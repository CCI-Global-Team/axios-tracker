/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { PageHead } from "@/components/core/page-title";
import { ReleaseDetail } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function ProjectReleasePage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, releaseId } = params;
  // store hooks
  const { getProjectById } = useProject();
  const { getReleaseById } = useRelease();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const project = getProjectById(projectId);
  const release = getReleaseById(releaseId);
  const pageTitle = project?.name && release?.name ? `${project.name} - ${release.name}` : undefined;
  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);

  return (
    <>
      <PageHead title={pageTitle} />
      <ReleaseDetail workspaceSlug={workspaceSlug} projectId={projectId} releaseId={releaseId} canEdit={canEdit} />
    </>
  );
}

export default observer(ProjectReleasePage);
