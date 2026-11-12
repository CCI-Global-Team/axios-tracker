/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * CCI: the Axios mark drawing itself, replacing upstream's pair of animated GIFs.
 *
 * Inline SVG rather than <img src="...svg">: SMIL is effectively frozen inside an <img>, and a GIF
 * cannot follow the theme or scale cleanly. Drawn inline, the mark inherits currentColor, so one
 * component serves light and dark and the dark/light asset pair is no longer needed.
 *
 * The two ribbons draw and retract half a cycle apart, so the crossing keeps forming and releasing —
 * the weave expressed as motion instead of as a masked gap.
 */

// Both ribbons are the same length; hard-coded so the dash animation needs no measurement at runtime.
const PATH_LENGTH = 82.41;
const CYCLE_SECONDS = 2;

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
    <div ref={ref} className="axios-loader flex items-center justify-center">
      <style>{`
        @keyframes axios-loader-draw {
          0%   { stroke-dashoffset: ${PATH_LENGTH}; }
          42%  { stroke-dashoffset: 0; }
          58%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -${PATH_LENGTH}; }
        }
        @keyframes axios-loader-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: none; }
        }
        .axios-loader {
          animation: axios-loader-in 240ms cubic-bezier(.23,1,.32,1) 160ms both;
        }
        .axios-loader__ribbon {
          stroke-dasharray: ${PATH_LENGTH};
          stroke-dashoffset: ${PATH_LENGTH};
          animation: axios-loader-draw ${CYCLE_SECONDS}s cubic-bezier(.45,.05,.35,1) infinite;
        }
        .axios-loader__ribbon--second { animation-delay: -${CYCLE_SECONDS / 2}s; }
        @media (prefers-reduced-motion: reduce) {
          .axios-loader { animation-duration: 1ms; }
          .axios-loader__ribbon { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
      {/* width/height attributes hold the size before the stylesheet arrives; without them the first
          server-rendered paint drew the mark at the full width of the screen. */}
      <svg
        viewBox="14.5 18.5 71 63"
        width="50"
        height="44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-auto text-accent-primary sm:h-11"
        style={{ color: "var(--txt-accent-primary, #d71920)" }}
        role="img"
        aria-label="Loading"
      >
        <path
          className="axios-loader__ribbon"
          d="M20,24 C44,24 56,76 80,76"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          className="axios-loader__ribbon axios-loader__ribbon--second"
          d="M20,76 C44,76 56,24 80,24"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
