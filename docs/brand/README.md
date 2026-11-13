# Axios brand assets

These are the canonical brand files for **Axios**, CCI's engineering tracker. The apps under
`apps/*/public/` and `apps/*/app/assets/` hold _copies_ of these — when a mark changes, change it
here first, then re-copy.

## The mark

The Axios mark is **the chain**: CCI's three linked loops drawn as one continuous line that crosses
itself twice. At each crossing the `\` strand passes over; the `/` strand underneath fades out under a
soft radial mask, so the over/under reads on any ground without a painted gap.

The wordmark is **AXIOS** in squared capitals. The A's crossbar is a slanted red "spark" that echoes
the chain's strands. The O and S overshoot the cap line and baseline slightly so they look the same
height as the flat letters.

Lockups:

- **Horizontal** (`PlaneLockup`): chain, then AXIOS on the chain's centre line. Top bars and headers.
- **Mark alone** (`PlaneLogo`): loaders, icons, small headers.
- **Wordmark alone** (`PlaneWordmark`): where the chain is already on screen.

All three draw from `packages/propel/src/icons/brand/axios-art.tsx`. The loader is `AxiosLoader` in the
same folder: the chain draws itself from the left crossing, holds, and retracts, with soft ends and a
fade at each end of the lap.

## Colour

| Token         | Value                                   | Use                                                                  |
| ------------- | --------------------------------------- | -------------------------------------------------------------------- |
| CCI Red       | `#D2181D`                               | The chain and the A's crossbar on light grounds; the favicon ground. |
| Red on dark   | `#FF4B4B`                               | The same, on dark grounds (`--axios-brand` switches in dark mode).   |
| Icon gradient | `#E3121B` → `#9A0710` → `#5E0007`, 135° | App icon ground at 48px and up.                                      |
| White         | `#FFFFFF`                               | The chain on red.                                                    |

Product UI colours come from the theme tokens and are not brand colours; do not reuse the red for
status or semantic meaning.

## Small sizes

At 32px and under the soft crossing fade turns to mush, so favicons use a separate drawing: a heavier
line (9 instead of 6.6 on the 123.1 x 37.9 box) with the under strand cut by a gap in the ground colour,
on flat red. That cut only works on the one ground it was cut for, which is why it is limited to the
favicon tiles.

## Regenerating

Everything below is output. `tools/generate-brand-assets.py` produces the whole set from one
definition; The chain geometry there must match `axios-art.tsx`.

```bash
python tools/generate-brand-assets.py --install
```

It asserts the rasters came out RGBA with transparent corners before it finishes, because the
failure mode there is silent and shipped once.

## Files

| File                                        | What it is                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `axios-mark.svg`                            | Bare mark, `currentColor` — for inline React use where the parent sets colour |
| `axios-mark-red.svg`                        | Bare mark in CCI Red, transparent ground — for light surfaces                 |
| `axios-mark-white.svg`                      | Bare mark in white, transparent ground — for dark surfaces                    |
| `axios-icon.svg`                            | White mark on a red rounded square — the app icon                             |
| `axios-icon-maskable.svg`                   | Same, art pulled into the centre 80% safe zone — PWA `purpose: maskable`      |
| `axios-favicon.svg`                         | App icon with tighter padding so the weave still reads small                  |
| `favicon.ico`                               | Multi-resolution: 16, 32, 48, 64, 128, 256                                    |
| `axios-icon-<N>x<N>.png`                    | Rasterised icon, 16 through 1024                                              |
| `axios-maskable-<N>.png`                    | Maskable rasters, 192 and 512                                                 |
| `axios-og-1200x630.png`                     | OpenGraph / link-preview card                                                 |
| `gradient-logo.png`, `gradient-bg-logo.png` | The decorative marks on the instance-not-ready screen                         |
| `takeoff-icon-{dark,light}.svg`             | Circular badges used by the admin new-user popup                              |

The 16px and 32px rasters are generated at tighter padding than the larger ones. That is
deliberate — at the default padding the weave gap closes at those sizes. Do not regenerate them by
scaling `axios-icon-512x512.png` down.

## Lockup

Horizontal lockup is the mark followed by the word **Axios** set in the product UI face, semibold,
with slight negative tracking.

The lockup is composed in the app from the mark plus live text rather than shipped as a single
flattened image, so it stays crisp at any size and follows the light/dark theme. There is no
standalone wordmark file, and one should not be added without a decision about which weight and
tracking are canonical.

`PlaneLockup`, `PlaneLogo`, `PlaneWordmark` and `PlaneNewIcon` in `packages/propel` keep their
upstream names deliberately — renaming them would multiply the rebase conflict surface against
upstream for no user-visible gain. Only the artwork inside them is CCI's.

## What not to do

- Do not recolour the mark to anything but CCI Red or white.
- Do not add a stroke, shadow, or gradient beyond the two supplied gradient files.
- Do not close the weave gap, or draw it by painting over the join with a background colour.
- Do not stretch it — the aspect ratio is fixed at 71:63.
- Do not place the red mark on a red ground, or the white mark on white.
