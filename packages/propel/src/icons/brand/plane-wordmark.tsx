/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

// Component name is upstream Plane's; per docs/brand/README.md there is no standalone Axios wordmark asset, so
// "Axios" is set here as live text (no CCI artwork/path involved in this file).
export function PlaneWordmark({ width = "146", height = "44", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 146 44"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <text x="4" y="22" dominantBaseline="central" fontSize="30" fontWeight="600" letterSpacing="-0.5" fill={color}>
        Axios
      </text>
    </svg>
  );
}
