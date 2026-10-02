/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarDays, Rocket } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// hooks
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { ReleaseStatusChip } from "./status-chip";

type Props = {
  workspaceSlug: string;
  projectId: string;
  canEdit: boolean;
  onCreate: () => void;
};

const ReleaseListRow = observer(function ReleaseListRow(props: {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
}) {
  const { workspaceSlug, projectId, releaseId } = props;
  const { getReleaseById } = useRelease();
  const release = getReleaseById(releaseId);
  if (!release) return null;

  const total = release.total_items ?? 0;
  const shipped = release.shipped_items ?? 0;
  const ready = release.ready_items ?? 0;

  return (
    <Link
      href={`/${workspaceSlug}/projects/${projectId}/releases/${release.id}`}
      className="flex min-h-11 flex-col gap-2 border-b border-subtle px-4 py-3 hover:bg-layer-transparent-hover sm:flex-row sm:items-center sm:gap-4 sm:px-6"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Rocket className="size-4 shrink-0 text-tertiary" />
        <span className="truncate text-body-sm-medium text-primary">{release.name}</span>
        {release.version && <span className="shrink-0 text-body-xs-regular text-tertiary">{release.version}</span>}
        <ReleaseStatusChip status={release.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-body-xs-regular text-secondary sm:pl-0">
        <span>
          Shipped {shipped} / {total}
        </span>
        <span>{ready} ready</span>
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3.5 text-tertiary" />
          {release.target_date ? renderFormattedDate(release.target_date) : "No target date"}
        </span>
        {release.owned_by && <ButtonAvatars showTooltip userIds={release.owned_by} />}
      </div>
    </Link>
  );
});

export const ReleasesList = observer(function ReleasesList(props: Props) {
  const { workspaceSlug, projectId, canEdit, onCreate } = props;
  const { fetchReleases, getProjectReleaseIds } = useRelease();

  const { isLoading } = useSWR(`PROJECT_RELEASES_${projectId}`, () => fetchReleases(workspaceSlug, projectId), {
    revalidateOnFocus: false,
  });
  const releaseIds = getProjectReleaseIds(projectId);

  if (!releaseIds && isLoading)
    return (
      <Loader className="space-y-2 p-4">
        <Loader.Item height="56px" />
        <Loader.Item height="56px" />
        <Loader.Item height="56px" />
      </Loader>
    );

  if (!releaseIds || releaseIds.length === 0)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
        <Rocket className="size-10 text-placeholder" />
        <h3 className="text-h5-medium text-primary">No releases yet</h3>
        <p className="max-w-md text-body-sm-regular text-tertiary">
          A release groups the work items that go to production together. Items move to Released as their code reaches
          the production branch, and the release closes itself once everything in it has shipped.
        </p>
        {canEdit && (
          <Button variant="primary" size="xl" className="min-h-11 sm:min-h-0" onClick={onCreate}>
            New release
          </Button>
        )}
      </div>
    );

  return (
    <div className="vertical-scrollbar scrollbar-md h-full w-full overflow-y-auto">
      {releaseIds.map((releaseId) => (
        <ReleaseListRow key={releaseId} workspaceSlug={workspaceSlug} projectId={projectId} releaseId={releaseId} />
      ))}
    </div>
  );
});
