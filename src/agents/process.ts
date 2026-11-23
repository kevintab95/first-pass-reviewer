import { spawn } from "node:child_process";

/** Variables any CLI needs to start; everything else must be opted in explicitly. */
const BASE_ENV = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "USER", "SHELL"];

/** Build a minimal child environment: base variables plus the named ones. Never inherits tokens. */
export function minimalEnv(
  names: string[],
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of [...BASE_ENV, ...names]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, ...extra };
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: Record<string, string>; input: string; timeoutMs: number },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
    child.stdin.end(options.input);
  });
}

/** Extract a JSON object from agent text: whole text, a ```json fence, or the outermost braces. */
export function extractJson(text: string): unknown {
  const attempts = [text.trim()];
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  const fenced: string[] = [];
  while ((match = fence.exec(text))) fenced.push(match[1]!);
  attempts.push(...fenced.reverse());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) attempts.push(text.slice(first, last + 1));
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // try the next candidate
    }
  }
  throw new Error("Agent output did not contain valid JSON");
}
