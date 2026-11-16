/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { EUserPermissions } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { checkEmailValidity, cn, getMemberName } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { pendingGrantService, revalidatePendingGrants } from "@/hooks/use-pending-grants";
import type { TPendingGrantKind, TPendingGrantTarget } from "@/services/pending-grant.service";

type Props = {
  /** What the person typed into the search box; prefilled when it is an email. */
  query: string;
  /** The people the picker already offers. */
  memberIds: string[];
  projectId?: string;
  /** CCI: the field the picker sets; held as a pending role until the invite is accepted. */
  pendingGrant?: TPendingGrantTarget;
  /** Called once an invitation has been sent with a pending role, so the picker can close. */
  onInvited?: () => void;
  onSelect: (userId: string) => void;
};

const GRANT_DESCRIPTION: Record<TPendingGrantKind, string> = {
  project_member: "join this project",
  label_owner: "own this campus",
  project_default_assignee: "become the default assignee",
  project_lead: "become the project lead",
  issue_assignee: "be assigned to this work item",
};

const errorMessage = (error: unknown) =>
  (error as { error?: string; detail?: string } | undefined)?.error ??
  (error as { detail?: string } | undefined)?.detail ??
  "Try again in a moment.";

/**
 * CCI: invite someone who is not in the picker yet. A known workspace member is added to the
 * project and picked at once. Anyone else gets a workspace invitation; inside a project the
 * invitation also carries what the picker was for (at least project membership), which the
 * server grants when they accept, so nobody has to come back and pick them again. Only rendered
 * for workspace admins, who are the only ones allowed to invite.
 */
export const MemberInvite = observer(function MemberInvite(props: Props) {
  const { query, memberIds, projectId, pendingGrant, onInvited, onSelect } = props;
  const { workspaceSlug } = useParams();
  const {
    getUserDetails,
    project: { bulkAddMembersToProject },
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails, inviteMembersToWorkspace },
  } = useMember();
  const typed = query.trim();
  const typedEmail = checkEmailValidity(typed) ? typed : "";
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const invite = async (raw: string) => {
    const address = raw.trim().toLowerCase();
    if (!workspaceSlug || !checkEmailValidity(address)) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Enter a valid email address" });
      return;
    }
    const slug = workspaceSlug.toString();
    const existing = workspaceMemberIds?.find((id) => getUserDetails(id)?.email?.toLowerCase() === address);
    if (existing && !getWorkspaceMemberDetails(existing)?.is_active) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "This person is suspended",
        message: "Reactivate them in workspace settings first.",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      if (existing && !memberIds.includes(existing) && projectId) {
        await bulkAddMembersToProject(slug, projectId, {
          members: [{ member_id: existing, role: EUserPermissions.MEMBER }],
        });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: `${getMemberName(getUserDetails(existing))} added to the project`,
        });
      }
      if (existing) {
        onSelect(existing);
        return;
      }
      if (projectId) {
        const target = pendingGrant ?? { kind: "project_member" as const };
        await pendingGrantService.create(slug, {
          email: address,
          kind: target.kind,
          project_id: projectId,
          target_id: target.targetId ?? null,
        });
        await revalidatePendingGrants(slug, projectId);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Invitation sent",
          message: `${address} will ${GRANT_DESCRIPTION[target.kind]} when they accept.`,
        });
        setIsFormOpen(false);
        setEmail("");
        onInvited?.();
        return;
      }
      await inviteMembersToWorkspace(slug, { emails: [{ email: address, role: EUserPermissions.MEMBER }] });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Invitation sent",
        message: `${address} can be picked here once they accept.`,
      });
      setIsFormOpen(false);
      setEmail("");
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Invite not sent", message: errorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  // The picker's own keyboard handling (open, close, choose) sits on an ancestor; keys typed
  // into this field are for this field.
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      void invite(email);
    }
    if (e.key === "Escape") setIsFormOpen(false);
  };

  if (isFormOpen)
    return (
      <div className="flex items-center gap-1.5 px-1 pt-1.5">
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field is opened on purpose to type into
          autoFocus
          type="email"
          // The address of someone else, never the viewer's own saved ones.
          autoComplete="off"
          name="invite-email"
          data-1p-ignore
          data-lpignore="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="name@example.com"
          aria-label="Email to invite"
          className="h-7 min-w-0 flex-grow rounded-sm border border-subtle bg-surface-2 px-2 text-13 text-secondary placeholder:text-placeholder focus:border-accent-strong focus:outline-none"
        />
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void invite(email)}
          className="h-7 flex-shrink-0 rounded-sm bg-accent-primary px-2.5 text-13 font-medium text-on-color hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting ? "Inviting…" : "Invite"}
        </button>
      </div>
    );

  return (
    <button
      type="button"
      disabled={isSubmitting}
      onClick={() => {
        if (typedEmail) void invite(typedEmail);
        else {
          setEmail("");
          setIsFormOpen(true);
        }
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left text-13 text-secondary hover:bg-layer-transparent-hover",
        isSubmitting && "opacity-60"
      )}
    >
      <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-strong">
        <UserPlus className="size-3.5" />
      </span>
      <span className="truncate">{typedEmail ? `Invite ${typedEmail}` : "Invite someone by email"}</span>
    </button>
  );
});
