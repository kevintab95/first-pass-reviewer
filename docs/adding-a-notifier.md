# Adding a notifier

The built-in notification is the **report issue** in the runner repo. It is created by
`github-actions[bot]` and assigned to you (later reviews @mention you), so GitHub notifies
you by web, email (per your GitHub settings) and the GitHub mobile app.

> Why a bot and not you? GitHub never notifies you about your own actions, and draft
> reviews notify nobody. That is why issues are written with the runner's `GITHUB_TOKEN`,
> not your reviewer token.

## Adding another channel

Notifications belong in a new step after `report`, because by then every PR's outcome is
in its `out/` directory.

1. Create `src/notify/<channel>.ts` exporting a function that takes the plan and a list
   of rows `{ repo, number, title, url, status, commentCount, issueUrl? }` and sends them.
2. Add a `notify` command to `src/cli.ts` that builds those rows from the work directory
   and calls every channel whose secret is set.
3. Add a step to `review.yml` with only that channel's secret in `env`, plus the
   channel's host in the harden-runner allow list.
4. Add the secret to the `workflow_call.secrets` list and document it in
   `docs/configuration.md`.

### What a notification may contain

Only public information: PR numbers, titles, links, counts and statuses. Never findings,
reasoning or comment text, because notification services are third parties and messages
may be stored or logged there.

### Candidate channels

| Channel         | How                                 | Notes                                            |
| --------------- | ----------------------------------- | ------------------------------------------------ |
| ntfy            | `POST https://ntfy.sh/<topic>`      | free; use a long random topic or an access token |
| Telegram        | Bot API `sendMessage`               | free; needs a bot token and chat id              |
| Email           | SMTP (Gmail app password, Brevo, …) | send to any address                              |
| Slack / Discord | incoming webhook                    | free in a workspace/server you control           |
