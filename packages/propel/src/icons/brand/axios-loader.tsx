/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { AXIOS_MARK_H, AXIOS_MARK_W, AXIOS_RED, AXIOS_STROKE, CrossingMask, OVER_1, useSvgId } from "./axios-art";

/*
 * CCI: the Axios loader. The chain draws itself as one line, holds, then retracts from the start,
 * over a faint copy of the whole chain.
 *
 * The line starts at the left crossing, so a lap begins and ends where the strands already meet.
 * The two strands that pass over are separate paths whose dashes are offset to the point where the
 * line reaches them, so they draw in step with it and stay on top.
 *
 * The leading and trailing edges are soft: N faint copies, each a little longer at both ends, stack
 * into a short gradient. The group fades in at the start of a lap and out at the end, so the line is
 * never a hard stub on an empty track.
 */

const LINE =
  "M40.26,18.96 L29.52,29.61 A15,15 0 1 1 29.52,8.31 L51.00,29.61 A15,15 0 0 0 72.12,29.61 L93.60,8.31 " +
  "A15,15 0 1 1 93.60,29.61 L72.12,8.31 A15,15 0 0 0 51.00,8.31 L40.26,18.96";
const OVER_2_REVERSED = "M93.60,29.61 L72.12,8.31";
/** Each over strand's length, in units where the whole line is 100. */
const OVER_LEN = 9.79;
/** Where along the line (0..100) each over strand begins. */
const OVER_AT = [27.732, 77.732];

const CYCLE = "2.4s";
// Each layer adds 1/(N+1) of opacity, so the ends ramp linearly; steps this small don't read as stripes.
const HALO_LAYERS = 24;
const HALO_STEP = 0.35;

const fill = (name: string, start: number) =>
  `@keyframes ${name} { 0% { stroke-dashoffset: ${(100 + start).toFixed(3)}; } ` +
  `45%,55% { stroke-dashoffset: ${start.toFixed(3)}; } 100% { stroke-dashoffset: ${(start - 100).toFixed(3)}; } }`;

const PIECES = [
  { key: "l", d: LINE, length: 100, start: 0, masked: true },
  { key: "a", d: OVER_1, length: OVER_LEN, start: OVER_AT[0], masked: false },
  { key: "b", d: OVER_2_REVERSED, length: OVER_LEN, start: OVER_AT[1], masked: false },
];

// Built once: identical for every instance, so the keyframe names can be global.
const HALOS: { cls: string; piece: (typeof PIECES)[number] }[] = [];
const CSS: string[] = [
  ".axios-ld path { fill: none; stroke-width: " + AXIOS_STROKE + "; }",
  ".axios-ld__track { opacity: .16; }",
  ".axios-ld__run { stroke-linecap: butt; stroke-dasharray: 100 102; animation: axios-ld-l0 " +
    CYCLE +
    " cubic-bezier(.45,.05,.35,1) infinite; }",
  ".axios-ld__runs { animation: axios-ld-fade " + CYCLE + " linear infinite; }",
  "@keyframes axios-ld-fade { 0% { opacity: 0; animation-timing-function: cubic-bezier(.2,.7,.45,1); } " +
    "22% { opacity: 1; animation-timing-function: linear; } " +
    "78% { opacity: 1; animation-timing-function: cubic-bezier(.55,0,.8,.3); } 100% { opacity: 0; } }",
];
for (const piece of PIECES) {
  const cls = `axios-ld-${piece.key}0`;
  CSS.push(`.axios-ld .${cls} { animation-name: ${cls}; }`, fill(cls, piece.start));
}
for (let j = HALO_LAYERS; j >= 1; j--) {
  const e = j * HALO_STEP;
  for (const piece of PIECES) {
    const cls = `axios-ld-${piece.key}${j}`;
    HALOS.push({ cls, piece });
    CSS.push(
      `.axios-ld .${cls} { stroke-dasharray: ${(100 + 2 * e).toFixed(2)} 400; animation-name: ${cls}; opacity: ${(1 / (j + 1)).toFixed(4)}; }`,
      fill(cls, piece.start + e)
    );
  }
}
// The glint: a slanted band of light, clipped to the chain, crossing while the chain is fully drawn
// (the 45-55% hold), so the draw and the shine take turns instead of moving at once.
CSS.push(
  ".axios-ld__glint { transform: translateX(-45px) skewX(-22deg); animation: axios-ld-glint " +
    CYCLE +
    " linear infinite; }",
  "@keyframes axios-ld-glint { 0%, 36% { transform: translateX(-45px) skewX(-22deg); " +
    "animation-timing-function: cubic-bezier(.45,.05,.35,1); } 64%, 100% { transform: translateX(175px) skewX(-22deg); } }"
);
CSS.push(
  "@media (prefers-reduced-motion: reduce) {",
  "  .axios-ld .axios-ld__glint { animation: none; opacity: 0; }",
  "  .axios-ld .axios-ld__run, .axios-ld .axios-ld__runs { animation: none; stroke-dashoffset: 0; opacity: 1; }",
  "  .axios-ld .axios-ld__halo { display: none; }",
  "}"
);
const LOADER_CSS = CSS.join("\n");

