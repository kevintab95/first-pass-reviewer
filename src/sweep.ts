// Step 6: close report issues whose PR has been merged or closed.

import type { Config } from "./config.ts";
import { createGitHub, getPr, resolveToken, splitRepo } from "./github.ts";
import { loadIssueIndex } from "./issues.ts";
import { describeError, log } from "./log.ts";
import type { Workspace } from "./workspace.ts";

export async function runSweep(_config: Config, ws: Workspace): Promise<void> {
  const plan = ws.readPlan();
  if (plan.local || !plan.runnerRepo) {
    log.info("sweep: skipped (local run)");
    return;
  }
  const runnerRepo = plan.runnerRepo;
  const runnerGh = createGitHub(resolveToken(["GITHUB_TOKEN"]));
  // The reviewer's token can also read private PRs, in case a watched repo is private.
  const readerGh = createGitHub(resolveToken(["REVIEWER_TOKEN", "GITHUB_TOKEN"]));
  const index = await loadIssueIndex(runnerGh, runnerRepo);
  let closed = 0;
  for (const issue of index.values()) {
    if (!issue.open) continue;
    try {
      const pr = await getPr(readerGh, issue.state.repo, issue.state.pr);
      if (pr.state === "open") continue;
      await runnerGh.rest.issues.createComment({
        ...splitRepo(runnerRepo),
        issue_number: issue.number,
        body: `The PR was ${pr.merged ? "merged" : "closed without merging"}; closing this report.`,
      });
      await runnerGh.rest.issues.update({
        ...splitRepo(runnerRepo),
        issue_number: issue.number,
        state: "closed",
        state_reason: pr.merged ? "completed" : "not_planned",
      });
      closed += 1;
    } catch (err) {
      log.warn(`sweep: issue #${issue.number} (${describeError(err)})`);
    }
  }
  log.info(`sweep: closed ${closed} report issue(s) for merged or closed PRs`);
}
