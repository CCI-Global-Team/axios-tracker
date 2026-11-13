#!/usr/bin/env python3
"""
Generate the complete Axios brand asset set from a single definition.

Everything the app ships — favicons, PWA icons, maskables, the multi-resolution .ico, the OG card,
the auth gradients, the admin badges — is output. `docs/brand/*.svg` and the constants below are
the source. If a raster looks wrong, change it here and regenerate; never hand-edit a PNG.

    python tools/generate-brand-assets.py            # write into docs/brand/
    python tools/generate-brand-assets.py --install  # also copy into apps/*/

Requires: Pillow, and Google Chrome for rasterising.

Two things here are load-bearing and easy to lose:

  * Chrome is invoked with --default-background-color=00000000. Without it, it composites onto
    opaque white and every PNG comes out with no alpha channel, so the area outside each tile's
    corner radius is baked solid white. That shipped once. `verify()` asserts against it.

  * Tiles of 32px and under use a different drawing of the chain (heavier line, crossings cut in the
    ground colour). The soft crossing fade that reads at 48px and up turns to mush at 16px.
"""

import argparse
import base64
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile

# ---------------------------------------------------------------- the mark

# The chain: CCI's three loops as one line crossing itself twice (see docs/brand/README.md). The same
# geometry is drawn in packages/propel/src/icons/brand/axios-art.tsx; change both together.
RED = "#D2181D"
GRADIENT = (("0", "#E3121B"), (".55", "#9A0710"), ("1", "#5E0007"))   # 135deg, light top-left
CHAIN = ("M29.52,8.31 L51.00,29.61 A15,15 0 0 0 72.12,29.61 L93.60,8.31 A15,15 0 1 1 93.60,29.61 "
         "L72.12,8.31 A15,15 0 0 0 51.00,8.31 L29.52,29.61 A15,15 0 1 1 29.52,8.31 Z")
OVERS = ("M29.52,8.31 L51.00,29.61", "M72.12,8.31 L93.60,29.61")
CROSSINGS = ((40.26, 18.96), (82.86, 18.96))
MARK_W, MARK_H = 123.1, 37.9
STROKE = 6.6          # on the mark box
SMALL_STROKE = 9      # 32px and below: heavier line, crossings cut instead of faded

# Mark width as a fraction of the tile is 1 - 2*pad. Small sizes get less padding so the loops stay open.
PAD_SMALL, PAD_LARGE, SMALL_MAX = 0.08, 0.11, 32
RADIUS = 112          # on a 512 box

SIZES = (16, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024)
ICO_SIZES = (16, 32, 48, 64, 128, 256)

CHROME_CANDIDATES = (
    r"C:/Program Files/Google/Chrome/Application/chrome.exe",
    r"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
)


def mark(color="currentColor", mid="m"):
    """The chain at full detail: the under strand fades out under a radial mask at each crossing."""
    circles = "".join(f'<circle cx="{x}" cy="{y}" r="15.8" fill="url(#{mid}g)"/>' for x, y in CROSSINGS)
    overs = "".join(f'<path d="{d}"/>' for d in OVERS)
    return (
        f'<defs><radialGradient id="{mid}g"><stop offset="0" stop-color="#000"/>'
        f'<stop offset=".35" stop-color="#000" stop-opacity=".9"/><stop offset="1" stop-color="#000" stop-opacity="0"/>'
        f'</radialGradient><mask id="{mid}" maskUnits="userSpaceOnUse" x="-5" y="-5" width="133.1" height="47.9">'
        f'<rect x="-5" y="-5" width="133.1" height="47.9" fill="#fff"/>{circles}</mask></defs>'
        f'<g fill="none" stroke="{color}" stroke-width="{STROKE}"><path d="{CHAIN}" mask="url(#{mid})"/>{overs}</g>'
    )


