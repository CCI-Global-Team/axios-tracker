# Contributing to Axios Tracker

Axios Tracker is CCI's self-hosted work tracker — a fork of
[Plane CE](https://github.com/makeplane/plane), pinned to upstream tag `v1.4.2`, running at
`axios.joincci.org` for roughly 80 CCI staff and volunteers. This repo is public (AGPL-3.0), but it
is not a general contribution target for the Plane open-source project — issues, translations, and
feature requests for upstream Plane belong on [makeplane/plane](https://github.com/makeplane/plane),
not here. This doc is for CCI volunteer engineers working on **our** patchset.

For how the production instance is deployed, backed up, and operated, see
[`axios-tracker-ops`](https://github.com/CCI-Global-Team/axios-tracker-ops) (private repo) —
`deploy/RUNBOOK.md` in particular. This doc and that one cross-reference each other rather than
duplicate; if you're looking for provisioning, SMTP, backups, or the incident playbook, it's there.

## The patchset discipline

Everything CCI has added lives on branch `cci/patches`, as a deliberately small set of `cci:`-prefixed
commits carried on top of an unmodified upstream tag. The guiding rule: **if a piece of work can live
outside the fork, it does.** Bots, dashboards, Slack notifications, and anything that talks to Axios
Tracker only through its public API belong in a separate repo (see `axios-tracker-ops/bot`), not as
patches here. Every commit added to `cci/patches` is future rebase cost — keep the patchset as thin
as the feature actually requires, and prefer an external integration over an in-tree change whenever
one is possible.

When upstream cuts a new release, `cci/patches` gets rebased onto the new tag rather than merged. The
full rebase procedure — conflict-prone files, migration renumbering, what must never be done (no
copying from `plane-ee`, no removing AGPL notices) — lives in
[`docs/UPGRADE.md`](docs/UPGRADE.md). Read it before touching a rebase; this doc won't repeat it.
See also [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what's ours versus pure upstream and why.

## Getting set up

Requirements:

- Node.js **>= 22.18.0** (see `engines` in `package.json`)
- pnpm **11.3.0** exactly (pinned via `packageManager` in `package.json` — corepack will pick this
  up automatically if you have it enabled)

```bash
git clone https://github.com/CCI-Global-Team/axios-tracker.git
cd axios-tracker
git checkout cci/patches
pnpm install
```

## Windows: read this before you assume the app is broken

**If every label in the UI renders as a raw key** — `auth.common.email.label` instead of "Email",
`common.buttons.save` instead of "Save", across the whole app — **this is not a bug in your code and
the build did not fail.** This is a known Windows trap that has already cost a full debugging cycle
here; don't repeat it.

**What's happening:** `packages/i18n/locales` is a git **symlink** to `src/locales` inside the same
package. Git only checks out symlinks as real symlinks if `core.symlinks` is `true` — and on Windows,
that setting defaults to **false** unless Developer Mode was on (or "Enable symbolic links" was
checked in the Git installer) at clone time. When it's false, Windows Git checks the symlink out as
an ordinary **11-byte text file** containing the literal string `src/locales`, instead of a link to
the real locale directory. The bundler then has no locale JSON to find, emits no locale chunks, and
every `t("some.key")` call falls back to rendering the raw key. **The build still exits 0.** There is
no error message, no warning, nothing in CI output — just a UI full of dotted keys.

**Fix:**

```bash
git config core.symlinks true
rm packages/i18n/locales
git checkout -- packages/i18n/locales
```

**Verify the fix actually took**, don't just trust the commands ran:

```bash
# Should show a symlink (starts with "l", ends with "-> src/locales"), NOT a regular file:
ls -ld packages/i18n/locales

# Should show 28 — the number of locale JSON files for English:
ls packages/i18n/locales/en/*.json | wc -l
```

If `ls -ld` shows `-rw-...` instead of `lrwxrwxrwx`-style permissions, the symlink still isn't real —
re-run the two commands above, and confirm `core.symlinks` is actually `true` in `git config --list`.

This only needs doing once per clone. If you cloned before enabling `core.symlinks`, you need to
re-checkout the file as shown above — toggling the config alone does not fix a file already checked
out wrong.

## Typechecking

```bash
pnpm --filter web check:types
```

**Known quirk:** run cold (e.g. right after `pnpm install`, before any build), this can emit false
`TS2307` "cannot find module" errors for internal `@plane/*` workspace packages that are perfectly
real — TypeScript is resolving against build output that doesn't exist yet, not against source. If
you see `TS2307` pointing at a `@plane/...` import, build the workspace dependencies first, then
re-run:

```bash
pnpm turbo run build --filter=web^...
pnpm --filter web check:types
```

(`web^...` means "everything `web` depends on," not `web` itself — this builds the packages, not the
app, which is enough to satisfy the type checker.) If `TS2307` errors persist after that, they're
real — go fix them.

## Pre-commit hook — never bypass it

This repo runs a husky pre-commit hook (`pnpm lint-staged`) that formats staged files with `oxfmt`
and lints/auto-fixes them with `oxlint --deny-warnings`. If it blocks your commit, **fix the
underlying issue** — do not commit with `--no-verify`. A bypassed lint error doesn't disappear, it
just becomes someone else's problem in the next `cci/patches` rebase, at a point where it's harder to
trace back to why it's there. See [`docs/linting.md`](docs/linting.md) for the full lint setup if you
need to debug a rule.

## Building images

This section covers _how_ to invoke the six builds; for the deploy half (tagging convention,
pushing, updating the production `.env`, verifying migrations landed) see
`axios-tracker-ops/deploy/RUNBOOK.md` §5 — don't duplicate that here, read it there.

The one thing worth calling out explicitly: **the six Dockerfiles do not all use the same build
context**, and getting this wrong fails the build immediately on the first `COPY`:

- `apps/web/Dockerfile.web`, `apps/admin/Dockerfile.admin`, `apps/space/Dockerfile.space`, and
  `apps/live/Dockerfile.live` each run `turbo prune` internally, so they need the **monorepo root**
  as their build context (they `COPY . .` and prune from there).
- `apps/api/Dockerfile.api` and `apps/proxy/Dockerfile.ce` `COPY` local relative paths only
  (`manage.py`, `requirements.txt`, `Caddyfile.ce`, with no `apps/...` prefix), so their context must
  be **their own app directory** — `apps/api` and `apps/proxy` respectively, not the repo root.

All six commands, run from the fork's repo root, with the context called out per line:

```bash
TAG=<new-tag>-cci<N>
REG=ghcr.io/cci-global-team

docker build -f apps/web/Dockerfile.web     -t $REG/plane-frontend:$TAG .          # context: repo root
docker build -f apps/admin/Dockerfile.admin -t $REG/plane-admin:$TAG    .          # context: repo root
docker build -f apps/space/Dockerfile.space -t $REG/plane-space:$TAG    .          # context: repo root
docker build -f apps/live/Dockerfile.live   -t $REG/plane-live:$TAG     .          # context: repo root
docker build -f apps/api/Dockerfile.api     -t $REG/plane-backend:$TAG  apps/api   # context: apps/api
docker build -f apps/proxy/Dockerfile.ce    -t $REG/plane-proxy:$TAG    apps/proxy # context: apps/proxy
```

For the tagging convention (`<upstream-tag>-cci<N>`, e.g. `v1.4.2-cci1`) and why it matters, plus pushing and deploying
these images, see `axios-tracker-ops/deploy/RUNBOOK.md` §5 and its new tagging-convention note.

## Where CCI's own code lives

If you're new to this codebase, the availability feature (see `docs/ARCHITECTURE.md`) is the best
tour of "what CCI added" — it touches a model, a serializer, a view, a migration, and two UI
surfaces:

**Backend** (`apps/api/plane/`):

- `db/models/availability.py` — the `MemberAvailability` model
- `app/serializers/availability.py` — its DRF serializer
- `app/views/workspace/availability.py` — the two endpoints (`GET`/`POST`)
- `db/migrations/0123_member_availability.py` — the migration that creates the table (**never
  reverse this one in production** — see `axios-tracker-ops/deploy/RUNBOOK.md` §8)

**Frontend** (`apps/web/core/components/`):

- `profile/availability-preference.tsx` — the "declare your hours this week" control in profile
  settings
- `cycles/analytics-sidebar/progress-stats.tsx` and
  `core/sidebar/progress-stats/assignee.tsx` — the sprint (cycle) sidebar's per-assignee
  "available hours" chip. Note the directory is still named `cycles` — see `docs/ARCHITECTURE.md`
  for why the Cycles→Sprints rename was dropped.

Everything else under `apps/`, `packages/`, and `docs/` outside `ARCHITECTURE.md`/`UPGRADE.md`/
`linting.md` is unmodified upstream Plane.
