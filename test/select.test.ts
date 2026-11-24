import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.ts";
import { decide, matchesSelection, needsReviewHistory, type PrSummary } from "../src/select.ts";

const config = parseConfig({ reviewer: "alice", repos: ["org/repo"] }, "/tmp");
const pr = (overrides: Partial<PrSummary>): PrSummary => ({
  number: 1,
  draft: false,
  author: "bob",
  assignees: [],
  requestedReviewers: [],
  labels: [],
  ...overrides,
});

describe("matchesSelection", () => {
  it("selects PRs assigned to or awaiting review from the reviewer", () => {
    expect(matchesSelection(pr({ assignees: ["Alice"] }), config)).toBe(true);
    expect(matchesSelection(pr({ requestedReviewers: ["alice"] }), config)).toBe(true);
    expect(matchesSelection(pr({ assignees: ["carol"] }), config)).toBe(false);
  });

  it("skips drafts, the reviewer's own PRs and skipped authors", () => {
    expect(matchesSelection(pr({ assignees: ["alice"], draft: true }), config)).toBe(false);
    expect(matchesSelection(pr({ assignees: ["alice"], author: "alice" }), config)).toBe(false);
    const skipBots = parseConfig(
      { reviewer: "alice", repos: ["org/repo"], select: { skipAuthors: ["dependabot[bot]"] } },
      "/tmp",
    );
    expect(
      matchesSelection(pr({ assignees: ["alice"], author: "dependabot[bot]" }), skipBots),
    ).toBe(false);
  });

  it("honours the assigned/reviewRequested switches and required labels", () => {
    const onlyAssigned = parseConfig(
      {
        reviewer: "alice",
        repos: ["org/repo"],
        select: { reviewRequested: false, labels: ["ready"] },
      },
      "/tmp",
    );
    expect(
      matchesSelection(pr({ requestedReviewers: ["alice"], labels: ["ready"] }), onlyAssigned),
    ).toBe(false);
    expect(matchesSelection(pr({ assignees: ["alice"] }), onlyAssigned)).toBe(false);
    expect(matchesSelection(pr({ assignees: ["alice"], labels: ["Ready"] }), onlyAssigned)).toBe(
      true,
    );
  });
});

describe("select.match: all", () => {
  const all = parseConfig(
    { reviewer: "alice", repos: ["org/repo"], select: { match: "all" } },
    "/tmp",
  );

  it("requires the reviewer to be both assigned and a reviewer", () => {
    expect(matchesSelection(pr({ assignees: ["alice"] }), all)).toBe(false);
    expect(matchesSelection(pr({ requestedReviewers: ["alice"] }), all)).toBe(false);
    expect(matchesSelection(pr({ assignees: ["Alice"], requestedReviewers: ["alice"] }), all)).toBe(
      true,
    );
  });

  it("counts a past review as being a reviewer (GitHub drops it from requested reviewers)", () => {
    expect(matchesSelection(pr({ assignees: ["alice"], pastReviewers: ["ALICE"] }), all)).toBe(
      true,
    );
    expect(matchesSelection(pr({ assignees: ["alice"], pastReviewers: ["carol"] }), all)).toBe(
      false,
    );
    // A past review alone is not enough without the assignment.
    expect(matchesSelection(pr({ pastReviewers: ["alice"] }), all)).toBe(false);
  });

  it("asks for review history only when it could change the answer", () => {
    expect(needsReviewHistory(pr({ assignees: ["alice"] }), all)).toBe(true);
    expect(needsReviewHistory(pr({ assignees: ["carol"] }), all)).toBe(false);
    expect(
      needsReviewHistory(pr({ assignees: ["alice"], requestedReviewers: ["alice"] }), all),
    ).toBe(false);
    expect(needsReviewHistory(pr({ assignees: ["alice"], draft: true }), all)).toBe(false);
    expect(needsReviewHistory(pr({ assignees: ["alice"] }), config)).toBe(false);
  });

  it("only checks the enabled conditions", () => {
    const assignedOnly = parseConfig(
      {
        reviewer: "alice",
        repos: ["org/repo"],
        select: { match: "all", reviewRequested: false },
      },
      "/tmp",
    );
    expect(matchesSelection(pr({ assignees: ["alice"] }), assignedOnly)).toBe(true);
    const neither = parseConfig(
      {
        reviewer: "alice",
        repos: ["org/repo"],
        select: { match: "all", assigned: false, reviewRequested: false },
      },
      "/tmp",
    );
    expect(matchesSelection(pr({ assignees: ["alice"] }), neither)).toBe(false);
  });
});

describe("decide", () => {
  const base = { headSha: "new", hasPendingReview: false, force: false };

  it("skips when the reviewer has a pending review, even if forced", () => {
    expect(decide({ ...base, hasPendingReview: true, force: true })).toEqual({
      action: "skip",
      reason: "pending-review",
    });
  });

  it("skips PRs already reviewed at this head", () => {
    expect(decide({ ...base, lastReviewedSha: "new" })).toEqual({
      action: "skip",
      reason: "up-to-date",
    });
  });

  it("does a full review the first time and when forced", () => {
    expect(decide(base)).toEqual({ action: "review", mode: "full" });
    expect(decide({ ...base, lastReviewedSha: "new", force: true })).toEqual({
      action: "review",
      mode: "full",
    });
  });

  it("reviews only new commits when the old head is an ancestor", () => {
    expect(decide({ ...base, lastReviewedSha: "old", compareStatus: "ahead" })).toEqual({
      action: "review",
      mode: "incremental",
    });
  });

  it("falls back to a full review after a force-push or rebase", () => {
    expect(decide({ ...base, lastReviewedSha: "old", compareStatus: "diverged" })).toEqual({
      action: "review",
      mode: "full",
    });
    expect(decide({ ...base, lastReviewedSha: "old", compareStatus: null })).toEqual({
      action: "review",
      mode: "full",
    });
  });
});
