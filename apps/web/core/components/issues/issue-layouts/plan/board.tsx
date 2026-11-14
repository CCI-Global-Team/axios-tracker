/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { CalendarRange, Columns3, LayoutDashboard, Search, X } from "lucide-react";
import type { TIssueMap } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local
import { BuildOrderView } from "./build-order";
import type { TPlanNode } from "./model";
import { DEFAULT_ITEM_HOURS, DEFAULT_WEEK_HOURS, NO_OWNER, dateToWeeks, schedule, weekStart } from "./model";
import { OverviewView } from "./overview";
import { PlanPeekSection } from "./peek";
import { setPlanPeekSection } from "./peek-slot";
import { ScheduleView } from "./schedule";
import { AREA_NOUN, usePlanData } from "./use-plan-data";
import { usePlanHours } from "./use-plan-hours";

export type TPlanView = "overview" | "order" | "schedule";
export type TPlanArrange = "step" | "area" | "owner";
export type TPlanFilter = "ready" | "blocked" | "wip" | "noowner" | "urgent" | `area:${string}`;

export const FILTER_LABELS: Record<Exclude<TPlanFilter, `area:${string}`>, string> = {
  ready: "Can start now",
  blocked: "Waiting on others",
  wip: "In progress",
  noowner: "No owner",
  urgent: "Urgent",
};

const VIEWS: { key: TPlanView; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "order", label: "Build order", icon: Columns3 },
  { key: "schedule", label: "Schedule", icon: CalendarRange },
];
const ARRANGE: { key: TPlanArrange; label: string }[] = [
  { key: "step", label: "Step" },
  { key: "area", label: "Area" },
  { key: "owner", label: "Owner" },
];

const VIEW_KEY = "axios:plan-view";
function readView(): TPlanView {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    if (v === "overview" || v === "order" || v === "schedule") return v;
  } catch {
    // storage blocked
  }
  return "overview";
}

type Props = {
  workspaceSlug: string;
  issueIds: string[];
  issueMap: TIssueMap;
  areaBy: "module" | "project";
  /** more pages are still loading */
  isLoadingMore: boolean;
  loadingError?: boolean;
  onRetryLoading?: () => void;
};

