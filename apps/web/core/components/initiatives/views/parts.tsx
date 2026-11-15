/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Layers, UserRound } from "lucide-react";
import { IntakeStateGroupIcon, PriorityIcon, StateGroupIcon } from "@plane/propel/icons";
import { AreaDot, PersonAvatar } from "@/components/issues/issue-layouts/plan/parts";
import type { WorkItem, WorkItemGroup } from "./model";
import { isOverdue } from "./model";

export const ITEM_FOCUS =
  "outline-none transition-colors hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--border-accent-strong)]";
export type ViewProps = { items: WorkItem[]; onOpen: (item: WorkItem) => void };
export type GroupedViewProps = ViewProps & { groups: WorkItemGroup[] };

export function EmptyLine({ children = "No work items found." }: { children?: React.ReactNode }) {
  return <p className="p-4 text-13 text-tertiary">{children}</p>;
}
export function GroupIcon({ group }: { group: WorkItemGroup }) {
  if (group.kind === "status") {
    if (group.id === "triage") return <IntakeStateGroupIcon stateGroup="triage" />;
    const stateGroup = group.id;
    if (
      stateGroup === "backlog" ||
      stateGroup === "unstarted" ||
      stateGroup === "started" ||
      stateGroup === "completed" ||
      stateGroup === "cancelled"
    )
      return <StateGroupIcon stateGroup={stateGroup} />;
  }
  if (group.kind === "project") return <AreaDot area={group.area} />;
  if (group.kind === "assignee")
    return group.person ? <PersonAvatar person={group.person} /> : <UserRound className="size-3.5" aria-hidden />;
  return <Layers className="size-3.5" aria-hidden />;
}
export function State({ item }: { item: WorkItem }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-12 text-secondary">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-layer-2"
        style={{ backgroundColor: item.stateColor }}
      />
      <span className="truncate">{item.stateName}</span>
    </span>
  );
}
export function Priority({ item }: { item: WorkItem }) {
  return (
    <span
      className="inline-flex shrink-0 items-center"
      role="img"
      aria-label={`Priority: ${item.priority}`}
      title={`Priority: ${item.priority}`}
    >
      <PriorityIcon priority={item.priority} />
    </span>
  );
}
export function Assignees({ item }: { item: WorkItem }) {
  const names = item.people.map((person) => person.name).join(", ") || "Unassigned";
  return (
    <span className="inline-flex shrink-0 items-center -space-x-1" aria-label={names} title={names}>
      {item.people.slice(0, 3).map((person) => (
        <PersonAvatar key={person.id} person={person} />
      ))}
      {item.people.length > 3 && (
        <span className="rounded-full bg-layer-2 px-1 text-11 text-secondary">+{item.people.length - 3}</span>
      )}
      {!item.people.length && <span className="text-11 text-tertiary">Unassigned</span>}
    </span>
  );
}
export function ItemDate({ value, overdue = false }: { value: string | null; overdue?: boolean }) {
  return value ? (
    <time dateTime={value} className={`text-12 whitespace-nowrap ${overdue ? "text-danger-primary" : "text-tertiary"}`}>
      {new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
    </time>
  ) : (
    <span className="text-tertiary">—</span>
  );
}
export function DueDate({ item }: { item: WorkItem }) {
  return <ItemDate value={item.dueDate} overdue={isOverdue(item)} />;
}
