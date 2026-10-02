/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400) — history rows for adding a work item to a release or removing it.
import { observer } from "mobx-react";
import { Rocket } from "lucide-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent } from "./";

type TIssueReleaseActivity = { activityId: string; ends: "top" | "bottom" | undefined };

export const IssueReleaseActivity = observer(function IssueReleaseActivity(props: TIssueReleaseActivity) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const added = activity.verb === "created";
  const releaseId = added ? activity.new_identifier : activity.old_identifier;
  return (
    <IssueActivityBlockComponent
      icon={<Rocket className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
    >
      <>
        <span>{added ? "added this work item to the release " : "removed the work item from the release "}</span>
        <a
          href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/releases/${releaseId}`}
          className="inline-flex items-center gap-1 truncate font-medium text-primary hover:underline"
        >
          <span className="truncate">{added ? activity.new_value : activity.old_value}</span>
        </a>
      </>
    </IssueActivityBlockComponent>
  );
});
