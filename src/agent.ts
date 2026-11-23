// Step 3: run the review agent for each prepared PR. This step must only ever receive the
// agent's own credentials (see the reusable workflow); it writes out/findings.json.

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { getAdapter } from "./agents/index.ts";
import type { Config } from "./config.ts";
import { findingsJsonSchema, FindingsSchema } from "./findings.ts";
import { describeError, jobSummary, log } from "./log.ts";
import { type Workspace, writeJson } from "./workspace.ts";

export async function runAgent(config: Config, ws: Workspace): Promise<void> {
  const plan = ws.readPlan();
  const adapter = getAdapter(config);
  const outputSchema = findingsJsonSchema();
  const rows: string[] = [];
  for (const entry of plan.entries) {
    const label = `${entry.repo}#${entry.number}`;
    const promptFile = ws.file(entry, "prompt.md");
    if (!existsSync(promptFile) || existsSync(ws.file(entry, "out", "agent-error.json"))) {
      rows.push(`${label}: not prepared`);
      continue;
    }
    try {
      const { output, meta } = await adapter.run({
        prompt: readFileSync(promptFile, "utf8"),
        cwd: ws.dir(entry),
        ...(config.agent.model ? { model: config.agent.model } : {}),
        maxTurns: config.agent.maxTurns,
        timeoutMs: config.agent.timeoutMinutes * 60_000,
        outputSchema,
      });
      const parsed = FindingsSchema.safeParse(output);
      if (!parsed.success) {
        // Keep the issue list (paths only), never the agent's text.
        const where = parsed.error.issues
          .map((i) => i.path.join("."))
          .slice(0, 5)
          .join(", ");
        throw new Error(`agent output did not match the findings schema (${where})`);
      }
      writeJson(ws.file(entry, "out", "findings.json"), parsed.data);
      writeJson(ws.file(entry, "out", "agent-meta.json"), { agent: adapter.name, ...meta });
      rows.push(`${label}: ${parsed.data.findings.length} findings (${meta.turns ?? "?"} turns)`);
    } catch (err) {
      const error = err instanceof z.ZodError ? "invalid agent output" : describeError(err);
      writeJson(ws.file(entry, "out", "agent-error.json"), { stage: "agent", error });
      rows.push(`${label}: agent failed (${error})`);
    }
  }
  for (const row of rows) log.info(`agent: ${row}`);
  jobSummary(`### Agent\n${rows.map((r) => `- ${r}`).join("\n") || "- nothing to review"}`);
}
