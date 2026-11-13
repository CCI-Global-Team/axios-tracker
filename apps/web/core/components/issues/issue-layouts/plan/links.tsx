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

function box(el: HTMLElement, base: DOMRect, anchorY: "top" | "middle"): TBox {
  const r = el.getBoundingClientRect();
  return {
    l: r.left - base.left,
    r: r.right - base.left,
    y: r.top - base.top + (anchorY === "top" ? Math.min(20, r.height / 2) : r.height / 2),
    cx: r.left - base.left + r.width / 2,
  };
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
}) {
  const { containerRef, links, anchorY, layoutKey } = props;
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
      const next: TPath[] = [];
      for (const link of links) {
        const a = findEl(root, link.from);
        const z = findEl(root, link.to);
        if (!a || !z) continue;
        next.push({
          d: curve(box(a, base, anchorY), box(z, base, anchorY)),
          dir: link.dir,
          key: `${link.from}>${link.to}`,
        });
      }
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
      className="pointer-events-none absolute top-0 left-0 z-[2] overflow-visible"
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
          strokeWidth={1.6}
          markerEnd={`url(#plan-arrow-${p.dir})`}
          className="motion-safe:animate-[plan-link-in_200ms_ease-out]"
        />
      ))}
    </svg>
  );
}
