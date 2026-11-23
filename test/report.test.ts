import { describe, expect, it } from "vitest";
import { advancesState, defang, issueTitle, renderReport } from "../src/report.ts";
import { entry, finding } from "./helpers.ts";

describe("renderReport", () => {
  const inDiff = finding();
  const outside = finding({ line: 300, title: "Outside the diff", severity: "efficiency" });
  const text = renderReport({
    entry,
    reviewer: "alice",
    findings: {
      summary: "Adds translations. Ping @carol about #123.",
      findings: [inDiff, outside],
    },
    partition: { postable: [inDiff], unpostable: [{ finding: outside, reason: "not-in-diff" }] },
    post: { status: "posted", commentCount: 1, reviewUrl: "https://example.com" },
  });

  it("groups findings by severity with the draft comment and the reasoning", () => {
    expect(text.indexOf("### Correctness")).toBeLessThan(text.indexOf("### Efficiency"));
    expect(text).toContain(inDiff.reasoning);
    expect(text).toContain(`> ${inDiff.comment}`);
    expect(text).toContain("in the draft");
    expect(text).toContain("outside the PR diff");
  });

  it("links to the reviewed commit and the Files changed tab", () => {
    expect(text).toContain(`https://github.com/org/repo/blob/${entry.headSha}/core/topic.py#L11`);
    expect(text).toContain(`${entry.url}/files`);
  });

  it("does not mention or link anyone from untrusted text", () => {
    expect(text).not.toMatch(/@carol/);
    expect(text).not.toMatch(/(^|\s)#123/);
    expect(text).not.toContain("@bob");
  });

  it("reports agent failures without findings", () => {
    const failed = renderReport({ entry, reviewer: "alice", agentError: "claude timed out" });
    expect(failed).toContain("did not complete (claude timed out)");
  });
});

describe("helpers", () => {
  it("defangs mentions and issue references", () => {
    expect(defang("hi @x and #5")).toBe("hi @​x and #​5");
  });

  it("advances state only after a real review", () => {
    expect(advancesState({ status: "posted", commentCount: 2 })).toBe(true);
    expect(advancesState({ status: "nothing-to-post", commentCount: 0 })).toBe(true);
    expect(advancesState({ status: "dry-run", commentCount: 2 })).toBe(false);
    expect(advancesState({ status: "pending-review-exists", commentCount: 0 })).toBe(false);
    expect(advancesState({ status: "failed", commentCount: 0 })).toBe(false);
    expect(advancesState(undefined)).toBe(false);
  });

  it("titles issues by PR", () => {
    expect(issueTitle(entry)).toBe("org/repo#42: Add topic translations");
  });
});
