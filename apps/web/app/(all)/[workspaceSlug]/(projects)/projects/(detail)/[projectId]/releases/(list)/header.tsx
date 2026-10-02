/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Rocket } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
import { CreateUpdateReleaseModal } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";

export const ReleasesListHeader = observer(function ReleasesListHeader() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { loader, currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  // derived values
  const canCreate =
    allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT) &&
    currentProjectDetails?.release_view !== false;

  return (
    <Header>
      <Header.LeftItem>
        <div>
          <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
            <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Releases"
                  href={`/${workspaceSlug}/projects/${projectId}/releases/`}
                  icon={<Rocket className="h-4 w-4 text-tertiary" />}
                  isLast
                />
              }
              isLast
            />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
      <Header.RightItem>
        {canCreate && workspaceSlug && projectId && (
          <>
            <Button variant="primary" size="lg" onClick={() => setIsCreateOpen(true)}>
              <div className="block sm:hidden">New</div>
              <div className="hidden sm:block">New release</div>
            </Button>
            <CreateUpdateReleaseModal
              isOpen={isCreateOpen}
              onClose={() => setIsCreateOpen(false)}
              workspaceSlug={workspaceSlug.toString()}
              projectId={projectId.toString()}
              onCreated={(release) => router.push(`/${workspaceSlug}/projects/${projectId}/releases/${release.id}`)}
            />
          </>
        )}
      </Header.RightItem>
    </Header>
  );
});
