/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { cn } from "@plane/utils";
import type { TPlanShared } from "./board";
import type { TLink } from "./links";
import { PlanLinks } from "./links";
import type { TPlanNode, TScheduleSlot } from "./model";
import { NO_OWNER, weeksToDate } from "./model";
import { formatDay } from "./overview";
import { PersonAvatar } from "./parts";
import { NO_AREA_HUE } from "./use-plan-data";

type Props = TPlanShared & {
  onSelect: (id: string | null) => void;
  personHours: Record<string, number>;
  setPersonHours: (id: string, h: number | null) => void;
};

const BAR_H = 28;
const ROW_H = 34;
const LANE_PAD = 8;

/** Bars that overlap in time (only possible for items with no owner) go on rows of their own. */
function packRows(items: TPlanNode[], slots: Map<string, TScheduleSlot>) {
  const rowEnds: number[] = [];
  const rowOf = new Map<string, number>();
  const placed = items
    .filter((n) => slots.has(n.id))
    .toSorted((a, b) => (slots.get(a.id) as TScheduleSlot).start - (slots.get(b.id) as TScheduleSlot).start);
  for (const n of placed) {
    const slot = slots.get(n.id) as TScheduleSlot;
    let row = rowEnds.findIndex((end) => end <= slot.start + 1e-6);
    if (row === -1) row = rowEnds.push(0) - 1;
    rowEnds[row] = slot.end;
    rowOf.set(n.id, row);
  }
  return { items: placed, rowOf, rows: Math.max(1, rowEnds.length) };
}

function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const update = () => setPhone(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return phone;
}

