/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Clock, X } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { pendingGrantService, revalidatePendingGrants, usePendingGrants } from "@/hooks/use-pending-grants";
import type { TPendingGrant, TPendingGrantTarget } from "@/services/pending-grant.service";

const PENDING_TOOLTIP = "Invitation sent. This is set for them automatically when they accept.";

/** CCI: workspace admins and the project's admins can withdraw a pending role. */
const usePendingGrantCancel = (projectId: string | undefined) => {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { allowPermissions } = useUserPermissions();
  const canCancel =
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE) ||
    (!!projectId && allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, slug, projectId));
  const [cancelling, setCancelling] = useState<string | null>(null);

  const cancel = async (grant: TPendingGrant) => {
    if (!slug || !projectId) return;
    setCancelling(grant.id);
    try {
      await pendingGrantService.cancel(slug, grant.id);
      await revalidatePendingGrants(slug, projectId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Not cancelled", message: "Try again in a moment." });
    } finally {
      setCancelling(null);
    }
  };

  return { canCancel, cancel, cancelling };
};

type CancelProps = { grant: TPendingGrant; projectId: string | undefined; className?: string };

/** CCI: withdraws the pending role; the workspace invitation itself stays. */
export const PendingGrantCancel = observer(function PendingGrantCancel(props: CancelProps) {
  const { grant, projectId, className } = props;
  const { canCancel, cancel, cancelling } = usePendingGrantCancel(projectId);
  if (!canCancel) return null;
  return (
    <Tooltip tooltipContent="Cancel the pending role. The invitation stays.">
      <button
        type="button"
        aria-label={`Cancel pending role for ${grant.email}`}
        disabled={cancelling === grant.id}
        onClick={(e) => {
          e.stopPropagation();
          void cancel(grant);
        }}
        className={cn(
          "flex-shrink-0 rounded-full p-0.5 text-tertiary hover:bg-layer-transparent-hover hover:text-primary disabled:opacity-60",
          className
        )}
      >
        <X className="size-3" />
      </button>
    </Tooltip>
  );
});

/** CCI: what a single-person picker button shows while its field waits on an invitation. */
export function PendingGrantLabel(props: { grant: TPendingGrant }) {
  return (
    <Tooltip tooltipContent={PENDING_TOOLTIP}>
      <span data-testid="pending-grant" className="flex min-w-0 items-center gap-1.5">
        <Clock className="size-3.5 flex-shrink-0 text-tertiary" />
        <span className="truncate text-secondary">{props.grant.email}</span>
        <span className="flex-shrink-0 text-tertiary">· invite pending</span>
      </span>
    </Tooltip>
  );
}

type Props = {
  projectId: string | undefined;
  target: TPendingGrantTarget;
  className?: string;
  /** Shown when nothing is pending. */
  fallback?: ReactNode;
};

/**
 * CCI: who a field is waiting on. Someone invited from this field's picker shows here as
 * "email · invite pending" until they accept, when the server sets the field for them.
 */
export const PendingGrants = observer(function PendingGrants(props: Props) {
  const { projectId, target, className, fallback = null } = props;
  const { workspaceSlug } = useParams();
  const grants = usePendingGrants(workspaceSlug?.toString(), projectId, target);

  if (!grants.length) return <>{fallback}</>;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {grants.map((grant) => (
        <span
          key={grant.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-strong py-0.5 pr-1 pl-2 text-11"
        >
          <PendingGrantLabel grant={grant} />
          <PendingGrantCancel grant={grant} projectId={projectId} />
        </span>
      ))}
    </div>
  );
});
