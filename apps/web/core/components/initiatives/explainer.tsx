/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Info, Target } from "lucide-react";
import { ModuleIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";

// CCI: the one-line definition, and the longer one behind every Initiative label.
export const INITIATIVE_TAGLINE = "One outcome, tracked across projects.";
export const INITIATIVE_DEFINITION =
  "An initiative groups modules from different projects that deliver one outcome. Each module stays in its own project; the initiative adds up their progress and plans their work together.";

/** An info mark that explains what an initiative is. */
export function InitiativeInfo({ className }: { className?: string }) {
  return (
    <Tooltip tooltipContent={INITIATIVE_DEFINITION} position="bottom">
      <button
        type="button"
        aria-label="What is an initiative?"
        className={cn(
          "grid size-6 place-items-center rounded-sm text-placeholder outline-none hover:text-secondary focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]",
          className
        )}
      >
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  );
}

const EXAMPLE = [
  { project: "Gamma", module: "Giving" },
  { project: "CCI App", module: "Giving" },
];

/** The idea as a picture: one initiative holding a module from each of two projects. */
export function InitiativeExample({ compact = false }: { compact?: boolean }) {
  return (
    <figure
      aria-label="Example: the Giving initiative holds the Giving module in Gamma and the Giving module in CCI App"
      className={cn(
        "inline-flex items-center self-center rounded-lg border border-dashed border-subtle bg-layer-1",
        compact ? "gap-2 px-3 py-2.5" : "gap-3 px-4 py-4"
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-13 font-medium text-primary shadow-raised-100">
        <Target className="size-3.5 text-secondary" aria-hidden />
        Giving
      </span>
      <span
        aria-hidden
        className="h-[calc(100%-1.75rem)] min-h-7 w-3 shrink-0 rounded-l-md border-y border-l border-strong"
      />
      <span className="flex flex-col gap-1.5">
        {EXAMPLE.map((m) => (
          <span key={m.project} className="inline-flex items-center gap-1.5 text-12 whitespace-nowrap text-secondary">
            <ModuleIcon className="size-3.5 shrink-0 text-tertiary" aria-hidden />
            <span>
              <span className="text-tertiary">{m.project} ·</span> {m.module}
            </span>
          </span>
        ))}
      </span>
    </figure>
  );
}
