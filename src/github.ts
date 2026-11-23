// Thin wrapper over the GitHub REST API. Two identities are used:
//  - the reviewer's token (REVIEWER_TOKEN): reads PRs, sees the reviewer's own pending
//    reviews, and creates the draft review. Only plan/prepare/post/sweep receive it.
//  - the runner's token (GITHUB_TOKEN, i.e. github-actions[bot]): writes report issues, so
//    the reviewer gets a notification (GitHub never notifies you about your own actions).

import { execFileSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import type { FileInfo } from "./types.ts";
import type { CompareStatus, PrSummary } from "./select.ts";

export type GitHub = Octokit;

export function createGitHub(token: string): GitHub {
  return new Octokit({ auth: token, userAgent: "pr-review-bot" });
}

/** Token lookup: explicit env vars first, then the local `gh` CLI login (for local runs). */
export function resolveToken(names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  try {
    const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
    if (token) return token;
  } catch {
    // fall through
  }
  throw new Error(`No GitHub token: set ${names.join(" or ")} (or log in with \`gh auth login\`).`);
}

export function splitRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Bad repo name: ${repo}`);
  return { owner, repo: name };
}

export interface OpenPr extends PrSummary {
  title: string;
  url: string;
  headSha: string;
  baseRef: string;
  body: string;
  createdAt: string;
}

type ApiPr = Awaited<ReturnType<Octokit["rest"]["pulls"]["get"]>>["data"];

function toOpenPr(
  pr: ApiPr | Awaited<ReturnType<Octokit["rest"]["pulls"]["list"]>>["data"][number],
): OpenPr {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    draft: Boolean(pr.draft),
    author: pr.user?.login ?? "",
    assignees: (pr.assignees ?? []).map((a) => a.login),
    requestedReviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
    labels: pr.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    body: pr.body ?? "",
    createdAt: pr.created_at,
  };
}

export async function listOpenPrs(gh: GitHub, repo: string): Promise<OpenPr[]> {
  const prs = await gh.paginate(gh.rest.pulls.list, {
    ...splitRepo(repo),
    state: "open",
    per_page: 100,
  });
  return prs.map(toOpenPr);
}

export async function getPr(
  gh: GitHub,
  repo: string,
  number: number,
): Promise<OpenPr & { state: string; merged: boolean }> {
  const { data } = await gh.rest.pulls.get({ ...splitRepo(repo), pull_number: number });
  return { ...toOpenPr(data), state: data.state, merged: data.merged };
}

/** True if `login` has an unsubmitted review on the PR (only visible with that user's token). */
export async function hasPendingReview(
  gh: GitHub,
  repo: string,
  number: number,
  login: string,
): Promise<boolean> {
  const reviews = await gh.paginate(gh.rest.pulls.listReviews, {
    ...splitRepo(repo),
    pull_number: number,
    per_page: 100,
  });
  return reviews.some(
    (r) => r.state === "PENDING" && r.user?.login.toLowerCase() === login.toLowerCase(),
  );
}

export async function listPrFiles(gh: GitHub, repo: string, number: number): Promise<FileInfo[]> {
  const files = await gh.paginate(gh.rest.pulls.listFiles, {
    ...splitRepo(repo),
    pull_number: number,
    per_page: 100,
  });
  return files.map((f) => ({
    path: f.filename,
    ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    ...(f.patch ? { patch: f.patch } : {}),
  }));
}

export async function compare(
  gh: GitHub,
  repo: string,
  base: string,
  head: string,
): Promise<{ status: CompareStatus; files: FileInfo[] }> {
  try {
    const { data } = await gh.rest.repos.compareCommitsWithBasehead({
      ...splitRepo(repo),
      basehead: `${base}...${head}`,
      per_page: 100,
    });
    return {
      status: data.status,
      files: (data.files ?? []).map((f) => ({
        path: f.filename,
        ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        ...(f.patch ? { patch: f.patch } : {}),
      })),
    };
  } catch (err) {
    // 404: the old SHA is gone (force-push + GC). Treat as unknown so we do a full review.
    if ((err as { status?: number }).status === 404) return { status: null, files: [] };
    throw err;
  }
}

export interface StyleExample {
  /** Login of the person who wrote the comment. */
  author: string;
  repo: string;
  pr: number;
  path: string;
  body: string;
}

interface ReviewContributionsResult {
  user: {
    contributionsCollection: {
      pullRequestReviewContributions: {
        nodes: {
          pullRequest: { number: number; repository: { nameWithOwner: string } };
          pullRequestReview: {
            comments: { nodes: { body: string; path: string; replyTo: { id: string } | null }[] };
          };
        }[];
      };
    };
  } | null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * A user's top-level review comments, newest first, used to show the agent how reviewers on a
 * project write. These are public comments already posted. GitHub's contributions API covers at
 * most one year per query, so this walks back year by year until `target` comments are found
 * or `maxYears` have been searched.
 */
export async function listReviewerComments(
  gh: GitHub,
  login: string,
  { target = 60, maxYears = 3, now = Date.now() } = {},
): Promise<StyleExample[]> {
  const found: StyleExample[] = [];
  for (let year = 0; year < maxYears && found.length < target; year++) {
    const to = new Date(now - year * YEAR_MS).toISOString();
    const from = new Date(now - (year + 1) * YEAR_MS).toISOString();
    const result = await gh.graphql<ReviewContributionsResult>(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            pullRequestReviewContributions(first: 100) {
              nodes {
                pullRequest { number repository { nameWithOwner } }
                pullRequestReview { comments(first: 20) { nodes { body path replyTo { id } } } }
              }
            }
          }
        }
      }`,
      { login, from, to },
    );
    const nodes = result.user?.contributionsCollection.pullRequestReviewContributions.nodes ?? [];
    for (const node of nodes) {
      for (const c of node.pullRequestReview.comments.nodes) {
        if (c.replyTo !== null) continue;
        found.push({
          author: login,
          repo: node.pullRequest.repository.nameWithOwner,
          pr: node.pullRequest.number,
          path: c.path,
          body: c.body.trim(),
        });
      }
    }
  }
  return found;
}
