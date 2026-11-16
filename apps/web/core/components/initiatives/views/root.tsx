/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { PlanBoard } from "@/components/issues/issue-layouts/plan/board";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { BoardView } from "./board";
import { CalendarView } from "./calendar";
import { ListView } from "./list";
import type { InitiativeFiltersProps } from "./filters";
import { InitiativeWorkItemFilters } from "./filters";
import type { GroupBy, WorkItem } from "./model";
import { filterItems, groupItems, isGroupBy } from "./model";
import { ITEM_FOCUS } from "./parts";
import { TableView } from "./table";
import { WorkItemsToolbar } from "./toolbar";
import type { WorkItemsProps } from "./use-work-items";
import { useWorkItems } from "./use-work-items";
import type { InitiativeView } from "./view-switcher";
import { useInitiativeView, ViewSwitcher } from "./view-switcher";

const GROUP_KEY = "axios:initiative-group";
type Props = WorkItemsProps &
  InitiativeFiltersProps & {
    isLoading: boolean;
    hasError: boolean;
    onRetry: () => void;
  };
const WorkItemsViews = observer(function WorkItemsViews({
  view,
  filter,
  isLoading,
  hasError,
  onRetry,
  ...props
}: Props & { view: InitiativeView; filter: IWorkItemFilterInstance | undefined }) {
  const allItems = useWorkItems(props);
  const { setPeekIssue } = useIssueDetail();
  const [query, setQuery] = useState("");
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
  const search = view === "plan" ? "" : query;
  const items = filterItems(allItems, search);
  const noMatches = !items.length && (search.trim() !== "" || filter?.hasActiveFilters);
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
        filter={filter}
      />
      {filter && <WorkItemFiltersRow filter={filter} />}
      {hasError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-13 text-secondary">Work items could not be loaded.</p>
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : isLoading ? (
        <Loader className="space-y-3 p-4">
          <Loader.Item height="40px" />
          <Loader.Item height="320px" />
        </Loader>
      ) : noMatches ? (
        <div className="p-4 text-13 text-tertiary" role="status">
          <p>No work items match these filters.</p>
          <button
            type="button"
            onClick={() => {
              void filter?.clearFilters();
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

export function InitiativeWorkItems(props: Props) {
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
        <InitiativeWorkItemFilters {...props}>
          {({ filter }) => <WorkItemsViews view={view} filter={filter} {...props} />}
        </InitiativeWorkItemFilters>
      </div>
    </div>
  );
}
