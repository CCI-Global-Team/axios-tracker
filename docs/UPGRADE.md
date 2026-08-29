# Rebasing cci/patches onto a new upstream release

1. `git fetch upstream --tags` (upstream = https://github.com/makeplane/plane.git)
2. `git checkout cci/patches && git rebase <new-tag>`
3. Renumber our migration: rename `apps/api/plane/db/migrations/XXXX_member_availability.py`
   to the new tail number; update its `dependencies` to the new head.
4. (No vocabulary pass — the Cycles→Sprints rename was dropped 2026-08-29; upstream wording is used as-is.)
5. `pnpm install && pnpm build`; rebuild and push images per axios-tracker-ops/deploy.
6. Deploy per `axios-tracker-ops/deploy/RUNBOOK.md` §upgrade.

## Conflict-prone files

All are append-style lists — resolve by keeping both sides:

- `apps/api/plane/db/models/__init__.py`
- `apps/api/plane/app/urls/workspace.py`
- `apps/api/plane/app/views/__init__.py`
- `packages/constants/src/settings/profile.ts`

## What must never be done

- Do not copy code from `makeplane/plane-ee` (private, proprietary).
- Do not remove upstream license or copyright notices (AGPL-3.0).
- Do not add features to this fork that could live in the bot instead.
