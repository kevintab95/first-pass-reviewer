// Report issues in the runner repo: one per reviewed PR, found via the `pr-review-bot`
// label and the hidden state marker in the body (see state.ts).

import { type GitHub, splitRepo } from "./github.ts";
import { type PrState, prKey, readState } from "./state.ts";

export const BOT_LABEL = "pr-review-bot";

export interface ReportIssue {
  number: number;
  open: boolean;
  body: string;
  state: PrState;
}

/** All report issues (open and closed), keyed by prKey(repo, pr). */
export async function loadIssueIndex(
  gh: GitHub,
  runnerRepo: string,
): Promise<Map<string, ReportIssue>> {
  const issues = await gh.paginate(gh.rest.issues.listForRepo, {
    ...splitRepo(runnerRepo),
    labels: BOT_LABEL,
    state: "all",
    per_page: 100,
  });
  const index = new Map<string, ReportIssue>();
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const state = readState(issue.body);
    if (!state) continue;
    const key = prKey(state.repo, state.pr);
    const existing = index.get(key);
    const open = issue.state === "open";
    // If duplicates ever exist, prefer the open one, then the newest.
    const better =
      !existing ||
      (open && !existing.open) ||
      (open === existing.open && issue.number > existing.number);
    if (better) index.set(key, { number: issue.number, open, body: issue.body ?? "", state });
  }
  return index;
}

const LABEL_COLORS: Record<string, string> = {
  [BOT_LABEL]: "5319e7",
  correctness: "d73a4a",
  "dry-run": "c5def5",
};

/** GitHub label names are limited to 50 characters. */
export function labelName(name: string): string {
  return name.length <= 50 ? name : name.slice(0, 50);
}

export class LabelCache {
  private known = new Set<string>();
  constructor(
    private gh: GitHub,
    private runnerRepo: string,
  ) {}

  async ensure(names: string[]): Promise<string[]> {
    const result: string[] = [];
    for (const raw of names) {
      const name = labelName(raw);
      result.push(name);
      if (this.known.has(name)) continue;
      try {
        await this.gh.rest.issues.getLabel({ ...splitRepo(this.runnerRepo), name });
      } catch (err) {
        if ((err as { status?: number }).status !== 404) throw err;
        await this.gh.rest.issues.createLabel({
          ...splitRepo(this.runnerRepo),
          name,
          color: LABEL_COLORS[name] ?? "ededed",
        });
      }
      this.known.add(name);
    }
    return result;
  }
}
