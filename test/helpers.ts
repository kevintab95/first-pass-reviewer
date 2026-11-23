import type { Finding } from "../src/findings.ts";
import type { PlanEntry } from "../src/types.ts";

export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    path: "core/topic.py",
    line: 11,
    side: "RIGHT",
    severity: "correctness",
    title: "Translations lost on migration",
    comment: "Schema migrations bump the version without carrying translations forward.",
    reasoning: "topic_migration_jobs commits via compute_models_to_commit (jobs.py:120).",
    confidence: "high",
    ...overrides,
  };
}

export const entry: PlanEntry = {
  repo: "org/repo",
  number: 42,
  title: "Add topic translations",
  url: "https://github.com/org/repo/pull/42",
  author: "bob",
  headSha: "0123456789abcdef",
  baseRef: "develop",
  mode: "full",
  dir: "prs/org__repo/42",
};
