/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: public share links (GAM-401) — history rows for creating or revoking a work item's public link.
// The link itself is never shown here: guests can read history but must not pick up a live link.
import { observer } from "mobx-react";
import { Globe } from "lucide-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { IssueActivityBlockComponent } from "./";

type TIssuePublicLinkActivity = { activityId: string; ends: "top" | "bottom" | undefined };

export const IssuePublicLinkActivity = observer(function IssuePublicLinkActivity(props: TIssuePublicLinkActivity) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  const created = activity.verb === "created";
  return (
    <IssueActivityBlockComponent
      icon={<Globe className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
    >
      <span>
        {created ? `created a public link${activity.new_value ? " (with description)" : ""}` : "revoked a public link"}
      </span>
    </IssueActivityBlockComponent>
  );
});
