import { describe, expect, it } from "vitest";
import { prKey, readState, stateMarker, writeState } from "../src/state.ts";

describe("state marker", () => {
  it("round-trips through an issue body", () => {
    const body = writeState("Report text", { repo: "org/repo", pr: 7, lastReviewedSha: "abc" });
    expect(body.startsWith(stateMarker({ repo: "org/repo", pr: 7, lastReviewedSha: "abc" }))).toBe(
      true,
    );
    expect(readState(body)).toEqual({ repo: "org/repo", pr: 7, lastReviewedSha: "abc" });
  });

  it("replaces an existing marker instead of adding a second one", () => {
    const first = writeState("Report", { repo: "org/repo", pr: 7 });
    const second = writeState(first, { repo: "org/repo", pr: 7, lastReviewedSha: "def" });
    expect(second.match(/pr-review-bot:state/g)).toHaveLength(1);
    expect(readState(second)?.lastReviewedSha).toBe("def");
  });

  it("ignores bodies without a valid marker", () => {
    expect(readState("plain")).toBeNull();
    expect(readState("<!-- pr-review-bot:state {nope} -->")).toBeNull();
    expect(readState(null)).toBeNull();
  });

  it("builds case-insensitive keys", () => {
    expect(prKey("Org/Repo", 3)).toBe(prKey("org/repo", 3));
  });
});
