// The contract every agent adapter implements. See docs/adding-an-agent.md.
//
// Security rules for adapters (enforced by review, see AGENTS.md):
//  - Start the agent with a minimal environment: never pass REVIEWER_TOKEN or GITHUB_TOKEN.
//  - Run with `cwd` as the working directory and restrict the agent to reading files there.
//  - Do not give the agent shell, network/web or file-write tools.
//  - Return the agent's final JSON; never log the agent's output.

export interface AgentRunInput {
  /** Fully rendered review prompt. */
  prompt: string;
  /** The PR directory; the agent must not read outside it. */
  cwd: string;
  model?: string;
  maxTurns: number;
  timeoutMs: number;
  /** JSON Schema of the expected output (schemas/findings.schema.json). */
  outputSchema: Record<string, unknown>;
}

export interface AgentRunResult {
  /** Parsed JSON output; validated against the findings schema by the caller. */
  output: unknown;
  /** Counts only (turns, cost, duration). Safe to log. */
  meta: Record<string, number | string | boolean>;
}

export interface AgentAdapter {
  name: string;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
