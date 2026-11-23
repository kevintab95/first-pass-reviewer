// Step 5: write the detailed report as an issue in the runner repo (one issue per PR).
// The issue is created by github-actions[bot] and assigned to / mentions the reviewer,
// which is what produces the GitHub (mobile) notification.

import type { Config } from "./config.ts";
import { type Finding, type Findings, SEVERITIES, SEVERITY_HEADINGS } from "./findings.ts";
import { createGitHub, resolveToken, splitRepo } from "./github.ts";
import { BOT_LABEL, LabelCache, loadIssueIndex } from "./issues.ts";
import { describeError, jobSummary, log } from "./log.ts";
import { prKey, stateMarker, writeState } from "./state.ts";
import type { PlanEntry, PostResult, PrMeta } from "./types.ts";
import type { Partition, UnpostableReason } from "./validate.ts";
import { readJsonIfExists, type Workspace, writeText } from "./workspace.ts";

const MAX_ISSUE_TEXT = 60_000; // GitHub's limit is 65,536 characters.

export interface ReportInput {
  entry: PlanEntry;
  meta?: PrMeta;
  findings?: Findings;
  partition?: Partition;
  post?: PostResult;
  agentError?: string;
  agentMeta?: Record<string, unknown>;
  reviewer: string;
}

const short = (sha: string) => sha.slice(0, 7);

