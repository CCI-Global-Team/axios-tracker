/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { range } from "lodash-es";

/** The Plan layout's overview, before its work items arrive: the plan bar, six tiles and two columns of cards. */
export function PlanLayoutLoader() {
  return (
    <div className="flex h-full w-full animate-pulse flex-col overflow-hidden" aria-busy aria-label="Loading plan">
      <div className="flex items-center gap-3 border-b border-subtle px-page-x py-2.5">
        <span className="h-8 w-64 rounded-md bg-layer-1 max-sm:w-28" />
        <span className="h-7 w-48 rounded-md bg-layer-1 max-sm:hidden" />
        <span className="ml-auto h-4 w-40 rounded-sm bg-layer-1 max-lg:hidden" />
      </div>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-page-x pt-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {range(6).map((i) => (
            <div key={i} className="flex h-[74px] flex-col justify-center gap-2 rounded-lg border border-subtle px-3.5">
              <span className="h-6 w-10 rounded-sm bg-layer-1" />
              <span className="h-3 w-20 rounded-sm bg-layer-1" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {[7, 5].map((rows) => (
            <div key={rows} className="flex flex-col gap-3 rounded-lg border border-subtle p-4">
              <span className="h-4 w-32 rounded-sm bg-layer-1" />
              {range(rows).map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="h-3 w-24 rounded-sm bg-layer-1" />
                  <span className="h-2.5 flex-1 rounded-[3px] bg-layer-1" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
