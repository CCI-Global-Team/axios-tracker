/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: the Plan layout's model. Pure functions over work items and their relations, so the three views
// (Overview, Build order, Schedule) agree on what is blocked, what can start and when it will be built.

import type { TWorkItemRelationEdge, TWorkItemRelationEnd } from "@plane/types";

export type TPlanItem = {
  id: string;
  /** e.g. GAM-123 */
  key: string;
  name: string;
  projectId: string;
  stateGroup: string;
  stateName: string;
  priority: string;
  /** first assignee, the lane the item is scheduled in */
  ownerId: string | null;
  areaId: string | null;
  isArchived: boolean;
};

export type TPlanKind = "done" | "wip" | "blocked" | "ready";

export type TPlanNode = TPlanItem & {
  isDone: boolean;
  /** everything this item waits on (blocked_by), in or out of the plan */
  waitsOn: string[];
  /** the part of waitsOn that is still open */
  openWaitsOn: string[];
  blocks: string[];
  related: string[];
  /** -1 when done, otherwise how many open steps sit in front of it */
  depth: number;
  kind: TPlanKind;
  /** everything downstream (transitively) that is still open */
  downstreamOpen: number;
};

/** A work item a relation points at that is not in the plan's scope (another project, module or view). */
export type TPlanOutsider = TWorkItemRelationEnd & { id: string };

export type TPlanGraph = {
  nodes: Map<string, TPlanNode>;
  outsiders: Map<string, TPlanOutsider>;
  /** blocked_by links with both ends in the plan */
  blockedByLinks: number;
};

const DONE_GROUPS = new Set(["completed", "cancelled"]);
export const isDoneGroup = (group: string | undefined) => !!group && DONE_GROUPS.has(group);

