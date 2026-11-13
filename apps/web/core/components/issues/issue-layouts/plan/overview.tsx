/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@plane/utils";
import type { TPlanFilter, TPlanShared, TPlanView } from "./board";
import type { TPlanNode } from "./model";
import { NO_OWNER, longestChain, statusLabel, weeksToDate } from "./model";
import { AreaDot, Card, CardTitle, ItemKey, LinkButton, PersonAvatar } from "./parts";
import type { TPlanArea } from "./use-plan-data";

type Props = TPlanShared & {
  areas: TPlanArea[];
  onFilter: (f: TPlanFilter | null) => void;
  onOpenItem: (id: string) => void;
  onGoTo: (v: TPlanView) => void;
  relationsError: boolean;
  onRetry: () => void;
};

const SEGMENTS = [
  { kind: "done", label: "Done", className: "bg-success-primary" },
  { kind: "wip", label: "In progress", className: "bg-accent-primary" },
  { kind: "ready", label: "Can start", className: "bg-success-subtle" },
  { kind: "blocked", label: "Waiting", className: "bg-warning-primary" },
] as const;

export const formatDay = (d: Date, withYear = false) =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

export function OverviewView(props: Props) {
  const { graph, areas, areaById, personById, plan, origin, now, onFilter, onOpenItem, onGoTo } = props;
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
      tone: "text-warning-primary",
    },
    { filter: "wip", value: count((n) => n.kind === "wip"), label: "in progress", tone: "text-accent-primary" },
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
      .toSorted((a, b) => b.total - b.c.done - (a.total - a.c.done));
  }, [areas, areaById, nodes]);

  const endDate = weeksToDate(origin, plan.end);
  const weeksLeft = Math.max(0, Math.ceil(plan.end - now));
  const setter = plan.setter === null ? null : plan.setter === NO_OWNER ? undefined : personById.get(plan.setter);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-page-x pt-4 pb-10">
      {props.relationsError && (
        <div className="flex items-center gap-2 rounded-md border border-warning-subtle bg-warning-subtle px-3 py-2 text-13 text-warning-primary">
          <TriangleAlert className="size-4 shrink-0" />
          Couldn’t load the links between work items, so nothing shows as blocked.
          <LinkButton className="ml-auto" onClick={props.onRetry}>
            Try again
          </LinkButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onFilter(t.filter)}
            className="group flex flex-col items-start gap-0.5 rounded-lg border border-subtle bg-layer-1 px-3.5 py-3 text-left transition-[border-color,box-shadow] duration-150 outline-none hover:border-strong hover:shadow-raised-100 focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
          >
            <span
              className={cn("text-24 leading-8 font-semibold tracking-tight tabular-nums", t.tone ?? "text-primary")}
            >
              {t.value}
            </span>
            <span className="flex items-center gap-1 text-12 text-tertiary">
              {t.label}
              <ArrowRight className="size-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle
              title="Progress by area"
              action={<LinkButton onClick={() => onGoTo("order")}>Open build order</LinkButton>}
            />
            {areaRows.length ? (
              <div className="flex flex-col">
                {areaRows.map((r) => (
                  <button
                    key={r.id || "none"}
                    type="button"
                    onClick={() => onFilter(`area:${r.id}`)}
                    className="grid grid-cols-[minmax(0,9.5rem)_1fr_3.5rem] items-center gap-3 rounded-sm py-1.5 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:grid-cols-[minmax(0,7rem)_1fr_3rem]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <AreaDot area={r.area} />
                      <span className="truncate text-secondary">{r.area?.name ?? "No area"}</span>
                    </span>
                    <span className="flex h-2.5 overflow-hidden rounded-[3px] bg-layer-2">
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
                    <span className="text-right text-12 text-tertiary tabular-nums">
                      {r.c.done}/{r.total}
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
              <Empty text="Nothing open in any area." />
            )}
          </Card>

          <Card>
            <CardTitle
              title="Longest chain"
              action={
                chain.length ? <span className="text-12 text-tertiary tabular-nums">{chain.length} steps</span> : null
              }
            />
            {chain.length ? (
              <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                {chain.map((id, i) => {
                  const n = graph.nodes.get(id) as TPlanNode;
                  return (
                    <li key={id} className="flex items-center gap-1">
                      {i > 0 && <ArrowRight className="size-3 text-placeholder" aria-hidden />}
                      <button
                        type="button"
                        title={n.name}
                        onClick={() => onOpenItem(id)}
                        className="font-mono rounded-sm border border-subtle bg-surface-1 px-1.5 py-0.5 text-11 font-medium text-secondary tabular-nums outline-none hover:border-strong hover:text-primary focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
                      >
                        {n.key}
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

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle
              title="Forecast"
              action={<LinkButton onClick={() => onGoTo("schedule")}>Open schedule</LinkButton>}
            />
            {open.length ? (
              <>
                <div className="text-20 leading-7 font-semibold tracking-tight text-primary">
                  {formatDay(endDate, true)}
                </div>
                <p className="mt-1 text-12 text-tertiary">
                  Everything built in about {weeksLeft} week{weeksLeft === 1 ? "" : "s"}, at 8 h an item unless set.
                </p>
                {setter !== null && (
                  <div className="mt-3 flex items-center gap-2 text-13 text-secondary">
                    <PersonAvatar person={setter} size={20} />
                    <span className="truncate">
                      <span className="font-medium text-primary">{setter?.name ?? "No owner"}</span> finishes last
                    </span>
                  </div>
                )}
              </>
            ) : (
              <Empty text="Nothing left to build." done />
            )}
          </Card>

          <Card>
            <CardTitle title="Blocking the most" />
            {blockingMost.length ? (
              <ItemList
                nodes={blockingMost}
                areaById={areaById}
                right={(n) => `${n.downstreamOpen} waiting`}
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
        </div>
      </div>
    </div>
  );
}

function ItemList(props: {
  nodes: TPlanNode[];
  areaById: TPlanShared["areaById"];
  right: (n: TPlanNode) => string;
  onOpenItem: (id: string) => void;
}) {
  return (
    <ul className="-mx-1 flex flex-col divide-y divide-subtle">
      {props.nodes.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => props.onOpenItem(n.id)}
            className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-1 py-2 text-left text-13 outline-none hover:bg-layer-transparent-hover focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
          >
            <ItemKey node={n} area={props.areaById.get(n.areaId ?? "")} />
            <span className="truncate text-primary">{n.name}</span>
            <span className="text-12 whitespace-nowrap text-tertiary tabular-nums">{props.right(n)}</span>
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
