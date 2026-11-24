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
  /** Logins that have already submitted a review. Only needed for `select.match: all`. */
  pastReviewers?: string[];
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function matchesSelection(pr: PrSummary, config: Config): boolean {
  const { reviewer, select } = config;
  if (same(pr.author, reviewer)) return false;
  if (select.skipDraftPrs && pr.draft) return false;
  if (select.skipAuthors.some((author) => same(author, pr.author))) return false;
  if (!select.labels.every((label) => pr.labels.some((l) => same(l, label)))) return false;
  const isAssigned = pr.assignees.some((a) => same(a, reviewer));
  const isRequested = pr.requestedReviewers.some((r) => same(r, reviewer));
  if (select.match === "all") {
    // GitHub removes a reviewer from the requested list once they submit a review, so a
    // re-review (e.g. the PR was reassigned to them) shows up only in pastReviewers.
    const isReviewer = isRequested || (pr.pastReviewers ?? []).some((r) => same(r, reviewer));
    if (!select.assigned && !select.reviewRequested) return false;
    if (select.assigned && !isAssigned) return false;
    if (select.reviewRequested && !isReviewer) return false;
    return true;
  }
  return (select.assigned && isAssigned) || (select.reviewRequested && isRequested);
}

/**
 * True when the PR would match only if the reviewer had already reviewed it, so the caller
 * should fetch its review history (an extra API call) and check again with pastReviewers.
 */
export function needsReviewHistory(pr: PrSummary, config: Config): boolean {
  if (config.select.match !== "all" || pr.pastReviewers) return false;
  return (
    !matchesSelection(pr, config) &&
    matchesSelection({ ...pr, pastReviewers: [config.reviewer] }, config)
  );
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
