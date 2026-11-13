/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { AxiosLoader } from "@plane/propel/icons";

/**
 * CCI: the Axios chain drawing itself (the artwork lives in @plane/propel's AxiosLoader), replacing
 * upstream's pair of animated GIFs. Inline SVG so it follows the theme and scales cleanly.
 */

/*
 * A page load passes through several loaders in turn (root, instance, auth, workspace). Each one is a
 * fresh element, so on its own each would restart the draw from blank and the handover reads as a
 * flicker. Every loader instead pins its animations to the start time of the first one, so a remount
 * carries on mid-stroke, and the fade-in has already finished for every loader after the first.
 */
declare global {
  interface Window {
    __axiosLoaderStart?: number;
  }
}

// useLayoutEffect so the phase is set before the first paint; plain useEffect on the server, where it never runs.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const useSharedClock = () => {
  const ref = useRef<HTMLDivElement>(null);
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getAnimations !== "function") return;
    const animations = el.getAnimations({ subtree: true });
    if (window.__axiosLoaderStart === undefined) {
      const started = animations.find((a) => a.startTime !== null)?.startTime;
      window.__axiosLoaderStart = typeof started === "number" ? started : (document.timeline.currentTime as number);
    }
    for (const animation of animations) animation.startTime = window.__axiosLoaderStart;
  }, []);
  return ref;
};

export function LogoSpinner() {
  const ref = useSharedClock();
  return (
    <div
      ref={ref}
      className="axios-loader flex items-center justify-center"
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <style>{`
        @keyframes axios-loader-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
        .axios-loader {
          animation: axios-loader-in 240ms cubic-bezier(.23,1,.32,1) 160ms both;
        }
        @media (prefers-reduced-motion: reduce) {
          .axios-loader { animation-duration: 1ms; }
        }
      `}</style>
      <AxiosLoader width={176} className="h-auto w-32 sm:w-44" />
    </div>
  );
}
