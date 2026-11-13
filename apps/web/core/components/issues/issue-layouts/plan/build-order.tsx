/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, SearchX } from "lucide-react";
import { cn } from "@plane/utils";
import type { TPlanArrange, TPlanShared } from "./board";
import type { TLink } from "./links";
import { PlanLinks } from "./links";
import type { TPlanNode } from "./model";
import { walk } from "./model";
import { ItemKey, PersonAvatar, StatusPill } from "./parts";
import type { TPlanArea } from "./use-plan-data";

type Props = TPlanShared & {
  arrange: TPlanArrange;
  areas: TPlanArea[];
  /** "No module", "No label" … */
  noAreaName: string;
  onSelect: (id: string | null) => void;
};

type TColumn = { key: string; title: string; items: TPlanNode[] };

/** Long columns show this many cards until expanded; picked items and their chain always show. */
const COLUMN_CAP = 30;

export function BuildOrderView(props: Props) {
  const {
    graph,
    areas,
    noAreaName,
    areaById,
    personById,
    people,
    arrange,
    isVisible,
    selectedId,
    itemHours,
    onSelect,
  } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const columns = useMemo<TColumn[]>(() => {
    const visible = [...graph.nodes.values()].filter(isVisible);
    const areaIndex = new Map(areas.map((a, i) => [a.id, i]));
    const sort = (list: TPlanNode[]) =>
      list.sort(
        (x, y) =>
          (areaIndex.get(x.areaId ?? "") ?? 999) - (areaIndex.get(y.areaId ?? "") ?? 999) ||
          y.downstreamOpen - x.downstreamOpen ||
          x.key.localeCompare(y.key, undefined, { numeric: true })
      );
    if (arrange === "area") {
      return [...areas.map((a) => ({ id: a.id, name: a.name })), { id: "", name: noAreaName }]
        .map((a) => ({
          key: a.id || "none",
          title: a.name,
          items: sort(visible.filter((n) => (n.areaId ?? "") === a.id)),
        }))
        .filter((c) => c.items.length);
    }
    if (arrange === "owner") {
      return [...people.map((p) => ({ id: p.id, name: p.name })), { id: "", name: "No owner" }]
        .map((p) => ({
          key: p.id || "none",
          title: p.name,
          items: sort(visible.filter((n) => (n.ownerId ?? "") === p.id)),
        }))
        .filter((c) => c.items.length);
    }
    const maxDepth = Math.max(0, ...visible.map((n) => n.depth));
    const cols: TColumn[] = [];
    for (let d = 0; d <= maxDepth; d++) {
      const items = visible.filter((n) => n.depth === d);
      if (!items.length) continue;
      cols.push({
        key: `step-${d}`,
        title: d === 0 ? "Nothing in the way" : `After ${d} step${d > 1 ? "s" : ""}`,
        items: sort(items),
      });
    }
    const done = visible.filter((n) => n.isDone);
    if (done.length) cols.push({ key: "done", title: "Done", items: sort(done) });
    return cols;
  }, [graph, isVisible, arrange, areas, noAreaName, people]);

  const selected = selectedId ? graph.nodes.get(selectedId) : undefined;
  const { up, down, related } = useMemo(() => {
    if (!selected) return { up: new Set<string>(), down: new Set<string>(), related: new Set<string>() };
    return {
      up: walk(graph.nodes, selected.id, "up"),
      down: walk(graph.nodes, selected.id, "down"),
      related: new Set(selected.related),
    };
  }, [graph, selected]);

  const links = useMemo<TLink[]>(
    () =>
      selected
        ? [
            ...selected.waitsOn.map((id) => ({ from: id, to: selected.id, dir: "up" as const })),
            ...selected.blocks.map((id) => ({ from: selected.id, to: id, dir: "down" as const })),
          ]
        : [],
    [selected]
  );
  const layoutKey = useMemo(
    () => `${columns.map((c) => `${c.key}:${c.items.length}`).join("|")}#${[...expanded].join(",")}`,
    [columns, expanded]
  );

  useEffect(() => {
    if (!selectedId) return;
    const el = boardRef.current?.querySelector<HTMLElement>(`[data-plan-id="${selectedId}"]`);
    el?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [selectedId]);

  if (!columns.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <SearchX className="size-8 text-placeholder" strokeWidth={1.5} />
        <p className="text-13 text-tertiary">No work items match.</p>
        <p className="text-12 text-placeholder">Try another search, or turn on Show done.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1 px-page-x pt-3 text-11 text-tertiary">
        {selected ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] border border-warning-strong bg-warning-subtle" />
              Has to happen first
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] border border-accent-strong bg-accent-subtle" />
              Waits on {selected.key}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] border border-dashed border-strong" />
              Related
            </span>
          </>
        ) : (
          <span>Pick a card to see what it waits on and what waits on it.</span>
        )}
      </div>
      <div className="overflow-x-auto px-page-x pt-2 pb-8 max-sm:snap-x max-sm:snap-mandatory max-sm:scroll-px-4">
        <div ref={boardRef} className="relative flex w-max items-start gap-3">
          {columns.map((col) => (
            <section
              key={col.key}
              aria-label={col.title}
              className="flex w-[264px] shrink-0 snap-start flex-col gap-1.5 rounded-lg bg-layer-transparent-hover p-2 max-sm:w-[78vw]"
            >
              <header className="px-1 pt-0.5 pb-1.5">
                <h2 className="flex items-baseline justify-between gap-2 text-13 font-semibold text-primary">
                  <span className="truncate">{col.title}</span>
                  <span className="text-12 font-medium text-tertiary tabular-nums">{col.items.length}</span>
                </h2>
              </header>
              {col.items.map((n, index) => {
                const role = !selected
                  ? null
                  : n.id === selected.id
                    ? "sel"
                    : up.has(n.id)
                      ? "up"
                      : down.has(n.id)
                        ? "down"
                        : related.has(n.id)
                          ? "rel"
                          : "dim";
                const isCapped = index >= COLUMN_CAP && !expanded.has(col.key) && (!role || role === "dim");
                if (isCapped) return null;
                const downOpen = n.blocks.filter((b) => {
                  const x = graph.nodes.get(b);
                  return x && !x.isDone;
                }).length;
                return (
                  <button
                    key={n.id}
                    type="button"
                    data-plan-id={n.id}
                    aria-pressed={n.id === selectedId}
                    aria-label={`${n.key} ${n.name}`}
                    onClick={() => onSelect(n.id)}
                    className={cn(
                      "relative z-[1] flex w-full flex-col gap-1.5 rounded-lg border bg-layer-2 px-2.5 py-2 text-left transition-[opacity,border-color,background-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]",
                      "border-subtle hover:border-strong hover:shadow-raised-100",
                      n.isDone && !role && "opacity-60",
                      role === "dim" && "opacity-35",
                      role === "sel" &&
                        "border-[var(--border-accent-strong)] shadow-raised-200 ring-2 ring-[var(--border-accent-strong)]",
                      role === "up" && "border-warning-strong bg-warning-subtle",
                      role === "down" && "border-accent-subtle bg-accent-subtle",
                      role === "rel" && "border-dashed border-strong"
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <ItemKey node={n} area={areaById.get(n.areaId ?? "")} />
                      {!(arrange === "step" && n.kind === "ready") && <StatusPill node={n} />}
                    </span>
                    <span
                      className={cn(
                        "line-clamp-3 text-13 leading-[18px] font-medium [overflow-wrap:anywhere] text-primary",
                        n.isDone && "line-through decoration-[var(--txt-tertiary)]"
                      )}
                    >
                      {n.name}
                    </span>
                    <span className="flex items-center gap-2 text-11 text-tertiary">
                      {n.priority === "urgent" && (
                        <span className="rounded-full bg-danger-subtle px-1.5 font-semibold text-danger-primary">
                          Urgent
                        </span>
                      )}
                      {downOpen > 0 && (
                        <span className="inline-flex items-center gap-1 text-12 font-medium text-secondary tabular-nums">
                          <GitBranch className="size-3" aria-hidden />
                          Blocks {downOpen}
                        </span>
                      )}
                      <span className="flex-1" />
                      {itemHours[n.id] !== undefined && <span className="tabular-nums">{itemHours[n.id]} h</span>}
                      <PersonAvatar person={n.ownerId ? personById.get(n.ownerId) : undefined} />
                    </span>
                  </button>
                );
              })}
              {col.items.length > COLUMN_CAP && !expanded.has(col.key) && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => new Set(prev).add(col.key))}
                  className="h-9 rounded-md text-12 font-medium text-accent-primary outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
                >
                  Show {col.items.length - COLUMN_CAP} more
                </button>
              )}
            </section>
          ))}
          <PlanLinks containerRef={boardRef} links={links} anchorY="top" layoutKey={layoutKey} />
        </div>
      </div>
    </div>
  );
}
