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

  * The art's outer bounds are the curve plus half a stroke, so they move whenever STROKE moves.
    A hard-coded viewBox would centre the mark wrongly and render it at the wrong optical size.
    Everything derives from bounds() instead.
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

RED = "#DF4E4E"
UNDER = "M20,24 C44,24 56,76 80,76"
OVER = "M20,76 C44,76 56,24 80,24"

STROKE = 11          # on the 0..100 art box
GAP_RATIO = 1.53     # weave gap relative to the stroke; keeps the gap optically constant

# Padding as a fraction of the tile. Small sizes get less, because at the large-size padding the
# weave gap closes and the mark becomes a blob. Do not "tidy" these into one number.
PAD_SMALL, PAD_LARGE, SMALL_MAX = 0.085, 0.19, 32
RADIUS_SMALL, RADIUS_LARGE = 96, 112   # on a 512 box

SIZES = (16, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024)
ICO_SIZES = (16, 32, 48, 64, 128, 256)

CHROME_CANDIDATES = (
    r"C:/Program Files/Google/Chrome/Application/chrome.exe",
    r"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
)


def bounds(stroke=STROKE):
    """Outer extent of the stroked art: the curve spans x 20..80, y 24..76, plus half a stroke."""
    h = stroke / 2
    x0, y0 = 20 - h, 24 - h
    return x0, y0, (80 + h) - x0, (76 + h) - y0


def mark(color="currentColor", mid="m", stroke=STROKE):
    gap = stroke * GAP_RATIO
    return (
        f'<defs><mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
        f'<rect width="100" height="100" fill="#fff"/>'
        f'<path d="{OVER}" fill="none" stroke="#000" stroke-width="{gap:.2f}" stroke-linecap="round"/>'
        f"</mask></defs>"
        f'<path d="{UNDER}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" mask="url(#{mid})"/>'
        f'<path d="{OVER}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round"/>'
    )


def placed(box, pad, mid="m", color="#fff"):
    _, _, w, h = bounds()
    s = box * (1 - 2 * pad) / max(w, h)
    return (f'<g transform="translate({box/2},{box/2}) scale({s:.6f}) translate(-50,-50)">'
            f'{mark(color, mid)}</g>')


def bare_svg(color):
    x, y, w, h = bounds()
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" '
            f'role="img" aria-label="Axios">{mark(color)}</svg>')


def tile_svg(size=512, pad=PAD_LARGE, radius=RADIUS_LARGE, full_bleed=False):
    rect = (f'<rect width="512" height="512" fill="{RED}"/>' if full_bleed
            else f'<rect width="512" height="512" rx="{radius}" fill="{RED}"/>')
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
            f'width="{size}" height="{size}">{rect}{placed(512, pad)}</svg>')


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
    x, y, w, h = bounds()
    print(f"stroke {STROKE}  bounds {w:.1f}x{h:.1f}  aspect {w/h:.3f}")

    # vector sources
    (brand / "axios-mark.svg").write_text(bare_svg("currentColor"), encoding="utf-8")
    (brand / "axios-mark-red.svg").write_text(bare_svg(RED), encoding="utf-8")
    (brand / "axios-mark-white.svg").write_text(bare_svg("#fff"), encoding="utf-8")
    (brand / "axios-icon.svg").write_text(tile_svg(), encoding="utf-8")
    (brand / "axios-icon-maskable.svg").write_text(tile_svg(pad=0.27, full_bleed=True), encoding="utf-8")
    (brand / "axios-favicon.svg").write_text(tile_svg(pad=0.14, radius=RADIUS_SMALL), encoding="utf-8")
    for name, ground in (("dark", "#7A2222"), ("light", RED)):
        _, _, aw, ah = bounds()
        s = 90 * 0.52 / max(aw, ah)
        (brand / f"takeoff-icon-{name}.svg").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="91" height="90" viewBox="0 0 91 90">'
            f'<circle cx="45.5" cy="45" r="45" fill="{ground}"/>'
            f'<g transform="translate(45.5,45) scale({s:.5f}) translate(-50,-50)">{mark("#fff", "t")}</g></svg>',
            encoding="utf-8")

    # rasters
    for size in SIZES:
        pad = PAD_SMALL if size <= SMALL_MAX else PAD_LARGE
        radius = RADIUS_SMALL if size <= SMALL_MAX else RADIUS_LARGE
        shoot(chrome, tile_svg(size, pad, radius), brand / f"axios-icon-{size}x{size}.png", size, profile)
    for size in (192, 512):
        shoot(chrome, tile_svg(size, 0.27, full_bleed=True), brand / f"axios-maskable-{size}.png", size, profile)
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

    print(f"\nComponent constants for stroke {STROKE}:")
    print(f'  viewBox   "{x} {y} {w} {h}"')
    print(f"  strokeWidth {STROKE}   mask stroke {STROKE*GAP_RATIO:.0f}")
    print(f"  aspect ratio {w/h:.4f}  (lockup mark width at height 53 = {53*w/h:.1f})")
    shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
