/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ALL_ISSUES } from "@plane/constants";
import type { EIssuesStoreType } from "@plane/types";
import { EIssueLayoutTypes } from "@plane/types";
import { useIssues } from "@/hooks/store/use-issues";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { IssueLayoutHOC } from "../issue-layout-HOC";
import { PlanBoard } from "./board";
import { usePlanPagination } from "./use-plan-pagination";

type TPlanStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW;

/**
 * The Plan layout for a project, module, cycle or project view. A plan needs every work item in scope, not one page,
 * so it keeps asking for the next page until there are none.
 */
export const BasePlanRoot = observer(function BasePlanRoot(props: { viewId?: string }) {
  const { viewId } = props;
  const params = useParams();
  const { workspaceSlug } = params;
  const storeType = useIssueStoreType() as TPlanStoreType;
  const { issues, issueMap } = useIssues(storeType);
  const { fetchIssues, fetchNextIssues } = useIssuesActions(storeType);

  useEffect(() => {
    void fetchIssues("init-loader", { canGroup: false, perPageCount: 100 }, viewId).catch(() => {
      // The initial loader can be retried by reopening the layout.
    });
  }, [fetchIssues, storeType, viewId]);

  const issueIds = (issues.groupedIssueIds?.[ALL_ISSUES] as string[] | undefined) ?? [];
  const hasMore = !!issues.getPaginationData(undefined, undefined)?.nextPageResults;
  const loader = issues.getIssueLoader();

  const pagination = usePlanPagination({
    scope: JSON.stringify([params, storeType, viewId]),
    cursor: issues.getPaginationData(undefined, undefined)?.nextCursor,
    hasMore,
    loading: !!loader,
    fetchNext: fetchNextIssues,
  });

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.PLAN}>
      <PlanBoard
        workspaceSlug={workspaceSlug.toString()}
        issueIds={issueIds}
        issueMap={issueMap}
        areaBy="module"
        isLoadingMore={hasMore}
        {...pagination}
      />
    </IssueLayoutHOC>
  );
});
