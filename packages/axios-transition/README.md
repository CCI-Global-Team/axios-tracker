# @plane/axios-transition

Moves Axios work items when GitHub branches, pull requests and reviews change. It is the only copy of
these rules: the GitHub webhook receiver in `apps/live` and the fallback Actions workflow both run
this module.

## For developers: how your ticket moves

Put the Axios key (e.g. `GAM-142`, the number Axios shows, never an old Jira number) in the **PR
title** or the **branch name**. The title wins when both carry a key, so fix a wrong key by renaming
the PR.

| When                                                                                       | The ticket goes to |
| ------------------------------------------------------------------------------------------ | ------------------ |
| You push a new branch with the key in its name                                             | In Progress        |
| You open the PR as a **draft**, or convert it back to draft                                | In Progress        |
| You open the PR ready, or click **Ready for review**                                       | Ready for Review   |
| A reviewer **requests changes**                                                            | In Progress        |
| You **re-request review** from that reviewer (or they approve, or the review is dismissed) | Ready for Review   |
| The PR is merged into the default branch                                                   | Ready for Test     |

So: open a draft while you are still working, and mark it ready when you want eyes on it. Once
changes are requested, push your fixes and click the re-request button next to the reviewer's name;
that is what moves the ticket back to Ready for Review.

The PR is also added to the work item's **Links**, and a comment on the PR links back to the ticket.

### Things that look like bugs but are not

- **Nothing pulls a ticket back once it reaches Ready for Test**, In Testing, UAT or Done. A QA bounce
  is moved by hand; opening a fix PR does not drag the ticket back.
- **Cancelled is never touched.** Reviving a cancelled ticket is a human decision.
- **One ticket, several PRs:** the ticket stays In Progress while any other open PR for it (in the
  same repo) is still a draft, and only reaches Ready for Test when the last one merges.
- **Review comments do nothing.** Only a verdict (changes requested, approved, dismissed) can move a
  ticket.
- **Re-requesting a whole team** does not clear one person's changes request; re-request the person.
- **A project without a Ready for Review state** (WordPress today) gets In Progress instead.
- **A PR with no key** is ignored. That is normal and never fails anything.

## For maintainers

### Where it runs

- **GitHub webhook** (the live path since 2026-09-25): each product repo has a repository webhook for
  `pull_request`, `pull_request_review` and `push` pointing at `POST /live/github/webhook`. The
  receiver is `apps/live/src/controllers/github-webhook.controller.ts`: it checks the HMAC signature,
  answers straight away and runs `handleEvent` one event at a time per PR. It costs no Actions
  minutes, which is the reason it exists (the org has a 2,000-minute monthly cap).
- **Actions fallback:** `.github/workflows/axios-transition.yml` runs `cli.mjs` on this repo's own PRs
  and can be called again from a product repo if the webhook ever has to be switched off. Setting up,
  switching off and rolling back the webhook are in the ops repo, `deploy/RUNBOOK.md` section 10.

`shouldHandle` mirrors the workflow's job-level `if:` and the callers' event types. Change them together.

### Why the target comes from the PR, not the event

A burst of events for one PR (open plus three review requests) is collapsed: while one run is in
flight, a newer event replaces the queued one. The run that survives therefore reads the PR as it is
now (draft flag, reviews, requested reviewers) instead of trusting the action that fired it. Keep it
that way, or collapsing starts dropping state changes.

The design notes at the top of `index.mjs` explain each rule in more depth.

### Changing the rules

1. Edit `index.mjs` (and `index.d.ts` if an export changes).
2. `node --test 'packages/axios-transition/*.test.mjs'` and `pnpm --filter live test`.
3. Merge to `cci/patches`, then run the **Release** workflow with deploy. The webhook path picks up the
   new code only after a deploy; the Actions fallback picks it up on merge.

No product-repo changes are needed. States are matched by name: renaming a state in Axios, or adding
one to the rank, is a code change here.

### Configuration

| Variable                | Where                                                | What                                                                                   |
| ----------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | live container (`deploy/.env`)                       | HMAC secret shared with the repo webhooks. Empty = endpoint answers 503.               |
| `AXIOS_BOT_TOKEN`       | live container; `AXIOS_BOT_TOKEN` secret for Actions | The "Axios automation" bot's `pr-automation` API token.                                |
| `AXIOS_GITHUB_TOKEN`    | live container                                       | Fine-grained token, Pull requests read/write on the product repos. Expires 2027-09-24. |
| `AXIOS_HOST`            | live container                                       | Defaults to `https://axios.joincci.org`.                                               |

Logs: `docker logs axios-tracker-live-1 | grep GITHUB_WEBHOOK`. GitHub keeps each delivery and its
response under the repo's Settings → Webhooks → Recent deliveries, with a Redeliver button.
