/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { AlertCircle, Ban } from "lucide-react";
import { cn } from "../utils";

export type TIssuePriorities = "urgent" | "high" | "medium" | "low" | "none";

interface IPriorityIcon {
  className?: string;
  containerClassName?: string;
  priority: TIssuePriorities | undefined | null;
  size?: number;
  withContainer?: boolean;
}

/*
 * CCI: three centred bars, filled up to the priority in its colour and faint above it. Lucide's
 * signal icons draw one or two stubs in the corner of the box, which read as a speck in a list row.
 */
function PriorityBars({ filled, size = 14, className }: { filled: 1 | 2 | 3; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      {[5, 8.5, 12].map((h, i) => (
        <rect key={h} x={1.5 + i * 4.75} y={14 - h} width="3.5" height={h} rx="1" opacity={i < filled ? 1 : 0.22} />
      ))}
    </svg>
  );
}
const LowBars = (p: { size?: number; className?: string }) => <PriorityBars filled={1} {...p} />;
const MediumBars = (p: { size?: number; className?: string }) => <PriorityBars filled={2} {...p} />;
const HighBars = (p: { size?: number; className?: string }) => <PriorityBars filled={3} {...p} />;

export function PriorityIcon(props: IPriorityIcon) {
  const { priority, className = "", containerClassName = "", size = 14, withContainer = false } = props;

  const priorityClasses = {
    urgent: "bg-layer-2 text-priority-urgent border-priority-urgent",
    high: "bg-layer-2 text-priority-high border-priority-high",
    medium: "bg-layer-2 text-priority-medium border-priority-medium",
    low: "bg-layer-2 text-priority-low border-priority-low",
    none: "bg-layer-2 text-priority-none border-priority-none",
  };

  // get priority icon
  const icons = {
    urgent: AlertCircle,
    high: HighBars,
    medium: MediumBars,
    low: LowBars,
    none: Ban,
  };
  const Icon = icons[priority ?? "none"];

  if (!Icon) return null;

  return (
    <>
      {withContainer ? (
        <div
          className={cn(
            "flex flex-shrink-0 items-center justify-center rounded-sm border p-0.5",
            priorityClasses[priority ?? "none"],
            containerClassName
          )}
        >
          <Icon size={size} className={className} />
        </div>
      ) : (
        <Icon
          size={size}
          className={cn(
            "flex-shrink-0",
            {
              "text-priority-urgent": priority === "urgent",
              "text-priority-high": priority === "high",
              "text-priority-medium": priority === "medium",
              "text-priority-low": priority === "low",
              "text-priority-none": priority === "none",
            },
            className
          )}
        />
      )}
    </>
  );
}
