/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import { PlanBoard } from "@/components/issues/issue-layouts/plan/board";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { BoardView } from "./board";
import { CalendarView } from "./calendar";
import { ListView } from "./list";
import { AppliedWorkItemFilters, WorkItemFiltersDropdown } from "./filters";
import type { FilterField, GroupBy, WorkItem } from "./model";
import {
  applyFilters,
  FILTER_FIELDS,
  getFilterOptions,
  groupItems,
  isGroupBy,
  readFilters,
  writeFilters,
} from "./model";
import { ITEM_FOCUS } from "./parts";
import { TableView } from "./table";
import { WorkItemsToolbar } from "./toolbar";
import type { WorkItemsProps } from "./use-work-items";
import { useWorkItems } from "./use-work-items";
import type { InitiativeView } from "./view-switcher";
import { useInitiativeView, ViewSwitcher } from "./view-switcher";

const GROUP_KEY = "axios:initiative-group";
const WorkItemsViews = observer(function WorkItemsViews({ view, ...props }: WorkItemsProps & { view: InitiativeView }) {
  const allItems = useWorkItems(props);
  const { setPeekIssue } = useIssueDetail();
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const options = getFilterOptions(allItems);
  const filters = readFilters(params, options);
  const onToggle = (field: FilterField, value: string) =>
    setParams(
      () => {
        const previous = new URLSearchParams(window.location.search);
        const next = readFilters(previous, options);
        next[field] = next[field].includes(value)
          ? next[field].filter((entry) => entry !== value)
          : [...next[field], value];
        return writeFilters(previous, next);
      },
      { replace: true }
    );
  const clearFilters = () =>
    setParams(
      () => {
        const next = new URLSearchParams(window.location.search);
        FILTER_FIELDS.forEach(({ id }) => next.delete(id));
        return next;
      },
      { replace: true }
    );
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(GROUP_KEY);
      if (isGroupBy(stored)) setGroupBy(stored);
    } catch {
      /* Storage may be unavailable. */
    }
  }, []);
  const changeGroup = (value: GroupBy) => {
    setGroupBy(value);
    try {
      window.localStorage.setItem(GROUP_KEY, value);
    } catch {
      /* Keep the in-memory selection. */
    }
  };
  const items = applyFilters(allItems, filters, view === "plan" ? "" : query);
  const noMatches = !items.length && (query.trim() !== "" || FILTER_FIELDS.some(({ id }) => filters[id].length));
  const groups = groupItems(
    items,
    groupBy,
    allItems.some((item) => item.stateGroup === "triage")
  );
  const onOpen = (item: WorkItem) =>
    setPeekIssue({
      workspaceSlug: props.workspaceSlug,
      projectId: item.projectId,
      issueId: item.id,
      isArchived: item.isArchived,
    });
  return (
    <>
      <WorkItemsToolbar
        query={query}
        onQuery={setQuery}
        showSearch={view !== "plan"}
        groupBy={view === "board" || view === "list" ? groupBy : undefined}
        onGroupBy={changeGroup}
        filters={<WorkItemFiltersDropdown filters={filters} options={options} onToggle={onToggle} />}
      />
      <AppliedWorkItemFilters filters={filters} options={options} onToggle={onToggle} onClear={clearFilters} />
      {noMatches ? (
        <div className="p-4 text-13 text-tertiary" role="status">
          <p>No work items match these filters.</p>
          <button
            type="button"
            onClick={() => {
              clearFilters();
              setQuery("");
            }}
            className={`mt-2 rounded-md border border-subtle px-3 py-2 text-12 text-secondary max-sm:min-h-11 ${ITEM_FOCUS}`}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {view === "plan" && <PlanBoard {...props} issueIds={items.map((item) => item.id)} />}
          {view === "table" && <TableView items={items} onOpen={onOpen} />}
          {view === "board" && <BoardView items={items} groups={groups} onOpen={onOpen} />}
          {view === "list" && <ListView key={groupBy} items={items} groups={groups} onOpen={onOpen} />}
          {view === "calendar" && <CalendarView items={items} onOpen={onOpen} />}
        </>
      )}
    </>
  );
});

export function InitiativeWorkItems(props: WorkItemsProps) {
  const { view, setView } = useInitiativeView();
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-surface-1">
      <ViewSwitcher view={view} onChange={setView} />
      <div
        id="initiative-work-items-panel"
        role="tabpanel"
        aria-labelledby={`initiative-tab-${view}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <WorkItemsViews view={view} {...props} />
      </div>
    </div>
  );
}
