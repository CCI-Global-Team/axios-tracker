/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

// Component name is upstream Plane's; the artwork drawn here is CCI's Axios mark (see docs/brand/axios-mark.svg),
// with "Axios" set as live text per docs/brand/README.md rather than as a path.
export function PlaneLockup({ width = "253", height = "53", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 230 53"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <svg x="0" y="0" width="88.33" height="53" viewBox="0 0 100 60">
        <g transform="translate(-176.9202,-73.5662) scale(3.540372)">
          <path
            d="M62.495,29.317C66.457,24.122 69.906,19.948 76.018,25.885C76.576,26.428 76.932,26.924 77.201,27.253C77.201,27.253 75.574,29.248 75.574,29.248C73.583,26.551 70.606,23.641 67.532,26.927C64.789,29.51 62.618,33.775 58.947,35.139C57.015,35.857 54.45,35.678 52.811,33.973C47.779,28.38 53.96,18.577 61.73,25.158C62.365,25.698 62.864,26.198 63.516,26.966C63.516,26.966 61.906,28.961 61.906,28.961C54.268,19.96 50.24,32.373 56.673,33.086C58.32,33.366 60.771,31.58 62.495,29.317Z"
            fill={color}
          />
        </g>
      </svg>
      <text
        x="115"
        y="26.5"
        dominantBaseline="central"
        fontSize="30"
        fontWeight="600"
        letterSpacing="-0.5"
        fill={color}
      >
        Axios
      </text>
    </svg>
  );
}
