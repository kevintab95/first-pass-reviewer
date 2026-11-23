// Generic adapter for any agent CLI that reads a prompt on stdin and prints JSON at the end.
// Configure with `agent.command` (argv) and `agent.env` (variable names to pass through).
// You are responsible for using the CLI's own flags to keep it read-only and offline
// apart from its model API; see docs/adding-an-agent.md for examples.

import type { Config } from "../config.ts";
import type { AgentAdapter, AgentRunInput, AgentRunResult } from "./types.ts";
import { extractJson, minimalEnv, runProcess } from "./process.ts";

/**
 * `agent.env` entries are variable names to pass through ("OPENAI_API_KEY"), or
 * "TARGET=SOURCE" to rename one, e.g. "OPENAI_API_KEY=AGENT_API_KEY" when the workflow
 * provides the credential as AGENT_API_KEY.
 */
export function commandEnv(entries: string[]): Record<string, string> {
  const passThrough = entries.filter((e) => !e.includes("="));
  const renamed: Record<string, string> = {};
  for (const entry of entries.filter((e) => e.includes("="))) {
    const [target, source] = entry.split("=", 2) as [string, string];
    const value = process.env[source];
    if (value !== undefined) renamed[target] = value;
  }
  return minimalEnv(passThrough, renamed);
}

export function commandAgent(config: Config): AgentAdapter {
  const argv = config.agent.command;
  if (!argv || argv.length === 0) {
    throw new Error('agent.type "command" needs agent.command, e.g. ["codex", "exec", "-"]');
  }
  const [bin, ...args] = argv as [string, ...string[]];
  return {
    name: "command",
    async run(input: AgentRunInput): Promise<AgentRunResult> {
      const expanded = args.map((arg) =>
        arg
          .replaceAll("{{model}}", input.model ?? "")
          .replaceAll("{{maxTurns}}", String(input.maxTurns)),
      );
      const started = Date.now();
      const result = await runProcess(bin, expanded, {
        cwd: input.cwd,
        env: commandEnv(config.agent.env),
        input: input.prompt,
        timeoutMs: input.timeoutMs,
      });
      if (result.timedOut) throw new Error(`${bin} timed out`);
      if (result.code !== 0) throw new Error(`${bin} exited with code ${result.code}`);
      return { output: extractJson(result.stdout), meta: { durationMs: Date.now() - started } };
    },
  };
}
