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



# The AXIOS wordmark on a 100-unit cap height, as drawn in axios-art.tsx (WordmarkArt).
WORDMARK_W = 513.2


def wordmark(color="#fff", accent="#FF3B3B", cid="wx"):
    return (
        f'<g fill="{color}"><polygon points="0,100 38,0 54,0 92,100 70,100 46,36 22,100"/>'
        f'<polygon points="34,68 53.5,56 59.5,72 28,84" fill="{accent}"/>'
        f'<g transform="translate(10 0)"><clipPath id="{cid}"><rect x="90" y="0" width="110" height="100"/></clipPath>'
        f'<path d="M104,-8 L186,108 M186,-8 L104,108" clip-path="url(#{cid})" stroke="{color}" stroke-width="21" fill="none"/></g>'
        f'<rect x="223.2" y="0" width="20" height="100"/>'
        f'<rect x="276.95" y="8.25" width="92.5" height="83.5" rx="17" fill="none" stroke="{color}" stroke-width="19.5"/>'
        f'<path d="M509.2,8.25 H426.95 Q409.95,8.25 409.95,25.25 V31 Q409.95,48 426.95,48 H486.45 Q503.45,48 503.45,65 '
        f'V74.75 Q503.45,91.75 486.45,91.75 H404.2" fill="none" stroke="{color}" stroke-width="19.5"/></g>'
    )


def og_svg():
    """The site-wide share card: the stacked lockup in white on the icon gradient, a tagline, and a large
    faint chain running off the right edge."""
    wm_h = 62                        # cap height in px
    wm_s = wm_h / 100
    mk_s = (WORDMARK_W * wm_s) / MARK_W
    x0, y0 = 96, 196
    big = 1180 / MARK_W
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
        + gradient_def() + '<rect width="1200" height="630" fill="url(#bg)"/>'
        f'<g opacity=".09" transform="translate(560,250) scale({big:.4f})">{mark("#fff", "big")}</g>'
        f'<g transform="translate({x0},{y0}) scale({wm_s})">{wordmark()}</g>'
        f'<g transform="translate({x0},{y0 + wm_h + 26}) scale({mk_s:.4f})">{mark("#fff", "og")}</g>'
        f'<text x="{x0}" y="{y0 + wm_h + 26 + MARK_H * mk_s + 70}" fill="#FFD2D2" '
        'font-family="Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif" font-size="34" font-weight="500">'
        "CCI Technology Team</text></svg>"
    )


def gradient_mark_svg(w, h, pad, stops, mid):
    """The chain stroked with a gradient, centred on a transparent canvas of w x h (for <img> slots)."""
    s = w * (1 - 2 * pad) / MARK_W
    g = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<defs><linearGradient id="{mid}s" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{MARK_W}" y2="{MARK_H}">{g}</linearGradient></defs>'
        f'<g transform="translate({w/2},{h/2}) scale({s:.5f}) translate({-MARK_W/2},{-MARK_H/2})">{mark(f"url(#{mid}s)", mid)}</g></svg>'
    )


# ---------------------------------------------------------------- lockups (variant D, "the chain, engineered")
#
# Each form in each colourway, on a transparent ground, so it can be dropped onto the ground it names.
# Geometry matches PlaneLockup (horizontal) and the share card (stacked) in packages/propel.

NAVY = "#1A2340"          # CCI navy: the wordmark on light grounds, and the ground the reversed set is for
RED_ON_DARK = "#FF4B4B"   # --axios-brand in dark mode
ACCENT_ON_RED = "#FF3B3B" # the A's cut stays visible against the red gradient
CHROME = (("0", "#F4F6F9"), (".3", "#D3D8E0"), (".5", "#9BA3B2"), (".7", "#E2E6EC"), ("1", "#AEB5C2"))

# (name, chain, wordmark, accent, use)
COLOURWAYS = (
    ("color", RED, NAVY, RED, "white and light grounds"),
    ("reversed", RED_ON_DARK, "#fff", RED_ON_DARK, "CCI navy and other dark grounds"),
    ("white", "#fff", "#fff", ACCENT_ON_RED, "CCI red and photographs"),
    ("chrome", "url(#chrome)", "url(#chrome)", RED_ON_DARK, "the metallic finish, on navy or red; 48px and up"),
)

H_CAP = 28.3                       # the wordmark's cap height next to the chain, in mark units
H_GAP = 21.4
H_W = MARK_W + H_GAP + WORDMARK_W * H_CAP / 100 + 1
S_CAP = 62 / ((WORDMARK_W * 0.62) / MARK_W)   # stacked: the share card's proportions, in mark units
S_GAP = 26 / ((WORDMARK_W * 0.62) / MARK_W)


def chrome_def(w, h):
    g = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in CHROME)
    return (f'<defs><linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="0" y1="0" '
            f'x2="{w:.1f}" y2="{h:.1f}">{g}</linearGradient></defs>')


