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
  const slug = workspaceSlug?.toString();
  const grants = usePendingGrants(slug, projectId, target);
  const { allowPermissions } = useUserPermissions();
  const canCancel =
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE) ||
    (!!projectId && allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, slug, projectId));
  const [cancelling, setCancelling] = useState<string | null>(null);

  if (!grants.length) return <>{fallback}</>;

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

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {grants.map((grant) => (
        <Tooltip key={grant.id} tooltipContent="Invitation sent. This is set for them automatically when they accept.">
          <span
            data-testid="pending-grant"
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-strong px-2 py-0.5 text-11 text-secondary",
              cancelling === grant.id && "opacity-60"
            )}
          >
            <Clock className="size-3 flex-shrink-0 text-tertiary" />
            <span className="truncate">{grant.email}</span>
            <span className="flex-shrink-0 text-tertiary">· invite pending</span>
            {canCancel && (
              <button
                type="button"
                aria-label={`Cancel pending role for ${grant.email}`}
                disabled={cancelling === grant.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void cancel(grant);
                }}
                className="-mr-1 flex-shrink-0 rounded-full p-0.5 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        </Tooltip>
      ))}
    </div>
  );
});
