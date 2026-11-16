/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Ban } from "lucide-react";
import { ChevronDownIcon } from "@plane/propel/icons";
// plane ui
import { Avatar } from "@plane/ui";
// helpers
import { cn, getFileURL, getMemberName } from "@plane/utils";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";

type Props = {
  /** A member id; project fields are typed as either the id or the expanded user. */
  value: string | { id: string } | null | undefined;
  /** Receives a member id, or "none" when cleared. */
  onChange: (val: string) => void;
  isDisabled?: boolean;
};

/**
 * One project member (never a guest) for a project setting such as Lead or Default assignee.
 * CCI: built on the shared member picker, so it searches name, username and email and can add
 * or invite someone who is missing, like every other member picker.
 */
export const MemberSelect = observer(function MemberSelect(props: Props) {
  const { value, onChange, isDisabled = false } = props;
  const { projectId } = useParams();
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();

  const memberIds = projectId ? (getProjectMemberIds(projectId.toString(), false) ?? []) : [];
  const valueId = typeof value === "string" ? value : value?.id;
  const selectedId = valueId && memberIds.includes(valueId) ? valueId : null;
  const selected = selectedId ? getUserDetails(selectedId) : undefined;

  return (
    <MemberDropdown
      multiple={false}
      value={selectedId}
      onChange={(val) => onChange(val ?? "none")}
      memberIds={memberIds}
      projectId={projectId?.toString()}
      clearLabel="None"
      disabled={isDisabled}
      buttonVariant="border-with-text"
      button={
        <div
          className={cn(
            "flex items-center gap-2 rounded-sm border border-subtle bg-surface-1 px-3 py-2 text-13",
            isDisabled ? "cursor-not-allowed" : "hover:bg-layer-transparent-hover"
          )}
        >
          {selected ? (
            <>
              <Avatar name={getMemberName(selected)} src={getFileURL(selected.avatar_url)} />
              <span className="truncate text-primary">{getMemberName(selected)}</span>
            </>
          ) : (
            <>
              <Ban className="size-3.5 rotate-90 text-placeholder" />
              <span className="text-placeholder">None</span>
            </>
          )}
          <ChevronDownIcon className="size-3 flex-shrink-0 text-tertiary" />
        </div>
      }
    />
  );
});
