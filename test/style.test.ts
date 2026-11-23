import { describe, expect, it } from "vitest";
import type { StyleExample } from "../src/github.ts";
import { pickStyleExamples, renderStyleExamples } from "../src/style.ts";

const example = (overrides: Partial<StyleExample>): StyleExample => ({
  author: "alice",
  repo: "org/repo",
  pr: 1,
  path: "a.py",
  body: "Where is this used?",
  ...overrides,
});

describe("pickStyleExamples", () => {
  it("never uses comments from the PR under review", () => {
    const picked = pickStyleExamples(
      [[example({ pr: 42, body: "Should this be gated by the flag?" }), example({ pr: 7 })]],
      { repo: "org/repo", number: 42 },
      10,
    );
    expect(picked.map((e) => e.pr)).toEqual([7]);
  });

  it("prefers the same repo, skips suggestions and extreme lengths, and caps the count", () => {
    const picked = pickStyleExamples(
      [
        [
          example({ repo: "other/repo", body: "Other repo comment" }),
          example({ body: "ok" }),
          example({ body: "x".repeat(600) }),
          example({ body: "```suggestion\nfoo\n```" }),
          example({ body: "Same repo one" }),
          example({ body: "Same repo two" }),
        ],
      ],
      { repo: "Org/Repo", number: 99 },
      2,
    );
    expect(picked.map((e) => e.body)).toEqual(["Same repo one", "Same repo two"]);
  });

  it("takes turns between authors, starting with the reviewer", () => {
    const own = [example({ body: "Own comment one" }), example({ body: "Own comment two" })];
    const other = [
      example({ author: "bob", body: "Bob comment one" }),
      example({ author: "bob", body: "Bob comment two" }),
      example({ author: "bob", body: "Bob comment three" }),
    ];
    const picked = pickStyleExamples([own, other], { repo: "org/repo", number: 99 }, 4);
    expect(picked.map((e) => e.body)).toEqual([
      "Own comment one",
      "Bob comment one",
      "Own comment two",
      "Bob comment two",
    ]);
  });
});

describe("renderStyleExamples", () => {
  it("quotes each comment with its author and location", () => {
    const text = renderStyleExamples("alice", [example({ body: "Line one\nLine two" })]);
    expect(text).toContain("Real comments alice posted on earlier PRs.");
    expect(text).toContain("- alice on `a.py` (org/repo#1):\n  > Line one\n  > Line two");
  });

  it("names other reviewers and keeps the reviewer's voice as the target", () => {
    const text = renderStyleExamples("alice", [example({}), example({ author: "bob" })]);
    expect(text).toContain("by alice (whose voice you write in) and by bob");
  });
});
