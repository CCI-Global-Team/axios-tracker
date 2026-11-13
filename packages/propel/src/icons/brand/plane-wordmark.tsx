/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";

import type { ISvgIcons } from "../type";
import { AXIOS_RED, WORDMARK_H, WORDMARK_W, WordmarkArt, useSvgId } from "./axios-art";

interface PlaneWordmarkProps extends ISvgIcons {
  /** Colour of the A's crossbar. Defaults to the brand red. */
  accent?: string;
}

// Component name is upstream Plane's; the artwork is CCI's AXIOS wordmark (see docs/brand/README.md).
export function PlaneWordmark({
  width = "106",
  height = "21",
  className,
  color = "currentColor",
  accent = AXIOS_RED,
}: PlaneWordmarkProps) {
  const clipId = useSvgId("axios-wordmark-x");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`-2 -2 ${WORDMARK_W + 4} ${WORDMARK_H + 4}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Axios"
    >
      <WordmarkArt color={color} accent={accent} clipId={clipId} />
    </svg>
  );
}
