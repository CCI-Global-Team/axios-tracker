/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

//
import { cn } from "@plane/utils";

type TCountChip = {
  count: string | number;
  className?: string;
  /** Totals are neutral; "accent" is for counts that ask for attention, such as unread notifications. */
  tone?: "neutral" | "accent";
};

export function CountChip(props: TCountChip) {
  const { count, className = "", tone = "neutral" } = props;

  return (
    <div
      className={cn(
        "relative flex flex-shrink-0 items-center justify-center rounded-xl px-2 py-0.5 text-caption-sm-semibold tabular-nums",
        tone === "accent" ? "bg-accent-primary/20 text-accent-primary" : "bg-layer-3 text-secondary",
        className
      )}
    >
      {count}
    </div>
  );
}
