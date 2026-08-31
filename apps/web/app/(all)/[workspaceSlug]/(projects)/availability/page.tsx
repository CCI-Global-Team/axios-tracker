/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "react-router";
// components
import { AvailabilityRoster } from "@/components/availability/roster";
import { PageHead } from "@/components/core/page-title";

export default function WorkspaceAvailabilityPage() {
  const { workspaceSlug } = useParams();

  return (
    <>
      <PageHead title="Availability" />
      <div className="relative h-full w-full overflow-hidden">
        <AvailabilityRoster workspaceSlug={workspaceSlug?.toString() ?? ""} />
      </div>
    </>
  );
}
