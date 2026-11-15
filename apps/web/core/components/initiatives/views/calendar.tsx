/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { ItemKey } from "@/components/issues/issue-layouts/plan/parts";
import type { WorkItem } from "./model";
import { dateKey, monthDays } from "./model";
import type { ViewProps } from "./parts";
import { EmptyLine, ITEM_FOCUS } from "./parts";

function Chips({ items, onOpen, limit = false }: ViewProps & { limit?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = limit && !expanded ? items.slice(0, 3) : items;
  return (
    <div className="min-w-0 space-y-1">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item)}
          title={`${item.key} ${item.name}`}
          className={`flex min-h-7 w-full min-w-0 flex-wrap items-center gap-x-1.5 rounded border border-subtle bg-layer-1 px-1.5 py-1 text-left max-sm:min-h-11 ${ITEM_FOCUS}`}
        >
          <ItemKey node={item} area={item.area} />
          <span className="min-w-0 flex-1 truncate text-11 text-secondary">{item.name}</span>
        </button>
      ))}
      {limit && items.length > 3 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className={`rounded px-1.5 py-1 text-11 text-accent-primary ${ITEM_FOCUS}`}
        >
          {expanded ? "Show less" : `+${items.length - 3} more`}
        </button>
      )}
    </div>
  );
}
export function CalendarView({ items, onOpen }: ViewProps) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [noDueOpen, setNoDueOpen] = useState(false);
  const noDueId = useId();
  const days = monthDays(month);
  const offset = (days[0].getDay() + 6) % 7;
  const byDate = new Map<string, WorkItem[]>();
  const noDue: WorkItem[] = [];
  items.forEach((item) => {
    if (!item.dueDate) noDue.push(item);
    else byDate.set(item.dueDate, [...(byDate.get(item.dueDate) ?? []), item]);
  });
  const populatedDays = days.filter((day) => byDate.has(dateKey(day)));
  const cells = Math.ceil((offset + days.length) / 7) * 7;
  const changeMonth = (delta: number) =>
    setMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + delta, 1));
  const monthTitle = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 sm:px-page-x">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-13 font-semibold text-primary" aria-live="polite">
          {monthTitle}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
            className={`grid size-8 place-items-center rounded border border-subtle text-secondary max-sm:size-11 ${ITEM_FOCUS}`}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Go to current month"
            onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            className={`h-8 rounded border border-subtle px-3 text-12 text-secondary max-sm:h-11 ${ITEM_FOCUS}`}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
            className={`grid size-8 place-items-center rounded border border-subtle text-secondary max-sm:size-11 ${ITEM_FOCUS}`}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      {!items.length ? (
        <EmptyLine />
      ) : (
        <>
          {!populatedDays.length && <EmptyLine>No due dates this month.</EmptyLine>}
          <div className="hidden min-w-0 sm:block" aria-label={monthTitle}>
            <div className="grid grid-cols-7">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="p-2 text-11 font-medium text-tertiary">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-md border-t border-l border-subtle">
              {Array.from({ length: cells }, (_, index) => {
                const day = days[index - offset];
                const key = day ? dateKey(day) : `empty-${index}`;
                const isToday = key === dateKey(today);
                return (
                  <div
                    key={key}
                    className={`min-h-28 min-w-0 border-r border-b border-subtle p-1.5 ${isToday ? "bg-accent-subtle" : "bg-surface-1"}`}
                  >
                    {day && (
                      <>
                        <time
                          dateTime={key}
                          aria-current={isToday ? "date" : undefined}
                          className={`mb-1 inline-block rounded px-1 text-12 ${isToday ? "font-semibold text-accent-primary" : "text-tertiary"}`}
                        >
                          {day.getDate()}
                        </time>
                        <Chips items={byDate.get(key) ?? []} onOpen={onOpen} limit />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="space-y-4 sm:hidden" aria-label={`${monthTitle} agenda`}>
            {populatedDays.map((day) => {
              const key = dateKey(day);
              const isToday = key === dateKey(today);
              return (
                <section key={key} className={isToday ? "rounded-md bg-accent-subtle p-2" : ""}>
                  <h4 className={`mb-2 text-12 font-medium ${isToday ? "text-accent-primary" : "text-secondary"}`}>
                    <time dateTime={key} aria-current={isToday ? "date" : undefined}>
                      {day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                    </time>
                  </h4>
                  <Chips items={byDate.get(key) ?? []} onOpen={onOpen} />
                </section>
              );
            })}
          </div>
          <section className="mt-4 border-t border-subtle pt-2">
            <h3>
              <button
                type="button"
                aria-expanded={noDueOpen}
                aria-controls={noDueId}
                onClick={() => setNoDueOpen(!noDueOpen)}
                className={`flex min-h-11 items-center gap-2 rounded text-12 text-secondary ${ITEM_FOCUS}`}
              >
                {noDueOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}No due date (
                {noDue.length})
              </button>
            </h3>
            <div id={noDueId} hidden={!noDueOpen}>
              <Chips items={noDue} onOpen={onOpen} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
