/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { ALL_ISSUES } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { PlanLayoutLoader } from "@/components/ui/loader/layouts/plan-layout-loader";
import { useIssues } from "@/hooks/store/use-issues";
import { IssueLayoutHOC } from "../issue-layout-HOC";
import { PlanBoard } from "./board";
import { usePlanPagination } from "./use-plan-pagination";

/** The Plan layout for a workspace view: work items from many projects, grouped into areas by project. */
export const WorkspacePlanRoot = observer(function WorkspacePlanRoot(props: { workspaceSlug: string }) {
  const { workspaceSlug } = props;
  const { globalViewId } = useParams();
  const {
    issues: { getIssueLoader, getPaginationData, groupedIssueIds, fetchNextIssues },
    issueMap,
  } = useIssues(EIssuesStoreType.GLOBAL);

  const issueIds = (groupedIssueIds?.[ALL_ISSUES] as string[] | undefined) ?? [];
  const hasMore = !!getPaginationData(ALL_ISSUES, undefined)?.nextPageResults;
  const loader = getIssueLoader();

  // the store action itself, so a failed page can be caught and retried
  const fetchNext = useCallback(async () => {
    if (globalViewId) return fetchNextIssues(workspaceSlug, globalViewId.toString());
  }, [fetchNextIssues, workspaceSlug, globalViewId]);
  const pagination = usePlanPagination({
    scope: JSON.stringify([workspaceSlug, globalViewId]),
    cursor: getPaginationData(ALL_ISSUES, undefined)?.nextCursor,
    hasMore,
    loading: !!loader,
    fetchNext,
  });

  if (!groupedIssueIds) return <PlanLayoutLoader />;

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.PLAN}>
      <PlanBoard
        workspaceSlug={workspaceSlug}
        issueIds={issueIds}
        issueMap={issueMap}
        areaBy="project"
        isLoadingMore={hasMore}
        {...pagination}
      />
    </IssueLayoutHOC>
  );
});
