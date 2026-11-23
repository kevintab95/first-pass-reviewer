import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCommentIndex,
  canComment,
  commentableLines,
  globToRegExp,
  matchesAny,
  renderDiff,
} from "../src/diff.ts";

const patch = readFileSync(new URL("./fixtures/sample.patch", import.meta.url), "utf8");

describe("commentableLines", () => {
  const lines = commentableLines(patch);

  it("maps added and context lines on the RIGHT side", () => {
    expect([...lines.RIGHT.keys()]).toEqual([10, 11, 12, 13, 14, 15, 42, 43, 44]);
  });

  it("maps deleted and context lines on the LEFT side", () => {
    expect([...lines.LEFT.keys()]).toEqual([10, 11, 12, 13, 14, 40, 41]);
  });

  it("records which hunk each line belongs to", () => {
    expect(lines.RIGHT.get(11)).toBe(0);
    expect(lines.RIGHT.get(44)).toBe(1);
  });
});

describe("canComment", () => {
  const index = buildCommentIndex([
    { path: "core/topic.py", status: "modified", additions: 3, deletions: 1, patch },
  ]);

  it("accepts lines in the diff and rejects others", () => {
    expect(canComment(index, "core/topic.py", "RIGHT", 11)).toBe(true);
    expect(canComment(index, "core/topic.py", "RIGHT", 30)).toBe(false);
    expect(canComment(index, "core/other.py", "RIGHT", 11)).toBe(false);
    expect(canComment(index, "core/topic.py", "LEFT", 11)).toBe(true);
  });

  it("only accepts multi-line ranges inside one hunk", () => {
    expect(canComment(index, "core/topic.py", "RIGHT", 12, 11)).toBe(true);
    expect(canComment(index, "core/topic.py", "RIGHT", 44, 12)).toBe(false);
    expect(canComment(index, "core/topic.py", "RIGHT", 11, 12)).toBe(false);
  });
});

describe("renderDiff", () => {
  it("writes git-style headers, including renames and missing patches", () => {
    const text = renderDiff([
      { path: "b.py", previousPath: "a.py", status: "renamed", additions: 0, deletions: 0 },
    ]);
    expect(text).toContain("diff --git a/a.py b/b.py");
    expect(text).toContain("rename from a.py");
    expect(text).toContain("no textual diff available");
  });
});

describe("globs", () => {
  it("supports ** and *", () => {
    expect(globToRegExp("**/*.lock").test("yarn.lock")).toBe(true);
    expect(globToRegExp("**/*.lock").test("a/b/Gemfile.lock")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/b.ts")).toBe(false);
    expect(matchesAny("web/app.min.js", ["**/*.min.js"])).toBe(true);
    expect(matchesAny("web/app.js", ["**/*.min.js"])).toBe(false);
  });
});