def lockup_svg(form, chain, word, accent):
    if form == "mark":
        w, h, body = MARK_W, MARK_H, mark(chain, "lm")
    elif form == "wordmark":
        w, h, body = WORDMARK_W, 100, wordmark(word, accent, "lx")
    elif form == "horizontal":
        w, h = H_W, MARK_H
        y = (MARK_H - H_CAP) / 2
        body = (mark(chain, "lm") + f'<g transform="translate({MARK_W + H_GAP:.2f} {y:.2f}) scale({H_CAP / 100})">'
                f'{wordmark(word, accent, "lx")}</g>')
    else:  # stacked: AXIOS over the chain, both the same width
        w, h = MARK_W, S_CAP + S_GAP + MARK_H
        body = (f'<g transform="scale({S_CAP / 100:.5f})">{wordmark(word, accent, "lx")}</g>'
                f'<g transform="translate(0 {S_CAP + S_GAP:.2f})">{mark(chain, "lm")}</g>')
    pad = 2
    defs = chrome_def(w, h) if "chrome" in chain + word else ""
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {w + 2 * pad:.1f} {h + 2 * pad:.1f}" '
            f'role="img" aria-label="Axios">{defs}{body}</svg>'), w + 2 * pad, h + 2 * pad


def write_lockups(chrome, brand, profile):
    out = brand / "lockups"
    out.mkdir(exist_ok=True)
    count = 0
    for form in ("horizontal", "stacked", "wordmark", "mark"):
        for name, chain, word, accent, _ in COLOURWAYS:
            svg, w, h = lockup_svg(form, chain, word, accent)
            stem = f"axios-{form}-{name}"
            (out / f"{stem}.svg").write_text(svg, encoding="utf-8")
            px = 1600 if form != "mark" else 1200
            shoot(chrome, svg.replace("<svg ", f'<svg width="{px}" height="{round(px * h / w)}" ', 1),
                  out / f"{stem}.png", px, profile, round(px * h / w))
            count += 1
    print(f"  {count} lockup files (svg + png) in docs/brand/lockups/")


# ---------------------------------------------------------------- rasterising

def find_chrome():
    for c in CHROME_CANDIDATES:
        if pathlib.Path(c).exists():
            return c
    found = shutil.which("google-chrome") or shutil.which("chromium")
    if found:
        return found
    sys.exit("Could not find Chrome. Add its path to CHROME_CANDIDATES.")


def shoot(chrome, html, out, size, profile, height=None):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write('<meta charset="utf-8"><style>html,body{margin:0;padding:0;'
                'overflow:hidden;background:transparent}svg{display:block}</style>' + html)
        tmp = f.name
    cmd = [chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
           f"--user-data-dir={profile}",
           # without this every corner comes out opaque white; see the module docstring
           "--default-background-color=00000000",
           f"--screenshot={out}", f"--window-size={size},{height or size}",
           pathlib.Path(tmp).as_uri()]
    try:
        # headless Chrome occasionally hangs on a screenshot; one retry clears it
        for attempt in (1, 2):
            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=45)
                break
            except subprocess.TimeoutExpired:
                if attempt == 2:
                    raise
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
    ap.add_argument("--lockups", action="store_true", help="only write docs/brand/lockups/, leaving the icons as they are")
    args = ap.parse_args()

    root = pathlib.Path(__file__).resolve().parent.parent
    brand = root / "docs" / "brand"
    if not brand.exists():
        sys.exit(f"{brand} not found - run from the repository")

    chrome = find_chrome()
    profile = tempfile.mkdtemp(prefix="axios-brand-")
    print(f"chain {MARK_W}x{MARK_H}  stroke {STROKE} (small {SMALL_STROKE})")
    write_lockups(chrome, brand, profile)
    if args.lockups:
        shutil.rmtree(profile, ignore_errors=True)
        return

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
    shoot(chrome, og_svg(), brand / "axios-og-1200x630.png", 1200, profile, 630)
    # the instance welcome page shows this one in a 160x96 object-contain slot
    shoot(chrome, gradient_mark_svg(561, 312, 0.04, (("0", "#F0444A"), ("1", "#9A0710")), "gl"),
          brand / "gradient-logo.png", 561, profile, 312)
    # a faint corner decoration, shown at 15% opacity in a 384x224 slot (no object-fit, so keep the canvas)
    shoot(chrome, gradient_mark_svg(1080, 672, 0.02, (("0", "#E8A3A6"), ("1", "#B0484D")), "gb"),
          brand / "gradient-bg-logo.png", 1080, profile, 672)
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
        # root.tsx links these as the apple-touch icons
        touch = root / "apps" / "web" / "app" / "assets" / "icons"
        shutil.copy(brand / "axios-icon-180x180.png", touch / "icon-180x180.png")
        shutil.copy(brand / "axios-icon-512x512.png", touch / "icon-512x512.png")
        shutil.copy(brand / "axios-og-1200x630.png", root / "apps" / "web" / "app" / "assets" / "og-image.png")
        # the card for shared work-item links (apps/api points at /og/axios-card.png)
        shutil.copy(brand / "axios-og-1200x630.png", root / "apps" / "web" / "public" / "og" / "axios-card.png")
        for name in ("gradient-logo.png", "gradient-bg-logo.png"):
            shutil.copy(brand / name, root / "apps" / "web" / "app" / "assets" / "auth" / name)
        shutil.copy(brand / "axios-icon-1024x1024.png",
                    root / "apps" / "web" / "public" / "plane-logos" / "plane-mobile-pwa.png")
        for name in ("dark", "light"):
            shutil.copy(brand / f"takeoff-icon-{name}.svg",
                        root / "apps" / "admin" / "app" / "assets" / "logos" / f"takeoff-icon-{name}.svg")
        print("  installed into apps/")

    shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
