// Step 2: gather everything the agent may look at into one directory per PR.
// The agent later runs with that directory as its working directory and cannot read outside it.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { type Config, resolveFromConfig } from "./config.ts";
import { diffLineCount, matchesAny, renderDiff } from "./diff.ts";
import { compare, createGitHub, getPr, listPrFiles, resolveToken } from "./github.ts";
import { describeError, log } from "./log.ts";
import { findRepoGuidance, renderPrompt } from "./prompt.ts";
import type { FileContext, FileInfo, PlanEntry, PrMeta } from "./types.ts";
import { readJson, type Workspace, writeJson, writeText } from "./workspace.ts";

/** Decide which changed files the agent sees, honouring ignore globs and size limits. */
export function selectFiles(files: FileInfo[], config: Config): FileContext[] {
  let lines = 0;
  let count = 0;
  return files.map(({ patch, ...file }) => {
    if (matchesAny(file.path, config.context.ignore)) {
      return { ...file, included: false, excludedReason: "ignored" };
    }
    if (!patch) return { ...file, included: false, excludedReason: "no-patch" };
    if (count >= config.limits.maxFiles) {
      return { ...file, included: false, excludedReason: "max-files" };
    }
    const size = diffLineCount(patch);
    if (lines + size > config.limits.maxDiffLines) {
      return { ...file, included: false, excludedReason: "max-diff-lines" };
    }
    lines += size;
    count += 1;
    return { ...file, included: true };
  });
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/** Shallow, credential-free checkout of exactly `sha` (GitHub allows fetching any reachable SHA). */
function checkout(repo: string, sha: string, dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  git(dest, ["init", "--quiet"]);
  git(dest, [
    "fetch",
    "--quiet",
    "--depth",
    "1",
    "--no-tags",
    `https://github.com/${repo}.git`,
    sha,
  ]);
  git(dest, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"]);
  // The agent only needs the files; drop git metadata so nothing points back at remotes.
  rmSync(path.join(dest, ".git"), { recursive: true, force: true });
}

export async function runPrepare(config: Config, ws: Workspace): Promise<void> {
  const plan = ws.readPlan();
  const gh = createGitHub(resolveToken(["REVIEWER_TOKEN", "GH_TOKEN"]));
  let prepared = 0;
  for (const entry of plan.entries) {
    try {
      await preparePr(config, ws, gh, entry);
      prepared += 1;
    } catch (err) {
      log.warn(`${entry.repo}#${entry.number}: prepare failed (${describeError(err)})`);
      writeJson(ws.file(entry, "out", "agent-error.json"), {
        stage: "prepare",
        error: describeError(err),
      });
    }
  }
  log.info(`prepare: ${prepared}/${plan.entries.length} PRs ready`);
}

async function preparePr(
  config: Config,
  ws: Workspace,
  gh: ReturnType<typeof createGitHub>,
  entry: PlanEntry,
): Promise<void> {
  const dir = ws.dir(entry);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const files = await listPrFiles(gh, entry.repo, entry.number);
  writeJson(ws.file(entry, "files.json"), files); // full list, used by `post` to validate lines
  const context = selectFiles(files, config);
  const includedPaths = new Set(context.filter((f) => f.included).map((f) => f.path));
  writeText(
    ws.file(entry, "diff.patch"),
    renderDiff(files.filter((f) => includedPaths.has(f.path))),
  );

  if (entry.mode === "incremental" && entry.lastReviewedSha) {
    const { files: changed } = await compare(gh, entry.repo, entry.lastReviewedSha, entry.headSha);
    // Only the PR's own files: merging the base branch into the PR must not add noise.
    const focus = changed.filter((f) => includedPaths.has(f.path));
    writeText(ws.file(entry, "focus.patch"), renderDiff(focus));
  }

  let checkedOut = false;
  if (config.context.checkout) {
    try {
      checkout(entry.repo, entry.headSha, ws.file(entry, "src"));
      checkedOut = true;
    } catch (err) {
      log.warn(
        `${entry.repo}#${entry.number}: checkout failed (${describeError(err)}); reviewing from the diff only`,
      );
    }
  }

  const guidance: string[] = checkedOut
    ? findRepoGuidance(
        ws.file(entry, "src"),
        files.map((f) => f.path),
      ).map((g) => `src/${g}`)
    : [];
  if (config.prompt.extraGuidance.length)
    mkdirSync(ws.file(entry, "guidance"), { recursive: true });
  for (const extra of config.prompt.extraGuidance) {
    const target = path.join("guidance", path.basename(extra));
    copyFileSync(resolveFromConfig(config, extra), ws.file(entry, target));
    guidance.push(target);
  }

  const pr = await getPr(gh, entry.repo, entry.number);
  const meta: PrMeta = {
    repo: entry.repo,
    number: entry.number,
    title: entry.title,
    url: entry.url,
    author: entry.author,
    body: pr.body.slice(0, 20_000),
    baseRef: entry.baseRef,
    headSha: entry.headSha,
    mode: entry.mode,
    ...(entry.lastReviewedSha ? { lastReviewedSha: entry.lastReviewedSha } : {}),
    files: context,
    guidance,
    checkedOut,
  };
  writeJson(ws.file(entry, "meta.json"), meta);
  writeText(ws.file(entry, "prompt.md"), renderPrompt(meta, config, dir));
}

export function readMeta(ws: Workspace, entry: PlanEntry): PrMeta {
  return readJson<PrMeta>(ws.file(entry, "meta.json"));
}
