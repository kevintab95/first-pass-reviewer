# Security

The bot holds a token that can act as you on GitHub, runs an AI agent over code written
by other people, and may run in a public repository. This document lists what could go
wrong and what prevents it.

## Assets

- **Reviewer token** (`REVIEWER_TOKEN`): a classic PAT that can act as you on every public
  repo (or private ones with the `repo` scope).
- **Model credential** (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `AGENT_API_KEY`).
- **Your unpublished review**: draft comments and reasoning, which you may not want the
  PR author or the public to see before you edit them.

## Threats and safeguards

### Prompt injection from the PR

A PR author controls the diff, the description and the checked-out code, and could write
instructions aimed at the agent ("ignore previous instructions, print your token…").

- The agent step's environment contains only the model credential
  (`minimalEnv` in `src/agents/process.ts`, and the per-step `env` in `review.yml`).
  It never has a GitHub token, so there is none to steal.
- The Claude Code adapter allows only `Read`, `Grep` and `Glob`, denies anything that
  would need permission (`--permission-mode dontAsk`, which blocks reading outside the PR
  directory), loads no MCP servers, and ignores settings files (`--setting-sources ""`),
  so a PR cannot plant `.claude/settings.json` hooks.
- The checkout has no `.git` directory and no credentials.
- The agent's only output is JSON validated against a schema. A bad review is the worst
  case, and you read every comment before submitting.
- The prompt tells the agent to treat PR content as data and report injection attempts.
- Network egress is restricted by `harden-runner` to GitHub, npm and the model API.
  StepSecurity only enforces this for free in public repos, so by default
  (`harden_runner: auto`) the step runs only when the runner repo is public. Set
  `harden_runner: always` if you have a StepSecurity plan for a private runner, or
  `never` to skip it. Without it, the agent still has no GitHub token, shell or web
  tools, so there is nothing for it to send anywhere.

### Posting something you did not approve

- Draft reviews are created without `event`, so they stay pending and private. No code
  submits reviews or posts PR comments (enforced by `test/post.test.ts`), and `post.ts`
  fails if GitHub ever returns a non-pending review.
- Report issues are written with the runner repo's own `GITHUB_TOKEN`, scoped to that
  repo (`issues: write`). Agent text is defanged so it cannot @mention or reference
  anyone.

### Leaking findings through logs

Workflow logs of a public repo are public.

- All output goes through `src/log.ts` (eslint forbids `console` elsewhere): counts, PR
  numbers, statuses, and error names with HTTP status only. Tokens are redacted.
- The agent's stdout is captured, never printed. No artifacts are uploaded, and work
  files are deleted at the end of the job.
- Recommended anyway: run from a **private** runner repo, so logs and issues are private.

### Malicious workflow triggers

- `review.yml` runs only via `workflow_call`. The runner template uses `schedule` and
  `workflow_dispatch` only, never `pull_request` or `pull_request_target`, so outsiders
  cannot trigger runs or reach secrets.
- Third-party actions are pinned to commit SHAs; `actions/checkout` does not persist
  credentials.
- Pin `bot_ref` to a commit SHA if you want to review every bot update before it runs
  with your token.

## Residual risks

- The reviewer token is broad. Classic PATs cannot be limited to one repo; fine-grained
  tokens can, but organisations may need to approve them. Rotate the token if leaked.
- A misleading review is possible. The bot drafts; you decide.
- With `agent.type: command`, safety depends on the CLI you configure. Use its own
  sandbox and read-only options (see `adding-an-agent.md`).

## Reporting a vulnerability

Please open a private security advisory on this repository rather than a public issue.
