/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { ALL_ISSUES } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import { PlanLayoutLoader } from "@/components/ui/loader/layouts/plan-layout-loader";
import { useIssues } from "@/hooks/store/use-issues";
import { IssueLayoutHOC } from "../issue-layout-HOC";
import { PlanBoard } from "./board";

/** The Plan layout for a workspace view: work items from many projects, grouped into areas by project. */
export const WorkspacePlanRoot = observer(function WorkspacePlanRoot(props: {
  workspaceSlug: string;
  fetchNextPages: () => void;
}) {
  const { workspaceSlug, fetchNextPages } = props;
  const {
    issues: { getIssueLoader, getPaginationData, groupedIssueIds },
    issueMap,
  } = useIssues(EIssuesStoreType.GLOBAL);

  const issueIds = (groupedIssueIds?.[ALL_ISSUES] as string[] | undefined) ?? [];
  const hasMore = !!getPaginationData(ALL_ISSUES, undefined)?.nextPageResults;
  const loader = getIssueLoader();

  useEffect(() => {
    if (hasMore && loader !== "init-loader" && loader !== "pagination") fetchNextPages();
  }, [hasMore, loader, issueIds.length, fetchNextPages]);

  if (!groupedIssueIds) return <PlanLayoutLoader />;

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.PLAN}>
      <PlanBoard
        workspaceSlug={workspaceSlug}
        issueIds={issueIds}
        issueMap={issueMap}
        areaBy="project"
        isLoadingMore={hasMore}
      />
    </IssueLayoutHOC>
  );
});
