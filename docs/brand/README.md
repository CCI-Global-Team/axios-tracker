# Axios brand assets

These are the canonical brand files for **Axios**, CCI's engineering tracker. The apps under
`apps/*/public/` and `apps/*/app/assets/` hold *copies* of these — when a mark changes, change it
here first, then re-copy.

## The mark

The Axios mark is **the crossing**: two ribbons interlacing, one passing over the other.

The CCI logo is two ribbon strands woven into three linked loops. What actually distinguishes it —
what makes it read as woven rather than merely curved — is the over/under crossing where the strands
pass through each other. The Axios mark takes that crossing on its own, with the loops removed.

It reads as an X, which suits the name, and it is square, which matters more than it sounds: the
single-loop marks considered alongside it are roughly 2:1, so in a square app-icon tile they have to
shrink to fit their width and leave the top and bottom empty. The crossing fills the tile.

It is also the mark with the least to lose at small sizes. At 16px a loop's counter closes up and the
artwork becomes a blob; two crossing strokes stay two crossing strokes.

## Colour

| Token | Value | Use |
|---|---|---|
| CCI Red | `#DF4E4E` | The only brand colour. Icon ground, mark on light surfaces. |
| White | `#FFFFFF` | The mark on red, and on dark surfaces. |

There is no second brand colour. Product UI colours come from Plane's own theme tokens and are not
brand colours — do not repurpose the red for status or semantic meaning.

## How the weave is drawn

The two strokes are:

```
ascending   M20,24 C44,24 56,76 80,76
descending  M20,76 C44,76 56,24 80,24
```

both at `stroke-width: 11` on a `0 0 100 100` box, with round caps. The weave gap is
`stroke x 1.53`, so it stays optically constant if the weight ever changes again.

The gap that makes the weave legible is cut with an **SVG mask**, not by painting a
background-coloured stroke over the join. That distinction matters: a painted gap only works on the
one background it was painted for, and silently breaks the moment the mark is placed on red, on a
photo, or on a dark theme. The mask works everywhere.

## Regenerating

Everything below is output. `tools/generate-brand-assets.py` produces the whole set from one
definition; `STROKE` at the top of that file is the only place the weight is written down.

```bash
python tools/generate-brand-assets.py --install
```

It asserts the rasters came out RGBA with transparent corners before it finishes, because the
failure mode there is silent and shipped once.

## Files

| File | What it is |
|---|---|
| `axios-mark.svg` | Bare mark, `currentColor` — for inline React use where the parent sets colour |
| `axios-mark-red.svg` | Bare mark in CCI Red, transparent ground — for light surfaces |
| `axios-mark-white.svg` | Bare mark in white, transparent ground — for dark surfaces |
| `axios-icon.svg` | White mark on a red rounded square — the app icon |
| `axios-icon-maskable.svg` | Same, art pulled into the centre 80% safe zone — PWA `purpose: maskable` |
| `axios-favicon.svg` | App icon with tighter padding so the weave still reads small |
| `favicon.ico` | Multi-resolution: 16, 32, 48, 64, 128, 256 |
| `axios-icon-<N>x<N>.png` | Rasterised icon, 16 through 1024 |
| `axios-maskable-<N>.png` | Maskable rasters, 192 and 512 |
| `axios-og-1200x630.png` | OpenGraph / link-preview card |
| `gradient-logo.png`, `gradient-bg-logo.png` | The decorative marks on the instance-not-ready screen |
| `takeoff-icon-{dark,light}.svg` | Circular badges used by the admin new-user popup |

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
