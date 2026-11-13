/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

/*
 * CCI: the Axios mark and wordmark, drawn once and shared by the logo, the lockup and the loader.
 * Source and rationale: docs/brand/README.md.
 *
 * The mark is CCI's chain: three loops as one continuous line that crosses itself twice. At each
 * crossing the "\" strand passes over; the "/" strand underneath fades out under a radial mask, so
 * the over/under reads on any ground without painting a background-coloured gap.
 */

/** The chain's art box. Loops are r=15 circles at x 18.95 / 61.56 / 104.16, y 18.96. */
export const AXIOS_MARK_W = 123.1;
export const AXIOS_MARK_H = 37.9;
export const AXIOS_STROKE = 6.6;

/** The brand red. Pages can override it per theme with --axios-brand (globals.css sets a lighter red for dark). */
export const AXIOS_RED = "var(--axios-brand, #D2181D)";

/** The whole chain as one closed path, for the static mark. */
export const CHAIN_PATH =
  "M29.52,8.31 L51.00,29.61 A15,15 0 0 0 72.12,29.61 L93.60,8.31 A15,15 0 1 1 93.60,29.61 " +
  "L72.12,8.31 A15,15 0 0 0 51.00,8.31 L29.52,29.61 A15,15 0 1 1 29.52,8.31 Z";
/** The two strands that pass over, drawn again on top of the masked chain. */
export const OVER_1 = "M29.52,8.31 L51.00,29.61";
export const OVER_2 = "M72.12,8.31 L93.60,29.61";
export const CROSSINGS = [
  [40.26, 18.96],
  [82.86, 18.96],
] as const;

/** React's useId has colons, which break url(#…) references in some engines. */
export const useSvgId = (prefix: string) => `${prefix}-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

/**
 * A mask that hides the under strand around each crossing with a soft radial falloff.
 * `soft` is the loader's version: fully hidden further out, so a strand that is only partly drawn
 * never shows a square end under the crossing.
 */
export function CrossingMask({ id, soft = false }: { id: string; soft?: boolean }) {
  const g = `${id}-g`;
  return (
    <>
      <radialGradient id={g}>
        <stop offset="0" stopColor="#000" />
        {soft ? (
          <>
            <stop offset=".4" stopColor="#000" />
            <stop offset=".6" stopColor="#000" stopOpacity=".75" />
          </>
        ) : (
          <stop offset=".35" stopColor="#000" stopOpacity=".9" />
        )}
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <mask id={id} maskUnits="userSpaceOnUse" x="-5" y="-5" width="133.1" height="47.9">
        <rect x="-5" y="-5" width="133.1" height="47.9" fill="#fff" />
        {CROSSINGS.map(([cx, cy]) => (
          <circle key={cx} cx={cx} cy={cy} r="15.8" fill={`url(#${g})`} />
        ))}
      </mask>
    </>
  );
}

/** The chain, in the 0 0 123.1 37.9 box. */
export function ChainArt({ color, maskId }: { color: string; maskId: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth={AXIOS_STROKE}>
      <path d={CHAIN_PATH} mask={`url(#${maskId})`} />
      <path d={OVER_1} />
      <path d={OVER_2} />
    </g>
  );
}

/*
 * The AXIOS wordmark: squared capitals on a 100-unit cap height, the A's crossbar a slanted red
 * "spark" that echoes the chain's strands. Spacing is the lab's refined set opened by 10 units per gap.
 * The O and S overshoot the cap line and baseline by 1.5 so they look the same height as the flat letters.
 */
export const WORDMARK_W = 513.2;
export const WORDMARK_H = 100;

export function WordmarkArt({ color, accent, clipId }: { color: string; accent: string; clipId: string }) {
  return (
    <g fill={color}>
      <polygon points="0,100 38,0 54,0 92,100 70,100 46,36 22,100" />
      <polygon points="34,68 53.5,56 59.5,72 28,84" fill={accent} />
      <g transform="translate(10 0)">
        <clipPath id={clipId}>
          <rect x="90" y="0" width="110" height="100" />
        </clipPath>
        <path
          d="M104,-8 L186,108 M186,-8 L104,108"
          clipPath={`url(#${clipId})`}
          stroke={color}
          strokeWidth="21"
          fill="none"
        />
      </g>
      <rect x="223.2" y="0" width="20" height="100" />
      <rect x="276.95" y="8.25" width="92.5" height="83.5" rx="17" fill="none" stroke={color} strokeWidth="19.5" />
      <path
        d="M509.2,8.25 H426.95 Q409.95,8.25 409.95,25.25 V31 Q409.95,48 426.95,48 H486.45 Q503.45,48 503.45,65 V74.75 Q503.45,91.75 486.45,91.75 H404.2"
        fill="none"
        stroke={color}
        strokeWidth="19.5"
      />
    </g>
  );
}
