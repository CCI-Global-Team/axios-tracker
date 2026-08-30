# Axios brand assets

These are the canonical brand files for **Axios**, CCI's engineering tracker. The apps under
`apps/*/public/` hold *copies* of these — when a mark changes, change it here first, then re-copy.

## The mark

The Axios mark is one strand of the CCI logo.

The CCI logo is two interlocking ribbon strands that together read as three linked loops. Axios takes
a single strand — the atomic unit of that chain — as its own mark. The geometry is not redrawn or
approximated: the path is lifted directly from the CCI logo's own vector source (the brand Lottie in
`Global-Frontend/src/assets/lotties/`), so stroke weight, loop radius, and terminal shape match the
parent mark exactly.

The reading is deliberate. CCI is the whole chain; Axios is one loop within it.

Practically, one loop also survives being shrunk in a way three loops do not — at 16px the CCI mark
collapses into a texture, while the single strand keeps its counter open.

## Colour

| Token | Value | Use |
|---|---|---|
| CCI Red | `#DF4E4E` | The only brand colour. Icon ground, mark on light surfaces. |
| White | `#FFFFFF` | The mark on red, and on dark surfaces. |

There is no second brand colour. Product UI colours come from Plane's own theme tokens and are not
brand colours — do not repurpose the red for status or semantic meaning.

## Files

| File | What it is |
|---|---|
| `axios-mark.svg` | Bare mark, `fill="currentColor"` — for inline React use where the parent sets colour |
| `axios-mark-red.svg` | Bare mark in CCI Red, transparent ground — for light surfaces |
| `axios-mark-white.svg` | Bare mark in white, transparent ground — for dark surfaces |
| `axios-icon.svg` | White mark on a red rounded square — the app icon |
| `axios-icon-maskable.svg` | Same, art pulled into the centre 80% safe zone — PWA `purpose: maskable` |
| `axios-favicon.svg` | App icon with tighter padding so the loop still reads small |
| `favicon.ico` | Multi-resolution: 16, 32, 48, 64, 128, 256 |
| `axios-icon-<N>x<N>.png` | Rasterised icon at 16…512 |

The 16px and 32px rasters are generated at tighter padding than the larger sizes. That is intentional
— at those sizes the default padding closes the loop's counter. Do not regenerate them by scaling
`axios-icon-512x512.png` down.

## Lockup

Horizontal lockup is the mark followed by the word **Axios** set in the product UI face, semibold,
with slight negative tracking. Gap between mark and word is roughly half the mark's height.

The lockup is composed in the app from `axios-mark.svg` plus live text rather than shipped as a
single flattened image, so it stays crisp at any size and follows the light/dark theme. There is no
standalone wordmark file, and one should not be added without a decision about which weight and
tracking are canonical.

## What not to do

- Do not recolour the mark to anything but CCI Red or white.
- Do not add a stroke, shadow, or gradient. The mark is a flat silhouette.
- Do not stretch it — the aspect ratio is fixed at roughly 2.09:1.
- Do not place the red mark on a red ground, or the white mark on white.
- Do not rotate it. Tilted, the open tail makes it read as a musical note.
