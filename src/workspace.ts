// File layout of the work directory shared by the pipeline steps:
//
//   <work>/plan.json
//   <work>/prs/<owner>__<repo>/<number>/
//     prompt.md  meta.json  files.json  diff.patch  focus.patch?
//     src/        checkout of the PR head (when context.checkout)
//     guidance/   runner-provided guidance files
//     out/        findings.json | agent-error.json, partition.json, post.json, issue.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Plan, PlanEntry } from "./types.ts";

export function prDir(repo: string, number: number): string {
  return path.join("prs", repo.replace("/", "__"), String(number));
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function readJsonIfExists<T>(file: string): T | undefined {
  return existsSync(file) ? readJson<T>(file) : undefined;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export class Workspace {
  constructor(readonly root: string) {}

  get planFile(): string {
    return path.join(this.root, "plan.json");
  }

  readPlan(): Plan {
    if (!existsSync(this.planFile)) {
      throw new Error(`No plan at ${this.planFile}; run the "plan" step first.`);
    }
    return readJson<Plan>(this.planFile);
  }

  writePlan(plan: Plan): void {
    writeJson(this.planFile, plan);
  }

  dir(entry: PlanEntry): string {
    return path.join(this.root, entry.dir);
  }

  file(entry: PlanEntry, ...parts: string[]): string {
    return path.join(this.root, entry.dir, ...parts);
  }
}
