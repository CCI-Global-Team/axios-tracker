/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR, { mutate } from "swr";
import type { TPendingGrant, TPendingGrantTarget } from "@/services/pending-grant.service";
import { PendingGrantService } from "@/services/pending-grant.service";

export const pendingGrantService = new PendingGrantService();

const swrKey = (workspaceSlug: string, projectId: string) => `PENDING_GRANTS_${workspaceSlug}_${projectId}`;

/** CCI: refetch a project's pending grants after one is created or cancelled. */
export const revalidatePendingGrants = (workspaceSlug: string, projectId: string) =>
  mutate(swrKey(workspaceSlug, projectId));

/**
 * CCI: the roles waiting on an invitation in this project, optionally narrowed to one field.
 * Only fetched for fields that can have one, so most screens never ask.
 */
export const usePendingGrants = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  target?: TPendingGrantTarget
): TPendingGrant[] => {
  const { data } = useSWR(
    workspaceSlug && projectId && target ? swrKey(workspaceSlug, projectId) : null,
    workspaceSlug && projectId ? () => pendingGrantService.list(workspaceSlug, projectId) : null
  );
  if (!data || !target) return [];
  return data.filter(
    (grant) => grant.kind === target.kind && (target.targetId ? grant.target_id === target.targetId : true)
  );
};
