/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useParams } from "react-router";
import { Target } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Breadcrumbs, Header } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { CountChip } from "@/components/common/count-chip";
import { CreateUpdateInitiativeModal } from "@/components/initiatives/create-modal";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useUserPermissions } from "@/hooks/store/user";

export const InitiativesHeader = observer(function InitiativesHeader() {
  const { workspaceSlug, initiativeId } = useParams();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { getInitiativeById, initiativeIdsForWorkspace } = useInitiative();
  const { allowPermissions } = useUserPermissions();
  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  const initiative = initiativeId ? getInitiativeById(initiativeId) : undefined;
  const count = initiativeIdsForWorkspace.length;

  return (
    <Header>
      <Header.LeftItem>
        <div className="flex items-center gap-2.5">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="Initiatives"
                  href={initiativeId ? `/${workspaceSlug}/initiatives` : undefined}
                  icon={<Target className="size-4 text-tertiary" />}
                />
              }
            />
            {initiativeId && <Breadcrumbs.Item component={<BreadcrumbLink label={initiative?.name ?? "…"} isLast />} />}
          </Breadcrumbs>
          {!initiativeId && count > 0 && <CountChip count={count} />}
        </div>
      </Header.LeftItem>
      {!initiativeId && canEdit && workspaceSlug && (
        <Header.RightItem>
          <Button variant="primary" size="lg" onClick={() => setCreating(true)}>
            New initiative
          </Button>
          <CreateUpdateInitiativeModal
            isOpen={creating}
            onClose={() => setCreating(false)}
            workspaceSlug={workspaceSlug}
            onCreated={(i) => void navigate(`/${workspaceSlug}/initiatives/${i.id}`)}
          />
        </Header.RightItem>
      )}
    </Header>
  );
});
