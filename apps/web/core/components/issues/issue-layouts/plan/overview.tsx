/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { ArrowUpRight, CircleCheck, ChevronRight, Clock, TriangleAlert } from "lucide-react";
import { cn } from "@plane/utils";
import type { TPlanFilter, TPlanShared, TPlanView } from "./board";
import type { TPlanNode } from "./model";
import { NO_OWNER, longestChain, statusLabel, weeksToDate } from "./model";
import { AreaDot, Card, CardTitle, ItemKey, LinkButton, PersonAvatar } from "./parts";
import type { TPlanArea, TPlanAreaKind } from "./use-plan-data";
import { AREA_NOUN } from "./use-plan-data";

type Props = TPlanShared & {
  areas: TPlanArea[];
  areaKind: TPlanAreaKind;
  onFilter: (f: TPlanFilter | null) => void;
  onOpenItem: (id: string) => void;
  onGoTo: (v: TPlanView) => void;
  relationsError: boolean;
  onRetry: () => void;
};

const SEGMENTS = [
  { kind: "done", label: "Done", className: "bg-success-primary" },
  { kind: "wip", label: "In progress", className: "bg-[var(--border-accent-strong)]" },
  { kind: "ready", label: "Can start", className: "bg-success-subtle-1 ring-1 ring-success-strong ring-inset" },
  { kind: "blocked", label: "Waiting", className: "bg-warning-primary" },
] as const;

export const formatDay = (d: Date, withYear = false) =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

