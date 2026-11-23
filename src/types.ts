// Data passed between pipeline steps through files in the work directory.
// Each step reads what earlier steps wrote; see docs/architecture.md.

export type ReviewMode = "full" | "incremental";

export interface PlanEntry {
  repo: string; // owner/repo
  number: number;
  title: string;
  url: string;
  author: string;
  headSha: string;
  baseRef: string;
  mode: ReviewMode;
  /** Head SHA reviewed last time, when known. Incremental reviews cover lastReviewedSha..headSha. */
  lastReviewedSha?: string;
  /** Report issue in the runner repo, when one already exists. */
  issueNumber?: number;
  /** Directory (relative to the work dir) holding this PR's files. */
  dir: string;
}

export interface SkippedPr {
  repo: string;
  number: number;
  reason: "pending-review" | "up-to-date" | "limit";
}

export interface Plan {
  generatedAt: string;
  reviewer: string;
  /** Runner repo (owner/repo) holding the report issues; absent in local mode. */
  runnerRepo?: string;
  /** Do not create draft reviews. */
  dryRun: boolean;
  /** Do not write anything to GitHub; render reports to files instead. */
  local: boolean;
  entries: PlanEntry[];
  skipped: SkippedPr[];
}

export interface FileInfo {
  path: string;
  previousPath?: string;
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff hunks for this file, as returned by the GitHub API. */
  patch?: string;
}

export interface FileContext extends Omit<FileInfo, "patch"> {
  /** Whether the agent was shown this file's diff. */
  included: boolean;
  excludedReason?: "ignored" | "no-patch" | "max-files" | "max-diff-lines";
}

export interface PrMeta {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  body: string;
  baseRef: string;
  headSha: string;
  mode: ReviewMode;
  lastReviewedSha?: string;
  files: FileContext[];
  /** Guidance files available to the agent, relative to the PR directory. */
  guidance: string[];
  checkedOut: boolean;
  /** Number of the reviewer's past comments in style/examples.md (0 when none). */
  styleExamples?: number;
}

export type PostStatus =
  | "posted"
  | "dry-run"
  | "local"
  | "nothing-to-post"
  | "pending-review-exists"
  | "agent-failed"
  | "failed";

export interface PostResult {
  status: PostStatus;
  reviewId?: number;
  reviewUrl?: string;
  commentCount: number;
  error?: string;
}
