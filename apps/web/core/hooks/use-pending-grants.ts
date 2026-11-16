/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate } from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import type { TPendingGrant, TPendingGrantTarget } from "@/services/pending-grant.service";
import { PendingGrantService } from "@/services/pending-grant.service";

export const pendingGrantService = new PendingGrantService();

const swrKey = (workspaceSlug: string, projectId: string) => `PENDING_GRANTS_${workspaceSlug}_${projectId}`;

/** CCI: refetch a project's pending grants after one is created or cancelled. */
export const revalidatePendingGrants = (workspaceSlug: string, projectId: string) =>
  mutate(swrKey(workspaceSlug, projectId));

/**
 * CCI: the roles waiting on an invitation in this project, optionally narrowed to one field.
 * Only fetched for fields that can have one, and only by people the API lets read them
 * (workspace admins and the project's members), so guests never ask.
 */
export const usePendingGrants = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  target?: TPendingGrantTarget
): TPendingGrant[] => {
  const { allowPermissions } = useUserPermissions();
  const canRead =
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE) ||
    (!!workspaceSlug &&
      !!projectId &&
      allowPermissions(
        [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        EUserPermissionsLevel.PROJECT,
        workspaceSlug,
        projectId
      ));
  const { data } = useSWR(
    workspaceSlug && projectId && target && canRead ? swrKey(workspaceSlug, projectId) : null,
    workspaceSlug && projectId ? () => pendingGrantService.list(workspaceSlug, projectId) : null
  );
  if (!data || !target) return [];
  return data.filter(
    (grant) => grant.kind === target.kind && (target.targetId ? grant.target_id === target.targetId : true)
  );
};
