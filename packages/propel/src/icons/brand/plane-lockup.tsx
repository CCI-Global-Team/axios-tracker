/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

// Component name is upstream Plane's; the artwork drawn here is CCI's Axios mark (see docs/brand/axios-mark.svg),
// with "Axios" set as live text per docs/brand/README.md rather than as a path.
// The default width/height carry the lockup's real aspect ratio, because most call sites size it with a height
// class and `w-auto` — a wrong intrinsic ratio there silently stretches the mark rather than erroring.
export function PlaneLockup({ width = "175", height = "53", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 175 53"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <mask id="axios-lockup-weave" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <path d="M20,76 C44,76 56,24 80,24" fill="none" stroke="#000" strokeWidth="23" strokeLinecap="round" />
        </mask>
      </defs>
      <svg x="0" y="0" width="59.3" height="53" viewBox="12.5 16.5 75 67" fill="none">
        <path
          d="M20,24 C44,24 56,76 80,76"
          fill="none"
          stroke={color}
          strokeWidth="15"
          strokeLinecap="round"
          mask="url(#axios-lockup-weave)"
        />
        <path d="M20,76 C44,76 56,24 80,24" fill="none" stroke={color} strokeWidth="15" strokeLinecap="round" />
      </svg>
      <text
        x="75"
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
