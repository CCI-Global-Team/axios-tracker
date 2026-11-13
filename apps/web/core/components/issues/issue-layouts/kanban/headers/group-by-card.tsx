/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// lucide icons
import { Minimize2, Maximize2, Circle } from "lucide-react";
import { PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssue, ISearchIssueResponse, TIssueKanbanFilters, TIssueGroupByOptions } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
// constants
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { CreateUpdateEpicModal } from "@/components/epic-modal";

interface IHeaderGroupByCard {
  sub_group_by: TIssueGroupByOptions | undefined;
  group_by: TIssueGroupByOptions | undefined;
  column_id: string;
  icon?: React.ReactNode;
  /** CCI: the group's colour (a state's), tinting the header. */
  color?: string;
  title: string;
  count: number;
  collapsedGroups: TIssueKanbanFilters;
  handleCollapsedGroups: (toggle: "group_by" | "sub_group_by", value: string) => void;
  issuePayload: Partial<TIssue>;
  disableIssueCreation?: boolean;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  isEpic?: boolean;
}

export const HeaderGroupByCard = observer(function HeaderGroupByCard(props: IHeaderGroupByCard) {
  const {
    sub_group_by,
    column_id,
    icon,
    color,
    title,
    count,
    collapsedGroups,
    handleCollapsedGroups,
    issuePayload,
    disableIssueCreation,
    addIssuesToView,
    isEpic = false,
  } = props;
  const verticalAlignPosition = sub_group_by ? false : collapsedGroups?.group_by.includes(column_id);
  // states
  const [isOpen, setIsOpen] = React.useState(false);
  const [openExistingIssueListModal, setOpenExistingIssueListModal] = React.useState(false);
  // hooks
  const storeType = useIssueStoreType();
  // router
  const { workspaceSlug, projectId, moduleId, cycleId } = useParams();

  const renderExistingIssueModal = moduleId || cycleId;
  const ExistingIssuesListModalPayload = moduleId ? { module: moduleId.toString() } : { cycle: true };

  const handleAddIssuesToView = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId) return;

    const issues = data.map((i) => i.id);

    try {
      await addIssuesToView?.(issues);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Work items added to the cycle successfully.",
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Selected work items could not be added to the cycle. Please try again.",
      });
    }
  };

  return (
    <>
      {isEpic ? (
        <CreateUpdateEpicModal isOpen={isOpen} onClose={() => setIsOpen(false)} data={issuePayload} />
      ) : (
        <CreateUpdateIssueModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          data={issuePayload}
          storeType={storeType}
        />
      )}

      {renderExistingIssueModal && (
        <ExistingIssuesListModal
          workspaceSlug={workspaceSlug?.toString()}
          projectId={projectId?.toString()}
          isOpen={openExistingIssueListModal}
          handleClose={() => setOpenExistingIssueListModal(false)}
          searchParams={ExistingIssuesListModalPayload}
          handleOnSubmit={handleAddIssuesToView}
        />
      )}
      {/* CCI: a horizontal header is a 36px band tinted with the state's colour, like the List's group headers. */}
      <div
        className={`relative flex flex-shrink-0 gap-1 ${
          verticalAlignPosition
            ? `w-[44px] flex-col items-center py-1.5`
            : `h-9 w-full flex-row items-center rounded-md px-2.5 ${color ? "" : "bg-layer-1"}`
        }`}
        style={
          !verticalAlignPosition && color
            ? { backgroundColor: `color-mix(in srgb, ${color} 10%, var(--bg-surface-1))` }
            : undefined
        }
      >
        <div className="flex size-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-xs">
          {icon ? icon : <Circle width={14} strokeWidth={2} />}
        </div>

        <div
          className={`relative flex gap-1 ${
            verticalAlignPosition ? `flex-col items-center` : `w-full flex-row items-baseline overflow-hidden`
          }`}
        >
          <div
            className={`line-clamp-1 inline-block truncate overflow-hidden text-13 font-semibold text-primary ${
              verticalAlignPosition ? `max-h-[400px] vertical-lr` : ``
            }`}
          >
            {title}
          </div>
          <div
            className={`flex-shrink-0 text-12 font-medium text-tertiary tabular-nums ${verticalAlignPosition ? `pr-0.5` : `pl-1.5`}`}
          >
            {count || 0}
          </div>
        </div>

        {sub_group_by === null && (
          <button
            type="button"
            aria-label={verticalAlignPosition ? `Expand ${title}` : `Collapse ${title}`}
            className={`flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-layer-transparent text-tertiary transition-[opacity,background-color] duration-150 hover:bg-layer-transparent-hover ${verticalAlignPosition ? "" : "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"}`}
            onClick={() => handleCollapsedGroups("group_by", column_id)}
          >
            {verticalAlignPosition ? (
              <Maximize2 width={14} strokeWidth={2} />
            ) : (
              <Minimize2 width={14} strokeWidth={2} />
            )}
          </button>
        )}

        {!disableIssueCreation &&
          (renderExistingIssueModal ? (
            <CustomMenu
              customButton={
                <span
                  aria-label={`New work item in ${title}`}
                  className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-layer-transparent text-tertiary transition-[opacity,background-color] duration-150 hover:bg-layer-transparent-hover lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  <PlusIcon height={14} width={14} strokeWidth={2} />
                </span>
              }
              placement="bottom-end"
            >
              <CustomMenu.MenuItem
                onClick={() => {
                  setIsOpen(true);
                }}
              >
                <span className="flex items-center justify-start gap-2">Create work item</span>
              </CustomMenu.MenuItem>
              <CustomMenu.MenuItem
                onClick={() => {
                  setOpenExistingIssueListModal(true);
                }}
              >
                <span className="flex items-center justify-start gap-2">Add an existing work item</span>
              </CustomMenu.MenuItem>
            </CustomMenu>
          ) : (
            <button
              type="button"
              aria-label={`New work item in ${title}`}
              className="flex h-[20px] w-[20px] flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm bg-layer-transparent text-tertiary transition-[opacity,background-color] duration-150 hover:bg-layer-transparent-hover lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
              onClick={() => {
                setIsOpen(true);
              }}
            >
              <PlusIcon width={14} strokeWidth={2} />
            </button>
          ))}
      </div>
    </>
  );
});
