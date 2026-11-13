/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ExternalLink, X } from "lucide-react";
import { cn } from "@plane/utils";
import type { TPlanShared } from "./board";
import type { TPlanGraph, TPlanNode, TScheduleSlot } from "./model";
import { isDoneGroup, statusLabel, walk, weeksToDate } from "./model";
import { formatDay } from "./overview";
import { AreaDot, ItemKey, KIND_PILL, PersonAvatar, StatusPill } from "./parts";

type Props = {
  node: TPlanNode;
  graph: TPlanGraph;
  areaById: TPlanShared["areaById"];
  personById: TPlanShared["personById"];
  slot: TScheduleSlot | undefined;
  origin: Date;
  hours: number;
  isGuess: boolean;
  onHours: (h: number | null) => void;
  onSelect: (id: string) => void;
  onOpen: (n: { id: string; projectId: string; isArchived?: boolean }) => void;
  onClose: () => void;
};

export function PlanPeek(props: Props) {
  const { node: n, graph, areaById, personById, slot, origin } = props;
  const area = areaById.get(n.areaId ?? "");
  const owner = n.ownerId ? personById.get(n.ownerId) : undefined;
  const before = walk(graph.nodes, n.id, "up").size;
  const after = walk(graph.nodes, n.id, "down").size;

  return (
    <aside
      aria-label={`${n.key} details`}
      className={cn(
        "z-[15] flex flex-col overflow-y-auto border-subtle bg-layer-1",
        // desktop and tablet: a panel beside the board
        "md:w-[340px] md:shrink-0 md:border-l lg:w-[360px]",
        // phone: a bottom sheet
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[72vh] max-md:rounded-t-xl max-md:border-t max-md:shadow-raised-200",
        "motion-safe:max-md:animate-[plan-sheet-in_220ms_cubic-bezier(0.23,1,0.32,1)] motion-safe:md:animate-[plan-panel-in_180ms_cubic-bezier(0.23,1,0.32,1)]"
      )}
    >
      <div className="sticky top-0 z-[1] flex items-start gap-2 border-b border-subtle bg-layer-1 px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-11 text-tertiary">
            <ItemKey node={n} area={area} />
            {area && <span className="truncate">· {area.name}</span>}
          </div>
          <h3 className="mt-1 text-14 leading-5 font-semibold [overflow-wrap:anywhere] text-primary">{n.name}</h3>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={props.onClose}
          className="-mr-1 grid size-8 shrink-0 place-items-center rounded-md text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-3 pb-5">
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-13">
          <dt className="text-tertiary">Status</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <StatusPill node={n} />
            {n.kind !== "done" && n.kind !== "wip" && n.stateName && (
              <span className="truncate text-12 text-tertiary">{n.stateName}</span>
            )}
          </dd>
          <dt className="text-tertiary">Owner</dt>
          <dd className="flex min-w-0 items-center gap-2 text-primary">
            <PersonAvatar person={owner} size={20} />
            <span className="truncate">{owner?.name ?? "No owner"}</span>
          </dd>
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
              <span className="text-12 text-tertiary">a guess</span>
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
          {!n.isDone && slot && (
            <>
              <dt className="text-tertiary">Planned</dt>
              <dd className="text-primary tabular-nums">
                {formatDay(weeksToDate(origin, slot.start))} – {formatDay(weeksToDate(origin, slot.end))}
              </dd>
            </>
          )}
          {n.priority === "urgent" && (
            <>
              <dt className="text-tertiary">Priority</dt>
              <dd>
                <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-11 font-semibold text-danger-primary">
                  Urgent
                </span>
              </dd>
            </>
          )}
        </dl>

        {(before > 0 || after > 0) && (
          <p className="rounded-md bg-layer-2 px-3 py-2 text-12 text-secondary tabular-nums">
            {before} item{before === 1 ? "" : "s"} in its chain before it, {after} still open after it.
          </p>
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
          swatch="bg-accent-primary"
          ids={n.blocks}
          empty="Nothing waits on this item."
          {...props}
        />
        <RelationList
          title="Related"
          swatch="border border-dashed border-strong"
          ids={n.related}
          empty="No related items."
          {...props}
        />

        <button
          type="button"
          onClick={() => props.onOpen(n)}
          className="mt-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent-primary px-3 text-13 font-medium text-on-color outline-none hover:bg-accent-primary-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] focus-visible:ring-offset-1"
        >
          Open {n.key}
          <ExternalLink className="size-3.5" />
        </button>
      </div>
    </aside>
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
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-sm px-1 py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
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
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 rounded-sm px-1 py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
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