export const PlanBoard = observer(function PlanBoard(props: Props) {
  const { workspaceSlug, issueIds, issueMap, areaBy, isLoadingMore } = props;
  const data = usePlanData({ workspaceSlug, issueIds, issueMap, areaBy });
  const { graph, areas, areaKind, people } = data;
  const noAreaName = `No ${AREA_NOUN[areaKind]}`;
  const areaButtonLabel = AREA_NOUN[areaKind].replace(/ .*/, "").replace(/^./, (c) => c.toUpperCase());
  const { itemHours, personHours, setItemHours, setPersonHours } = usePlanHours(workspaceSlug);
  const { setPeekIssue, peekIssue } = useIssueDetail();

  const [view, setView] = useState<TPlanView>("overview");
  const [arrange, setArrange] = useState<TPlanArrange>("step");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [filter, setFilter] = useState<TPlanFilter | null>(null);

  useEffect(() => setView(readView()), []);
  const changeView = useCallback((v: TPlanView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage blocked
    }
  }, []);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const hoursOf = useCallback((id: string) => itemHours[id] ?? DEFAULT_ITEM_HOURS, [itemHours]);
  const weekHoursOf = useCallback(
    (ownerId: string) =>
      personHours[ownerId] ??
      (ownerId === NO_OWNER ? null : personById.get(ownerId)?.declaredHours) ??
      DEFAULT_WEEK_HOURS,
    [personHours, personById]
  );

  const today = useMemo(() => new Date(), []);
  const origin = useMemo(() => weekStart(today), [today]);
  const now = dateToWeeks(origin, today);
  const plan = useMemo(() => schedule(graph.nodes, hoursOf, weekHoursOf, now), [graph, hoursOf, weekHoursOf, now]);

  const isVisible = useCallback(
    (n: TPlanNode) => {
      if (!showDone && n.isDone) return false;
      if (filter) {
        if ((filter === "ready" || filter === "blocked" || filter === "wip") && n.kind !== filter) return false;
        if (filter === "noowner" && (n.ownerId || n.isDone)) return false;
        if (filter === "urgent" && n.priority !== "urgent") return false;
        if (filter.startsWith("area:") && (n.areaId ?? "") !== filter.slice(5)) return false;
      }
      if (query) {
        const q = query.trim().toLowerCase();
        if (!n.key.toLowerCase().includes(q) && !n.name.toLowerCase().includes(q)) return false;
      }
      return true;
    },
    [showDone, filter, query]
  );

  const openWorkItem = useCallback(
    (n: { id: string; projectId: string; isArchived?: boolean }) =>
      setPeekIssue({ workspaceSlug, projectId: n.projectId, issueId: n.id, isArchived: !!n.isArchived }),
    [setPeekIssue, workspaceSlug]
  );

  // the open work item sidebar is the selection: its links draw on the board
  const selectedId = peekIssue?.issueId && graph.nodes.has(peekIssue.issueId) ? peekIssue.issueId : null;

  const reveal = useCallback(
    (n: TPlanNode) => {
      if (isVisible(n)) return;
      setFilter(null);
      setQuery("");
      if (n.isDone) setShowDone(true);
    },
    [isVisible]
  );
  const select = useCallback(
    (id: string | null) => {
      const n = id ? graph.nodes.get(id) : undefined;
      if (!n || id === selectedId) {
        setPeekIssue(undefined);
        return;
      }
      openWorkItem(n);
      reveal(n);
    },
    [graph, selectedId, openWorkItem, reveal, setPeekIssue]
  );
  const openFromOverview = useCallback(
    (id: string) => {
      const n = graph.nodes.get(id);
      if (!n) return;
      changeView("order");
      openWorkItem(n);
      reveal(n);
    },
    [changeView, graph, openWorkItem, reveal]
  );
  const applyFilter = useCallback(
    (f: TPlanFilter | null) => {
      setFilter(f);
      if (selectedId) setPeekIssue(undefined);
      changeView("order");
    },
    [changeView, selectedId, setPeekIssue]
  );

  // the work item sidebar draws the Plan's section for items on this board
  useEffect(() => {
    setPlanPeekSection((issueId) => {
      const n = graph.nodes.get(issueId);
      if (!n) return null;
      return (
        <PlanPeekSection
          node={n}
          graph={graph}
          areaById={areaById}
          slot={plan.slots.get(n.id)}
          origin={origin}
          hours={hoursOf(n.id)}
          isGuess={itemHours[n.id] === undefined}
          onHours={(h) => setItemHours(n.id, h)}
          onSelect={(id) => {
            const next = graph.nodes.get(id);
            if (next) {
              openWorkItem(next);
              reveal(next);
            }
          }}
          onOpen={openWorkItem}
        />
      );
    });
  }, [graph, areaById, plan, origin, hoursOf, itemHours, setItemHours, openWorkItem, reveal]);
  useEffect(() => () => setPlanPeekSection(null), []);

  const openCount = useMemo(() => [...graph.nodes.values()].filter((n) => !n.isDone).length, [graph]);
  const filterLabel = filter
    ? filter.startsWith("area:")
      ? (areaById.get(filter.slice(5))?.name ?? noAreaName)
      : FILTER_LABELS[filter as keyof typeof FILTER_LABELS]
    : null;

  const shared = {
    graph,
    areaById,
    personById,
    people,
    plan,
    origin,
    now,
    hoursOf,
    itemHours,
    weekHoursOf,
    isVisible,
    selectedId,
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-1">
      {/* plan bar */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-subtle px-page-x py-2.5">
        <div
          role="tablist"
          aria-label="Plan view"
          className="inline-flex rounded-md bg-layer-2 p-0.5 max-sm:grid max-sm:w-full max-sm:grid-cols-3"
        >
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => changeView(key)}
              className={cn(
                "flex h-7 items-center justify-center gap-1.5 rounded-sm px-2.5 text-13 whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:h-10",
                view === key
                  ? "bg-layer-1 font-medium text-primary shadow-raised-100"
                  : "text-tertiary hover:text-secondary"
              )}
            >
              <Icon className="size-3.5 shrink-0" strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {view === "order" && (
          <div aria-label="Arrange columns by" role="group" className="inline-flex items-center gap-1.5">
            <span className="text-12 text-tertiary max-md:hidden">By</span>
            <div className="inline-flex rounded-md bg-layer-2 p-0.5">
              {ARRANGE.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={arrange === key}
                  onClick={() => setArrange(key)}
                  className={cn(
                    "h-6 rounded-sm px-2 text-12 transition-[background-color,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:h-9 max-sm:px-3",
                    arrange === key
                      ? "bg-layer-1 font-medium text-primary shadow-raised-100"
                      : "text-tertiary hover:text-secondary"
                  )}
                >
                  {key === "area" ? areaButtonLabel : label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="relative flex h-7 min-w-0 items-center max-sm:order-last max-sm:w-full">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-placeholder" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a work item"
            aria-label="Find a work item"
            className="h-7 w-full rounded-md border border-subtle bg-layer-1 pr-2 pl-7 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong sm:w-48"
          />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-1.5 text-12 text-secondary select-none max-sm:min-h-9">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="size-3.5 accent-[var(--bg-accent-primary)]"
          />
          Show done
        </label>

        {filterLabel && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full border border-subtle bg-layer-1 pr-1 pl-2.5 text-12 text-secondary">
            {filterLabel}
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setFilter(null)}
              className="grid size-5 place-items-center rounded-full text-tertiary hover:bg-layer-2 hover:text-primary"
            >
              <X className="size-3" />
            </button>
          </span>
        )}

        <span className="ml-auto text-12 text-tertiary tabular-nums" aria-live="polite">
          <span className="max-lg:hidden">
            {openCount} open · {graph.blockedByLinks} blocked-by links
          </span>
          {isLoadingMore && (
            <button
              type="button"
              disabled={!props.loadingError}
              onClick={props.onRetryLoading}
              aria-label={props.loadingError ? "Retry loading work items" : undefined}
              title={props.loadingError ? "Retry loading work items" : undefined}
              className="inline-flex items-center gap-1.5"
            >
              <span className="max-lg:hidden"> · </span>
              <span
                className={cn(
                  "size-1.5 rounded-full bg-[var(--border-accent-strong)]",
                  !props.loadingError && "motion-safe:animate-pulse"
                )}
              />
              Counting {graph.nodes.size} so far…
            </button>
          )}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {view === "overview" && (
            <OverviewView
              {...shared}
              areas={areas}
              areaKind={areaKind}
              onFilter={applyFilter}
              onOpenItem={openFromOverview}
              onGoTo={changeView}
              relationsError={!!data.relationsError}
              onRetry={data.retryRelations}
            />
          )}
          {view === "order" && (
            <BuildOrderView {...shared} arrange={arrange} onSelect={select} areas={areas} noAreaName={noAreaName} />
          )}
          {view === "schedule" && (
            <ScheduleView {...shared} onSelect={select} setPersonHours={setPersonHours} personHours={personHours} />
          )}
        </div>
      </div>
    </div>
  );
});

export type TPlanShared = {
  graph: ReturnType<typeof usePlanData>["graph"];
  areaById: Map<string, ReturnType<typeof usePlanData>["areas"][number]>;
  personById: Map<string, ReturnType<typeof usePlanData>["people"][number]>;
  people: ReturnType<typeof usePlanData>["people"];
  plan: ReturnType<typeof schedule>;
  origin: Date;
  now: number;
  hoursOf: (id: string) => number;
  /** Hours set by hand; items missing here use the default guess. */
  itemHours: Record<string, number>;
  weekHoursOf: (ownerId: string) => number;
  isVisible: (n: TPlanNode) => boolean;
  selectedId: string | null;
};
