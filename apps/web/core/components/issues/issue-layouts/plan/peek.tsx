/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CalendarRange } from "lucide-react";
import { cn } from "@plane/utils";
import type { TPlanShared } from "./board";
import type { TPlanGraph, TPlanNode, TScheduleSlot } from "./model";
import { isDoneGroup, statusLabel, walk, weeksToDate } from "./model";
import { formatDay } from "./overview";
import { AreaDot, ItemKey, KIND_PILL } from "./parts";

type Props = {
  node: TPlanNode;
  graph: TPlanGraph;
  areaById: TPlanShared["areaById"];
  slot: TScheduleSlot | undefined;
  origin: Date;
  hours: number;
  isGuess: boolean;
  onHours: (h: number | null) => void;
  /** pick another item in the plan (its sidebar opens and the board draws its links) */
  onSelect: (id: string) => void;
  onOpen: (n: { id: string; projectId: string; isArchived?: boolean }) => void;
};

/** The Plan's part of the work item sidebar: estimate, planned dates and what the item waits on and blocks. */
export function PlanPeekSection(props: Props) {
  const { node: n, graph, slot, origin } = props;
  const before = walk(graph.nodes, n.id, "up").size;
  const after = walk(graph.nodes, n.id, "down").size;

  return (
    <section aria-label="Plan" className="mt-6 flex flex-col gap-4 border-t border-subtle pt-5">
      <h3 className="flex items-center gap-2 text-13 font-semibold text-primary">
        <CalendarRange className="size-4 text-tertiary" />
        Plan
      </h3>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-13">
        <dt className="text-tertiary">Estimate</dt>
        <dd className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min={0.5}
              max={400}
              step={0.5}
              value={props.hours}
              aria-label="Estimate in hours"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                props.onHours(v > 0 ? v : null);
              }}
              className={cn(
                "h-7 w-14 rounded-sm border bg-surface-1 px-1.5 text-right text-13 text-primary tabular-nums outline-none focus:border-accent-strong",
                props.isGuess ? "border-dashed border-strong" : "border-subtle"
              )}
            />
            <span className="text-tertiary">hours</span>
          </label>
          {props.isGuess ? (
            <span className="text-12 text-tertiary">default</span>
          ) : (
            <button
              type="button"
              onClick={() => props.onHours(null)}
              className="rounded-sm text-12 text-accent-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
            >
              Reset
            </button>
          )}
        </dd>
        {!n.isDone && (
          <>
            <dt className="text-tertiary">Planned</dt>
            <dd className="text-primary tabular-nums">
              {slot
                ? `${formatDay(weeksToDate(origin, slot.start))} – ${formatDay(weeksToDate(origin, slot.end))}`
                : "Waiting"}
            </dd>
          </>
        )}
      </dl>

      {(before > 0 || after > 0) && (
        <div className="grid grid-cols-2 gap-2 text-12 text-tertiary">
          <span>
            <span className="block text-16 font-semibold text-primary tabular-nums">{before}</span>
            before it in the chain
          </span>
          <span>
            <span className="block text-16 font-semibold text-primary tabular-nums">{after}</span>
            open after it
          </span>
        </div>
      )}

      <RelationList
        title="Waits on"
        swatch="bg-warning-primary"
        ids={n.waitsOn}
        empty="Nothing. It can start whenever someone picks it up."
        {...props}
      />
      <RelationList
        title="Blocks"
        swatch="bg-[var(--border-accent-strong)]"
        ids={n.blocks}
        empty="Nothing waits on this item."
        {...props}
      />
      {n.related.length > 0 && (
        <RelationList title="Related" swatch="border border-dashed border-strong" ids={n.related} empty="" {...props} />
      )}
    </section>
  );
}

function RelationList(props: Props & { title: string; swatch: string; ids: string[]; empty: string }) {
  const { graph, areaById } = props;
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-2 text-12 font-semibold text-secondary">
        <span className={cn("size-2.5 rounded-[3px]", props.swatch)} />
        {props.title}
        {props.ids.length > 0 && <span className="font-medium text-tertiary tabular-nums">{props.ids.length}</span>}
      </h4>
      {props.ids.length ? (
        <ul className="flex flex-col">
          {props.ids.map((id) => {
            const inPlan = graph.nodes.get(id);
            const outside = graph.outsiders.get(id);
            if (inPlan) {
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(id)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-sm px-1 py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-md:min-h-11"
                  >
                    <ItemKey node={inPlan} area={areaById.get(inPlan.areaId ?? "")} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-primary">{inPlan.name}</span>
                      <span className="text-12 text-tertiary">{statusLabel(inPlan)}</span>
                    </span>
                  </button>
                </li>
              );
            }
            if (!outside) return null;
            const done = outside.is_archived || isDoneGroup(outside.state_group);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => props.onOpen({ id, projectId: outside.project_id, isArchived: outside.is_archived })}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-sm px-1 py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-md:min-h-11"
                >
                  <span className="font-mono inline-flex items-center gap-1.5 text-11 font-medium text-tertiary tabular-nums">
                    <AreaDot area={undefined} className="rounded-full" />
                    {outside.project_identifier}-{outside.sequence_id}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-primary">{outside.name}</span>
                    <span className="flex items-center gap-1.5 text-12 text-tertiary">
                      <span className={cn("rounded-full px-1.5", done ? KIND_PILL.done : "bg-layer-2")}>
                        {outside.state_name || "Unknown"}
                      </span>
                      Outside this view
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 text-12 text-tertiary">{props.empty}</p>
      )}
    </section>
  );
}
