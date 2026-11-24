// Step 1: decide which PRs to review and how. Writes <work>/plan.json.

import type { Config } from "./config.ts";
import {
  compare,
  createGitHub,
  getPr,
  hasPendingReview,
  listOpenPrs,
  listPastReviewers,
  type OpenPr,
  resolveToken,
} from "./github.ts";
import { loadIssueIndex, type ReportIssue } from "./issues.ts";
import { describeError, jobSummary, log } from "./log.ts";
import { decide, matchesSelection, needsReviewHistory } from "./select.ts";
import { prKey } from "./state.ts";
import type { Plan, PlanEntry, SkippedPr } from "./types.ts";
import { prDir, type Workspace } from "./workspace.ts";

export interface PlanOptions {
  /** Review just this PR ("owner/repo#123", or "123" when one repo is configured), even if unchanged. */
  pr?: string;
  dryRun: boolean;
  local: boolean;
  runnerRepo?: string;
}

export function parsePrRef(ref: string, repos: string[]): { repo: string; number: number } {
  const match = /^(?:([\w.-]+\/[\w.-]+)#)?(\d+)$/.exec(ref.trim());
  if (!match) throw new Error(`Bad PR reference "${ref}": use owner/repo#123 or 123.`);
  const repo = match[1] ?? (repos.length === 1 ? repos[0] : undefined);
  if (!repo)
    throw new Error(`PR reference "${ref}" needs a repo, since several repos are configured.`);
  return { repo, number: Number(match[2]) };
}

export async function runPlan(config: Config, ws: Workspace, options: PlanOptions): Promise<Plan> {
  const reviewerGh = createGitHub(resolveToken(["REVIEWER_TOKEN", "GH_TOKEN"]));
  const runnerRepo = options.local ? undefined : options.runnerRepo;
  let issues = new Map<string, ReportIssue>();
  if (runnerRepo) {
    const runnerGh = createGitHub(resolveToken(["GITHUB_TOKEN", "REVIEWER_TOKEN", "GH_TOKEN"]));
    issues = await loadIssueIndex(runnerGh, runnerRepo);
  }

  const candidates: { repo: string; pr: OpenPr }[] = [];
  if (options.pr) {
    const { repo, number } = parsePrRef(options.pr, config.repos);
    const pr = await getPr(reviewerGh, repo, number);
    if (pr.state !== "open") throw new Error(`${repo}#${number} is not open.`);
    candidates.push({ repo, pr });
  } else {
    for (const repo of config.repos) {
      const prs = await listOpenPrs(reviewerGh, repo);
      const selected: OpenPr[] = [];
      for (const pr of prs) {
        if (matchesSelection(pr, config)) {
          selected.push(pr);
        } else if (needsReviewHistory(pr, config)) {
          const pastReviewers = await listPastReviewers(reviewerGh, repo, pr.number);
          if (matchesSelection({ ...pr, pastReviewers }, config)) selected.push(pr);
        }
      }
      log.info(`${repo}: ${prs.length} open PRs, ${selected.length} match the selection`);
      candidates.push(...selected.map((pr) => ({ repo, pr })));
    }
  }
  // Oldest first, so long-waiting PRs are not starved by the per-run limit.
  candidates.sort((a, b) => a.pr.createdAt.localeCompare(b.pr.createdAt));

  const entries: PlanEntry[] = [];
  const skipped: SkippedPr[] = [];
  for (const { repo, pr } of candidates) {
    try {
      const issue = issues.get(prKey(repo, pr.number));
      const lastReviewedSha = issue?.state.lastReviewedSha;
      const pending = await hasPendingReview(reviewerGh, repo, pr.number, config.reviewer);
      const needsCompare =
        !pending && !options.pr && lastReviewedSha && lastReviewedSha !== pr.headSha;
      const compareStatus = needsCompare
        ? (await compare(reviewerGh, repo, lastReviewedSha, pr.headSha)).status
        : null;
      const decision = decide({
        headSha: pr.headSha,
        ...(lastReviewedSha ? { lastReviewedSha } : {}),
        compareStatus,
        hasPendingReview: pending,
        force: Boolean(options.pr),
      });
      if (decision.action === "skip") {
        skipped.push({ repo, number: pr.number, reason: decision.reason });
        continue;
      }
      if (entries.length >= config.limits.maxPrsPerRun) {
        skipped.push({ repo, number: pr.number, reason: "limit" });
        continue;
      }
      entries.push({
        repo,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        author: pr.author,
        headSha: pr.headSha,
        baseRef: pr.baseRef,
        mode: decision.mode,
        ...(lastReviewedSha && decision.mode === "incremental" ? { lastReviewedSha } : {}),
        ...(issue ? { issueNumber: issue.number } : {}),
        dir: prDir(repo, pr.number),
      });
    } catch (err) {
      log.warn(
        `${repo}#${pr.number}: planning failed (${describeError(err)}); will retry next run`,
      );
    }
  }

  const plan: Plan = {
    generatedAt: new Date().toISOString(),
    reviewer: config.reviewer,
    ...(runnerRepo ? { runnerRepo } : {}),
    dryRun: options.dryRun,
    local: options.local,
    entries,
    skipped,
  };
  ws.writePlan(plan);

  const counts = (reason: SkippedPr["reason"]) => skipped.filter((s) => s.reason === reason).length;
  const line =
    `plan: ${entries.length} to review (${entries.map((e) => `${e.repo}#${e.number} ${e.mode}`).join(", ") || "none"}); ` +
    `skipped ${counts("up-to-date")} up to date, ${counts("pending-review")} with your pending review, ${counts("limit")} over the per-run limit`;
  log.info(line);
  jobSummary(`### Plan\n${line}`);
  return plan;
}
