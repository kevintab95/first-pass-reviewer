import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDraftReviewPayload, commentBody } from "../src/post.ts";
import { entry, finding } from "./helpers.ts";

describe("buildDraftReviewPayload", () => {
  const payload = buildDraftReviewPayload(entry, "Summary", [
    finding(),
    finding({ line: 12, startLine: 11 }),
  ]);

  it("never includes an event, so the review stays a private draft", () => {
    expect(payload).not.toHaveProperty("event");
  });

  it("targets the reviewed commit and maps comment fields", () => {
    expect(payload).toMatchObject({
      owner: "org",
      repo: "repo",
      pull_number: 42,
      commit_id: entry.headSha,
      body: "Summary",
    });
    expect(payload.comments[0]).toEqual({
      path: "core/topic.py",
      line: 11,
      side: "RIGHT",
      body: commentBody(finding()),
    });
    expect(payload.comments[1]).toMatchObject({ start_line: 11, start_side: "RIGHT", line: 12 });
  });

  it("posts only the comment text, never the private reasoning", () => {
    expect(JSON.stringify(payload)).not.toContain(finding().reasoning);
  });
});

describe("source invariants", () => {
  const srcDir = path.resolve(import.meta.dirname, "../src");
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((f) =>
    f.endsWith(".ts"),
  );
  const code = (file: string) =>
    readFileSync(path.join(srcDir, file), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

  it("has no code that submits a review", () => {
    for (const file of files) {
      const text = code(file);
      expect(text, file).not.toMatch(/submitReview|\/events\b|\bevent\s*:/);
    }
  });

  it("creates reviews only in post.ts", () => {
    const writers = files.filter((file) => /createReview\(/.test(code(file)));
    expect(writers).toEqual(["post.ts"]);
  });
});