def small_mark(color="#fff", ground=RED, mid="s"):
    """The chain for favicons: a heavier line, with the under strand cut by a ground-coloured gap,
    because a soft fade turns to mush at 16px. Only valid on a flat ground of `ground`."""
    clip = "".join(f'<circle cx="{x}" cy="{y}" r="9"/>' for x, y in CROSSINGS)
    overs = "".join(f'<path d="{d}"/>' for d in OVERS)
    return (
        f'<defs><clipPath id="{mid}">{clip}</clipPath></defs><g fill="none" stroke-width="{SMALL_STROKE}">'
        f'<path d="{CHAIN}" stroke="{color}"/>'
        f'<g clip-path="url(#{mid})" stroke="{ground}" stroke-width="{SMALL_STROKE + 6}">{overs}</g>'
        f'<g stroke="{color}">{overs}</g></g>'
    )


def placed(box, pad, inner):
    s = box * (1 - 2 * pad) / MARK_W
    return (f'<g transform="translate({box/2},{box/2}) scale({s:.6f}) translate({-MARK_W/2},{-MARK_H/2})">'
            f'{inner}</g>')


def bare_svg(color):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MARK_W} {MARK_H}" '
            f'role="img" aria-label="Axios">{mark(color)}</svg>')


def gradient_def(gid="bg"):
    stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in GRADIENT)
    return f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">{stops}</linearGradient></defs>'


def tile_svg(size=512, small=False, full_bleed=False, pad=None):
    """Large tiles: the full mark on the red gradient. Small tiles: the favicon mark on flat red."""
    if pad is None:
        pad = PAD_SMALL if small else PAD_LARGE
    rx = "" if full_bleed else f' rx="{RADIUS}"'
    if small:
        ground, inner = f'<rect width="512" height="512"{rx} fill="{RED}"/>', small_mark()
    else:
        ground, inner = gradient_def() + f'<rect width="512" height="512"{rx} fill="url(#bg)"/>', mark("#fff")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
            f'width="{size}" height="{size}">{ground}{placed(512, pad, inner)}</svg>')


# ---------------------------------------------------------------- rasterising

def find_chrome():
    for c in CHROME_CANDIDATES:
        if pathlib.Path(c).exists():
            return c
    found = shutil.which("google-chrome") or shutil.which("chromium")
    if found:
        return found
    sys.exit("Could not find Chrome. Add its path to CHROME_CANDIDATES.")


def shoot(chrome, html, out, size, profile):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write('<meta charset="utf-8"><style>html,body{margin:0;padding:0;'
                'overflow:hidden;background:transparent}svg{display:block}</style>' + html)
        tmp = f.name
    try:
        subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
             f"--user-data-dir={profile}",
             # without this every corner comes out opaque white; see the module docstring
             "--default-background-color=00000000",
             f"--screenshot={out}", f"--window-size={size},{size}",
             pathlib.Path(tmp).as_uri()],
            check=True, capture_output=True)
    finally:
        pathlib.Path(tmp).unlink(missing_ok=True)


def build_ico(brand):
    imgs = [(s, (brand / f"axios-icon-{s}x{s}.png").read_bytes()) for s in ICO_SIZES]
    out = bytearray(struct.pack("<HHH", 0, 1, len(imgs)))
    off = 6 + 16 * len(imgs)
    for s, d in imgs:
        w = 0 if s >= 256 else s
        out += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(d), off)
        off += len(d)
    for _, d in imgs:
        out += d
    (brand / "favicon.ico").write_bytes(bytes(out))


