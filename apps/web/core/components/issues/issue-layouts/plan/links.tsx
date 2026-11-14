/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { DOWN_COLOUR, UP_COLOUR } from "./parts";

/** up: has to happen first; down: waits on it; rel: related, drawn dashed with no arrow */
export type TLink = { from: string; to: string; dir: "up" | "down" | "rel" };
type TDir = TLink["dir"];
type TPoint = [number, number];
type TRect = { l: number; r: number; t: number; b: number; y: number };
/** where a link ends: the arrow's tip on the card edge, and which way the arrow points */
type THead = { x: number; y: number; to: "right" | "left"; dir: TDir };
type TDrawn = { lines: { d: string; dir: TDir; key: string }[]; heads: (THead & { key: string })[] };

/** arrowhead length and half-width; a line stops at the arrow's base, never at its tip */
const HEAD = 8;
const HALF = 4;
/** corner radius where a line turns */
const RADIUS = 8;
/** how far before the target a line takes its last turn; links into one card share it, so they meet at one arrow */
const LANE = 16;

/** The element for a work item inside the container is marked `data-plan-id`. */
const findEl = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-plan-id="${id}"]`);

function rect(el: HTMLElement, base: DOMRect, anchorY: "top" | "middle"): TRect {
  const r = el.getBoundingClientRect();
  const t = r.top - base.top;
  return {
    l: r.left - base.left,
    r: r.right - base.left,
    t,
    b: t + r.height,
    y: t + (anchorY === "top" ? Math.min(20, r.height / 2) : r.height / 2),
  };
}

/** An orthogonal polyline with rounded corners. */
function rounded(points: TPoint[]): string {
  const pts = points.filter(
    (p, i) => i === 0 || Math.abs(p[0] - points[i - 1][0]) > 0.5 || Math.abs(p[1] - points[i - 1][1]) > 0.5
  );
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const r = Math.min(RADIUS, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const inX = x - Math.sign(x - px) * r;
    const inY = y - Math.sign(y - py) * r;
    const outX = x + Math.sign(nx - x) * r;
    const outY = y + Math.sign(ny - y) * r;
    d += `L${inX} ${inY}Q${x} ${y} ${outX} ${outY}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d}L${lx} ${ly}`;
}

/**
 * Route one link: out of the source's side, along a lane just in front of the target, and straight into the
 * target's edge. Every link into a card uses the same lane and end, so they join before one shared arrow.
 */
type TBlock = { l: number; r: number; t: number; b: number };

/** whether a horizontal line at y from x1 to x2 stays clear of every card in its way */
const clearAt = (y: number, x1: number, x2: number, blocks: TBlock[]) => {
  const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
  return !blocks.some((k) => k.r > lo + 1 && k.l < hi - 1 && y >= k.t - 2 && y <= k.b + 2);
};

/**
 * The side-entry path. When the straight run at the source's height would cross other cards (a link that skips a
 * column), drop into the gap beside the source, cross in the nearest gap between cards, then turn into the lane.
 */
function sidePath(a: TRect, z: TRect, from: number, lane: number, end: number, blocks: TBlock[]): TPoint[] {
  const direct: TPoint[] = [
    [from, a.y],
    [lane, a.y],
    [lane, z.y],
    [end, z.y],
  ];
  if (!blocks.length || clearAt(a.y, from, lane, blocks)) return direct;
  const out = from + Math.sign(lane - from) * LANE;
  const [lo, hi] = out < lane ? [out, lane] : [lane, out];
  const inWay = blocks.filter((k) => k.r > lo + 1 && k.l < hi - 1);
  const ys = inWay.flatMap((k) => [k.t - 3, k.b + 3]).filter((y) => clearAt(y, out, lane, blocks));
  if (!ys.length) return direct;
  const cy = ys.reduce((best, y) =>
    Math.abs(y - a.y) + Math.abs(y - z.y) < Math.abs(best - a.y) + Math.abs(best - z.y) ? y : best
  );
  return [
    [from, a.y],
    [out, a.y],
    [out, cy],
    [lane, cy],
    [lane, z.y],
    [end, z.y],
  ];
}

function route(a: TRect, z: TRect, dir: TDir, blocks: TBlock[]): { points: TPoint[]; head: THead } | null {
  const sameRow = Math.abs(z.y - a.y) < 1;
  const below = z.t >= a.b;
  const above = z.b <= a.t;
  // target to the right: turn in a lane just in front of it and come straight in from the left
  if (z.l > a.r - 1 || (z.l > a.l && (below || above))) {
    const room = z.l - a.r - HEAD;
    if (room >= 2 * RADIUS) {
      const lane = z.l - HEAD - Math.min(LANE, room / 2);
      return {
        points: sidePath(a, z, a.r, lane, z.l - HEAD, blocks),
        head: { x: z.l, y: z.y, to: "right", dir },
      };
    }
    if (sameRow) {
      // bars that touch on one row already read in order
      return room >= 2
        ? {
            points: [
              [a.r, a.y],
              [z.l - HEAD, z.y],
            ],
            head: { x: z.l, y: z.y, to: "right", dir },
          }
        : null;
    }
    // the source runs past the lane: leave from its bottom or top edge instead
    const lane = z.l - HEAD - LANE / 2;
    if (lane > a.l + 4 && (below || above)) {
      return {
        points: [
          [lane, below ? a.b : a.t],
          [lane, z.y],
          [z.l - HEAD, z.y],
        ],
        head: { x: z.l, y: z.y, to: "right", dir },
      };
    }
  }
  // target to the left: the mirror image
  if (a.l - z.r - HEAD >= 2 * RADIUS) {
    const lane = z.r + HEAD + Math.min(LANE, (a.l - z.r - HEAD) / 2);
    return {
      points: sidePath(a, z, a.l, lane, z.r + HEAD, blocks),
      head: { x: z.r, y: z.y, to: "left", dir },
    };
  }
  // same column: loop out past the right edges and come back in
  const lane = Math.max(a.r, z.r) + HEAD + LANE;
  return {
    points: [
      [a.r, a.y],
      [lane, a.y],
      [lane, z.y],
      [z.r + HEAD, z.y],
    ],
    head: { x: z.r, y: z.y, to: "left", dir },
  };
}

function headPath({ x, y, to }: THead): string {
  const back = to === "right" ? x - HEAD : x + HEAD;
  return `M${x} ${y}L${back} ${y - HALF}L${back} ${y + HALF}z`;
}

const colour = (dir: TDir) => (dir === "up" ? UP_COLOUR : dir === "down" ? DOWN_COLOUR : "var(--txt-placeholder)");

/**
 * Arrows from each item the selection waits on, and to each item waiting on it. Drawn in the container's own
 * coordinates, so they scroll with it; re-measured when the container resizes.
 */
/**
 * Every blocked-by link inside the selection's chain (so each highlighted card is joined to the next), plus a
 * dashed line to each related item. Related lines come first so they draw underneath.
 */
export function chainLinks(
  nodes: Map<string, { waitsOn: string[]; blocks: string[] }>,
  selectedId: string,
  related: string[],
  up: Set<string>,
  down: Set<string>
): TLink[] {
  const links: TLink[] = related.filter((id) => nodes.has(id)).map((id) => ({ from: selectedId, to: id, dir: "rel" }));
  for (const id of [selectedId, ...up]) {
    for (const w of nodes.get(id)?.waitsOn ?? []) if (up.has(w)) links.push({ from: w, to: id, dir: "up" });
  }
  for (const id of [selectedId, ...down]) {
    for (const b of nodes.get(id)?.blocks ?? []) if (down.has(b)) links.push({ from: id, to: b, dir: "down" });
  }
  return links;
}

export function PlanLinks(props: {
  containerRef: RefObject<HTMLElement | null>;
  links: TLink[];
  anchorY: "top" | "middle";
  /** changes whenever the laid-out items change */
  layoutKey: string;
  /** draw over the items (cards several columns apart) rather than under them (schedule bars) */
  above?: boolean;
}) {
  const { containerRef, links, anchorY, layoutKey, above } = props;
  const [drawn, setDrawn] = useState<TDrawn>({ lines: [], heads: [] });
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || !links.length) {
      setDrawn({ lines: [], heads: [] });
      return;
    }
    const measure = () => {
      const base = root.getBoundingClientRect();
      const rects = new Map<string, TRect | null>();
      const rectOf = (id: string) => {
        if (!rects.has(id)) {
          const el = findEl(root, id);
          rects.set(id, el ? rect(el, base, anchorY) : null);
        }
        return rects.get(id) ?? null;
      };
      // cards a link should route around; schedule links run under the bars, so only cards drawn over matter
      const cards = above
        ? [...root.querySelectorAll<HTMLElement>("[data-plan-id]")]
            .map((el) => rectOf(el.dataset.planId ?? ""))
            .filter((k): k is TRect => !!k)
        : [];
      const lines: TDrawn["lines"] = [];
      const heads = new Map<string, TDrawn["heads"][number]>();
      for (const link of links) {
        const a = rectOf(link.from);
        const z = rectOf(link.to);
        if (!a || !z) continue;
        const blocks = cards.filter((k) => k !== a && k !== z);
        const routed = route(a, z, link.dir, blocks);
        if (!routed) continue;
        const { points, head } = routed;
        lines.push({ d: rounded(points), dir: link.dir, key: `${link.from}>${link.to}` });
        if (link.dir === "rel") continue;
        const key = `${link.to}:${head.to}:${head.x.toFixed(1)}:${head.y.toFixed(1)}`;
        if (!heads.has(key)) heads.set(key, { ...head, key });
      }
      setDrawn({ lines, heads: [...heads.values()] });
      setSize({ w: root.scrollWidth, h: root.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [containerRef, links, anchorY, layoutKey, above]);

  if (!drawn.lines.length) return null;
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute top-0 left-0 overflow-visible ${above ? "z-[2]" : "z-0"}`}
      width={size.w}
      height={size.h}
    >
      <g className="motion-safe:animate-[plan-link-in_200ms_ease-out]">
        {drawn.lines.map((l) => (
          <path
            key={l.key}
            d={l.d}
            fill="none"
            stroke={colour(l.dir)}
            strokeWidth={1.5}
            strokeOpacity={0.8}
            strokeDasharray={l.dir === "rel" ? "4 4" : undefined}
            strokeLinejoin="round"
          />
        ))}
        {drawn.heads.map((h) => (
          <path key={h.key} d={headPath(h)} fill={colour(h.dir)} />
        ))}
      </g>
    </svg>
  );
}
