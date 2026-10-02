/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { PageHead } from "@/components/core/page-title";
import { CreateUpdateReleaseModal, ReleasesList } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ProjectReleasesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // router
  const router = useAppRouter();
  // store hooks
  const { getProjectById, currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - Releases` : undefined;
  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);

  if (currentProjectDetails?.release_view === false)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
        <h3 className="text-h5-medium text-primary">Releases are turned off for this project</h3>
        <p className="text-body-sm-regular text-tertiary">A project admin can turn them on in the project features.</p>
      </div>
    );

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full w-full flex-col">
        <ReleasesList
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          canEdit={canEdit}
          onCreate={() => setIsCreateOpen(true)}
        />
      </div>
      <CreateUpdateReleaseModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onCreated={(release) => router.push(`/${workspaceSlug}/projects/${projectId}/releases/${release.id}`)}
      />
    </>
  );
}

export default observer(ProjectReleasesPage);
