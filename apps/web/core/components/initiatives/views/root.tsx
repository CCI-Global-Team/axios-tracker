/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { PlanBoard } from "@/components/issues/issue-layouts/plan/board";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { BoardView } from "./board";
import { CalendarView } from "./calendar";
import { ListView } from "./list";
import type { GroupBy, WorkItem } from "./model";
import { filterItems, groupItems, isGroupBy } from "./model";
import { TableView } from "./table";
import { WorkItemsToolbar } from "./toolbar";
import type { WorkItemsProps } from "./use-work-items";
import { useWorkItems } from "./use-work-items";
import type { InitiativeView } from "./view-switcher";
import { useInitiativeView, ViewSwitcher } from "./view-switcher";

const GROUP_KEY = "axios:initiative-group";
const ReadViews = observer(function ReadViews({
  view,
  ...props
}: WorkItemsProps & { view: Exclude<InitiativeView, "plan"> }) {
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
  const items = filterItems(allItems, query);
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
        groupBy={view === "board" || view === "list" ? groupBy : undefined}
        onGroupBy={changeGroup}
      />
      {view === "table" && <TableView items={items} onOpen={onOpen} />}
      {view === "board" && <BoardView items={items} groups={groups} onOpen={onOpen} />}
      {view === "list" && <ListView key={groupBy} items={items} groups={groups} onOpen={onOpen} />}
      {view === "calendar" && <CalendarView items={items} onOpen={onOpen} />}
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
        {view === "plan" ? <PlanBoard {...props} /> : <ReadViews view={view} {...props} />}
      </div>
    </div>
  );
}