export function buildPlanGraph(
  items: TPlanItem[],
  edges: TWorkItemRelationEdge[],
  ends: Record<string, TWorkItemRelationEnd>
): TPlanGraph {
  const nodes = new Map<string, TPlanNode>();
  for (const item of items) {
    nodes.set(item.id, {
      ...item,
      isDone: item.isArchived || isDoneGroup(item.stateGroup),
      waitsOn: [],
      openWaitsOn: [],
      blocks: [],
      related: [],
      depth: 0,
      kind: "ready",
      downstreamOpen: 0,
    });
  }
  const outsiders = new Map<string, TPlanOutsider>();
  const note = (id: string) => {
    if (!nodes.has(id) && !outsiders.has(id) && ends[id]) outsiders.set(id, { ...ends[id], id });
  };
  const isOpen = (id: string) => {
    const n = nodes.get(id);
    if (n) return !n.isDone;
    const o = ends[id];
    return !!o && !o.is_archived && !isDoneGroup(o.state_group);
  };

  let blockedByLinks = 0;
  const seen = new Set<string>();
  for (const e of edges) {
    const a = e.issue_id;
    const b = e.related_issue_id;
    if (a === b) continue;
    const key = `${e.relation_type}:${a}:${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.relation_type === "blocked_by") {
      // a waits on b
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (na && !na.waitsOn.includes(b)) {
        na.waitsOn.push(b);
        note(b);
      }
      if (nb && !nb.blocks.includes(a)) {
        nb.blocks.push(a);
        note(a);
      }
      if (na && nb) blockedByLinks++;
    } else if (e.relation_type === "relates_to" || e.relation_type === "duplicate") {
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (na && !na.related.includes(b)) {
        na.related.push(b);
        note(b);
      }
      if (nb && !nb.related.includes(a)) {
        nb.related.push(a);
        note(a);
      }
    }
  }

  for (const n of nodes.values()) n.openWaitsOn = n.waitsOn.filter(isOpen);

  // depth over open blockers inside the plan; an open outside blocker still costs one step.
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const n = nodes.get(id);
    if (!n || n.isDone) return -1;
    if (visiting.has(id)) return 0; // a cycle in the data: cut it here
    visiting.add(id);
    let d = 0;
    for (const b of n.openWaitsOn) d = Math.max(d, 1 + Math.max(0, nodes.has(b) ? depth(b) : 0));
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const n of nodes.values()) {
    n.depth = n.isDone ? -1 : depth(n.id);
    n.kind = n.isDone ? "done" : n.stateGroup === "started" ? "wip" : n.openWaitsOn.length ? "blocked" : "ready";
  }
  for (const n of nodes.values()) {
    if (!n.isDone) n.downstreamOpen = walk(nodes, n.id, "down").size;
  }
  return { nodes, outsiders, blockedByLinks };
}

/** Everything before ("up") or after ("down") an item in its chain, inside the plan, open items only when downstream. */
export function walk(nodes: Map<string, TPlanNode>, id: string, dir: "up" | "down"): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = nodes.get(stack.pop() as string);
    if (!cur) continue;
    for (const next of dir === "up" ? cur.waitsOn : cur.blocks) {
      const n = nodes.get(next);
      if (!n || out.has(next) || next === id) continue;
      if (dir === "down" && n.isDone) continue;
      out.add(next);
      stack.push(next);
    }
  }
  return out;
}

export function statusLabel(n: TPlanNode): string {
  if (n.kind === "done") return n.isArchived && !isDoneGroup(n.stateGroup) ? "Archived" : n.stateName;
  if (n.kind === "wip") return n.stateName;
  if (n.kind === "blocked") return `Waiting on ${n.openWaitsOn.length}`;
  return n.stateGroup === "backlog" ? "Backlog" : "Can start";
}

// ---------- schedule ----------

export const DEFAULT_ITEM_HOURS = 8;
export const DEFAULT_WEEK_HOURS = 20;
export const NO_OWNER = "";

export type TScheduleSlot = { start: number; end: number };
export type TSchedule = {
  /** in weeks from the plan's start (this week's Monday) */
  slots: Map<string, TScheduleSlot>;
  /** when each lane frees up */
  laneEnd: Map<string, number>;
  end: number;
  /** the lane that finishes last */
  setter: string | null;
};

/**
 * List scheduling: each person works one item at a time; an item starts once its open blockers in the plan
 * are finished and its owner is free. Ties go to urgent, then items already under way, then the item with
 * the most open work waiting on it.
 */
/** Lower goes first: urgent, then already started, then whatever unblocks the most. */
const priorityRank = (n: TPlanNode) =>
  (n.priority === "urgent" ? 0 : 1) * 1e6 + (n.kind === "wip" ? 0 : 1) * 5e5 - n.downstreamOpen;

export function schedule(
  nodes: Map<string, TPlanNode>,
  hoursOf: (id: string) => number,
  weekHoursOf: (ownerId: string) => number,
  now: number
): TSchedule {
  const open = [...nodes.values()].filter((n) => !n.isDone);
  const slots = new Map<string, TScheduleSlot>();
  const laneEnd = new Map<string, number>();
  const lane = (n: TPlanNode) => n.ownerId ?? NO_OWNER;
  const inPlanBlockers = new Map(open.map((n) => [n.id, n.openWaitsOn.filter((b) => nodes.has(b))]));
  let todo = open;
  let guard = open.length + 1;
  while (todo.length && guard-- > 0) {
    let best: TPlanNode | null = null;
    let bestStart = Infinity;
    for (const n of todo) {
      const blockers = inPlanBlockers.get(n.id) ?? [];
      if (!blockers.every((b) => slots.has(b))) continue;
      let start = laneEnd.get(lane(n)) ?? now;
      for (const b of blockers) start = Math.max(start, (slots.get(b) as TScheduleSlot).end);
      if (
        start < bestStart - 1e-9 ||
        (best && Math.abs(start - bestStart) < 1e-9 && priorityRank(n) < priorityRank(best))
      ) {
        best = n;
        bestStart = start;
      }
    }
    if (!best) {
      // blockers form a cycle: release the rest in priority order so nothing disappears from the schedule
      for (const n of todo) inPlanBlockers.set(n.id, []);
      continue;
    }
    const weekHours = Math.max(1, weekHoursOf(lane(best)));
    const slot = { start: bestStart, end: bestStart + hoursOf(best.id) / weekHours };
    slots.set(best.id, slot);
    laneEnd.set(lane(best), slot.end);
    const picked = best;
    todo = todo.filter((n) => n !== picked);
  }
  let end = now;
  let setter: string | null = null;
  for (const [l, e] of laneEnd) {
    if (e > end) {
      end = e;
      setter = l;
    }
  }
  return { slots, laneEnd, end, setter };
}

/** The longest chain of open items, each waiting on the one before it. */
export function longestChain(nodes: Map<string, TPlanNode>): string[] {
  const memo = new Map<string, string[]>();
  const visiting = new Set<string>();
  const longest = (id: string): string[] => {
    const hit = memo.get(id);
    if (hit) return hit;
    if (visiting.has(id)) return [];
    visiting.add(id);
    const n = nodes.get(id) as TPlanNode;
    let best: string[] = [];
    for (const k of n.blocks) {
      const kid = nodes.get(k);
      if (!kid || kid.isDone) continue;
      const path = longest(k);
      if (path.length > best.length) best = path;
    }
    visiting.delete(id);
    const out = [id, ...best];
    memo.set(id, out);
    return out;
  };
  let best: string[] = [];
  for (const n of nodes.values()) {
    if (n.isDone || n.openWaitsOn.some((b) => nodes.has(b))) continue;
    const p = longest(n.id);
    if (p.length > best.length) best = p;
  }
  return best.length > 1 ? best : [];
}

// ---------- dates ----------

const DAY = 864e5;
/** Monday 00:00 of the week containing d, local time. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const weeksToDate = (origin: Date, w: number) => new Date(origin.getTime() + Math.round(w * 7) * DAY);
export const dateToWeeks = (origin: Date, d: Date) => (d.getTime() - origin.getTime()) / (7 * DAY);
