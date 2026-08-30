#!/usr/bin/env python3
"""
Re-apply CCI's two mechanical branding passes after a rebase onto a new upstream release.

Most of the CCI patchset is deliberate, hand-written code that git will carry across a rebase on
its own. Two passes are not: they are wide, shallow, and purely mechanical, and they are the two
that generate almost all of the rebase conflict noise.

    1. The brand ramp   - every --brand-* token in the Tailwind theme rotated to CCI red's hue.
    2. Locale values    - "Plane" -> "Axios" in translation VALUES across every locale.

Rather than resolve hundreds of conflict hunks by hand, take upstream's version of these files
during the rebase (`git checkout --theirs`) and then run this script to re-apply the pass on top.
It is idempotent, so running it when nothing needs changing is safe and reports zero edits.

    python tools/reapply-cci-brand.py            # apply
    python tools/reapply-cci-brand.py --check    # report what would change, touch nothing

Run from the repository root.
"""

import argparse
import json
import pathlib
import re
import sys

# CCI Red #DF4E4E is oklch(0.6226 0.1814 23.97). Only the hue is applied: each token keeps
# upstream's own lightness and chroma. That is deliberate and load-bearing — see docs/UPGRADE.md.
CCI_HUE = "24"

VARIABLES_CSS = pathlib.Path("packages/tailwind-config/variables.css")
LOCALES_DIR = pathlib.Path("packages/i18n/src/locales")

BRAND_TOKEN = re.compile(r"(--brand-[a-z0-9]+:\s*)oklch\(([\d.]+)\s+([\d.]+)\s+[\d.]+\)")

# Substrings that legitimately contain "Plane" and must never be rewritten: package names, import
# paths, CSS variables, and anything that is an identifier rather than prose a person reads.
PROTECTED = ("@plane/", "plane.so", "makeplane", "PlaneLockup", "PlaneLogo", "PlaneWordmark", "PlaneNewIcon")


def retint_brand_ramp(check: bool) -> int:
    if not VARIABLES_CSS.exists():
        print(f"  ! {VARIABLES_CSS} not found — did the theme move upstream?", file=sys.stderr)
        return -1
    src = VARIABLES_CSS.read_text(encoding="utf-8")
    changed = 0

    def sub(m: "re.Match[str]") -> str:
        nonlocal changed
        changed += 1
        return f"{m.group(1)}oklch({m.group(2)} {m.group(3)} {CCI_HUE})"

    out = BRAND_TOKEN.sub(sub, src)
    already = len(re.findall(rf"--brand-[a-z0-9]+:\s*oklch\([\d.]+ [\d.]+ {CCI_HUE}\)", src))
    todo = changed - already
    if todo > 0 and not check:
        VARIABLES_CSS.write_text(out, encoding="utf-8", newline="")
    print(f"  brand ramp : {changed} tokens, {todo} needed rotating to hue {CCI_HUE}")

    # The danger scale must never be caught by this. If it ever is, the primary and destructive
    # buttons collapse toward each other and the failure is visual, not a build error.
    text = VARIABLES_CSS.read_text(encoding="utf-8")
    stray = re.findall(rf"--red-[a-z0-9]+:\s*oklch\([\d.]+ [\d.]+ {CCI_HUE}\)", text)
    if stray:
        print(f"  ! {len(stray)} --red-* danger tokens are at the brand hue — that is a bug", file=sys.stderr)
        return -1
    return todo


def rebrand_value(value: str) -> str:
    if any(p in value for p in PROTECTED):
        return value
    return re.sub(r"\bPlane\b", "Axios", value)


def walk(node):
    """Rewrite string values in place; keys are never touched."""
    n = 0
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, str):
                new = rebrand_value(v)
                if new != v:
                    node[k] = new
                    n += 1
            else:
                n += walk(v)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            if isinstance(v, str):
                new = rebrand_value(v)
                if new != v:
                    node[i] = new
                    n += 1
            else:
                n += walk(v)
    return n


def rebrand_locales(check: bool) -> int:
    if not LOCALES_DIR.exists():
        print(f"  ! {LOCALES_DIR} not found — did the locales move upstream?", file=sys.stderr)
        return -1
    total, touched = 0, 0
    for path in sorted(LOCALES_DIR.rglob("*.json")):
        try:
            original = path.read_text(encoding="utf-8")
            data = json.loads(original)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"  ! skipping {path}: {exc}", file=sys.stderr)
            continue
        before = json.dumps(data, sort_keys=True)
        n = walk(data)
        if n:
            total += n
            touched += 1
            if not check:
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8", newline="")
        # key sets must be identical: a changed key renders as a raw i18n string on screen
        # rather than failing the build, which is the worst kind of regression here.
        after = json.loads(json.dumps(data))
        if sorted(_keypaths(json.loads(before))) != sorted(_keypaths(after)):
            print(f"  ! {path}: key set changed — refusing", file=sys.stderr)
            return -1
    print(f"  locales    : {total} values rebranded across {touched} files")
    return total


def _keypaths(node, prefix=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _keypaths(v, f"{prefix}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _keypaths(v, f"{prefix}[{i}]")
    else:
        yield prefix


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="report only; change nothing")
    args = ap.parse_args()

    if not VARIABLES_CSS.exists() and not LOCALES_DIR.exists():
        print("Run this from the repository root.", file=sys.stderr)
        return 2

    print("re-applying CCI branding passes" + (" (check only)" if args.check else ""))
    a = retint_brand_ramp(args.check)
    b = rebrand_locales(args.check)
    if a < 0 or b < 0:
        return 1
    if args.check and (a or b):
        print("\n  changes are outstanding — run without --check to apply")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
