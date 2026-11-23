import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const repoName = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "must look like owner/repo");

export const DEFAULT_IGNORE = [
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/*.lock",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.snap",
];

export const ConfigSchema = z.strictObject({
  /** GitHub login whose PRs are reviewed and who owns the draft reviews. */
  reviewer: z.string().min(1),
  /** Repositories to watch, as owner/repo. */
  repos: z.array(repoName).min(1),
  select: z
    .strictObject({
      /** Review PRs assigned to the reviewer. */
      assigned: z.boolean().default(true),
      /** Review PRs where the reviewer is a requested reviewer. */
      reviewRequested: z.boolean().default(true),
      /** Skip PRs the author has marked as draft. */
      skipDraftPrs: z.boolean().default(true),
      /** Only review PRs that carry all of these labels. */
      labels: z.array(z.string()).default([]),
      /** Never review PRs opened by these logins (e.g. dependabot[bot]). */
      skipAuthors: z.array(z.string()).default([]),
    })
    .prefault({}),
  agent: z
    .strictObject({
      /** Adapter name: "claude-code" or "command" (see docs/adding-an-agent.md). */
      type: z.string().default("claude-code"),
      /** Model passed to the adapter, if it supports one. */
      model: z.string().optional(),
      maxTurns: z.number().int().positive().default(40),
      timeoutMinutes: z.number().positive().default(20),
      /** For type "command": argv of the agent CLI. The prompt is sent on stdin. */
      command: z.array(z.string()).optional(),
      /** For type "command": extra environment variable names passed through to the CLI. */
      env: z.array(z.string()).default([]),
    })
    .prefault({}),
  prompt: z
    .strictObject({
      /** Path to a custom prompt template, relative to this config file. */
      template: z.string().optional(),
      /** Extra guidance files (markdown), relative to this config file. */
      extraGuidance: z.array(z.string()).default([]),
    })
    .prefault({}),
  context: z
    .strictObject({
      /** Check out the PR head so the agent can read surrounding code. */
      checkout: z.boolean().default(true),
      /** Glob patterns of changed files the agent should not review. */
      ignore: z.array(z.string()).default(DEFAULT_IGNORE),
    })
    .prefault({}),
  limits: z
    .strictObject({
      maxPrsPerRun: z.number().int().positive().default(5),
      maxFiles: z.number().int().positive().default(60),
      maxDiffLines: z.number().int().positive().default(4000),
      maxComments: z.number().int().positive().default(15),
    })
    .prefault({}),
  issues: z
    .strictObject({
      /** Extra labels added to every report issue. */
      labels: z.array(z.string()).default([]),
      /** Assign report issues to the reviewer (this is what triggers the notification). */
      assignReviewer: z.boolean().default(true),
    })
    .prefault({}),
});

export type Config = z.output<typeof ConfigSchema> & {
  /** Directory of the config file; relative paths in the config resolve against it. */
  baseDir: string;
};

export function parseConfig(raw: unknown, baseDir: string): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid config:\n${z.prettifyError(result.error)}`);
  }
  return { ...result.data, baseDir };
}

export function loadConfig(file: string): Config {
  const absolute = path.resolve(file);
  const raw: unknown = parse(readFileSync(absolute, "utf8"));
  return parseConfig(raw, path.dirname(absolute));
}

export function resolveFromConfig(config: Config, relative: string): string {
  return path.resolve(config.baseDir, relative);
}
