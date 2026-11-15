/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Search } from "lucide-react";
import type { GroupBy } from "./model";
import { GROUP_OPTIONS, isGroupBy } from "./model";

export function WorkItemsToolbar({
  query,
  onQuery,
  groupBy,
  onGroupBy,
}: {
  query: string;
  onQuery: (query: string) => void;
  groupBy?: GroupBy;
  onGroupBy: (by: GroupBy) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-subtle px-4 py-2.5 sm:px-page-x">
      <label className="relative flex h-7 min-w-0 items-center max-sm:h-10 max-sm:w-full">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-placeholder" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Find a work item"
          aria-label="Find a work item"
          className="h-7 w-full rounded-md border border-subtle bg-layer-1 pr-2 pl-7 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong max-sm:h-10 sm:w-48"
        />
      </label>
      {groupBy && (
        <label className="inline-flex items-center gap-2 text-12 text-tertiary">
          Group by
          <select
            value={groupBy}
            onChange={(event) => {
              if (isGroupBy(event.target.value)) onGroupBy(event.target.value);
            }}
            className="h-7 rounded-md border border-subtle bg-layer-1 px-2 text-12 text-primary outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:h-10"
          >
            {GROUP_OPTIONS.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
