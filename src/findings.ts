// The contract between the review agent and the rest of the pipeline.
// schemas/findings.schema.json is generated from this file (`npm run schemas`).

import { z } from "zod";

export const SEVERITIES = ["correctness", "consistency", "efficiency", "style"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_HEADINGS: Record<Severity, string> = {
  correctness: "Correctness",
  consistency: "Consistency and robustness",
  efficiency: "Efficiency",
  style: "Cleanup and style",
};

export const FindingSchema = z.strictObject({
  path: z.string().min(1).describe("File path relative to the repository root, as in the diff."),
  line: z
    .int()
    .positive()
    .describe("Line the comment attaches to: new-file line for RIGHT, old-file line for LEFT."),
  side: z
    .enum(["RIGHT", "LEFT"])
    .default("RIGHT")
    .describe("RIGHT for added/unchanged lines, LEFT for deleted lines."),
  startLine: z
    .int()
    .positive()
    .optional()
    .describe("First line of a multi-line comment; must be in the same diff hunk."),
  severity: z.enum(SEVERITIES),
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Short claim for the report issue (never posted), e.g. 'Feature flag not enforced'."),
  comment: z
    .string()
    .min(1)
    .describe(
      "The draft review comment, in the reviewer's voice: one concern, 1-2 sentences, usually a question that names what the author should check or do and points to existing code to follow. No evidence or call-path traces.",
    ),
  gapLocation: z
    .string()
    .optional()
    .describe(
      "When the real gap is in code outside the diff (e.g. a job that should also be updated), its file:line or symbol. The comment itself stays on the related changed line.",
    ),
  reasoning: z
    .string()
    .min(1)
    .describe(
      "For the reviewer only (never posted): why you believe this, the code paths you traced, and evidence with file:line references.",
    ),
  confidence: z.enum(["high", "medium", "low"]),
});

export const FindingsSchema = z.strictObject({
  summary: z
    .string()
    .describe(
      "For the reviewer's report only (never posted): 2-4 plain-English sentences on what the PR does and the main concerns, if any.",
    ),
  findings: z.array(FindingSchema),
});

export type Finding = z.output<typeof FindingSchema>;
export type Findings = z.output<typeof FindingsSchema>;

/** JSON Schema handed to agents that support structured output. */
export function findingsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(FindingsSchema, { io: "input" }) as Record<string, unknown>;
}
