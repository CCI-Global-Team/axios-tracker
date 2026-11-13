/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { DOWN_COLOUR, UP_COLOUR } from "./parts";

export type TLink = { from: string; to: string; dir: "up" | "down" };
type TPath = { d: string; dir: "up" | "down"; key: string };
type TBox = { l: number; r: number; y: number; cx: number };

/** The element for a work item inside the container is marked `data-plan-id`. */
const findEl = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-plan-id="${id}"]`);

type TRect = { l: number; r: number; t: number; b: number; y: number; cx: number };

function rect(el: HTMLElement, base: DOMRect, anchorY: "top" | "middle"): TRect {
  const r = el.getBoundingClientRect();
  const t = r.top - base.top;
  return {
    l: r.left - base.left,
    r: r.right - base.left,
    t,
    b: t + r.height,
    y: t + (anchorY === "top" ? Math.min(20, r.height / 2) : r.height / 2),
    cx: r.left - base.left + r.width / 2,
  };
}

/** Several links on one card fan out along its edge, in the order of the cards at their other ends. */
const FAN = 7;
function fanned(at: TRect, index: number, count: number): TBox {
  const y = at.y + (index - (count - 1) / 2) * FAN;
  return { l: at.l, r: at.r, cx: at.cx, y: Math.min(at.b - 6, Math.max(at.t + 6, y)) };
}

function curve(a: TBox, z: TBox): string {
  if (Math.abs(a.cx - z.cx) < 40) {
    // same column: loop out to the right
    const x = Math.max(a.r, z.r) + 28;
    return `M${a.r} ${a.y}C${x} ${a.y},${x} ${z.y},${z.r} ${z.y}`;
  }
  if (a.r < z.l) {
    const mx = (a.r + z.l) / 2;
    return `M${a.r} ${a.y}C${mx} ${a.y},${mx} ${z.y},${z.l} ${z.y}`;
  }
  const mx = (z.r + a.l) / 2;
  return `M${a.l} ${a.y}C${mx} ${a.y},${mx} ${z.y},${z.r} ${z.y}`;
}

/**
 * Arrows from each item the selection waits on, and to each item waiting on it. Drawn in the container's own
 * coordinates, so they scroll with it; re-measured when the container resizes.
 */
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
  const [paths, setPaths] = useState<TPath[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || !links.length) {
      setPaths([]);
      return;
    }
    const measure = () => {
      const base = root.getBoundingClientRect();
      const rects = new Map<string, TRect>();
      const rectOf = (id: string) => {
        if (!rects.has(id)) {
          const el = findEl(root, id);
          if (el) rects.set(id, rect(el, base, anchorY));
        }
        return rects.get(id);
      };
      const drawn = links.filter((l) => rectOf(l.from) && rectOf(l.to));
      // the links leaving and arriving at each card, sorted by where the other end sits
      const ends = new Map<string, string[]>();
      const add = (id: string, other: string) => ends.set(id, [...(ends.get(id) ?? []), other]);
      drawn.forEach((l) => {
        add(l.from, l.to);
        add(l.to, l.from);
      });
      ends.forEach((others) => others.sort((x, y) => rectOf(x)!.y - rectOf(y)!.y));
      const endBox = (id: string, other: string) => {
        const others = ends.get(id)!;
        return fanned(rectOf(id)!, others.indexOf(other), others.length);
      };
      const next: TPath[] = drawn.map((link) => ({
        d: curve(endBox(link.from, link.to), endBox(link.to, link.from)),
        dir: link.dir,
        key: `${link.from}>${link.to}`,
      }));
      setPaths(next);
      setSize({ w: root.scrollWidth, h: root.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [containerRef, links, anchorY, layoutKey]);

  if (!paths.length) return null;
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute top-0 left-0 overflow-visible ${above ? "z-[2]" : "z-0"}`}
      width={size.w}
      height={size.h}
    >
      <defs>
        {(["up", "down"] as const).map((dir) => (
          <marker
            key={dir}
            id={`plan-arrow-${dir}`}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0 0L8 4L0 8z" fill={dir === "up" ? UP_COLOUR : DOWN_COLOUR} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={p.dir === "up" ? UP_COLOUR : DOWN_COLOUR}
          strokeWidth={1.25}
          strokeOpacity={0.75}
          markerEnd={`url(#plan-arrow-${p.dir})`}
          className="motion-safe:animate-[plan-link-in_200ms_ease-out]"
        />
      ))}
    </svg>
  );
}
