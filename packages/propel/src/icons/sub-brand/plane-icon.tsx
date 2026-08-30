/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import { IconWrapper } from "../icon-wrapper";
import type { ISvgIcons } from "../type";

// Component name is upstream Plane's; the artwork drawn here is CCI's Axios mark (see docs/brand/axios-mark.svg).
// The mask cuts the gap for the over/under weave so it holds on any background.
export function PlaneNewIcon({ color = "currentColor", ...rest }: ISvgIcons) {
  return (
    <IconWrapper color={color} viewBox="14.5 18.5 71 63" {...rest}>
      <defs>
        <mask id="axios-icon-weave" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
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
        mask="url(#axios-icon-weave)"
      />
      <path d="M20,76 C44,76 56,24 80,24" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" />
    </IconWrapper>
  );
}
