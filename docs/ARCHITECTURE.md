# Architecture — what CCI added on top of upstream

This is a short, factual account of everything CCI has changed relative to upstream Plane CE
`v1.4.2`, so a future maintainer can tell at a glance what's ours to maintain versus what's pure
upstream and should be treated as such (no local workarounds — fix it via a rebase or report it
upstream instead). For _how_ to carry and rebase these changes, see [`UPGRADE.md`](UPGRADE.md); for
day-to-day contributor setup, see [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## MemberAvailability

**What it's for.** Axios Tracker's ~80 users are volunteers, not full-time staff, and their
available hours vary week to week. `MemberAvailability` lets a volunteer declare how many hours they
can give in a given week; a lead planning sprint (cycle) assignments can see that number next to each
assignee's workload in the sprint sidebar, instead of guessing.

**Model.** `apps/api/plane/db/models/availability.py`. One row per `(workspace, member, week_start)`,
where `week_start` is always the Monday of the declared week. Enforced two ways:

- Django's `unique_together` on `["workspace", "member", "week_start", "deleted_at"]`
- A `UniqueConstraint` scoped to `deleted_at__isnull=True`

The second is the one that actually matters day to day: this model uses Plane's standard soft-delete
(`BaseModel` sets `deleted_at`), and a plain `unique_together` including a nullable `deleted_at`
column would let a member re-declare the same week only by colliding with their own soft-deleted row.
The partial `UniqueConstraint` is what makes "one live declaration per member per week, any number of
soft-deleted ones" actually hold.

**Endpoints** (`apps/api/plane/app/views/workspace/availability.py`):

- `GET /api/workspaces/<slug>/availability/?week_start=<YYYY-MM-DD>` — every member's declared
  availability for one week (defaults to the current week if `week_start` is omitted). Available to
  any workspace member (admin, member, or guest).
- `POST /api/workspaces/<slug>/availability/` — upsert the **calling user's own** declaration for a
  week. The view deliberately ignores any member id in the request body and always writes against
  `request.user` — there is no way to declare availability on someone else's behalf through this
  endpoint, by admins or otherwise.

**Design rule: undeclared and zero must render differently.** A member who has declared nothing for a
week must show **no availability text at all**. A member who has explicitly declared `0` hours must
show **"0h"**. These are not the same thing — one is "we don't know," the other is "this person told
us they have no time this week" — and collapsing them looks the same from the outside (nobody assumes
they've made a commitment) but means something very different to a lead trying to read the sidebar.

This is enforced by never defaulting the frontend value to `0`: the sidebar
(`apps/web/core/components/cycles/analytics-sidebar/progress-stats.tsx`) builds a
`Record<string, number>` from whatever the availability endpoint actually returned, so a member with
no row simply has no entry in that map — their `availableHours` field stays `undefined`, not `0`. The
render check in `apps/web/core/components/core/sidebar/progress-stats/assignee.tsx` is explicitly
`assignee.availableHours !== undefined`, not a truthy check (`if (assignee.availableHours)`, which
would treat a real `0` the same as "nothing to show" and reintroduce the exact bug this guards
against). If you touch either file, keep that distinction — an earlier version of this feature
collapsed the two states, which made every non-responder in a workspace look like they'd declared
zero hours, silently, with no error.

## What's deliberately NOT in this fork

- **No Discord integration.** Nothing here talks to Discord. If CCI wants Axios Tracker activity in
  Discord, that's an external bot subscribing to Plane's webhooks/API, not an in-tree patch — see
  `axios-tracker-ops/bot`.
- **No GitHub automation** (auto-linking commits/PRs to work items, status transitions on PR merge,
  etc.). Same reasoning: an external integration against the public API, not a fork patch, if it's
  ever built.
- **No vocabulary rename.** An earlier patch (`cci: rename Cycles to Sprints in en locale`) rewrote
  the user-facing English locale strings for Plane's "Cycle" concept to "Sprint," on the theory that
  "Sprint" is the term CCI actually uses. It was **dropped** (`cci: drop the Cycles->Sprints rename`)
  once it became clear upstream hardcodes user-facing English directly in components — activity
  feeds, delete-confirmation modals, empty states, kanban column headers — bypassing the i18n layer
  entirely in those spots. A locale-only rename can't reach that hardcoded text, so the result was a
  half-renamed UI: "Sprint" in some places, "Cycle" in others, with no clear rule for which. Consistent
  upstream wording throughout beats a partially-applied rename, and dropping it also removes a step
  that had to be manually re-run and re-verified on every rebase. Routes, API fields, database tables,
  and directory names (e.g. `apps/web/core/components/cycles/`) all still say "cycle" — that's
  upstream's vocabulary and this fork does not diverge from it.

## The rebase-cost principle

`cci/patches` is rebased onto each new upstream tag rather than merged (`UPGRADE.md` has the full
procedure). Three files are hot spots for conflicts on every rebase, because CCI's patches and
upstream's own ongoing changes both append to the same lists:

- `apps/api/plane/db/models/__init__.py`
- `apps/api/plane/app/urls/workspace.py`
- `apps/api/plane/app/views/__init__.py`
- `packages/constants/src/settings/profile.ts`

All four are resolved the same way: **keep both sides.** These are registration lists (model
exports, URL patterns, view exports), not logic — a conflict here almost never means CCI's addition
and upstream's addition are incompatible, it means they both added a line near each other. Dropping
either side either breaks a CCI feature or silently reverts an upstream fix; take both entries and
move on. If a conflict in one of these files ever looks like more than a nearby-line collision, that's
worth stopping and reading closely rather than resolving on autopilot — but that has not been the
normal case so far.
