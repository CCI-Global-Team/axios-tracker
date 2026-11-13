/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { TPlanKind, TPlanNode } from "./model";
import { statusLabel } from "./model";
import type { TPlanArea, TPlanPerson } from "./use-plan-data";
import { NO_AREA_HUE } from "./use-plan-data";

export const KIND_PILL: Record<TPlanKind, string> = {
  ready: "bg-success-subtle text-success-primary",
  blocked: "bg-warning-subtle text-warning-primary",
  wip: "bg-accent-subtle text-accent-primary",
  done: "bg-layer-2 text-tertiary",
};

/** Upstream (has to happen first) and downstream (waits on the picked item), as CSS colours for SVG strokes. */
export const UP_COLOUR = "var(--txt-warning-primary)";
export const DOWN_COLOUR = "var(--txt-accent-primary)";

export function StatusPill({ node, className }: { node: TPlanNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-11 font-medium whitespace-nowrap",
        KIND_PILL[node.kind],
        className
      )}
    >
      {statusLabel(node)}
    </span>
  );
}

export function AreaDot({ area, className }: { area: TPlanArea | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-[2px]", className)}
      style={{ background: area?.hue ?? NO_AREA_HUE }}
    />
  );
}

export function ItemKey({ node, area }: { node: { key: string }; area: TPlanArea | undefined }) {
  return (
    <span className="font-mono inline-flex items-center gap-1.5 text-11 font-medium whitespace-nowrap text-tertiary tabular-nums">
      <AreaDot area={area} />
      {node.key}
    </span>
  );
}

export function PersonAvatar({ person, size = 18 }: { person: TPlanPerson | undefined; size?: number }) {
  return (
    <Avatar
      name={person?.name ?? "No owner"}
      src={person?.avatarUrl ? getFileURL(person.avatarUrl) : undefined}
      fallbackSeed={person?.id ?? "no-owner"}
      size={size}
      showTooltip={false}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("min-w-0 rounded-lg border border-subtle bg-layer-1 p-4", className)} {...props} />;
}

export function CardTitle({ title, action }: { title: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="text-13 font-semibold text-primary">{title}</h3>
      {action}
    </div>
  );
}

export function LinkButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-sm text-12 font-medium text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]",
        className
      )}
      {...props}
    />
  );
}
