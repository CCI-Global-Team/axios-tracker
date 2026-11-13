/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";
import {
  AXIOS_MARK_H,
  AXIOS_MARK_W,
  AXIOS_RED,
  ChainArt,
  CrossingMask,
  WORDMARK_H,
  WordmarkArt,
  useSvgId,
} from "./axios-art";

// The horizontal lockup: the chain, then AXIOS on the chain's centre line. The wordmark's cap height is
// three quarters of the chain's height, and the gap between them is about one loop radius.
const CAP = 28.3;
const SCALE = CAP / WORDMARK_H;
const GAP = 21.4;
const WM_X = AXIOS_MARK_W + GAP;
const WM_Y = (AXIOS_MARK_H - CAP) / 2;
const W = WM_X + 513.2 * SCALE + 1;

interface PlaneLockupProps extends ISvgIcons {
  /** Colour of the chain and the A's crossbar. Defaults to the brand red; pass "currentColor" on a coloured ground. */
  accent?: string;
}

// Component name is upstream Plane's; the artwork is CCI's Axios lockup (see docs/brand/README.md).
// The default size carries the lockup's real aspect ratio, because most call sites size it with a height class and
// `w-auto`; a wrong intrinsic ratio there letterboxes the art.
export function PlaneLockup({
  width = String(Math.round((W * 20) / AXIOS_MARK_H)),
  height = "20",
  className,
  color = "currentColor",
  accent = AXIOS_RED,
}: PlaneLockupProps) {
  const maskId = useSvgId("axios-lockup");
  const clipId = useSvgId("axios-lockup-x");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${W.toFixed(1)} ${AXIOS_MARK_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Axios"
    >
      <defs>
        <CrossingMask id={maskId} />
      </defs>
      <ChainArt color={accent} maskId={maskId} />
      <g transform={`translate(${WM_X} ${WM_Y.toFixed(2)}) scale(${SCALE})`}>
        <WordmarkArt color={color} accent={accent} clipId={clipId} />
      </g>
    </svg>
  );
}
