import { describe, expect, it } from "vitest";
import { describeError, redact } from "../src/log.ts";

describe("redact", () => {
  it("removes GitHub and model provider tokens", () => {
    const text = `ghp_${"a".repeat(36)} github_pat_${"b".repeat(40)} sk-ant-oat01-${"c".repeat(40)}`;
    expect(redact(text)).toBe("[REDACTED] [REDACTED] [REDACTED]");
  });
});

describe("describeError", () => {
  it("keeps only the status and the first line of the message", () => {
    const err = Object.assign(new Error("Validation Failed\nbody: secret review text"), {
      status: 422,
    });
    expect(describeError(err)).toBe("Error 422 Validation Failed");
  });
});
