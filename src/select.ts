// Pure decision logic: which PRs to review and how. No I/O here, so it is easy to test.

import type { Config } from "./config.ts";
import type { ReviewMode } from "./types.ts";

export interface PrSummary {
  number: number;
  draft: boolean;
  author: string;
  assignees: string[];
  requestedReviewers: string[];
  labels: string[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function matchesSelection(pr: PrSummary, config: Config): boolean {
  const { reviewer, select } = config;
  if (same(pr.author, reviewer)) return false;
  if (select.skipDraftPrs && pr.draft) return false;
  if (select.skipAuthors.some((author) => same(author, pr.author))) return false;
  if (!select.labels.every((label) => pr.labels.some((l) => same(l, label)))) return false;
  const assigned = select.assigned && pr.assignees.some((a) => same(a, reviewer));
  const requested = select.reviewRequested && pr.requestedReviewers.some((r) => same(r, reviewer));
  return assigned || requested;
}

/** Status from GitHub's compare API for lastReviewedSha...headSha; null if it failed (e.g. force-push). */
export type CompareStatus = "ahead" | "behind" | "diverged" | "identical" | null;

export type Decision =
  | { action: "skip"; reason: "pending-review" | "up-to-date" }
  | { action: "review"; mode: ReviewMode };

export function decide(input: {
  headSha: string;
  lastReviewedSha?: string;
  compareStatus?: CompareStatus;
  hasPendingReview: boolean;
  force: boolean;
}): Decision {
  // GitHub allows one pending review per user per PR, and the reviewer may be mid-edit.
  if (input.hasPendingReview) return { action: "skip", reason: "pending-review" };
  if (!input.force && input.lastReviewedSha === input.headSha) {
    return { action: "skip", reason: "up-to-date" };
  }
  if (input.force || !input.lastReviewedSha) return { action: "review", mode: "full" };
  // "ahead" means the new head contains the old one: only new commits need a look.
  // Anything else (rebase, force-push, unknown SHA) needs a full review.
  return { action: "review", mode: input.compareStatus === "ahead" ? "incremental" : "full" };
}
