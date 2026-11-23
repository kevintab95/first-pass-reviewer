# AGENTS.md

This is a **pr-review-bot runner repo**: configuration only. The bot's code lives in the
public `pr-review-bot` repository and is called from `.github/workflows/daily-review.yml`.
Read the bot's `AGENTS.md` and `docs/` before changing how the bot works; change it there,
not here.

## Files

- `pr-review-bot.yml`: who is reviewed, which repos, limits, agent settings. All keys are
  documented in the bot's `docs/configuration.md`; the schema is
  `schemas/config.schema.json` there.
- `guidance/*.md`: project-specific review focus given to the agent, in addition to the
  reviewed repo's own `AGENTS.md`. Keep it about what to look for and what to ignore.
- `.github/workflows/daily-review.yml`: schedule and manual trigger.

## Rules

- Never commit secrets or tokens. Credentials are repository secrets
  (`REVIEWER_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`).
- Never add `pull_request` or `pull_request_target` triggers to the workflow.
- Keep `permissions` at `contents: read` and `issues: write`.
- Report issues (label `pr-review-bot`) are written by the bot. Do not edit the hidden
  `<!-- pr-review-bot:state ... -->` marker at the top of an issue unless you want to
  force a re-review (delete `lastReviewedSha`).

## Testing a change

Run the workflow manually with `dry_run` checked and one PR number: it writes the report
issue but creates no draft review. Or run locally from a checkout of the bot:

```bash
npm run review -- --config ../<this-repo>/pr-review-bot.yml --pr <owner/repo#n> --local
```
