/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

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

export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center">
      <style>{`
        @keyframes axios-loader-draw {
          0%   { stroke-dashoffset: ${PATH_LENGTH}; }
          42%  { stroke-dashoffset: 0; }
          58%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -${PATH_LENGTH}; }
        }
        .axios-loader__ribbon {
          stroke-dasharray: ${PATH_LENGTH};
          stroke-dashoffset: ${PATH_LENGTH};
          animation: axios-loader-draw ${CYCLE_SECONDS}s cubic-bezier(.45,.05,.35,1) infinite;
        }
        .axios-loader__ribbon--second { animation-delay: -${CYCLE_SECONDS / 2}s; }
        @media (prefers-reduced-motion: reduce) {
          .axios-loader__ribbon { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
      <svg
        viewBox="14.5 18.5 71 63"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-auto text-accent-primary sm:h-11"
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
