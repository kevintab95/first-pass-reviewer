# PR review runner

Private runner for [pr-review-bot](https://github.com/kevintab95/pr-review-bot): every day
it pre-reviews the PRs waiting on me, leaves **draft** review comments only I can see, and
opens an issue here with the full reasoning.

## Setup

1. Edit `pr-review-bot.yml` (your login and repos) and `guidance/example.md`.
2. Add repository secrets (Settings → Secrets and variables → Actions):
   - `REVIEWER_TOKEN`: classic personal access token, `public_repo` scope
     (`repo` for private repos).
   - `CLAUDE_CODE_OAUTH_TOKEN`: from `claude setup-token`, or set `ANTHROPIC_API_KEY`
     instead.
3. Watch this repo (Watch → Custom → Issues) and turn on push notifications in the
   GitHub mobile app. Report issues are assigned to you.
4. Actions → daily-review → Run workflow, with `dry_run` checked and a PR number, to try it.

## Daily use

- A notification arrives for each reviewed PR. The issue explains every finding and why.
- Open the PR's **Files changed** tab: the draft comments are there, as yours. Edit,
  delete or add, then **Finish your review** and choose Comment, Approve or Request changes.
- New commits get an incremental review as a comment on the same issue. Issues close
  themselves when the PR is merged or closed.
- If you already have a pending review on a PR, the bot leaves it alone until you
  submit or discard it.
