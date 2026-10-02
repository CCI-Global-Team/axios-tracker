/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TReleaseIssue } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// hooks
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { AddReleaseItemsModal } from "./add-items-modal";
import { browseUrl, describeShippedVia, releaseIssueKey } from "./helpers";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  items: TReleaseIssue[];
  isOpen: boolean;
  canEdit: boolean;
};

// key | title | state | assignees | shipped | remove
const GRID = "sm:grid sm:grid-cols-[6rem_minmax(0,1fr)_9rem_5rem_7rem_2.75rem] sm:items-center sm:gap-3";

const ReleaseItemRow = observer(function ReleaseItemRow(props: {
  workspaceSlug: string;
  item: TReleaseIssue;
  canRemove: boolean;
  onRemove: (item: TReleaseIssue) => void;
}) {
  const { workspaceSlug, item, canRemove, onRemove } = props;
  const key = releaseIssueKey(item);

  return (
    <div className={`relative flex flex-col gap-1.5 border-b border-subtle px-3 py-2.5 last:border-b-0 ${GRID}`}>
      <div className="flex items-center gap-2 pr-12 sm:contents">
        <Link
          href={browseUrl(workspaceSlug, key)}
          className="shrink-0 text-body-xs-medium text-accent-primary hover:underline"
        >
          {key}
        </Link>
        <Link
          href={browseUrl(workspaceSlug, key)}
          className="min-w-0 flex-1 truncate text-body-xs-regular text-primary hover:underline"
        >
          {item.name}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:contents">
        <span className="flex min-w-0 items-center gap-1.5 text-body-xs-regular text-secondary">
          {item.state ? (
            <>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.state.color }} />
              <span className="truncate">{item.state.name}</span>
            </>
          ) : (
            <span className="text-placeholder">No state</span>
          )}
        </span>
        <span className="flex items-center">
          {item.assignee_ids?.length > 0 ? (
            <ButtonAvatars showTooltip userIds={item.assignee_ids} />
          ) : (
            <span className="text-body-xs-regular text-placeholder sm:hidden">Unassigned</span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {item.shipped_at ? (
            <Tooltip
              tooltipContent={`Shipped ${renderFormattedDate(item.shipped_at)}${
                item.shipped_via ? ` via ${describeShippedVia(item.shipped_via)}` : ""
              }`}
            >
              <span className="inline-flex h-5 items-center rounded-sm bg-success-subtle px-1.5 text-caption-md-medium text-success-primary">
                Shipped
              </span>
            </Tooltip>
          ) : (
            <span className="inline-flex h-5 items-center rounded-sm bg-layer-2 px-1.5 text-caption-md-medium text-tertiary">
              Not shipped
            </span>
          )}
          {item.is_unplanned && (
            <Tooltip tooltipContent="Shipped to production without being planned into a release">
              <span className="inline-flex h-5 items-center rounded-sm bg-warning-subtle px-1.5 text-caption-md-medium text-warning-primary">
                Unplanned
              </span>
            </Tooltip>
          )}
        </span>
      </div>
      <span className="absolute top-1 right-1 sm:static">
        {canRemove && (
          <Tooltip tooltipContent="Remove from release">
            <button
              type="button"
              aria-label={`Remove ${key} from the release`}
              onClick={() => onRemove(item)}
              className="grid size-11 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-danger-primary sm:size-7"
            >
              <X className="size-4" />
            </button>
          </Tooltip>
        )}
      </span>
    </div>
  );
});

export const ReleaseItems = observer(function ReleaseItems(props: Props) {
  const { workspaceSlug, projectId, releaseId, items, isOpen, canEdit } = props;
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { removeReleaseIssue } = useRelease();
  const canChange = isOpen && canEdit;

  const handleRemove = async (item: TReleaseIssue) => {
    try {
      await removeReleaseIssue(workspaceSlug, projectId, releaseId, item.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Removed",
        message: `${releaseIssueKey(item)} is no longer in this release.`,
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "The item could not be removed." });
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-body-sm-medium text-primary">Work items</h4>
        {canChange && (
          <Button
            variant="secondary"
            size="lg"
            className="min-h-11 sm:min-h-0"
            prependIcon={<Plus />}
            onClick={() => setIsAddOpen(true)}
          >
            Add work items
          </Button>
        )}
      </div>
      <div className="rounded-md border border-subtle">
        <div className={`hidden border-b border-subtle px-3 py-2 text-caption-md-medium text-tertiary ${GRID}`}>
          <span>Key</span>
          <span>Title</span>
          <span>State</span>
          <span>Assignees</span>
          <span>Shipped</span>
          <span />
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-body-xs-regular text-tertiary">
            No work items yet.{canChange ? " Add the items that go to production together." : ""}
          </p>
        ) : (
          items.map((item) => (
            <ReleaseItemRow
              key={item.id}
              workspaceSlug={workspaceSlug}
              item={item}
              canRemove={canChange}
              onRemove={(value) => void handleRemove(value)}
            />
          ))
        )}
      </div>
      {canChange && (
        <AddReleaseItemsModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          releaseId={releaseId}
          existingIssueIds={items.map((item) => item.id)}
        />
      )}
    </section>
  );
});
