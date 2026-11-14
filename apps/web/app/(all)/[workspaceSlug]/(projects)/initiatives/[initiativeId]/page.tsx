/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "react-router";
import { PageHead } from "@/components/core/page-title";
import { InitiativeDetail } from "@/components/initiatives/detail";

export default function WorkspaceInitiativePage() {
  const { workspaceSlug, initiativeId } = useParams();
  return (
    <>
      <PageHead title="Initiative" />
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