/** Neutralise @mentions and issue references from untrusted text so the report notifies nobody else. */
export function defang(text: string): string {
  return text.replace(/@(?=[A-Za-z0-9-])/g, "@​").replace(/(^|\s)#(?=\d)/g, "$1#​");
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function lineLink(entry: PlanEntry, finding: Finding): string {
  const range = finding.startLine ? `L${finding.startLine}-L${finding.line}` : `L${finding.line}`;
  const location = `${finding.path}:${finding.startLine ? `${finding.startLine}-` : ""}${finding.line}`;
  if (finding.side === "LEFT")
    return `\`${location}\` (deleted lines; see the PR's Files changed tab)`;
  return `[\`${location}\`](https://github.com/${entry.repo}/blob/${entry.headSha}/${finding.path}#${range})`;
}

const UNPOSTABLE_TEXT: Record<UnpostableReason, string> = {
  "not-in-diff":
    "not in the draft: the line is outside the PR diff, so GitHub won't accept a comment there",
  "over-limit": "not in the draft: over the per-review comment limit",
  duplicate: "not in the draft: duplicate of another finding",
  severity: "report only: this severity is not drafted (see review.postSeverities)",
};

function postLine(entry: PlanEntry, post: PostResult | undefined): string {
  switch (post?.status) {
    case "posted":
      return `posted as a **draft** with ${post.commentCount} comment(s), visible only to you. [Open Files changed](${entry.url}/files) to edit and submit.`;
    case "dry-run":
      return `dry run: not posted (${post.commentCount} comment(s) would have been drafted).`;
    case "local":
      return "local run: not posted.";
    case "nothing-to-post":
      return "nothing to post (no findings on lines inside the diff).";
    case "pending-review-exists":
      return "skipped: you already have a pending review on this PR. Finish or discard it and the next run will try again.";
    case "failed":
      return `failed to post (${post.error ?? "unknown error"}). The next run will try again.`;
    default:
      return "not posted: the review did not complete.";
  }
}

export function renderReport(input: ReportInput): string {
  const { entry, meta, findings, partition, post, agentError, agentMeta } = input;
  const out: string[] = [];
  const scope =
    entry.mode === "incremental" && entry.lastReviewedSha
      ? `new commits only, \`${short(entry.lastReviewedSha)}..${short(entry.headSha)}\``
      : `full review at \`${short(entry.headSha)}\``;
  out.push(
    `**PR:** [${entry.repo}#${entry.number}](${entry.url}) by \`${entry.author}\`: ${defang(entry.title)}`,
    `**Scope:** ${scope}`,
    `**Draft review:** ${postLine(entry, post)}`,
  );
  if (agentMeta) {
    const parts = [
      `adapter \`${String(agentMeta.agent)}\``,
      agentMeta.turns !== undefined ? `${String(agentMeta.turns)} turns` : "",
      agentMeta.costUsd ? `~$${String(agentMeta.costUsd)}` : "",
    ].filter(Boolean);
    out.push(`**Agent:** ${parts.join(", ")}`);
  }

  if (agentError) {
    out.push("", `The review did not complete (${agentError}). The next run will try again.`);
    return truncate(out.join("\n"));
  }
  if (!findings) return truncate(out.join("\n"));

  out.push("", "### Summary", defang(findings.summary));
  const reasons = new Map(partition?.unpostable.map((u) => [u.finding, u.reason]) ?? []);
  const ordered = partition
    ? [...partition.postable, ...partition.unpostable.map((u) => u.finding)]
    : findings.findings;
  const inDraft = post?.status === "posted" ? "in the draft" : "would go in the draft";

  if (ordered.length === 0) {
    out.push("", "No issues found.");
  }
  let n = 0;
  for (const severity of SEVERITIES) {
    const group = ordered.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    out.push("", `### ${SEVERITY_HEADINGS[severity]}`);
    for (const finding of group) {
      n += 1;
      const reason = reasons.get(finding);
      const status = reason ? UNPOSTABLE_TEXT[reason] : inDraft;
      out.push(
        "",
        `#### ${n}. ${defang(finding.title)}`,
        `${lineLink(entry, finding)} · confidence: ${finding.confidence} · ${status}`,
        ...(finding.gapLocation ? [`Actual gap: ${defang(finding.gapLocation)}`] : []),
        "",
        "**Draft comment**",
        quote(defang(finding.comment)),
        "",
        "<details open><summary><b>Reasoning</b></summary>",
        "",
        defang(finding.reasoning),
        "",
        "</details>",
      );
    }
  }

  const excluded = meta?.files.filter((f) => !f.included) ?? [];
  if (excluded.length) {
    out.push(
      "",
      "<details><summary>Files not reviewed</summary>",
      "",
      ...excluded.map((f) => `- \`${f.path}\` (${f.excludedReason})`),
      "",
      "</details>",
    );
  }
  return truncate(out.join("\n"));
}

function truncate(text: string): string {
  if (text.length <= MAX_ISSUE_TEXT) return text;
  return `${text.slice(0, MAX_ISSUE_TEXT)}\n\n_(Report truncated: GitHub limits issue text length.)_`;
}

export function issueTitle(entry: PlanEntry): string {
  return `${entry.repo}#${entry.number}: ${entry.title}`.slice(0, 250);
}

/** Should this run count as "reviewed at headSha"? Only when a real, complete review happened. */
export function advancesState(post: PostResult | undefined): boolean {
  return post?.status === "posted" || post?.status === "nothing-to-post";
}

function loadInput(ws: Workspace, entry: PlanEntry, reviewer: string): ReportInput {
  const agentError = readJsonIfExists<{ error: string }>(ws.file(entry, "out", "agent-error.json"));
  const meta = readJsonIfExists<PrMeta>(ws.file(entry, "meta.json"));
  const findings = readJsonIfExists<Findings>(ws.file(entry, "out", "findings.json"));
  const partition = readJsonIfExists<Partition>(ws.file(entry, "out", "partition.json"));
  const post = readJsonIfExists<PostResult>(ws.file(entry, "out", "post.json"));
  const agentMeta = readJsonIfExists<Record<string, unknown>>(
    ws.file(entry, "out", "agent-meta.json"),
  );
  return {
    entry,
    reviewer,
    ...(meta ? { meta } : {}),
    ...(findings ? { findings } : {}),
    ...(partition ? { partition } : {}),
    ...(post ? { post } : {}),
    ...(agentError ? { agentError: agentError.error } : {}),
    ...(agentMeta ? { agentMeta } : {}),
  };
}

export async function runReport(config: Config, ws: Workspace): Promise<void> {
  const plan = ws.readPlan();
  const rows: string[] = [];
  if (plan.local || !plan.runnerRepo) {
    for (const entry of plan.entries) {
      const file = ws.file(entry, "out", "issue.md");
      writeText(file, renderReport(loadInput(ws, entry, config.reviewer)));
      rows.push(`${entry.repo}#${entry.number}: report written to ${file}`);
    }
    for (const row of rows) log.info(`report: ${row}`);
    return;
  }

  const runnerRepo = plan.runnerRepo;
  const gh = createGitHub(resolveToken(["GITHUB_TOKEN"]));
  const labels = new LabelCache(gh, runnerRepo);
  const index = await loadIssueIndex(gh, runnerRepo);
  const mention = `@${config.reviewer}`;

  for (const entry of plan.entries) {
    const label = `${entry.repo}#${entry.number}`;
    try {
      const input = loadInput(ws, entry, config.reviewer);
      const report = renderReport(input);
      const existing = index.get(prKey(entry.repo, entry.number));
      const reviewedSha = advancesState(input.post)
        ? entry.headSha
        : existing?.state.lastReviewedSha;
      const state = {
        repo: entry.repo,
        pr: entry.number,
        ...(reviewedSha ? { lastReviewedSha: reviewedSha } : {}),
      };
      const issueLabels = await labels.ensure([
        BOT_LABEL,
        `repo:${entry.repo}`,
        ...config.issues.labels,
        ...(input.findings?.findings.some((f) => f.severity === "correctness")
          ? ["correctness"]
          : []),
        ...(plan.dryRun ? ["dry-run"] : []),
      ]);

      if (existing) {
        await gh.rest.issues.update({
          ...splitRepo(runnerRepo),
          issue_number: existing.number,
          body: writeState(existing.body, state),
          ...(existing.open ? {} : { state: "open" as const }),
        });
        await gh.rest.issues.addLabels({
          ...splitRepo(runnerRepo),
          issue_number: existing.number,
          labels: issueLabels,
        });
        await gh.rest.issues.createComment({
          ...splitRepo(runnerRepo),
          issue_number: existing.number,
          body: `${mention} new review run.\n\n${report}`,
        });
        rows.push(`${label}: updated issue #${existing.number}`);
      } else {
        const created = await gh.rest.issues.create({
          ...splitRepo(runnerRepo),
          title: issueTitle(entry),
          body: `${stateMarker(state)}\n${config.issues.assignReviewer ? "" : `cc ${mention}\n\n`}${report}`,
          labels: issueLabels,
          ...(config.issues.assignReviewer ? { assignees: [config.reviewer] } : {}),
        });
        rows.push(`${label}: created issue #${created.data.number}`);
      }
    } catch (err) {
      rows.push(`${label}: report failed (${describeError(err)})`);
    }
  }
  for (const row of rows) log.info(`report: ${row}`);
  jobSummary(`### Report issues\n${rows.map((r) => `- ${r}`).join("\n") || "- none"}`);
}