def verify(brand):
    from PIL import Image
    bad = []
    for f in sorted(brand.glob("axios-icon-*.png")):
        im = Image.open(f)
        if im.mode != "RGBA":
            bad.append((f.name, f"mode {im.mode}, expected RGBA"))
            continue
        a = im.load()[0, 0][3]
        # a hair of alpha at the corner is the radius being antialiased; opaque is the bug
        if a > 40:
            bad.append((f.name, f"corner alpha {a}, expected ~0"))
    return bad


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", action="store_true", help="also copy into apps/*/")
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    brand = root / "docs" / "brand"
    if not brand.exists():
        sys.exit(f"{brand} not found - run from the repository")

    chrome = find_chrome()
    profile = tempfile.mkdtemp(prefix="axios-brand-")
    print(f"chain {MARK_W}x{MARK_H}  stroke {STROKE} (small {SMALL_STROKE})")

    # vector sources
    (brand / "axios-mark.svg").write_text(bare_svg("currentColor"), encoding="utf-8")
    (brand / "axios-mark-red.svg").write_text(bare_svg(RED), encoding="utf-8")
    (brand / "axios-mark-white.svg").write_text(bare_svg("#fff"), encoding="utf-8")
    (brand / "axios-icon.svg").write_text(tile_svg(), encoding="utf-8")
    (brand / "axios-icon-maskable.svg").write_text(tile_svg(pad=0.2, full_bleed=True), encoding="utf-8")
    (brand / "axios-favicon.svg").write_text(tile_svg(small=True), encoding="utf-8")
    for name, ground in (("dark", "#7A0A0E"), ("light", RED)):
        s = 90 * 0.66 / MARK_W
        (brand / f"takeoff-icon-{name}.svg").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="91" height="90" viewBox="0 0 91 90">'
            f'<circle cx="45.5" cy="45" r="45" fill="{ground}"/>'
            f'<g transform="translate(45.5,45) scale({s:.5f}) translate({-MARK_W/2},{-MARK_H/2})">{mark("#fff", "t")}</g></svg>',
            encoding="utf-8")

    # rasters
    for size in SIZES:
        shoot(chrome, tile_svg(size, small=size <= SMALL_MAX), brand / f"axios-icon-{size}x{size}.png", size, profile)
    for size in (192, 512):
        shoot(chrome, tile_svg(size, pad=0.2, full_bleed=True), brand / f"axios-maskable-{size}.png", size, profile)
    build_ico(brand)
    print(f"  {len(SIZES)} icons + 2 maskables + favicon.ico")

    bad = verify(brand)
    if bad:
        for n, why in bad:
            print(f"  ! {n}: {why}", file=sys.stderr)
        sys.exit("transparency check failed")
    print("  transparency check passed")

    if args.install:
        for a in ("web", "admin", "space"):
            fav = root / "apps" / a / "app" / "assets" / "favicon"
            pub = root / "apps" / a / "public" / "favicon"
            shutil.copy(brand / "favicon.ico", fav / "favicon.ico")
            shutil.copy(brand / "axios-icon-16x16.png", fav / "favicon-16x16.png")
            shutil.copy(brand / "axios-icon-32x32.png", fav / "favicon-32x32.png")
            shutil.copy(brand / "axios-icon-180x180.png", fav / "apple-touch-icon.png")
            shutil.copy(brand / "axios-icon-192x192.png", pub / "android-chrome-192x192.png")
            shutil.copy(brand / "axios-icon-512x512.png", pub / "android-chrome-512x512.png")
        icons = root / "apps" / "web" / "public" / "icons"
        shutil.copy(brand / "axios-icon-192x192.png", icons / "icon-192x192.png")
        shutil.copy(brand / "axios-icon-512x512.png", icons / "icon-348x348.png")
        shutil.copy(brand / "axios-icon-512x512.png", icons / "icon-512x512.png")
        shutil.copy(brand / "axios-maskable-192.png", icons / "icon-192x192-maskable.png")
        shutil.copy(brand / "axios-maskable-512.png", icons / "icon-512x512-maskable.png")
        shutil.copy(brand / "axios-icon-1024x1024.png",
                    root / "apps" / "web" / "public" / "plane-logos" / "plane-mobile-pwa.png")
        for name in ("dark", "light"):
            shutil.copy(brand / f"takeoff-icon-{name}.svg",
                        root / "apps" / "admin" / "app" / "assets" / "logos" / f"takeoff-icon-{name}.svg")
        print("  installed into apps/")

    shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
