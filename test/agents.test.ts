import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAdapter } from "../src/agents/index.ts";
import { claudeArgs } from "../src/agents/claude-code.ts";
import { extractJson, minimalEnv } from "../src/agents/process.ts";
import { parseConfig } from "../src/config.ts";
import { findRepoGuidance } from "../src/prompt.ts";

const input = {
  prompt: "p",
  cwd: "/tmp",
  maxTurns: 7,
  timeoutMs: 1000,
  outputSchema: { type: "object" },
};

describe("claude-code adapter", () => {
  const args = claudeArgs(input);
  const flag = (name: string) => args[args.indexOf(name) + 1];

  it("allows only read-only file tools", () => {
    expect(flag("--tools")).toBe("Read,Grep,Glob");
    expect(flag("--permission-mode")).toBe("dontAsk");
  });

  it("ignores settings files a PR could plant and uses no MCP servers", () => {
    expect(flag("--setting-sources")).toBe("");
    expect(args).toContain("--strict-mcp-config");
  });

  it("passes turn limit and output schema", () => {
    expect(flag("--max-turns")).toBe("7");
    expect(JSON.parse(flag("--json-schema")!)).toEqual({ type: "object" });
    const withMeta = claudeArgs({ ...input, outputSchema: { $schema: "x", type: "object" } });
    expect(JSON.parse(withMeta[withMeta.indexOf("--json-schema") + 1]!)).toEqual({
      type: "object",
    });
  });
});

describe("minimalEnv", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("never passes GitHub tokens to the agent", () => {
    process.env.REVIEWER_TOKEN = "x";
    process.env.GITHUB_TOKEN = "y";
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "z";
    const env = minimalEnv(["CLAUDE_CODE_OAUTH_TOKEN"]);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("z");
    expect(env).not.toHaveProperty("REVIEWER_TOKEN");
    expect(env).not.toHaveProperty("GITHUB_TOKEN");
  });
});

describe("extractJson", () => {
  it("handles bare JSON, fenced JSON and surrounding prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Done.\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Result: {"a":3} end')).toEqual({ a: 3 });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("getAdapter", () => {
  it("rejects unknown adapters and incomplete command config", () => {
    expect(() =>
      getAdapter(parseConfig({ reviewer: "a", repos: ["o/r"], agent: { type: "nope" } }, "/")),
    ).toThrow(/Unknown/);
    expect(() =>
      getAdapter(parseConfig({ reviewer: "a", repos: ["o/r"], agent: { type: "command" } }, "/")),
    ).toThrow(/agent.command/);
  });
});

describe("findRepoGuidance", () => {
  it("prefers AGENTS.md, falls back to CLAUDE.md per directory, and adds CONTRIBUTING", () => {
    const root = mkdtempSync(path.join(tmpdir(), "guidance-"));
    mkdirSync(path.join(root, "core/domain"), { recursive: true });
    mkdirSync(path.join(root, "web"), { recursive: true });
    writeFileSync(path.join(root, "AGENTS.md"), "");
    writeFileSync(path.join(root, "CLAUDE.md"), "");
    writeFileSync(path.join(root, "core/CLAUDE.md"), "");
    writeFileSync(path.join(root, "web/AGENTS.md"), "");
    writeFileSync(path.join(root, "CONTRIBUTING.md"), "");
    const found = findRepoGuidance(root, ["core/domain/topic.py"]);
    expect(found).toEqual(["AGENTS.md", "core/CLAUDE.md", "CONTRIBUTING.md"]);
  });
});

describe("commandEnv", () => {
  it("passes through and renames only the configured variables", async () => {
    const { commandEnv } = await import("../src/agents/command.ts");
    process.env.AGENT_API_KEY = "k";
    process.env.REVIEWER_TOKEN = "secret";
    const env = commandEnv(["OPENAI_API_KEY=AGENT_API_KEY"]);
    expect(env.OPENAI_API_KEY).toBe("k");
    expect(env).not.toHaveProperty("AGENT_API_KEY");
    expect(env).not.toHaveProperty("REVIEWER_TOKEN");
    delete process.env.AGENT_API_KEY;
    delete process.env.REVIEWER_TOKEN;
  });
});
