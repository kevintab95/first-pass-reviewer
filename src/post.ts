// Step 4: create the draft review.
//
// INVARIANT: this file is the only place that writes a review, and it never sets `event`.
// A review created without `event` stays PENDING: visible only to the reviewer, who edits
// and submits it themselves. Never add calls to the submit-review endpoint
// (POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events).
// test/post.test.ts enforces this.

import { buildCommentIndex } from "./diff.ts";
import type { Finding, Findings } from "./findings.ts";
import { type GitHub, createGitHub, hasPendingReview, resolveToken, splitRepo } from "./github.ts";
import { describeError, jobSummary, log } from "./log.ts";
import type { Config } from "./config.ts";
import type { FileInfo, PlanEntry, PostResult } from "./types.ts";
import { partitionFindings } from "./validate.ts";
import { readJson, readJsonIfExists, type Workspace, writeJson } from "./workspace.ts";

export type ReviewComment = {
  path: string;
  body: string;
  line: number;
  side: "RIGHT" | "LEFT";
  start_line?: number;
  start_side?: "RIGHT" | "LEFT";
};

// A type alias (not an interface) so it satisfies Octokit's index-signature parameter type.
export type DraftReviewPayload = {
  owner: string;
  repo: string;
  pull_number: number;
  commit_id: string;
  body: string;
  comments: ReviewComment[];
};

/** Posted text is the comment alone: titles, reasoning and gap locations stay in the report issue. */
export function commentBody(finding: Finding): string {
  return finding.comment.trim();
}

export function reviewBody(template: string, entry: Pick<PlanEntry, "author">): string {
  return template.replaceAll("{{author}}", entry.author);
}

/** Build the create-review request. Deliberately has no `event` field: the review stays a draft. */
export function buildDraftReviewPayload(
  entry: Pick<PlanEntry, "repo" | "number" | "headSha">,
  body: string,
  findings: Finding[],
): DraftReviewPayload {
  return {
    ...splitRepo(entry.repo),
    pull_number: entry.number,
    commit_id: entry.headSha,
    body,
    comments: findings.map((f) => ({
      path: f.path,
      body: commentBody(f),
      line: f.line,
      side: f.side,
      ...(f.startLine !== undefined ? { start_line: f.startLine, start_side: f.side } : {}),
    })),
  };
}

export async function createDraftReview(
  gh: GitHub,
  payload: DraftReviewPayload,
): Promise<{ id: number; url: string }> {
  const { data } = await gh.rest.pulls.createReview(payload);
  if (data.state !== "PENDING") {
    // Should be impossible without `event`; fail loudly if GitHub ever changes behaviour.
    throw new Error(`Expected a PENDING review but GitHub returned ${data.state}`);
  }
  return { id: data.id, url: data.html_url };
}

export async function runPost(config: Config, ws: Workspace): Promise<void> {
  const plan = ws.readPlan();
  const needsGitHub = !plan.local && !plan.dryRun;
  const gh = needsGitHub ? createGitHub(resolveToken(["REVIEWER_TOKEN", "GH_TOKEN"])) : undefined;
  const rows: string[] = [];
  for (const entry of plan.entries) {
    const label = `${entry.repo}#${entry.number}`;
    const findings = readJsonIfExists<Findings>(ws.file(entry, "out", "findings.json"));
    if (!findings) {
      writeJson(ws.file(entry, "out", "post.json"), { status: "agent-failed", commentCount: 0 });
      rows.push(`${label}: no findings file (agent failed)`);
      continue;
    }
    const files = readJson<FileInfo[]>(ws.file(entry, "files.json"));
    const partition = partitionFindings(findings.findings, buildCommentIndex(files), {
      maxComments: config.limits.maxComments,
      postSeverities: config.review.postSeverities,
    });
    writeJson(ws.file(entry, "out", "partition.json"), partition);

    let result: PostResult;
    if (plan.local || plan.dryRun) {
      result = {
        status: plan.local ? "local" : "dry-run",
        commentCount: partition.postable.length,
      };
    } else if (partition.postable.length === 0) {
      result = { status: "nothing-to-post", commentCount: 0 };
    } else {
      try {
        // Re-check right before writing: the reviewer may have started a review since `plan`.
        if (await hasPendingReview(gh!, entry.repo, entry.number, config.reviewer)) {
          result = { status: "pending-review-exists", commentCount: 0 };
        } else {
          const review = await createDraftReview(
            gh!,
            buildDraftReviewPayload(
              entry,
              reviewBody(config.review.body, entry),
              partition.postable,
            ),
          );
          result = {
            status: "posted",
            reviewId: review.id,
            reviewUrl: review.url,
            commentCount: partition.postable.length,
          };
        }
      } catch (err) {
        result = { status: "failed", commentCount: 0, error: describeError(err) };
      }
    }
    writeJson(ws.file(entry, "out", "post.json"), result);
    rows.push(
      `${label}: ${result.status}, ${result.commentCount} comments, ${partition.unpostable.length} kept for the issue only`,
    );
  }
  for (const row of rows) log.info(`post: ${row}`);
  jobSummary(`### Draft reviews\n${rows.map((r) => `- ${r}`).join("\n") || "- none"}`);
}
