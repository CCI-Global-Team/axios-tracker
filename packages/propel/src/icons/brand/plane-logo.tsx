/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";

// Component name is upstream Plane's; the artwork drawn here is CCI's Axios mark (see docs/brand/axios-mark.svg).
// The mark is two ribbons interlacing. The mask cuts the gap where the descending stroke passes under the
// ascending one, so the over/under weave holds on any background rather than being painted with a ground colour.
export function PlaneLogo({ width = "59", height = "52", className, color = "currentColor" }: ISvgIcons) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="14.5 18.5 71 63"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <mask id="axios-logo-weave" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="#fff" />
          <path d="M20,76 C44,76 56,24 80,24" fill="none" stroke="#000" strokeWidth="17" strokeLinecap="round" />
        </mask>
      </defs>
      <path
        d="M20,24 C44,24 56,76 80,76"
        fill="none"
        stroke={color}
        strokeWidth="11"
        strokeLinecap="round"
        mask="url(#axios-logo-weave)"
      />
      <path d="M20,76 C44,76 56,24 80,24" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
    </svg>
  );
}
