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
  const { workspaceSlug } = useParams();
  const storeType = useIssueStoreType() as TPlanStoreType;
  const { issues, issueMap } = useIssues(storeType);
  const { fetchIssues, fetchNextIssues } = useIssuesActions(storeType);

  useEffect(() => {
    fetchIssues("init-loader", { canGroup: false, perPageCount: 100 }, viewId);
  }, [fetchIssues, storeType, viewId]);

  const issueIds = (issues.groupedIssueIds?.[ALL_ISSUES] as string[] | undefined) ?? [];
  const hasMore = !!issues.getPaginationData(undefined, undefined)?.nextPageResults;
  const loader = issues.getIssueLoader();

  useEffect(() => {
    if (hasMore && loader !== "init-loader" && loader !== "pagination") fetchNextIssues();
  }, [hasMore, loader, issueIds.length, fetchNextIssues]);

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.PLAN}>
      <PlanBoard
        workspaceSlug={workspaceSlug.toString()}
        issueIds={issueIds}
        issueMap={issueMap}
        areaBy="module"
        isLoadingMore={hasMore}
      />
    </IssueLayoutHOC>
  );
});
