/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { STATE_GROUPS } from "@plane/constants";
import type { TInitiativeProgress } from "@plane/types";
import { cn } from "@plane/utils";

// done first, so the bar fills from the left the way a progress bar reads
const ORDER = ["completed", "started", "unstarted", "backlog", "cancelled"] as const;
const LABEL: Record<(typeof ORDER)[number], string> = {
  completed: "Done",
  started: "In progress",
  unstarted: "To do",
  backlog: "Backlog",
  cancelled: "Cancelled",
};

const countOf = (p: TInitiativeProgress, group: (typeof ORDER)[number]) => p[`${group}_issues`] ?? 0;

/** Work items by state group, as one bar. */
export function InitiativeProgressBar({ progress, className }: { progress: TInitiativeProgress; className?: string }) {
  const total = progress.total_issues;
  return (
    <div
      role="img"
      aria-label={`${progress.completed_issues} of ${total} work items done`}
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-layer-3", className)}
    >
      {total > 0 &&
        ORDER.map((group) => {
          const n = countOf(progress, group);
          if (!n) return null;
          return (
            <span
              key={group}
              className="h-full transition-[width] duration-200 ease-out"
              style={{ width: `${(n / total) * 100}%`, backgroundColor: STATE_GROUPS[group].color }}
            />
          );
        })}
    </div>
  );
}

/** The bar with a percentage, and a legend of the groups that have items. */
export function InitiativeProgress({ progress }: { progress: TInitiativeProgress }) {
  const total = progress.total_issues;
  const pct = total ? Math.round((progress.completed_issues / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-20 font-semibold text-primary tabular-nums">{pct}%</span>
        <span className="text-13 text-secondary tabular-nums">
          {progress.completed_issues} of {total} work item{total === 1 ? "" : "s"} done
        </span>
      </div>
      <InitiativeProgressBar progress={progress} className="h-2" />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-12 text-tertiary">
        {ORDER.filter((g) => countOf(progress, g) > 0).map((group) => (
          <li key={group} className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="size-2 rounded-full" style={{ backgroundColor: STATE_GROUPS[group].color }} />
            {LABEL[group]} {countOf(progress, group)}
          </li>
        ))}
      </ul>
    </div>
  );
}
