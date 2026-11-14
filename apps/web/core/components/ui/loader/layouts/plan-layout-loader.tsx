/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { range } from "lodash-es";

/** The Plan layout's overview, before its work items arrive: the plan bar, the forecast, the count strip and two cards. */
export function PlanLayoutLoader() {
  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden motion-safe:animate-pulse"
      aria-busy
      aria-label="Loading plan"
    >
      <div className="flex items-center gap-3 border-b border-subtle px-page-x py-2.5">
        <span className="h-8 w-72 rounded-md bg-layer-1 max-sm:w-full" />
        <span className="h-7 w-48 rounded-md bg-layer-1 max-sm:hidden" />
      </div>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-page-x pt-4">
        <div className="flex h-[86px] items-center gap-6 rounded-lg border border-subtle bg-layer-1 px-5">
          <span className="flex flex-col gap-2">
            <span className="h-3 w-24 rounded-sm bg-layer-2" />
            <span className="h-7 w-40 rounded-sm bg-layer-2" />
          </span>
          <span className="h-3 w-44 rounded-sm bg-layer-2 max-sm:hidden" />
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-subtle bg-layer-1 xl:grid-cols-6">
          {range(6).map((i) => (
            <div key={i} className="flex h-[60px] flex-col justify-center gap-2 px-3.5">
              <span className="h-4 w-10 rounded-sm bg-layer-2" />
              <span className="h-3 w-20 rounded-sm bg-layer-2" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {[7, 5].map((rows) => (
            <div key={rows} className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-1 p-4">
              <span className="h-4 w-32 rounded-sm bg-layer-2" />
              {range(rows).map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="h-3 w-24 rounded-sm bg-layer-2" />
                  <span className="h-2.5 flex-1 rounded-[3px] bg-layer-2" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