export function OverviewView(props: Props) {
  const { graph, areas, areaKind, areaById, personById, plan, origin, now, onFilter, onOpenItem, onGoTo } = props;
  const nodes = useMemo(() => [...graph.nodes.values()], [graph]);
  const open = useMemo(() => nodes.filter((n) => !n.isDone), [nodes]);
  const count = (f: (n: TPlanNode) => boolean) => open.filter(f).length;

  const tiles: { filter: TPlanFilter | null; value: number; label: string; tone?: string }[] = [
    { filter: null, value: open.length, label: "open work items" },
    { filter: "ready", value: count((n) => n.kind === "ready"), label: "can start now", tone: "text-success-primary" },
    {
      filter: "blocked",
      value: count((n) => n.kind === "blocked"),
      label: "waiting on others",
    },
    { filter: "wip", value: count((n) => n.kind === "wip"), label: "in progress" },
    { filter: "noowner", value: count((n) => !n.ownerId), label: "no owner" },
    { filter: "urgent", value: count((n) => n.priority === "urgent"), label: "urgent", tone: "text-danger-primary" },
  ];

  const chain = useMemo(() => longestChain(graph.nodes), [graph]);
  const blockingMost = useMemo(
    () =>
      open
        .filter((n) => n.downstreamOpen > 0)
        .toSorted(
          (a, b) => b.downstreamOpen - a.downstreamOpen || a.key.localeCompare(b.key, undefined, { numeric: true })
        )
        .slice(0, 6),
    [open]
  );
  const unowned = useMemo(
    () =>
      open
        .filter((n) => !n.ownerId)
        .toSorted((a, b) => b.downstreamOpen - a.downstreamOpen || (a.priority === "urgent" ? -1 : 0))
        .slice(0, 6),
    [open]
  );

  const areaRows = useMemo(() => {
    const ids = [...areas.map((a) => a.id), ""];
    return ids
      .map((id) => {
        const all = nodes.filter((n) => (n.areaId ?? "") === id);
        const c = { done: 0, wip: 0, ready: 0, blocked: 0 };
        all.forEach((n) => c[n.kind]++);
        return { id, area: areaById.get(id), total: all.length, c };
      })
      .filter((r) => r.total > 0 && r.total > r.c.done)
      .toSorted((a, b) => Number(!a.id) - Number(!b.id) || b.total - b.c.done - (a.total - a.c.done));
  }, [areas, areaById, nodes]);

  const endDate = weeksToDate(origin, plan.end);
  const weeksLeft = Math.max(0, Math.ceil(plan.end - now));
  // only a forecast when something can be dated; the rest is counted below it
  const allWaiting = plan.slots.size === 0 && plan.unscheduled.size > 0;
  const setter =
    allWaiting || plan.setter === null ? null : plan.setter === NO_OWNER ? undefined : personById.get(plan.setter);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-page-x pt-4 pb-10">
      {props.relationsError && (
        <div className="flex items-center gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-13 text-warning-primary">
          <TriangleAlert className="size-4 shrink-0" />
          Couldn’t load the links between work items, so nothing shows as blocked.
          <LinkButton className="ml-auto" onClick={props.onRetry}>
            Reload links
          </LinkButton>
        </div>
      )}

      <section
        aria-label="Forecast"
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-subtle bg-layer-1 px-5 py-4"
      >
        {open.length ? (
          <>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-12 font-medium text-tertiary">Everything built by</span>
              <span className="text-28 leading-9 font-semibold tracking-tight text-primary tabular-nums">
                {allWaiting ? "Waiting" : formatDay(endDate, true)}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 text-13 text-secondary">
              {!allWaiting && (
                <span className="tabular-nums">
                  In about {weeksLeft} week{weeksLeft === 1 ? "" : "s"}
                </span>
              )}
              {plan.unscheduled.size > 0 && (
                <span className="flex items-center gap-1.5 text-warning-primary tabular-nums">
                  <Clock className="size-3.5 shrink-0" />
                  {plan.unscheduled.size} can’t be dated yet
                </span>
              )}
              {setter !== null && (
                <span className="flex min-w-0 items-center gap-2">
                  <PersonAvatar person={setter} size={18} />
                  <span className="truncate">
                    {setter ? (
                      <>
                        <span className="font-medium text-primary">{setter.name}</span> finishes last
                      </>
                    ) : (
                      "Items with no owner finish last"
                    )}
                  </span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onGoTo("schedule")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-13 font-medium text-primary outline-none hover:border-strong focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:h-11 max-sm:w-full max-sm:justify-center sm:ml-auto"
            >
              Open schedule
              <ArrowUpRight className="size-3.5 text-tertiary" />
            </button>
          </>
        ) : (
          <Empty text="Nothing left to build." done />
        )}
      </section>

      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-subtle bg-layer-1 xl:grid-cols-6">
        {tiles.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onFilter(t.filter)}
            className={cn(
              "group flex min-h-11 flex-col items-start gap-0.5 border-subtle px-3.5 py-2.5 text-left outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] focus-visible:ring-inset",
              i % 3 !== 0 && "border-l",
              i >= 3 && "border-t xl:border-t-0",
              i === 3 && "xl:border-l"
            )}
          >
            <span className={cn("text-18 leading-6 font-semibold tabular-nums", t.tone ?? "text-primary")}>
              {t.value}
            </span>
            <span className="flex items-center gap-0.5 text-12 text-tertiary">
              {t.label}
              <ChevronRight className="size-3 text-placeholder" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle
            title={`Progress by ${AREA_NOUN[areaKind]}`}
            action={<LinkButton onClick={() => onGoTo("order")}>Open build order</LinkButton>}
          />
          {areaRows.length ? (
            <div className="flex flex-col">
              {areaRows.map((r) => (
                <button
                  key={r.id || "none"}
                  type="button"
                  onClick={() => onFilter(`area:${r.id}`)}
                  aria-label={`${r.area?.name ?? `No ${AREA_NOUN[areaKind]}`}: ${r.c.done} of ${r.total} done`}
                  className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-sm py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:min-h-11 max-sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,14rem)_1fr_auto]"
                >
                  <span className="flex min-w-0 items-center gap-2 max-sm:col-start-1 max-sm:row-start-1">
                    <AreaDot area={r.area} />
                    <span className={cn("truncate", r.id ? "text-secondary" : "text-tertiary")}>
                      {r.area?.name ?? `No ${AREA_NOUN[areaKind]}`}
                    </span>
                  </span>
                  <span className="flex h-2.5 overflow-hidden rounded-[3px] bg-layer-2 max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-2">
                    {SEGMENTS.map((s) =>
                      r.c[s.kind] ? (
                        <span
                          key={s.kind}
                          className={cn("h-full", s.className)}
                          style={{ width: `${(r.c[s.kind] / r.total) * 100}%` }}
                          title={`${r.c[s.kind]} ${s.label.toLowerCase()}`}
                        />
                      ) : null
                    )}
                  </span>
                  <span className="text-right text-12 whitespace-nowrap text-tertiary tabular-nums max-sm:col-start-2 max-sm:row-start-1">
                    {r.c.done} of {r.total} done
                  </span>
                </button>
              ))}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-11 text-tertiary">
                {SEGMENTS.map((s) => (
                  <span key={s.kind} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2.5 rounded-[2px]", s.className)} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <Empty text={`Nothing open in any ${AREA_NOUN[areaKind]}.`} />
          )}
        </Card>

        <div className="grid min-w-0 content-start gap-4 md:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardTitle title="Blocking the most" />
            {blockingMost.length ? (
              <ItemList
                nodes={blockingMost}
                areaById={areaById}
                right={(n, i) =>
                  i === 0 ? (
                    <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-11 font-medium text-warning-primary">
                      {n.downstreamOpen} waiting
                    </span>
                  ) : (
                    `${n.downstreamOpen} waiting`
                  )
                }
                onOpenItem={onOpenItem}
              />
            ) : (
              <Empty text="Nothing open is blocking anything." done />
            )}
          </Card>

          <Card>
            <CardTitle
              title="Needs an owner"
              action={
                count((n) => !n.ownerId) > unowned.length ? (
                  <LinkButton onClick={() => onFilter("noowner")}>See all {count((n) => !n.ownerId)}</LinkButton>
                ) : null
              }
            />
            {unowned.length ? (
              <ItemList nodes={unowned} areaById={areaById} right={statusLabel} onOpenItem={onOpenItem} />
            ) : (
              <Empty text="Everything open has an owner." done />
            )}
          </Card>

          <Card className="md:col-span-2 lg:col-span-1">
            <CardTitle
              title="Longest chain"
              action={
                chain.length ? <span className="text-12 text-tertiary tabular-nums">{chain.length} steps</span> : null
              }
            />
            {chain.length ? (
              <ol className="-mx-1 flex flex-col">
                {chain.map((id, i) => {
                  const n = graph.nodes.get(id) as TPlanNode;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onOpenItem(id)}
                        className="grid w-full grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-sm px-1 py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-md:min-h-11"
                      >
                        <span className="text-right text-11 text-placeholder tabular-nums">{i + 1}</span>
                        <ItemKey node={n} area={areaById.get(n.areaId ?? "")} />
                        <span className="truncate text-primary">{n.name}</span>
                        <PersonAvatar person={n.ownerId ? personById.get(n.ownerId) : undefined} size={18} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Empty text="No open item waits on another." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ItemList(props: {
  nodes: TPlanNode[];
  areaById: TPlanShared["areaById"];
  right: (n: TPlanNode, i: number) => React.ReactNode;
  onOpenItem: (id: string) => void;
}) {
  return (
    <ul className="-mx-1 flex flex-col divide-y divide-subtle">
      {props.nodes.map((n, i) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => props.onOpenItem(n.id)}
            className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-1 py-2 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-md:min-h-11"
          >
            <ItemKey node={n} area={props.areaById.get(n.areaId ?? "")} />
            <span className="truncate text-primary">{n.name}</span>
            <span className="text-12 whitespace-nowrap text-tertiary tabular-nums">{props.right(n, i)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text, done = false }: { text: string; done?: boolean }) {
  return (
    <p className="flex items-center gap-2 py-1 text-13 text-tertiary">
      {done && <CircleCheck className="size-4 text-success-primary" />}
      {text}
    </p>
  );
}
