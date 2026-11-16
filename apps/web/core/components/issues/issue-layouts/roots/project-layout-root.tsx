/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useSearchParams } from "react-router";
import useSWR from "swr";
// plane constants
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import type { TWorkItemFilterExpression } from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import {
  decodeFilterExpression,
  encodeFilterExpression,
  writeFiltersToUrl,
} from "@/components/work-item-filters/url-filters";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
// local imports
import { IssuePeekOverview } from "../../peek-overview";
import { LayoutTabs } from "../filters/header/layout-tabs";
import { ActiveLoader } from "../issue-layout-HOC";
import { CalendarLayout } from "../calendar/roots/project-root";
import { BaseGanttRoot } from "../gantt";
import { BasePlanRoot } from "../plan/root";
import { KanBanLayout } from "../kanban/roots/project-root";
import { ListLayout } from "../list/roots/project-root";
import { ProjectSpreadsheetLayout } from "../spreadsheet/roots/project-root";

function ProjectIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <KanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <CalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot />;
    case EIssueLayoutTypes.PLAN:
      return <BasePlanRoot />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ProjectSpreadsheetLayout />;
    default:
      return null;
  }
}

/** CCI: the project's last layout, so the skeleton shown before its filters load is the right shape. */
const layoutKey = (projectId: string) => `axios:layout:${projectId}`;
function readLastLayout(projectId: string): EIssueLayoutTypes {
  try {
    const saved = window.localStorage.getItem(layoutKey(projectId));
    if (saved && Object.values(EIssueLayoutTypes).includes(saved as EIssueLayoutTypes))
      return saved as EIssueLayoutTypes;
  } catch {
    // storage blocked: fall back to the list
  }
  return EIssueLayoutTypes.LIST;
}

export const ProjectLayoutRoot = observer(function ProjectLayoutRoot() {
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = useRef<{
    workspaceSlug: string | undefined;
    projectId: string | undefined;
    expression: TWorkItemFilterExpression | undefined;
  } | null>(null);
  // CCI: capture the shared filters once per project; later URL writes must not reload them.
  if (
    !initialFilters.current ||
    initialFilters.current.workspaceSlug !== workspaceSlug ||
    initialFilters.current.projectId !== projectId
  ) {
    initialFilters.current = {
      workspaceSlug,
      projectId,
      expression: decodeFilterExpression(searchParams.get("filters")),
    };
  }
  const richFiltersOverride = initialFilters.current.expression;
  // hooks
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { getFilter } = useWorkItemFilters();
  const applyingUrlFilters = useRef(false);
  // derived values
  const workItemFilters = projectId ? issuesFilter?.getIssueFilters(projectId) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout;

  useSWR(
    workspaceSlug && projectId ? `PROJECT_ISSUES_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId, richFiltersOverride);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const updateFilters = useCallback(
    (filters: TWorkItemFilterExpression) => {
      if (!workspaceSlug || !projectId || !issuesFilter) return Promise.resolve();
      writeFiltersToUrl(setSearchParams, filters);
      return issuesFilter.updateFilterExpression(workspaceSlug, projectId, filters, !applyingUrlFilters.current);
    },
    [issuesFilter, workspaceSlug, projectId, setSearchParams]
  );

  // CCI: keep the URL and the shown filters in step. With no (or an unreadable) ?filters=, the current filters
  // go into the URL so the address bar is always shareable. When ?filters= changes after load (an in-app link,
  // back/forward, or a project whose filters SWR already cached), it is applied for this visit without saving.
  const urlFilters = searchParams.get("filters");
  const shownFilters = workItemFilters?.richFilters;
  useEffect(() => {
    if (!workspaceSlug || !projectId || !issuesFilter || !workItemFilters) return;
    const liveUrlFilters = new URLSearchParams(window.location.search).get("filters");
    if (liveUrlFilters === encodeFilterExpression(shownFilters)) return;
    const expression = decodeFilterExpression(liveUrlFilters);
    if (!expression) {
      writeFiltersToUrl(setSearchParams, shownFilters);
      return;
    }
    applyingUrlFilters.current = true;
    try {
      const filter = getFilter(EIssuesStoreType.PROJECT, projectId);
      if (filter) {
        filter.resetExpression(expression);
        if (filter.hasActiveFilters) filter.toggleVisibility(true);
      } else void issuesFilter.updateFilterExpression(workspaceSlug, projectId, expression, false);
    } finally {
      applyingUrlFilters.current = false;
    }
  }, [urlFilters, shownFilters, workItemFilters, workspaceSlug, projectId, issuesFilter, getFilter, setSearchParams]);

  useEffect(() => {
    if (!projectId || !activeLayout) return;
    try {
      window.localStorage.setItem(layoutKey(projectId), activeLayout);
    } catch {
      // storage blocked: nothing to remember
    }
  }, [projectId, activeLayout]);

  if (!workspaceSlug || !projectId) return <></>;
  // CCI: while the filters load, show the same frame and skeleton the layout will show, instead of a blank
  // work area that then fills with a skeleton.
  if (!workItemFilters) {
    const lastLayout = readLastLayout(projectId);
    return (
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <LayoutTabs selectedLayout={lastLayout} onChange={() => {}} disabled />
        <div className="relative h-full w-full overflow-auto bg-surface-1">
          <ActiveLoader layout={lastLayout} />
        </div>
      </div>
    );
  }
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        entityType={EIssuesStoreType.PROJECT}
        entityId={projectId}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={workItemFilters}
        updateFilters={updateFilters}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: projectWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            <LayoutTabs
              selectedLayout={activeLayout}
              onChange={(layout) =>
                issuesFilter?.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, { layout })
              }
            />
            {projectWorkItemsFilter && (
              <WorkItemFiltersRow
                filter={projectWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON,
                }}
              />
            )}
            <div className="relative h-full w-full overflow-auto bg-surface-1">
              {/* mutation loader */}
              {issues?.getIssueLoader() === "mutation" && (
                <div className="shadow-sm fixed top-[70px] right-[20px] z-50 flex h-[40px] w-[40px] items-center justify-center rounded-sm bg-layer-1">
                  <Spinner className="h-4 w-4" />
                </div>
              )}
              <ProjectIssueLayout activeLayout={activeLayout} />
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
