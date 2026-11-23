# Configuration

The runner repo holds `pr-review-bot.yml`. Only `reviewer` and `repos` are required.
Relative paths resolve against the config file's directory. Unknown keys are rejected.

The project was renamed from `pr-review-bot`. For compatibility, the default config file
name (`pr-review-bot.yml`), the report-issue label (`pr-review-bot`) and the hidden issue
state marker (`<!-- pr-review-bot:state ... -->`) keep the old name.
Machine-readable schema: [`schemas/config.schema.json`](../schemas/config.schema.json).

```yaml
reviewer: your-login # whose PRs are reviewed; draft reviews are created as this user
repos: [org/repo, org/other] # repositories to watch

select:
  assigned: true # PRs assigned to the reviewer
  reviewRequested: true # PRs where the reviewer is a requested reviewer
  skipDraftPrs: true # skip PRs marked as draft by their author
  labels: [] # only PRs carrying all of these labels
  skipAuthors: [] # e.g. ["dependabot[bot]"]

agent:
  type: claude-code # or "command" (see adding-an-agent.md)
  model: claude-opus-5-5 # optional; adapter default if omitted
  maxTurns: 40 # agent turn limit per PR
  timeoutMinutes: 20 # hard timeout per PR
  command: [] # type "command" only: argv of the agent CLI
  env: [] # type "command" only: env vars to pass ("NAME" or "TARGET=SOURCE")

prompt:
  template: prompts/custom.md # optional; defaults to prompts/review.md in first-pass-reviewer
  extraGuidance: [guidance/project.md] # files copied into guidance/ for the agent

context:
  checkout: true # check out the PR head so the agent can read surrounding code
  ignore: ["**/package-lock.json", "**/*.min.js", ...] # changed files to leave out

review:
  body: "Thanks @{{author}}! Left a few comments. PTAL" # draft review body; {{author}} = PR author
  postSeverities: [correctness, consistency] # drafted as comments; others go to the report only
  styleFromHistory: true # show the agent your recent review comments so drafts match your voice
  styleReviewers: [] # other maintainers whose comments are also used as examples, e.g. [seanlip]
  styleExampleCount: 15 # how many past comments to use in total

limits:
  maxPrsPerRun: 5
  maxFiles: 60 # changed files shown to the agent
  maxDiffLines: 4000 # total diff lines shown to the agent
  maxComments: 15 # comments in one draft review

issues:
  labels: [] # extra labels on report issues
  assignReviewer: true # assignment is what triggers the notification
```

## Guidance the agent reads

1. The reviewed repo's `AGENTS.md` files: at the root and in every ancestor directory of a
   changed file. Where a directory has no `AGENTS.md`, its `CLAUDE.md` is used instead.
2. `CONTRIBUTING.md` (or `.github/CONTRIBUTING.md`).
3. Your `prompt.extraGuidance` files.
4. With `review.styleFromHistory`, up to `review.styleExampleCount` recent top-level review
   comments (up to 3 years back, from GitHub's contributions API) by you and by anyone in
   `review.styleReviewers`, taking turns with yours first, written to `style/examples.md`. Comments on the PR under review are never included. They are
   already public, and they are used only to match your voice.

## Custom prompt templates

Copy `prompts/review.md` and point `prompt.template` at it. Available placeholders:
`{{repo}}`, `{{number}}`, `{{title}}`, `{{author}}`, `{{baseRef}}`, `{{headSha}}`,
`{{mode}}`, `{{scope}}`, `{{guidance}}`, `{{fileCount}}`, `{{includedCount}}`,
`{{excludedNote}}`, `{{sourceNote}}`, `{{maxComments}}`, `{{reviewer}}`, `{{styleNote}}`,
`{{postSeverities}}`. The output must still match the
findings schema.

## Workflow inputs (`review.yml`)

| Input                     | Default                          | Purpose                                                                                                                      |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `config`                  | `pr-review-bot.yml`              | config path in the runner repo                                                                                               |
| `bot_repository`          | `kevintab95/first-pass-reviewer` | change when using a fork                                                                                                     |
| `bot_ref`                 | `v1`                             | tag/branch/SHA of the bot to run                                                                                             |
| `dry_run`                 | `false`                          | skip creating draft reviews (issues are still written)                                                                       |
| `pr`                      | empty                            | review one PR (`owner/repo#123` or `123`) even if unchanged                                                                  |
| `agent_setup`             | installs Claude Code 2.1.330     | shell command installing the agent CLI                                                                                       |
| `egress_policy`           | `block`                          | `audit` to debug blocked network calls                                                                                       |
| `harden_runner`           | `auto`                           | run harden-runner: `auto` (public runner repos only), `always` (e.g. with a StepSecurity plan for private repos), or `never` |
| `extra_allowed_endpoints` | empty                            | extra `host:443` entries, e.g. another model API                                                                             |

Secrets: `reviewer_token` (required), `claude_code_oauth_token` or `anthropic_api_key`
(for Claude Code), `agent_api_key` (exposed to the agent step as `AGENT_API_KEY`).
