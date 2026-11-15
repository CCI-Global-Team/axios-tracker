/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssuePriorities } from "@plane/types";
import type { TPlanArea, TPlanPerson } from "@/components/issues/issue-layouts/plan/use-plan-data";

export type GroupBy = "status" | "project" | "module" | "assignee";
export type WorkItem = {
  id: string;
  key: string;
  name: string;
  projectId: string;
  projectName: string;
  projectIdentifier: string;
  area?: TPlanArea;
  projectArea?: TPlanArea;
  stateGroup: string;
  stateName: string;
  stateColor?: string;
  priority: TIssuePriorities;
  people: TPlanPerson[];
  modules: { id: string; name: string }[];
  labels: { id: string; name: string; color?: string }[];
  startDate: string | null;
  dueDate: string | null;
  isArchived: boolean;
};
export type WorkItemGroup = {
  id: string;
  name: string;
  kind: GroupBy;
  area?: TPlanArea;
  person?: TPlanPerson;
  items: WorkItem[];
};
export const STATUS_GROUPS = [
  { id: "triage", name: "Triage" },
  { id: "backlog", name: "Backlog" },
  { id: "unstarted", name: "Todo" },
  { id: "started", name: "In progress" },
  { id: "completed", name: "Done" },
  { id: "cancelled", name: "Cancelled" },
];
export const GROUP_OPTIONS: { id: GroupBy; name: string }[] = [
  { id: "status", name: "Status" },
  { id: "project", name: "Project" },
  { id: "module", name: "Module" },
  { id: "assignee", name: "Assignee" },
];
export function isGroupBy(value: string | null): value is GroupBy {
  return GROUP_OPTIONS.some(({ id }) => id === value);
}
export function statusRank(group: string) {
  const index = STATUS_GROUPS.findIndex(({ id }) => id === group);
  return index < 0 ? STATUS_GROUPS.length : index;
}
export function compareKeys(a: WorkItem, b: WorkItem) {
  return a.key.localeCompare(b.key, undefined, { numeric: true }) || a.id.localeCompare(b.id);
}
export function filterItems(items: WorkItem[], query: string) {
  const term = query.trim().toLowerCase();
  return items.filter((item) => `${item.key} ${item.name}`.toLowerCase().includes(term));
}

export const FILTER_FIELDS = [
  { id: "status", name: "Status" },
  { id: "project", name: "Project" },
  { id: "module", name: "Module" },
  { id: "assignee", name: "Assignee" },
  { id: "priority", name: "Priority" },
  { id: "label", name: "Label" },
  { id: "due", name: "Due date" },
] as const;
export type FilterField = (typeof FILTER_FIELDS)[number]["id"];
export type WorkItemFilters = Record<FilterField, string[]>;
export type WorkItemFilterOption = {
  id: string;
  name: string;
  count: number;
  area?: TPlanArea;
  person?: TPlanPerson;
  identifier?: string;
  color?: string;
};
export type WorkItemFilterOptions = Record<FilterField, WorkItemFilterOption[]>;
const DUE_OPTIONS = [
  { id: "overdue", name: "Overdue" },
  { id: "week", name: "Due this week" },
  { id: "month", name: "Due this month" },
  { id: "none", name: "No due date" },
];

// Monday–Sunday and calendar-month ranges use local dates, as the calendar view does.
function dueValues(item: WorkItem, now: Date): string[] {
  if (!item.dueDate) return ["none"];
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [
    ...(isOverdue(item, dateKey(now)) ? ["overdue"] : []),
    ...(item.dueDate >= dateKey(monday) && item.dueDate <= dateKey(sunday) ? ["week"] : []),
    ...(item.dueDate >= dateKey(first) && item.dueDate <= dateKey(last) ? ["month"] : []),
  ];
}

function filterValues(item: WorkItem, now: Date): WorkItemFilters {
  return {
    status: [item.stateGroup],
    project: [item.projectId],
    module: item.modules.map(({ id }) => id),
    assignee: item.people.length ? item.people.map(({ id }) => id) : ["none"],
    priority: [item.priority],
    label: item.labels.map(({ id }) => id),
    due: dueValues(item, now),
  };
}