export interface AxiosLoaderProps {
  className?: string;
  /** Line colour. Defaults to the brand red. */
  color?: string;
  /** Pixel size before any stylesheet applies; keeps the first server-rendered paint from filling the screen. */
  width?: number;
  /** A band of light crosses the chain once per lap, while it is fully drawn. */
  glint?: boolean;
}

/** One piece's halo layers, faintest first, then the line itself. */
const renderRun = (piece: (typeof PIECES)[number]) => (
  <React.Fragment key={piece.key}>
    {HALOS.filter((h) => h.piece === piece).map(({ cls }) => (
      <path key={cls} d={piece.d} pathLength={piece.length} className={`axios-ld__run axios-ld__halo ${cls}`} />
    ))}
    <path d={piece.d} pathLength={piece.length} className={`axios-ld__run axios-ld-${piece.key}0`} />
  </React.Fragment>
);

export function AxiosLoader({ className, color = AXIOS_RED, width = 120, glint = true }: AxiosLoaderProps) {
  const maskId = useSvgId("axios-ld");
  const glintMaskId = useSvgId("axios-ld-gm");
  const glintId = useSvgId("axios-ld-g");
  const height = Math.round((width * (AXIOS_MARK_H + 2)) / (AXIOS_MARK_W + 2));
  return (
    <svg
      viewBox={`-1 -1 ${AXIOS_MARK_W + 2} ${AXIOS_MARK_H + 2}`}
      width={width}
      height={height}
      className={`axios-ld ${className ?? ""}`}
      style={{ overflow: "visible" }}
      stroke={color}
      role="img"
      aria-label="Loading"
    >
      <style>{LOADER_CSS}</style>
      <defs>
        <CrossingMask id={maskId} soft />
        {glint && (
          <>
            <linearGradient id={glintId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="36" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".38" stopColor="#fff" stopOpacity=".25" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".95" />
              <stop offset=".56" stopColor="#fff" stopOpacity=".5" />
              <stop offset=".6" stopColor="#fff" stopOpacity="0" />
              <stop offset=".7" stopColor="#fff" stopOpacity=".3" />
              <stop offset=".76" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask
              id={glintMaskId}
              maskUnits="userSpaceOnUse"
              x="-5"
              y="-5"
              width={AXIOS_MARK_W + 10}
              height={AXIOS_MARK_H + 10}
            >
              {PIECES.map((p) => (
                <path key={p.key} d={p.d} stroke="#fff" mask={p.masked ? `url(#${maskId})` : undefined} />
              ))}
            </mask>
          </>
        )}
      </defs>
      <g className="axios-ld__track">
        {PIECES.map((p) => (
          <path key={p.key} d={p.d} mask={p.masked ? `url(#${maskId})` : undefined} />
        ))}
      </g>
      <g className="axios-ld__runs">
        {/* The masked line is masked once, as a group: cheaper than a mask per halo layer. */}
        <g mask={`url(#${maskId})`}>{PIECES.filter((p) => p.masked).map(renderRun)}</g>
        {PIECES.filter((p) => !p.masked).map(renderRun)}
      </g>
      {glint && (
        <g mask={`url(#${glintMaskId})`}>
          <rect
            className="axios-ld__glint"
            x="0"
            y="-20"
            width="36"
            height="80"
            fill={`url(#${glintId})`}
            stroke="none"
          />
        </g>
      )}
    </svg>
  );
}
