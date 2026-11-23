# pr-review-bot

A daily AI pre-review of the pull requests waiting on you. It leaves **draft review
comments that only you can see**, so you can edit, delete or add to them and submit the
review yourself. It never approves, requests changes or comments publicly on your behalf.

For each PR assigned to you or awaiting your review, it:

1. Reads the diff and the surrounding code at the PR head, plus the project's `AGENTS.md`
   and any review guidance you provide.
2. Creates a **pending review** as you, with plain-English line comments.
3. Opens (or updates) an issue in your **private runner repo** with the full analysis:
   every finding, the drafted comment, and the reasoning behind it. GitHub notifies you,
   including on mobile.
4. On later runs, reviews only new commits, and closes the issue when the PR is merged
   or closed.

It runs on GitHub Actions (free), and with Claude Code can use your existing Claude
subscription. Other agent CLIs can be plugged in.

## How it fits together

```
your private runner repo                    this public repo
┌───────────────────────────────┐           ┌──────────────────────────────────┐
│ .github/workflows/daily.yml   │──calls──▶ │ .github/workflows/review.yml     │
│ pr-review-bot.yml (config)    │           │ src/ (plan → prepare → agent →   │
│ guidance/*.md                 │           │       post → report → sweep)     │
│ secrets, run logs, issues     │           └──────────────────────────────────┘
└───────────────────────────────┘
```

Keeping the runner repo private keeps your run logs and reports private. The bot is
designed to leak nothing even from a public runner (see [docs/security.md](docs/security.md)),
but private is the recommended setup.

## Quick start

1. **Create a private runner repo** from [`templates/runner/`](templates/runner): copy
   its files, then edit `pr-review-bot.yml` (your login and repos) and
   `guidance/example.md`.
2. **Add secrets** to the runner repo (Settings → Secrets and variables → Actions):
   - `REVIEWER_TOKEN`: a classic personal access token with the `public_repo` scope
     (`repo` if you review private repos). Draft reviews are created with it, as you.
   - `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` locally (uses your Claude
     subscription), **or** `ANTHROPIC_API_KEY` for pay-as-you-go API usage.
3. **Get notified:** Watch the runner repo (Custom → Issues), and enable push
   notifications in the GitHub mobile app. Report issues are assigned to you.
4. **Try it:** Actions → daily-review → Run workflow with `dry_run` checked and a PR
   number. You get a report issue but no draft. Then run without `dry_run`.

The schedule in the template runs daily; change the `cron` line to suit you.

### Run locally

```bash
npm ci
npm run review -- --config ../my-runner/pr-review-bot.yml --pr owner/repo#123 --local
```

`--local` writes nothing to GitHub; the report is saved under
`work/prs/<owner>__<repo>/<n>/out/issue.md`. It uses your `gh` login and your local
Claude Code login.

## Documentation

- [docs/architecture.md](docs/architecture.md): pipeline steps, files and state
- [docs/configuration.md](docs/configuration.md): every config key and workflow input
- [docs/security.md](docs/security.md): threat model and safeguards
- [docs/adding-an-agent.md](docs/adding-an-agent.md): use Codex, Gemini CLI or others
- [docs/adding-a-notifier.md](docs/adding-a-notifier.md): add email, ntfy, Telegram, …
- [AGENTS.md](AGENTS.md): guide for contributors and their coding agents

## Limitations

- GitHub allows one pending review per person per PR. If you already have one in
  progress, the bot skips that PR until you submit or discard it.
- Comments can only be attached to lines in the diff. Findings elsewhere appear in the
  report issue only.
- Very large PRs are reviewed partially (see `limits` in the configuration); the report
  lists skipped files.

## License

MIT
