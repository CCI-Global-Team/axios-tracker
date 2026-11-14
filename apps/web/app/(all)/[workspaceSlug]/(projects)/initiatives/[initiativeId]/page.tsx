/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "react-router";
import { PageHead } from "@/components/core/page-title";
import { InitiativeDetail } from "@/components/initiatives/detail";
import { useInitiative } from "@/hooks/store/use-initiative";

function WorkspaceInitiativePage() {
  const { workspaceSlug, initiativeId } = useParams();
  const { getInitiativeById } = useInitiative();
  const name = initiativeId ? getInitiativeById(initiativeId)?.name : undefined;
  return (
    <>
      <PageHead title={name ? `${name} - Initiatives` : "Initiatives"} />
      {workspaceSlug && initiativeId && (
        <InitiativeDetail
          key={`${workspaceSlug}/${initiativeId}`}
          workspaceSlug={workspaceSlug}
          initiativeId={initiativeId}
        />
      )}
    </>
  );
}

export default observer(WorkspaceInitiativePage);
