# Rebasing cci/patches onto a new upstream release

1. `git fetch upstream --tags` (upstream = https://github.com/makeplane/plane.git)
2. `git checkout cci/patches && git rebase <new-tag>` — resolve per the conflict map below
3. Renumber our migration: rename `apps/api/plane/db/migrations/XXXX_member_availability.py`
   to the new tail number; update its `dependencies` to the new head.
4. `python tools/reapply-cci-brand.py` — re-applies the two mechanical branding passes
5. `pnpm install && pnpm build`; rebuild and push images per axios-tracker-ops/deploy
6. Deploy per `axios-tracker-ops/deploy/RUNBOOK.md`

Then verify, in this order, because each catches a failure the previous one cannot:

- `pnpm --filter web check:types` — **exit 0 proves very little here.** This tree has twice built
  clean and rendered broken.
- Load the app and read it. Every string must be prose, not a raw i18n key like
  `auth.common.email.label`. That failure exits 0 from every build step there is.
- Grep the **built bundle**, not the source, for the strings in "Third-party routing" below. Source
  greps have missed live links that the bundle scan caught.

## The conflict map

The patchset is 532 files against upstream, but that number badly overstates the work. What matters
is which files conflict, and how hard each is to resolve.

| Group | Files | On conflict |
|---|---|---|
| Locale JSON values | ~321 | **Take upstream**, then run `tools/reapply-cci-brand.py` |
| Binary assets (icons, spinners, OG) | ~33 | **Take ours** — `git checkout --ours`. Binaries never merge. |
| Theme ramp (`variables.css`) | 1 | **Take upstream**, then the script re-applies the hue rotation |
| TS/JS code | ~76 | Resolve by hand. 34 of these are ≤4 lines. |
| Python + email templates | ~44 | Resolve by hand |
| Files we created outright | 37 | Cannot conflict |

Never hand-resolve the first three groups. They are wide, shallow and mechanical, and hand-resolving
hundreds of hunks is how a subtle mistake gets in.

### Append-style lists — keep both sides

- `apps/api/plane/db/models/__init__.py`
- `apps/api/plane/app/urls/workspace.py`
- `apps/api/plane/app/views/__init__.py`
- `packages/constants/src/settings/profile.ts`

### Files upstream churns often, so expect these every time

Measured over upstream's last 300 commits before v1.4.2:

- `packages/tailwind-config/variables.css` — 15 commits. Scripted; take theirs and re-run.
- `apps/web/app/root.tsx` — 12 commits. Ours is the page title and OpenGraph block.
- `packages/constants/src/endpoints.ts` — 8 commits. Ours is one line, `SUPPORT_EMAIL`.
- `packages/propel/src/icons/brand/*` — 5 commits. Ours replaces the artwork wholesale; if upstream
  redraws their logo, take ours outright.

## Things that will silently regress if you are not looking for them

**Credentials in the compose file.** Upstream's `docker-compose.yml` ships `DATABASE_URL` and
`AMQP_URL` defaults that hardcode `plane:plane`, silently overriding generated secrets. We fixed
this in axios-tracker-ops; a rebase of that file can reintroduce it. The stack comes up and works,
on well-known credentials.

**Third-party routing.** Upstream keeps adding links to its own support, community and commerce.
None of them contain the word "Plane" in what a user reads, so a string sweep misses all of them.
After every rebase, grep the **built bundle** for:

```
plane.so/legals   support@plane.so   app.plane.so/upgrade
forum.plane.so    status.plane.so    makeplane/plane/issues
```

Each of those has, at some point, sent a CCI volunteer to a third party: to agree to Plane's Terms
of Service, to email Plane about a CCI outage, to pay Plane for a licence on a server CCI owns, or
to file a bug describing CCI's internals on a public issue tracker.

**The brand hue against the danger scale.** The retint rotates `--brand-*` to hue 24 while keeping
each token's lightness and chroma. Do not "simplify" this by setting the tokens to literal
`#DF4E4E`. Danger lives at hue 17–28, so hue gives no separation and it comes from lightness and
chroma instead. Measured in OKLab, primary vs destructive is dE 0.161 in light and 0.194 in dark;
substituting literal `#DF4E4E` collapses that to **dE 0.071**, close enough to the delete button to
be a hazard. The script guards against `--red-*` being caught by the rotation and fails loudly.

## Things that make the next rebase easier

Each of these exists because a past rebase-or-regenerate step went wrong once. They are cheap to
keep and expensive to rediscover.

**Regenerate rasters, never hand-edit them.** Every icon comes from `tools/` + `docs/brand/*.svg`.
The SVGs are the source; the PNGs and the `.ico` are output. If a raster looks wrong, fix the SVG
and regenerate — do not touch a PNG.

**Rasterising with headless Chrome needs `--default-background-color=00000000`.** Without it Chrome
composites onto opaque white, and the output has no alpha channel at all: every rounded corner comes
out solid white. It is invisible against a white page and obvious everywhere else, and it shipped
once. After regenerating, assert on pixels rather than eyeballing:

```python
from PIL import Image
im = Image.open("axios-icon-512x512.png")
assert im.mode == "RGBA", im.mode
assert im.convert("RGBA").load()[0, 0][3] == 0, "corner is not transparent"
```

**Prefer `currentColor` over per-theme assets.** The loader was two GIFs, one per theme. As an
inline SVG inheriting `currentColor` it is one component and zero assets, and a theme change cannot
desynchronise it. The same reasoning retired the dark/light spinner pair. Any new brand asset that
would need a light and a dark variant is probably better inline.

**SMIL does not animate inside `<img>`.** Measured: ~150 changed pixels across a cycle in an
`<img>`, against ~10,000 inlined in the DOM. If an animated mark is needed, inline it and drive it
with CSS. Do not ship an animated SVG as an `<img src>` and assume it moves.

**Keep component names, change only their contents.** `PlaneLockup`, `PlaneLogo`, `PlaneWordmark`
and `PlaneNewIcon` keep upstream's names across 19 call sites. Every rename is a conflict at every
call site on every future rebase, for nothing a user can see.

**Grep the built bundle, not the source.** Upstream's third-party links contain no searchable brand
word — `support@plane.so`, `forum.plane.so`, `app.plane.so/upgrade`, `makeplane/plane/issues` — and
source greps have missed live ones that a bundle scan caught. The check that works:

```bash
docker exec <web-container> sh -c 'for s in plane.so/legals support@plane.so   app.plane.so/upgrade forum.plane.so status.plane.so makeplane/plane/issues; do   printf "%-26s %s
" "$s" "$(grep -rl "$s" /usr/share/nginx/html | wc -l)"; done'
```

Every one of those should print `0`.

**A clean typecheck proves almost nothing here.** This tree has twice built green and rendered
broken — once with every string as a raw i18n key, once with white-cornered icons. Load the app and
look at it before believing a build.

## What must never be done

- Do not copy code from `makeplane/plane-ee` (private, proprietary).
- Do not remove upstream license or copyright notices (AGPL-3.0).
- Do not rename `PlaneLockup` / `PlaneLogo` / `PlaneWordmark` / `PlaneNewIcon`. The names are
  upstream's and the artwork inside them is ours; renaming multiplies the conflict surface across
  19 call sites for no user-visible gain.
- Do not edit i18n **keys**, only values. A changed key renders as a raw key on screen and exits 0
  from every build step.
- Do not add features to this fork that could live in the bot instead.

## Open items carried across rebases

- `apps/api/plane/utils/email.py` carries `SPDX-License-Identifier: LicenseRef-Plane-Commercial`
  ("proprietary and confidential"). It is byte-identical to upstream and is the only such file in
  the tree — upstream's own contradiction inside their public AGPL repo — but this fork is public
  and redistributes it. Unresolved.
- The sign-in Terms/Privacy notice is suppressed in
  `apps/web/core/components/account/terms-and-conditions.tsx` because it pointed at Plane's legal
  pages. Restore it by putting CCI's own published URLs in `LEGAL_LINKS`.
- The billing and upgrade surface has no meaning on self-hosted CE. Its links are inert but the UI
  is still present; removing it outright is a product decision.
