import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Config, resolveFromConfig } from "./config.ts";
import type { PrMeta } from "./types.ts";

export const DEFAULT_TEMPLATE = fileURLToPath(new URL("../prompts/review.md", import.meta.url));

export function loadTemplate(config: Config): string {
  const file = config.prompt.template
    ? resolveFromConfig(config, config.prompt.template)
    : DEFAULT_TEMPLATE;
  return readFileSync(file, "utf8");
}

/** Replace {{name}} placeholders; unknown placeholders are left as-is so typos are visible. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match);
}

export function promptValues(meta: PrMeta, config: Config, prRoot: string): Record<string, string> {
  const included = meta.files.filter((f) => f.included).length;
  const excluded = meta.files.length - included;
  const scope =
    meta.mode === "incremental"
      ? `This is an incremental review. You already reviewed this PR at ${meta.lastReviewedSha}. ` +
        `Review only the new changes in \`focus.patch\` (${meta.lastReviewedSha}..${meta.headSha}); ` +
        "use `diff.patch` (the whole PR) only for context. Do not repeat earlier concerns."
      : "This is a full review of the whole PR diff in `diff.patch`.";
  const guidance = meta.guidance.length
    ? meta.guidance.map((g) => `- \`${g}\``).join("\n")
    : "- (none found)";
  return {
    repo: meta.repo,
    number: String(meta.number),
    title: meta.title,
    author: meta.author,
    baseRef: meta.baseRef,
    headSha: meta.headSha,
    mode: meta.mode,
    scope,
    guidance,
    fileCount: String(meta.files.length),
    includedCount: String(included),
    excludedNote: excluded
      ? `${excluded} changed file(s) were left out of the diff (lock files, generated files, or size limits); see \`meta.json\`.`
      : "All changed files are included.",
    sourceNote: meta.checkedOut
      ? "The repository at the PR head is checked out in `src/`. Read surrounding code there to confirm a problem before reporting it."
      : "The repository is not checked out; you only have the diff.",
    maxComments: String(config.limits.maxComments),
    prRoot,
  };
}

export function renderPrompt(meta: PrMeta, config: Config, prRoot: string): string {
  return renderTemplate(loadTemplate(config), promptValues(meta, config, prRoot));
}

/**
 * Guidance files from the reviewed repo: AGENTS.md is the default convention. CLAUDE.md is
 * only used where a directory has no AGENTS.md. Looks at the repo root and every ancestor
 * directory of a changed file, plus CONTRIBUTING.md.
 */
export function findRepoGuidance(srcDir: string, changedPaths: string[]): string[] {
  const dirs = new Set<string>([""]);
  for (const file of changedPaths) {
    let dir = path.posix.dirname(file);
    while (dir !== "." && dir !== "/" && !dirs.has(dir)) {
      dirs.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  const found: string[] = [];
  for (const dir of [...dirs].sort()) {
    const agents = path.posix.join(dir, "AGENTS.md");
    const claude = path.posix.join(dir, "CLAUDE.md");
    if (existsSync(path.join(srcDir, agents))) found.push(agents);
    else if (existsSync(path.join(srcDir, claude))) found.push(claude);
  }
  for (const contributing of ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"]) {
    if (existsSync(path.join(srcDir, contributing))) {
      found.push(contributing);
      break;
    }
  }
  return found;
}
