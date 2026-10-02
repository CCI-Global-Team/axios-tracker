/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarDays, Pencil, X } from "lucide-react";
// plane imports
import type { TReleaseUndoResponse } from "@plane/types";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { CreateUpdateReleaseModal } from "./create-release-modal";
import { browseUrl, isReleaseOpen } from "./helpers";
import { ReleaseActions } from "./release-actions";
import { ReleaseChecklist } from "./release-checklist";
import { ReleaseItems } from "./release-items";
import { ReleaseNotes } from "./release-notes";
import { ReleaseStatusChip } from "./status-chip";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  canEdit: boolean;
};

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-subtle px-3 py-2">
      <div className="text-h4-medium text-primary">{value}</div>
      <div className="text-body-xs-regular text-secondary">{label}</div>
      {hint && <div className="text-caption-sm-regular text-tertiary">{hint}</div>}
    </div>
  );
}

export const ReleaseDetail = observer(function ReleaseDetail(props: Props) {
  const { workspaceSlug, projectId, releaseId, canEdit } = props;
  // states
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [undo, setUndo] = useState<{ result: TReleaseUndoResponse; action: "reopen" | "roll_back" } | null>(null);
  // store hooks
  const { fetchReleaseDetails, fetchReleaseIssues, getReleaseById, getReleaseIssues } = useRelease();
  const { getUserDetails } = useMember();
  // fetching
  const { error } = useSWR(`RELEASE_DETAILS_${releaseId}`, () =>
    fetchReleaseDetails(workspaceSlug, projectId, releaseId)
  );
  useSWR(`RELEASE_ISSUES_${releaseId}`, () => fetchReleaseIssues(workspaceSlug, projectId, releaseId));
  // derived values
  const release = getReleaseById(releaseId);
  const items = getReleaseIssues(releaseId) ?? [];

  if (error && !release)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
        <h3 className="text-h5-medium text-primary">Release not found</h3>
        <p className="text-body-sm-regular text-tertiary">It may have been deleted.</p>
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/releases`}
          className="text-body-sm-medium text-accent-primary"
        >
          View all releases
        </Link>
      </div>
    );

  if (!release)
    return (
      <Loader className="space-y-3 p-4">
        <Loader.Item height="64px" />
        <Loader.Item height="80px" />
        <Loader.Item height="240px" />
      </Loader>
    );

  const isOpen = isReleaseOpen(release.status);
  const owner = release.owned_by ? getUserDetails(release.owned_by) : undefined;
  const total = items.length || (release.total_items ?? 0);
  const shipped = items.length ? items.filter((item) => !!item.shipped_at).length : (release.shipped_items ?? 0);
  const unplanned = items.length ? items.filter((item) => item.is_unplanned).length : (release.unplanned_items ?? 0);

  return (
    <div className="vertical-scrollbar scrollbar-md h-full w-full overflow-x-hidden overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6">
        {/* header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h4-medium break-words text-primary">{release.name}</h2>
              {release.version && <span className="text-body-sm-regular text-tertiary">{release.version}</span>}
              <ReleaseStatusChip status={release.status} />
              {canEdit && (
                <button
                  type="button"
                  aria-label="Edit release details"
                  onClick={() => setIsEditOpen(true)}
                  className="grid size-11 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-secondary sm:size-7"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs-regular text-secondary">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5 text-tertiary" />
                {release.target_date ? `Target ${renderFormattedDate(release.target_date)}` : "No target date"}
              </span>
              {release.released_at && <span>Released {renderFormattedDate(release.released_at)}</span>}
              <span className="flex items-center gap-1.5">
                {release.owned_by ? (
                  <>
                    <ButtonAvatars showTooltip={false} userIds={release.owned_by} />
                    {owner?.display_name ?? "Owner"}
                  </>
                ) : (
                  <span className="text-placeholder">No owner</span>
                )}
              </span>
            </div>
          </div>
          {canEdit && (
            <ReleaseActions
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              release={release}
              items={items}
              onUndo={(result, action) => setUndo({ result, action })}
            />
          )}
        </div>

        {/* items an undo could not move back, because someone had already moved them on */}
        {undo && undo.result.left_alone?.length > 0 && (
          <div className="rounded-md border border-subtle bg-layer-1 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-body-xs-medium text-primary">
                {undo.action === "reopen" ? "Reopen" : "Roll back"} left {undo.result.left_alone.length} work item
                {undo.result.left_alone.length === 1 ? " alone, because it had" : "s alone, because they had"} already
                moved on from Released:
              </p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setUndo(null)}
                className="grid size-11 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover sm:size-6"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <ul className="mt-1 space-y-0.5">
              {undo.result.left_alone.map((entry) => (
                <li key={entry.issue_id} className="text-body-xs-regular text-secondary">
                  <Link href={browseUrl(workspaceSlug, entry.key)} className="text-accent-primary hover:underline">
                    {entry.key}
                  </Link>
                  {entry.state ? ` is in ${entry.state}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* readiness */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Work items" value={total} />
          <Stat label="Ready" value={release.ready_items ?? 0} hint="Ready for Test or later" />
          <Stat label="Shipped" value={shipped} hint="Reached production" />
          <Stat label="Unplanned" value={unplanned} hint="Shipped without being planned" />
        </div>

        <ReleaseItems
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          releaseId={release.id}
          items={items}
          isOpen={isOpen}
          canEdit={canEdit}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReleaseNotes
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            release={release}
            items={items}
            canEdit={canEdit}
          />
          <ReleaseChecklist workspaceSlug={workspaceSlug} projectId={projectId} release={release} canEdit={canEdit} />
        </div>
      </div>
      <CreateUpdateReleaseModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        data={release}
      />
    </div>
  );
});
