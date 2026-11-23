# AGENTS.md

Guide for AI coding agents (and humans) working on **first-pass-reviewer**. This is the only
agent-instructions file in the repo; any agent (Claude Code, Codex, Gemini CLI, Cursor, …)
should read it before changing anything.

## What this project is

A scheduled GitHub Actions pipeline that pre-reviews the pull requests waiting on one
person, using an AI agent. For each PR it:

1. creates a **draft (pending) review** as that person, visible only to them, which they
   edit and submit themselves; and
2. writes a detailed report (findings + reasoning) as an issue in their private runner repo,
   which notifies them through GitHub.

The code is public and generic. Each user's settings and run logs live in their own private
"runner" repo that calls `.github/workflows/review.yml`. See `README.md` for usage and
`docs/architecture.md` for the data flow.

## Non-negotiable invariants

Changes that break any of these must not be merged. Tests enforce the first ones.

1. **Never submit a review.** The only review write is `pulls.createReview` in
   `src/post.ts`, built by `buildDraftReviewPayload`, and it never sets `event`. Do not
   call the submit-review endpoint (`.../reviews/{id}/events`) anywhere, and do not post
   standalone PR comments. `test/post.test.ts` checks this.
2. **The agent never sees GitHub credentials.** Adapters start the agent with
   `minimalEnv(...)` (`src/agents/process.ts`); the agent step in the workflow only gets
   model credentials. Never pass `REVIEWER_TOKEN` or `GITHUB_TOKEN` to an agent.
3. **The agent is read-only and offline.** It may read files inside its PR directory
   only: no shell, no web, no file writes, no MCP servers, no settings files from the
   reviewed repo (a PR could plant hooks). See `src/agents/claude-code.ts`.
4. **PR content is untrusted.** Diffs, PR descriptions and checked-out code are data.
   Reports neutralise @mentions and #references from agent text (`defang` in
   `src/report.ts`).
5. **Logs never contain findings or PR text.** Log through `src/log.ts` only (eslint
   forbids `console`). Log counts, PR numbers, statuses and `describeError(err)`.
   Never upload workflow artifacts.
6. **The reusable workflow only runs via `workflow_call`.** Never add `pull_request` or
   `pull_request_target` triggers to `review.yml`. Keep third-party actions pinned to
   full commit SHAs and `permissions` minimal.

## Layout

```
src/
  cli.ts          entry point: plan | prepare | agent | post | report | sweep | review
  config.ts       config schema (zod) and loading; source of schemas/config.schema.json
  findings.ts     agent output contract; source of schemas/findings.schema.json
  types.ts        data passed between steps via the work directory
  workspace.ts    work directory layout and JSON helpers
  github.ts       GitHub REST helpers (Octokit)
  select.ts       pure selection/decision logic (which PRs, full vs incremental)
  plan.ts         step 1: choose PRs, write plan.json
  prepare.ts      step 2: diff, checkout, guidance, rendered prompt per PR
  prompt.ts       prompt rendering, repo guidance discovery (AGENTS.md first)
  agent.ts        step 3: run the adapter, validate output
  agents/         adapters: claude-code, command (any CLI); types.ts is the contract
  validate.ts     split findings into postable (in diff) and issue-only
  diff.ts         diff parsing, commentable-line index, globs
  post.ts         step 4: create the draft review (the only review write)
  report.ts       step 5: render and write report issues in the runner repo
  issues.ts       report-issue lookup and labels
  state.ts        per-PR state stored as a hidden marker in the issue body
  sweep.ts        step 6: close issues for merged/closed PRs
  log.ts          the only logger; redaction
prompts/review.md default review prompt ({{placeholders}} filled in by src/prompt.ts)
schemas/          generated JSON schemas (do not edit by hand)
templates/runner/ starter for a private runner repo
docs/             architecture, configuration, security, extension guides
test/             vitest unit tests and fixtures
```

## Commands

```bash
npm ci                 # install (Node 22+)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint + prettier --check
npm test               # vitest
npm run format         # prettier --write
npm run schemas        # regenerate schemas/*.json after changing config.ts or findings.ts
npm run review -- --config <runner>/pr-review-bot.yml --pr owner/repo#123 --local
                       # full local run, writes nothing to GitHub (uses `gh auth token`)
```

Run `npm run typecheck && npm run lint && npm test` before finishing any change.

## Conventions

- TypeScript, ESM, strict mode, executed directly with `tsx` (no build step). Import
  local files with the `.ts` extension.
- Keep decision logic pure (see `select.ts`, `validate.ts`, `renderReport`) and test it.
  I/O lives in the step modules.
- Steps communicate only through files in the work directory (`workspace.ts`). Each step
  must work when run as a separate process with only its own secrets.
- One failing PR must not stop the others: catch per PR, record the error in its `out/`
  directory, continue.
- When adding a config key: update `config.ts`, `docs/configuration.md`, run
  `npm run schemas`, and add a test.
- When changing the findings contract: update `findings.ts`, `prompts/review.md`,
  run `npm run schemas`, and check every adapter still produces it.

## Extending

- New agent: `docs/adding-an-agent.md` (implement `AgentAdapter`, register in
  `src/agents/index.ts`, follow invariants 2-3).
- New notification channel: `docs/adding-a-notifier.md`.
- Review style for a specific project: that belongs in the runner repo's guidance files
  or the reviewed repo's `AGENTS.md`, not in this repo.
