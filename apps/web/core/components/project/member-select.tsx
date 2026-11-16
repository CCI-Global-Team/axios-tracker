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
import { PendingGrantCancel, PendingGrantLabel } from "@/components/dropdowns/member/pending-grants";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { revalidatePendingGrants, usePendingGrants } from "@/hooks/use-pending-grants";
import type { TPendingGrantTarget } from "@/services/pending-grant.service";

type Props = {
  /** A member id; project fields are typed as either the id or the expanded user. */
  value: string | { id: string } | null | undefined;
  /** Receives a member id, or "none" when cleared. Return the save so pending invites refresh after it. */
  onChange: (val: string) => void | Promise<unknown>;
  isDisabled?: boolean;
  /** CCI: the field this sets. Someone invited from the picker shows as pending until they accept. */
  pendingGrant?: TPendingGrantTarget;
};

/**
 * One project member (never a guest) for a project setting such as Lead or Default assignee.
 * CCI: built on the shared member picker, so it searches name, username and email and can add
 * or invite someone who is missing, like every other member picker.
 */
export const MemberSelect = observer(function MemberSelect(props: Props) {
  const { value, onChange, isDisabled = false, pendingGrant } = props;
  const { workspaceSlug, projectId } = useParams();
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();

  const memberIds = projectId ? (getProjectMemberIds(projectId.toString(), false) ?? []) : [];
  const valueId = typeof value === "string" ? value : value?.id;
  const selectedId = valueId && memberIds.includes(valueId) ? valueId : null;
  const selected = selectedId ? getUserDetails(selectedId) : undefined;
  // CCI: an empty field can be waiting on someone invited from this picker.
  const pending = usePendingGrants(workspaceSlug?.toString(), projectId?.toString(), pendingGrant)[0];
  const shownPending = selected ? undefined : pending;

  // Choosing someone for the field replaces whoever it was waiting on; the server cancels that
  // pending role, so refetch once the save has landed.
  const handleChange = async (val: string | null) => {
    await onChange(val ?? "none");
    if (pendingGrant && workspaceSlug && projectId)
      void revalidatePendingGrants(workspaceSlug.toString(), projectId.toString());
  };

  const dropdown = (
    <MemberDropdown
      multiple={false}
      value={selectedId}
      onChange={(val) => void handleChange(val)}
      pendingGrant={pendingGrant}
      memberIds={memberIds}
      projectId={projectId?.toString()}
      clearLabel="None"
      disabled={isDisabled}
      buttonVariant="border-with-text"
      button={
        <div
          className={cn(
            "flex max-w-80 min-w-0 items-center gap-2 rounded-sm border border-subtle bg-surface-1 px-3 py-2 text-13",
            isDisabled ? "cursor-not-allowed" : "hover:bg-layer-transparent-hover"
          )}
        >
          {selected ? (
            <>
              <Avatar name={getMemberName(selected)} src={getFileURL(selected.avatar_url)} />
              <span className="truncate text-primary">{getMemberName(selected)}</span>
            </>
          ) : shownPending ? (
            <PendingGrantLabel grant={shownPending} />
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

  if (!shownPending || isDisabled) return dropdown;
  return (
    <div className="flex min-w-0 items-center gap-1">
      {dropdown}
      <PendingGrantCancel grant={shownPending} projectId={projectId?.toString()} />
    </div>
  );
});
