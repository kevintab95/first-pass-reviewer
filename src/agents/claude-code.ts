// Claude Code adapter: runs the `claude` CLI headless (`-p`) with read-only file tools.

import type { AgentAdapter, AgentRunInput, AgentRunResult } from "./types.ts";
import { extractJson, minimalEnv, runProcess } from "./process.ts";

export function claudeArgs(input: AgentRunInput): string[] {
  // The CLI's validator does not resolve the draft-2020-12 meta-schema URI, so drop it.
  const { $schema: _metaSchema, ...schema } = input.outputSchema;
  void _metaSchema;
  return [
    "-p",
    "--output-format",
    "json",
    // Only these built-in tools exist for the session: no shell, no web, no file writes.
    "--tools",
    "Read,Grep,Glob",
    // Deny anything that would need a permission prompt (e.g. reading outside cwd).
    "--permission-mode",
    "dontAsk",
    // Ignore settings files: a PR could otherwise ship .claude/settings.json with hooks.
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--max-turns",
    String(input.maxTurns),
    "--json-schema",
    JSON.stringify(schema),
    ...(input.model ? ["--model", input.model] : []),
  ];
}

interface ClaudeResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  num_turns?: number;
  total_cost_usd?: number;
  duration_ms?: number;
}

export const claudeCode: AgentAdapter = {
  name: "claude-code",
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const env = minimalEnv(["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"], {
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
      DISABLE_AUTOUPDATER: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    });
    const result = await runProcess(process.env.CLAUDE_BIN ?? "claude", claudeArgs(input), {
      cwd: input.cwd,
      env,
      input: input.prompt,
      timeoutMs: input.timeoutMs,
    });
    if (result.timedOut) throw new Error("claude timed out");
    let parsed: ClaudeResult;
    try {
      parsed = JSON.parse(result.stdout) as ClaudeResult;
    } catch {
      // CLI usage errors are one line on stdout/stderr and contain no review content.
      const firstLine = (result.stderr || result.stdout).trim().split("\n")[0]?.slice(0, 160);
      throw new Error(`claude exited with code ${result.code}: ${firstLine || "no output"}`);
    }
    const meta = {
      turns: parsed.num_turns ?? 0,
      costUsd: Number((parsed.total_cost_usd ?? 0).toFixed(4)),
      durationMs: parsed.duration_ms ?? 0,
    };
    if (parsed.is_error || parsed.subtype !== "success") {
      throw new Error(
        `claude finished with ${parsed.subtype ?? "an error"} after ${meta.turns} turns`,
      );
    }
    const output = parsed.structured_output ?? extractJson(parsed.result ?? "");
    return { output, meta };
  },
};
