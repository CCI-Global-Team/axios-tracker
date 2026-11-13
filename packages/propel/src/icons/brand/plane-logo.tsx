/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";
import { AXIOS_MARK_H, AXIOS_MARK_W, AXIOS_RED, ChainArt, CrossingMask, useSvgId } from "./axios-art";

// Component name is upstream Plane's; the artwork is CCI's Axios mark, the chain (see docs/brand/README.md).
// The default size carries the mark's real aspect ratio, because call sites size it with a height class and
// `w-auto`. `color` defaults to the brand red; pass "currentColor" on a coloured ground.
export function PlaneLogo({ width = "123", height = "38", className, color = AXIOS_RED }: ISvgIcons) {
  const maskId = useSvgId("axios-mark");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${AXIOS_MARK_W} ${AXIOS_MARK_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Axios"
    >
      <defs>
        <CrossingMask id={maskId} />
      </defs>
      <ChainArt color={color} maskId={maskId} />
    </svg>
  );
}
