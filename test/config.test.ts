import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configJsonSchema } from "../scripts/gen-schemas.ts";
import { DEFAULT_IGNORE, loadConfig, parseConfig } from "../src/config.ts";
import { findingsJsonSchema } from "../src/findings.ts";

describe("config", () => {
  it("fills defaults for a minimal config", () => {
    const config = parseConfig({ reviewer: "alice", repos: ["org/repo"] }, "/base");
    expect(config.select).toMatchObject({
      assigned: true,
      reviewRequested: true,
      skipDraftPrs: true,
    });
    expect(config.agent.type).toBe("claude-code");
    expect(config.context.ignore).toEqual(DEFAULT_IGNORE);
    expect(config.limits.maxComments).toBe(15);
    expect(config.review).toEqual({
      body: "Thanks @{{author}}! Left a few comments. PTAL",
      postSeverities: ["correctness", "consistency"],
      styleFromHistory: true,
      styleReviewers: [],
      styleExampleCount: 15,
    });
    expect(config.baseDir).toBe("/base");
  });

  it("rejects unknown keys and bad repo names", () => {
    expect(() => parseConfig({ reviewer: "a", repos: ["org/repo"], typo: 1 }, "/")).toThrow(
      /Invalid config/,
    );
    expect(() => parseConfig({ reviewer: "a", repos: ["not-a-repo"] }, "/")).toThrow(/owner\/repo/);
  });

  it("loads the runner template", () => {
    const config = loadConfig(
      new URL("../templates/runner/pr-review-bot.yml", import.meta.url).pathname,
    );
    expect(config.repos.length).toBeGreaterThan(0);
  });
});

describe("generated schemas", () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8"));

  it("are up to date (run `npm run schemas`)", () => {
    expect(read("config.schema.json")).toEqual(configJsonSchema());
    expect(read("findings.schema.json")).toEqual(findingsJsonSchema());
  });
});
