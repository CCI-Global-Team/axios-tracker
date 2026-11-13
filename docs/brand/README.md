# Axios brand assets

These are the canonical brand files for **Axios**, the CCI Technology Team's tracker. The apps under
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
- **Stacked**: AXIOS over the chain, both the same width. Share cards, splash screens, print.
- **Wordmark alone** (`PlaneWordmark`): where the chain is already on screen.

All three draw from `packages/propel/src/icons/brand/axios-art.tsx`. The loader is `AxiosLoader` in the
same folder: the chain draws itself from the left crossing, holds, and retracts, with soft ends and a
fade at each end of the lap.

## Colour

| Token         | Value                                                     | Use                                                                  |
| ------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| CCI Red       | `#D2181D`                                                 | The chain and the A's crossbar on light grounds; the favicon ground. |
| Red on dark   | `#FF4B4B`                                                 | The same, on dark grounds (`--axios-brand` switches in dark mode).   |
| Icon gradient | `#E3121B` → `#9A0710` → `#5E0007`, 135°                   | App icon ground at 48px and up.                                      |
| CCI Navy      | `#1A2340`                                                 | The wordmark on light grounds; the ground for the reversed set.      |
| White         | `#FFFFFF`                                                 | The chain and wordmark on red or navy.                               |
| Chrome        | `#F4F6F9` → `#D3D8E0` → `#9BA3B2` → `#E2E6EC` → `#AEB5C2` | The metallic finish, on navy or red, at 48px and up.                 |

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

| File                                         | What it is                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `axios-mark.svg`                             | Bare mark, `currentColor` — for inline React use where the parent sets colour        |
| `axios-mark-red.svg`                         | Bare mark in CCI Red, transparent ground — for light surfaces                        |
| `axios-mark-white.svg`                       | Bare mark in white, transparent ground — for dark surfaces                           |
| `axios-icon.svg`                             | White mark on a red rounded square — the app icon                                    |
| `axios-icon-maskable.svg`                    | Same, art pulled into the centre 80% safe zone — PWA `purpose: maskable`             |
| `axios-favicon.svg`                          | App icon with tighter padding so the weave still reads small                         |
| `favicon.ico`                                | Multi-resolution: 16, 32, 48, 64, 128, 256                                           |
| `axios-icon-<N>x<N>.png`                     | Rasterised icon, 16 through 1024                                                     |
| `axios-maskable-<N>.png`                     | Maskable rasters, 192 and 512                                                        |
| `axios-og-1200x630.png`                      | OpenGraph / link-preview card                                                        |
| `axios-loader{,-red,-white}.svg`             | The loader as a self-animating SVG, for places without React                         |
| `axios-loader.lottie.json`                   | An earlier loader; `AxiosLoader` is the current one and this file is not regenerated |
| `lockups/axios-<form>-<colourway>.{svg,png}` | Every form in every colourway; see Lockups below                                     |
| `gradient-logo.png`, `gradient-bg-logo.png`  | The decorative marks on the instance-not-ready screen                                |
| `takeoff-icon-{dark,light}.svg`              | Circular badges used by the admin new-user popup                                     |

The 16px and 32px rasters are generated at tighter padding than the larger ones. That is
deliberate — at the default padding the weave gap closes at those sizes. Do not regenerate them by
scaling `axios-icon-512x512.png` down.

## Lockups

`docs/brand/lockups/` holds the full set as files for decks, print, partner sites and email:
four forms in four colourways, each as an SVG and a transparent PNG (1600 px wide, 1200 for the mark).

| Form         | What it is                           |
| ------------ | ------------------------------------ |
| `horizontal` | Chain, then AXIOS on its centre line |
| `stacked`    | AXIOS over the chain, the same width |
| `wordmark`   | AXIOS alone                          |
| `mark`       | The chain alone                      |

| Colourway  | Chain     | Wordmark | Spark     | For                                              |
| ---------- | --------- | -------- | --------- | ------------------------------------------------ |
| `color`    | CCI Red   | CCI Navy | CCI Red   | White and light grounds                          |
| `reversed` | `#FF4B4B` | White    | `#FF4B4B` | CCI Navy and other dark grounds                  |
| `white`    | White     | White    | `#FF3B3B` | CCI Red and photographs                          |
| `chrome`   | Chrome    | Chrome   | `#FF4B4B` | The metallic finish, on navy or red; 48px and up |

Any form pairs with any colourway, for example `lockups/axios-stacked-reversed.svg`. The horizontal
geometry matches `PlaneLockup` (wordmark cap height 28.3 on the chain's 37.9, gap 21.4); the stacked one
matches the share card. In the product, use the components instead: they follow the theme.

`PlaneLockup`, `PlaneLogo`, `PlaneWordmark` and `PlaneNewIcon` in `packages/propel` keep their
upstream names deliberately — renaming them would multiply the rebase conflict surface against
upstream for no user-visible gain. Only the artwork inside them is CCI's.

## What not to do

- Do not recolour the mark or the lockups outside the colourways above.
- Do not add a stroke or shadow, or a gradient other than the icon ground and the chrome finish.
- Do not paint the crossings with a ground colour above 32px; the soft fade is the large-size drawing.
- Do not stretch it; the chain is fixed at 123.1:37.9.
- Do not place the red mark on a red ground, or the white mark on white.
- Do not set the wordmark in a typeface; it is drawn, so use the files or `PlaneWordmark`.
