/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Rocket } from "lucide-react";
// plane imports
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CommonProjectBreadcrumbs } from "@/components/breadcrumbs/common";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";

export const ReleaseDetailHeader = observer(function ReleaseDetailHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId, releaseId } = useParams();
  // store hooks
  const { loader } = useProject();
  const { getReleaseById } = useRelease();
  // derived values
  const release = releaseId ? getReleaseById(releaseId.toString()) : undefined;

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
                />
              }
            />
            <Breadcrumbs.Item component={<BreadcrumbLink label={release?.name ?? "Release"} isLast />} isLast />
          </Breadcrumbs>
        </div>
      </Header.LeftItem>
    </Header>
  );
});
