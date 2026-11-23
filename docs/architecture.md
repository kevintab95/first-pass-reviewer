# Architecture

The pipeline is six steps. In CI each runs as a separate process (a separate workflow
step), so each receives only the credentials it needs. They communicate through files in
a work directory. `cli.ts review` runs all six in one process for local use.

| Step    | Module       | Credentials                          | Reads                                    | Writes                                                        |
| ------- | ------------ | ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| plan    | `plan.ts`    | reviewer token, runner token         | open PRs, pending reviews, report issues | `plan.json`                                                   |
| prepare | `prepare.ts` | reviewer token (read only)           | PR files, compare API, public git        | per-PR directory                                              |
| agent   | `agent.ts`   | model credential only                | `prompt.md`, PR directory                | `out/findings.json` or `out/agent-error.json`                 |
| post    | `post.ts`    | reviewer token                       | findings, `files.json`                   | draft review on the PR, `out/partition.json`, `out/post.json` |
| report  | `report.ts`  | runner token (`github-actions[bot]`) | everything in `out/`                     | report issue in the runner repo                               |
| sweep   | `sweep.ts`   | runner token, reviewer token         | report issues, PR states                 | closes issues of finished PRs                                 |

## Work directory

```
<work>/plan.json
<work>/prs/<owner>__<repo>/<number>/
  prompt.md      rendered prompt (prompts/review.md + values)
  meta.json      PR metadata, changed files (with included/excluded flags), guidance list
  files.json     every changed file with its patch; used by `post` to validate lines
  diff.patch     diff of the files the agent reviews (after ignore globs and limits)
  focus.patch    incremental runs only: changes since the last reviewed commit
  src/           PR head checkout (no .git), when context.checkout is true
  guidance/      extra guidance files from the runner repo
  style/         examples.md: the reviewer's past review comments, for voice (optional)
  out/           step outputs (see table above), issue.md in local runs
```

The agent runs with the PR directory as its working directory and can only read inside it.

## Choosing PRs (`plan`)

1. List open PRs of each configured repo and keep those that match `select`
   (assigned and/or review requested, not drafts, not your own, labels, authors).
2. For each, skip it when you have a pending review (GitHub allows only one, and you may
   be editing it).
3. Read the PR's report issue state: skip when `lastReviewedSha` equals the head.
4. Otherwise review it: **incremental** when GitHub's compare API says the new head is
   `ahead` of the last reviewed one, **full** otherwise (first review, force-push, rebase).
5. Keep at most `limits.maxPrsPerRun`, oldest PRs first.

`--pr` forces a full review of one PR regardless of state (but still respects a pending review).

## State

There is no state file. Each report issue starts with a hidden marker:

```html
<!-- pr-review-bot:state {"repo":"org/repo","pr":42,"lastReviewedSha":"abc…"} -->
```

`report` updates it only after a complete review (`posted` or `nothing-to-post`). Dry
runs, failures and skipped posts leave it unchanged, so the next run tries again.

## Findings contract

Agents return JSON matching `schemas/findings.schema.json` (generated from
`src/findings.ts`):

```json
{
  "summary": "What the PR does and the main concerns.",
  "findings": [
    {
      "path": "core/domain/topic_services.py",
      "line": 1439,
      "side": "RIGHT",
      "severity": "correctness",
      "title": "Old suggestions can still be accepted after a rename",
      "comment": "Plain-English draft comment for the PR author.",
      "reasoning": "For the reviewer only: traced paths and evidence.",
      "confidence": "high"
    }
  ]
}
```

`comment` is the only text that goes into the draft review: short, one concern, usually a
question, in the reviewer's voice. `title`, `reasoning`, the optional `gapLocation` (where
the real gap is when it lies outside the diff) and `summary` appear only in the report
issue. The draft review's body comes from `review.body` in the config, not from the agent.
`post` drafts only severities listed in `review.postSeverities`, and keeps findings whose line is in the diff (multi-line ranges must be inside one
hunk), up to `limits.maxComments`, ordered by severity then confidence. The rest are shown
in the report issue with the reason they were not drafted.

## Report issues

One issue per PR, titled `owner/repo#123: PR title`, labelled `pr-review-bot`,
`repo:owner/repo` and `correctness` when relevant, assigned to the reviewer. The first
review is the issue body; later reviews are comments that @mention the reviewer. The
issue is reopened if a closed PR gets reviewed again, and closed by `sweep` when the PR
is merged or closed.
