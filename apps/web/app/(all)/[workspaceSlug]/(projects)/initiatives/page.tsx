/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "react-router";
import { PageHead } from "@/components/core/page-title";
import { InitiativesList } from "@/components/initiatives/list";

export default function WorkspaceInitiativesPage() {
  const { workspaceSlug } = useParams();
  return (
    <>
      <PageHead title="Initiatives" />
      {workspaceSlug && <InitiativesList workspaceSlug={workspaceSlug} />}
    </>
  );
}