// Options and counts always come from the whole initiative, before search or filters.
export function getFilterOptions(items: WorkItem[], now = new Date()): WorkItemFilterOptions {
  const options: WorkItemFilterOptions = {
    status: [],
    project: [],
    module: [],
    assignee: [],
    priority: [],
    label: [],
    due: [],
  };
  const maps = Object.fromEntries(
    FILTER_FIELDS.map(({ id }) => [id, new Map<string, WorkItemFilterOption>()])
  ) as Record<FilterField, Map<string, WorkItemFilterOption>>;
  for (const item of items) {
    const candidates: Record<FilterField, Omit<WorkItemFilterOption, "count">[]> = {
      status: STATUS_GROUPS.filter(({ id }) => id === item.stateGroup),
      project: [
        { id: item.projectId, name: item.projectName, identifier: item.projectIdentifier, area: item.projectArea },
      ],
      module: item.modules,
      assignee: item.people.length
        ? item.people.map((person) => ({ id: person.id, name: person.name, person }))
        : [{ id: "none", name: "Unassigned" }],
      priority: [{ id: item.priority, name: item.priority.charAt(0).toUpperCase() + item.priority.slice(1) }],
      label: item.labels,
      due: DUE_OPTIONS.filter(({ id }) => dueValues(item, now).includes(id)),
    };
    for (const { id: field } of FILTER_FIELDS) {
      for (const option of new Map(candidates[field].map((value) => [value.id, value])).values()) {
        const existing = maps[field].get(option.id);
        if (existing) existing.count += 1;
        else maps[field].set(option.id, { ...option, count: 1 });
      }
    }
  }
  for (const { id } of FILTER_FIELDS) {
    const order =
      id === "status"
        ? STATUS_GROUPS.map((s) => s.id)
        : id === "priority"
          ? PRIORITIES
          : id === "due"
            ? DUE_OPTIONS.map((d) => d.id)
            : null;
    options[id] = [...maps[id].values()].toSorted((a, b) =>
      order ? order.indexOf(a.id) - order.indexOf(b.id) : a.name.localeCompare(b.name)
    );
  }
  return options;
}

export function readFilters(params: URLSearchParams, options: WorkItemFilterOptions): WorkItemFilters {
  const filters: WorkItemFilters = {
    status: [],
    project: [],
    module: [],
    assignee: [],
    priority: [],
    label: [],
    due: [],
  };
  for (const { id } of FILTER_FIELDS) {
    const known = new Set(options[id].map((option) => option.id));
    filters[id] = [...new Set(params.getAll(id).flatMap((value) => value.split(",")))].filter((value) =>
      known.has(value)
    );
  }
  return filters;
}

export function writeFilters(params: URLSearchParams, filters: WorkItemFilters): URLSearchParams {
  const updated = new URLSearchParams(params);
  for (const { id } of FILTER_FIELDS) {
    if (filters[id].length) updated.set(id, filters[id].join(","));
    else updated.delete(id);
  }
  return updated;
}

export function applyFilters(items: WorkItem[], filters: WorkItemFilters, query = "", now = new Date()): WorkItem[] {
  return filterItems(items, query).filter((item) => {
    const values = filterValues(item, now);
    return FILTER_FIELDS.every(
      ({ id }) => !filters[id].length || filters[id].some((value) => values[id].includes(value))
    );
  });
}
export function groupItems(items: WorkItem[], by: GroupBy, includeTriage = false): WorkItemGroup[] {
  const groups = new Map<string, WorkItemGroup>();
  if (by === "status") {
    STATUS_GROUPS.filter(
      ({ id }) => id !== "triage" || includeTriage || items.some((i) => i.stateGroup === id)
    ).forEach(({ id, name }) => groups.set(id, { id, name, kind: by, items: [] }));
  }
  for (const item of items) {
    const memberships =
      by === "status"
        ? [{ id: item.stateGroup, name: item.stateName || "Unknown state" }]
        : by === "project"
          ? [{ id: item.projectId, name: item.projectName, area: item.projectArea }]
          : by === "module"
            ? item.modules.length
              ? item.modules
              : [{ id: "", name: "No module" }]
            : item.people.length
              ? item.people.map((person) => ({ id: person.id, name: person.name, person }))
              : [{ id: "", name: "Unassigned" }];
    for (const membership of new Map(memberships.map((m) => [m.id, m])).values()) {
      if (!groups.has(membership.id)) groups.set(membership.id, { ...membership, kind: by, items: [] });
      groups.get(membership.id)!.items.push(item);
    }
  }
  return [...groups.values()].toSorted((a, b) =>
    by === "status"
      ? statusRank(a.id) - statusRank(b.id)
      : a.id === ""
        ? 1
        : b.id === ""
          ? -1
          : a.name.localeCompare(b.name, undefined, { numeric: true })
  );
}
export type SortColumn = "item" | "project" | "module" | "state" | "priority" | "assignees" | "start" | "due";
const PRIORITIES = ["urgent", "high", "medium", "low", "none"];
export function compareItems(a: WorkItem, b: WorkItem, column: SortColumn): number {
  if (column === "state") return statusRank(a.stateGroup) - statusRank(b.stateGroup) || compareKeys(a, b);
  if (column === "priority")
    return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || compareKeys(a, b);
  const value = (item: WorkItem) =>
    ({
      item: item.key,
      project: item.projectName,
      module: item.modules
        .map((m) => m.name)
        .toSorted()
        .join(", "),
      assignees: item.people
        .map((p) => p.name)
        .toSorted()
        .join(", "),
      start: item.startDate ?? "9999-12-31",
      due: item.dueDate ?? "9999-12-31",
    })[column];
  return value(a).localeCompare(value(b), undefined, { numeric: true }) || compareKeys(a, b);
}
// Date-only values stay in local calendar time, including in timezones west of UTC.
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isOverdue(item: WorkItem, today = dateKey(new Date())) {
  return !!item.dueDate && item.dueDate < today && !["completed", "cancelled"].includes(item.stateGroup);
}
export function monthDays(month: Date): Date[] {
  return Array.from(
    { length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)
  );
}
