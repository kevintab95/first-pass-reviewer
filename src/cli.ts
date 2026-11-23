// Entry point: `tsx src/cli.ts <step> --config <file> [options]`.
//
// Steps run separately in CI so each gets only the secrets it needs:
//   plan -> prepare -> agent -> post -> report -> sweep
// `review` runs them all in one process (for local use).

import path from "node:path";
import { parseArgs } from "node:util";
import { runAgent } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { describeError, log } from "./log.ts";
import { runPlan } from "./plan.ts";
import { runPost } from "./post.ts";
import { runPrepare } from "./prepare.ts";
import { runReport } from "./report.ts";
import { runSweep } from "./sweep.ts";
import { Workspace } from "./workspace.ts";

const USAGE = `Usage: first-pass-reviewer <plan|prepare|agent|post|report|sweep|review> --config <file> [options]

Options:
  --config <file>        Path to pr-review-bot.yml (required)
  --work-dir <dir>       Working directory shared by the steps (default: ./work)
  --pr <ref>             Review only this PR (owner/repo#123, or 123 with one repo), even if unchanged
  --dry-run              Do everything except create the draft review
  --local                Write nothing to GitHub; render reports to <work>/prs/.../out/issue.md
  --runner-repo <repo>   Repo for report issues (default: $GITHUB_REPOSITORY)
  -h, --help             Show this help
`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      "work-dir": { type: "string", default: "work" },
      pr: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      local: { type: "boolean", default: false },
      "runner-repo": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const step = positionals[0];
  if (values.help || !step || !values.config) {
    process.stdout.write(USAGE);
    process.exitCode = values.help ? 0 : 2;
    return;
  }

  const config = loadConfig(values.config);
  const ws = new Workspace(path.resolve(values["work-dir"]));
  const runnerRepo = values["runner-repo"] ?? process.env.GITHUB_REPOSITORY;
  const planOptions = {
    dryRun: values["dry-run"],
    local: values.local,
    ...(values.pr ? { pr: values.pr } : {}),
    ...(runnerRepo ? { runnerRepo } : {}),
  };

  switch (step) {
    case "plan":
      await runPlan(config, ws, planOptions);
      break;
    case "prepare":
      await runPrepare(config, ws);
      break;
    case "agent":
      await runAgent(config, ws);
      break;
    case "post":
      await runPost(config, ws);
      break;
    case "report":
      await runReport(config, ws);
      break;
    case "sweep":
      await runSweep(config, ws);
      break;
    case "review":
      await runPlan(config, ws, planOptions);
      await runPrepare(config, ws);
      await runAgent(config, ws);
      await runPost(config, ws);
      await runReport(config, ws);
      await runSweep(config, ws);
      break;
    default:
      process.stdout.write(USAGE);
      process.exitCode = 2;
  }
}

main().catch((err: unknown) => {
  log.error(describeError(err));
  process.exitCode = 1;
});
