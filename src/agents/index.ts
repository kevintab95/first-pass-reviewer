import type { Config } from "../config.ts";
import { claudeCode } from "./claude-code.ts";
import { commandAgent } from "./command.ts";
import type { AgentAdapter } from "./types.ts";

/** Register new adapters here (see docs/adding-an-agent.md). */
const ADAPTERS: Record<string, (config: Config) => AgentAdapter> = {
  "claude-code": () => claudeCode,
  command: commandAgent,
};

export function getAdapter(config: Config): AgentAdapter {
  const factory = ADAPTERS[config.agent.type];
  if (!factory) {
    throw new Error(
      `Unknown agent.type "${config.agent.type}". Known: ${Object.keys(ADAPTERS).join(", ")}`,
    );
  }
  return factory(config);
}

export type { AgentAdapter, AgentRunInput, AgentRunResult } from "./types.ts";
