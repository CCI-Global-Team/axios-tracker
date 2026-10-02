/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400) — read-only "Release" row in the work item sidebar and peek view.
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { Rocket } from "lucide-react";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { ReleaseStatusChip } from "./status-chip";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

export const IssueReleaseRow = observer(function IssueReleaseRow(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { fetchIssueRelease, getIssueRelease } = useRelease();

  useSWR(
    workspaceSlug && projectId && issueId ? `ISSUE_RELEASE_${issueId}` : null,
    () => fetchIssueRelease(workspaceSlug, projectId, issueId),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const release = getIssueRelease(issueId);

  return (
    <SidebarPropertyListItem icon={Rocket} label="Release">
      {release ? (
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/releases/${release.id}`}
          className="flex h-7.5 min-w-0 items-center gap-2 rounded-sm px-2 text-body-xs-regular text-primary hover:bg-layer-transparent-hover"
        >
          <span className="truncate">
            {release.name}
            {release.version ? ` ${release.version}` : ""}
          </span>
          {release.status && <ReleaseStatusChip status={release.status} />}
        </Link>
      ) : (
        <span className="flex h-7.5 items-center px-2 text-body-xs-regular text-placeholder">None</span>
      )}
    </SidebarPropertyListItem>
  );
});