export function ScheduleView(props: Props) {
  const { graph, areaById, personById, plan, origin, now, isVisible, selectedId, hoursOf, weekHoursOf, onSelect } =
    props;
  const gridRef = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const NAME_W = phone ? 148 : 208;
  const PX = phone ? 84 : 112;
  const weeks = Math.max(4, Math.ceil(plan.end) + 1);
  const W = weeks * PX;

  const open = useMemo(() => [...graph.nodes.values()].filter((n) => !n.isDone), [graph]);
  const lanes = useMemo(() => {
    const ids = [...new Set(open.map((n) => n.ownerId ?? NO_OWNER))];
    return ids
      .map((id) => (Object.assign({id,person:id===NO_OWNER?undefined:personById.get(id)}, packRows(open.filter(n=>(n.ownerId??NO_OWNER)===id&&isVisible(n)),plan.slots))))
      .toSorted((a, b) =>
        a.id === NO_OWNER ? 1 : b.id === NO_OWNER ? -1 : (a.person?.name ?? "").localeCompare(b.person?.name ?? "")
      );
  }, [open, personById, isVisible, plan]);

  const selected = selectedId ? graph.nodes.get(selectedId) : undefined;
  const links = useMemo<TLink[]>(
    () =>
      selected
        ? [
            ...selected.openWaitsOn.map((id) => ({ from: id, to: selected.id, dir: "up" as const })),
            ...selected.blocks.map((id) => ({ from: selected.id, to: id, dir: "down" as const })),
          ]
        : [],
    [selected]
  );
  const linked = useMemo(() => new Set(links.flatMap((l) => [l.from, l.to])), [links]);

  useEffect(() => {
    if (!selectedId) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-plan-id="${selectedId}"]`)?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [selectedId]);

  const totalHours = open.reduce((sum, n) => sum + hoursOf(n.id), 0);
  const setter =
    plan.setter === null
      ? null
      : plan.setter === NO_OWNER
        ? "No owner"
        : (personById.get(plan.setter)?.name ?? "Unknown");
  const end = weeksToDate(origin, plan.end);

  if (!open.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <CircleCheck className="size-8 text-success-primary" strokeWidth={1.5} />
        <p className="text-13 text-tertiary">Nothing left to schedule.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-page-x pt-4 pb-10">
      <dl className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1 sm:max-w-3xl">
        {[
          { label: "Everything built", value: formatDay(end, true) },
          { label: "Finishes last", value: setter ?? "—" },
          { label: "Left, from estimates", value: `${Math.round(totalHours).toLocaleString()} h` },
        ].map((f) => (
          <div key={f.label} className="rounded-lg border border-subtle bg-layer-1 px-3.5 py-2.5">
            <dd className="truncate text-18 leading-6 font-semibold tracking-tight text-primary tabular-nums">
              {f.value}
            </dd>
            <dt className="text-12 text-tertiary">{f.label}</dt>
          </div>
        ))}
      </dl>

      <div className="overflow-x-auto rounded-lg border border-subtle bg-layer-1">
        <div ref={gridRef} className="relative" style={{ width: NAME_W + W }}>
          {/* week header */}
          <div className="sticky top-0 z-[3] flex border-b border-subtle bg-layer-1">
            <div
              className="sticky left-0 z-[4] flex shrink-0 items-end border-r border-subtle bg-layer-1 px-3 pb-1.5 text-11 font-medium text-tertiary"
              style={{ width: NAME_W }}
            >
              Person · hours a week
            </div>
            {Array.from({ length: weeks }, (_, i) => (
              <div
                key={i}
                className="shrink-0 border-l border-subtle px-2 py-1.5 first:border-l-0"
                style={{ width: PX }}
              >
                <div className="text-11 font-medium text-secondary">Week {i + 1}</div>
                <div className="text-11 text-tertiary tabular-nums">{formatDay(weeksToDate(origin, i))}</div>
              </div>
            ))}
          </div>

          {lanes.map((lane) => {
            const declared = lane.person?.declaredHours ?? null;
            const override = props.personHours[lane.id];
            const hours = weekHoursOf(lane.id);
            return (
              <div
                key={lane.id || "none"}
                className="flex border-b border-subtle last:border-b-0"
                style={{ height: LANE_PAD * 2 + lane.rows * ROW_H - (ROW_H - BAR_H) }}
              >
                <div
                  className="sticky left-0 z-[3] flex shrink-0 items-center gap-2 border-r border-subtle bg-layer-1 pr-2 pl-3"
                  style={{ width: NAME_W }}
                >
                  <PersonAvatar person={lane.person} size={20} />
                  <span
                    className="min-w-0 flex-1 truncate text-13 text-primary"
                    title={lane.person?.name ?? "No owner"}
                  >
                    {lane.person?.name ?? "No owner"}
                  </span>
                  <label
                    className="flex items-center gap-0.5"
                    title={
                      override !== undefined
                        ? "Set here, in this browser"
                        : declared !== null
                          ? "Declared in Availability"
                          : "Not declared; a guess"
                    }
                  >
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      max={80}
                      value={hours}
                      aria-label={`Hours a week for ${lane.person?.name ?? "no owner"}`}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        props.setPersonHours(lane.id, v > 0 ? (v === declared ? null : v) : null);
                      }}
                      className={cn(
                        "h-6 w-10 rounded-sm border bg-surface-1 px-1 text-right text-12 text-primary tabular-nums outline-none focus:border-accent-strong",
                        override === undefined && declared === null
                          ? "border-dashed border-strong text-tertiary"
                          : "border-subtle"
                      )}
                    />
                    <span className="text-11 text-tertiary">h</span>
                  </label>
                </div>
                <div className="relative shrink-0" style={{ width: W }}>
                  {Array.from({ length: weeks - 1 }, (_, i) => (
                    <span
                      key={i}
                      className="absolute inset-y-0 w-px bg-[var(--border-subtle)]"
                      style={{ left: (i + 1) * PX }}
                    />
                  ))}
                  {lane.items.map((n) => {
                    const slot = plan.slots.get(n.id);
                    if (!slot) return null;
                    const hue = areaById.get(n.areaId ?? "")?.hue ?? NO_AREA_HUE;
                    const isSel = n.id === selectedId;
                    const dim = !!selected && !isSel && !linked.has(n.id);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        data-plan-id={n.id}
                        aria-pressed={isSel}
                        title={`${n.key} ${n.name}`}
                        onClick={() => onSelect(n.id)}
                        className={cn(
                          "absolute z-[1] flex h-7 items-center gap-1.5 overflow-hidden rounded-md border px-1.5 text-left text-12 whitespace-nowrap text-primary transition-[opacity,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]",
                          n.kind === "wip" && "border-2",
                          isSel && "z-[2] shadow-raised-100 ring-2 ring-[var(--txt-primary)]",
                          dim && "opacity-30"
                        )}
                        style={{
                          top: LANE_PAD + (lane.rowOf.get(n.id) ?? 0) * ROW_H,
                          left: slot.start * PX + 1,
                          width: Math.max(10, (slot.end - slot.start) * PX - 3),
                          borderColor: hue,
                          background: `color-mix(in srgb, ${hue} 14%, var(--bg-layer-1))`,
                        }}
                      >
                        <span className="font-mono text-11 font-semibold" style={{ color: hue }}>
                          {n.key}
                        </span>
                        <span className="truncate">{n.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* today and the finish line */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 z-[2] w-0.5 bg-[var(--axios-brand)]"
            style={{ left: NAME_W + now * PX }}
          />
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-[2] border-l-2 border-dashed border-success-strong"
            style={{ left: NAME_W + plan.end * PX }}
          >
            <span className="absolute top-1 left-1.5 rounded-sm bg-success-subtle px-1.5 py-0.5 text-11 font-medium whitespace-nowrap text-success-primary">
              Everything built {formatDay(end)}
            </span>
          </div>
          <PlanLinks
            containerRef={gridRef}
            links={links}
            anchorY="middle"
            layoutKey={`${weeks}:${PX}:${lanes.length}`}
          />
        </div>
      </div>
      <p className="text-12 text-tertiary">
        One item at a time per person, each starting once what it waits on is finished. Items in progress have a thick
        border.
      </p>
    </div>
  );
}
