// The only module allowed to write to stdout/stderr (enforced by eslint `no-console`).
//
// Rule: logs may contain PR numbers, counts, statuses and short error codes. They must
// never contain review findings, PR bodies or API response bodies, because workflow
// logs of a public repo are public. Everything is passed through `redact` as a last
// line of defence against leaking tokens.

import { appendFileSync } from "node:fs";

const TOKEN_PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
];

export function redact(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, "[REDACTED]");
  return out;
}

export const log = {
  info(message: string): void {
    console.log(redact(message));
  },
  warn(message: string): void {
    console.warn(redact(`warning: ${message}`));
  },
  error(message: string): void {
    console.error(redact(`error: ${message}`));
  },
};

/** Short, body-free description of an error, safe to log. */
export function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const status = "status" in err ? String((err as { status: unknown }).status) : "";
    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message.split("\n")[0]!.slice(0, 160) : "";
    return redact([name, status, message].filter(Boolean).join(" "));
  }
  return redact(String(err).slice(0, 160));
}

/** Append counts-only markdown to the GitHub Actions job summary, if available. */
export function jobSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${redact(markdown)}\n`);
}
