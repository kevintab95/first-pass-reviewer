// Unified-diff helpers. GitHub only accepts review comments on lines that appear in the
// PR diff, so every finding is checked against the index built here before posting.

import type { FileInfo } from "./types.ts";

export type Side = "RIGHT" | "LEFT";

/** line number -> hunk index, per side. */
export interface FileLines {
  RIGHT: Map<number, number>;
  LEFT: Map<number, number>;
}

export type CommentIndex = Map<string, FileLines>;

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Lines a review comment can be attached to, for one file's patch. */
export function commentableLines(patch: string): FileLines {
  const lines: FileLines = { RIGHT: new Map(), LEFT: new Map() };
  let oldLine = 0;
  let newLine = 0;
  let hunk = -1;
  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      hunk += 1;
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    if (hunk < 0 || raw.startsWith("\\")) continue;
    const marker = raw[0];
    if (marker === "+") {
      lines.RIGHT.set(newLine++, hunk);
    } else if (marker === "-") {
      lines.LEFT.set(oldLine++, hunk);
    } else if (marker === " ") {
      lines.RIGHT.set(newLine++, hunk);
      lines.LEFT.set(oldLine++, hunk);
    }
  }
  return lines;
}

export function buildCommentIndex(files: FileInfo[]): CommentIndex {
  const index: CommentIndex = new Map();
  for (const file of files) {
    if (file.patch) index.set(file.path, commentableLines(file.patch));
  }
  return index;
}

export function canComment(
  index: CommentIndex,
  path: string,
  side: Side,
  line: number,
  startLine?: number,
): boolean {
  const sideLines = index.get(path)?.[side];
  if (!sideLines) return false;
  const hunk = sideLines.get(line);
  if (hunk === undefined) return false;
  if (startLine === undefined) return true;
  return startLine < line && sideLines.get(startLine) === hunk;
}

export function diffLineCount(patch: string | undefined): number {
  return patch ? patch.split("\n").length : 0;
}

/** Render files as a git-style unified diff the agent can read. */
export function renderDiff(files: FileInfo[]): string {
  const parts: string[] = [];
  for (const file of files) {
    const from = file.previousPath ?? file.path;
    parts.push(`diff --git a/${from} b/${file.path}`);
    if (file.status === "renamed") parts.push(`rename from ${from}`, `rename to ${file.path}`);
    parts.push(
      `--- ${file.status === "added" ? "/dev/null" : `a/${from}`}`,
      `+++ ${file.status === "removed" ? "/dev/null" : `b/${file.path}`}`,
    );
    parts.push(file.patch ?? "(no textual diff available: binary or too large)");
  }
  return `${parts.join("\n")}\n`;
}

/** Minimal glob matcher: `**` crosses directories, `*` and `?` do not. */
export function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === "*" && glob[i + 1] === "*") {
      const slashAfter = glob[i + 2] === "/";
      source += slashAfter ? "(?:.*/)?" : ".*";
      i += slashAfter ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(path));
}
