// Split agent findings into those GitHub will accept as line comments and the rest.

import { type CommentIndex, canComment } from "./diff.ts";
import { type Finding, SEVERITIES, type Severity } from "./findings.ts";

export type UnpostableReason = "not-in-diff" | "over-limit" | "duplicate" | "severity";

export interface PartitionOptions {
  maxComments: number;
  /** Severities that may be drafted; others go to the report issue only. */
  postSeverities: readonly Severity[];
}

export interface Partition {
  postable: Finding[];
  unpostable: { finding: Finding; reason: UnpostableReason }[];
}

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence],
  );
}

export function partitionFindings(
  findings: Finding[],
  index: CommentIndex,
  { maxComments, postSeverities }: PartitionOptions,
): Partition {
  const postable: Finding[] = [];
  const unpostable: Partition["unpostable"] = [];
  const seen = new Set<string>();
  for (const original of sortFindings(findings)) {
    let finding = original;
    const key = `${finding.path}:${finding.side}:${finding.line}:${finding.title.toLowerCase()}`;
    if (seen.has(key)) {
      unpostable.push({ finding, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    if (!postSeverities.includes(finding.severity)) {
      unpostable.push({ finding, reason: "severity" });
      continue;
    }
    if (!canComment(index, finding.path, finding.side, finding.line, finding.startLine)) {
      // A bad range start should not cost us the whole comment: retry as a single-line comment.
      if (
        finding.startLine !== undefined &&
        canComment(index, finding.path, finding.side, finding.line)
      ) {
        finding = { ...finding };
        delete finding.startLine;
      } else {
        unpostable.push({ finding, reason: "not-in-diff" });
        continue;
      }
    }
    if (postable.length >= maxComments) {
      unpostable.push({ finding, reason: "over-limit" });
      continue;
    }
    postable.push(finding);
  }
  return { postable, unpostable };
}
