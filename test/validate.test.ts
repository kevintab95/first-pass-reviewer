import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCommentIndex } from "../src/diff.ts";
import { partitionFindings, type PartitionOptions, sortFindings } from "../src/validate.ts";
import { finding } from "./helpers.ts";

const patch = readFileSync(new URL("./fixtures/sample.patch", import.meta.url), "utf8");
const all: PartitionOptions["postSeverities"] = [
  "correctness",
  "consistency",
  "efficiency",
  "style",
];
const opts = (maxComments: number): PartitionOptions => ({ maxComments, postSeverities: all });
const index = buildCommentIndex([
  { path: "core/topic.py", status: "modified", additions: 3, deletions: 1, patch },
]);

describe("partitionFindings", () => {
  it("keeps findings on diff lines and sets aside the rest", () => {
    const result = partitionFindings(
      [
        finding(),
        finding({ line: 300, title: "Elsewhere" }),
        finding({ path: "other.py", title: "Other file" }),
      ],
      index,
      opts(10),
    );
    expect(result.postable).toHaveLength(1);
    expect(result.unpostable.map((u) => u.reason)).toEqual(["not-in-diff", "not-in-diff"]);
  });

  it("downgrades a bad multi-line range to a single-line comment", () => {
    const result = partitionFindings([finding({ line: 43, startLine: 12 })], index, opts(10));
    expect(result.postable).toHaveLength(1);
    expect(result.postable[0]!.startLine).toBeUndefined();
  });

  it("caps comments, keeping the most severe and confident", () => {
    const result = partitionFindings(
      [
        finding({ severity: "style", title: "Style" }),
        finding({ severity: "correctness", confidence: "low", title: "Low" }),
        finding({ severity: "correctness", confidence: "high", title: "High" }),
      ],
      index,
      opts(2),
    );
    expect(result.postable.map((f) => f.title)).toEqual(["High", "Low"]);
    expect(result.unpostable).toEqual([
      { finding: expect.objectContaining({ title: "Style" }), reason: "over-limit" },
    ]);
  });

  it("drops duplicates", () => {
    const result = partitionFindings([finding(), finding()], index, opts(10));
    expect(result.postable).toHaveLength(1);
    expect(result.unpostable[0]!.reason).toBe("duplicate");
  });
});

describe("postSeverities", () => {
  it("keeps non-drafted severities for the report only", () => {
    const result = partitionFindings(
      [finding(), finding({ severity: "efficiency", title: "Slow" })],
      index,
      { maxComments: 10, postSeverities: ["correctness", "consistency"] },
    );
    expect(result.postable.map((f) => f.title)).toEqual([finding().title]);
    expect(result.unpostable).toEqual([
      { finding: expect.objectContaining({ title: "Slow" }), reason: "severity" },
    ]);
  });
});

describe("sortFindings", () => {
  it("orders by severity then confidence", () => {
    const sorted = sortFindings([
      finding({ severity: "efficiency", title: "e" }),
      finding({ severity: "consistency", confidence: "medium", title: "c2" }),
      finding({ severity: "consistency", confidence: "high", title: "c1" }),
    ]);
    expect(sorted.map((f) => f.title)).toEqual(["c1", "c2", "e"]);
  });
});
