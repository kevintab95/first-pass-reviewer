# Adding an agent

The review agent is pluggable. Two ways to use something other than Claude Code:

## Option 1: the `command` adapter (no code)

Any CLI that takes the prompt on **stdin** and prints the findings JSON on **stdout**
works. The adapter extracts the JSON from the output (bare, fenced in a json code block,
or the outermost `{…}`) and validates it against `schemas/findings.schema.json`.

```yaml
agent:
  type: command
  command: ["your-agent", "--flag", "--model", "{{model}}"] # {{model}}, {{maxTurns}} are substituted
  model: some-model
  env: ["OPENAI_API_KEY=AGENT_API_KEY"] # pass the workflow's AGENT_API_KEY as OPENAI_API_KEY
```

In the runner workflow, install the CLI with the `agent_setup` input, pass its key as the
`agent_api_key` secret, and allow its API host with `extra_allowed_endpoints`.

**You are responsible for keeping the agent read-only and offline**, using the CLI's
own options: a read-only sandbox, no shell or network tools, and no auto-approval of
actions. The process runs in the PR directory with a minimal environment (no GitHub
tokens), but what it can do inside the runner depends on its own sandbox.

Illustrative examples (check the CLI's current flags before relying on them):

- **OpenAI Codex CLI**: `["codex", "exec", "--sandbox", "read-only", "-"]`
- **Gemini CLI**: `["gemini", "--model", "{{model}}"]`, with its settings restricted to
  read-only file tools.

## Option 2: a dedicated adapter (TypeScript)

Write one when the CLI has structured output, cost reporting or tool restrictions worth
using properly.

1. Create `src/agents/<name>.ts` implementing `AgentAdapter` from `src/agents/types.ts`:

   ```ts
   export const myAgent: AgentAdapter = {
     name: "my-agent",
     async run(input) {
       // input.prompt, input.cwd, input.model, input.maxTurns, input.timeoutMs, input.outputSchema
       const result = await runProcess("my-agent", [...flags], {
         cwd: input.cwd,
         env: minimalEnv(["MY_AGENT_API_KEY"]),
         input: input.prompt,
         timeoutMs: input.timeoutMs,
       });
       return { output: extractJson(result.stdout), meta: { turns: 0 } };
     },
   };
   ```

2. Register it in `ADAPTERS` in `src/agents/index.ts`.
3. Add tests like the Claude Code ones in `test/agents.test.ts`, asserting the
   read-only flags.
4. Document its secret and endpoint here and in `docs/configuration.md`.

### Rules every adapter must follow

- Start the process with `minimalEnv(...)`: never pass `REVIEWER_TOKEN` or `GITHUB_TOKEN`.
- Working directory = `input.cwd`; the agent must not read outside it.
- No shell, network/web, file-write or MCP tools; ignore config files from the reviewed
  repo.
- Prefer the CLI's structured-output mode with `input.outputSchema`.
- Never log the agent's output. Return counts only in `meta`.
- Respect `input.timeoutMs` and `input.maxTurns`.
