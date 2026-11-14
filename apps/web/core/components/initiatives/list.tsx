/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { useInitiative } from "@/hooks/store/use-initiative";
import { CreateInitiativeModal } from "./create-modal";
import { initiativeErrorMessage } from "./error";
import { InitiativesHeader } from "./header";

export const InitiativesList = observer(function InitiativesList({ workspaceSlug }: { workspaceSlug: string }) {
  const [creating, setCreating] = useState(false);
  const { fetchInitiatives, initiativeIdsForWorkspace, getInitiativeById } = useInitiative();
  const { error, isLoading, mutate } = useSWR(workspaceSlug ? ["INITIATIVES", workspaceSlug] : null, () =>
    fetchInitiatives(workspaceSlug)
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-6 md:px-9">
      <div className="mx-auto max-w-4xl">
        <InitiativesHeader title="Initiatives">
          <Button onClick={() => setCreating(true)}>New initiative</Button>
        </InitiativesHeader>
        {error ? (
          <p role="alert">
            {initiativeErrorMessage(error, "Unable to load initiatives.")}{" "}
            <button onClick={() => void mutate()}>Retry</button>
          </p>
        ) : isLoading ? (
          <p>Loading initiatives…</p>
        ) : initiativeIdsForWorkspace.length === 0 ? (
          <p>No initiatives yet.</p>
        ) : (
          <ul className="divide-y divide-subtle">
            {initiativeIdsForWorkspace.map((id) => {
              const initiative = getInitiativeById(id);
              if (!initiative) return null;
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <Link className="font-medium underline" to={`/${workspaceSlug}/initiatives/${id}`}>
                    {initiative.name}
                  </Link>
                  <span>
                    {initiative.project_ids.length} projects · {initiative.completed_issues} of{" "}
                    {initiative.total_issues} done
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {creating && (
          <CreateInitiativeModal
            workspaceSlug={workspaceSlug}
            onClose={() => setCreating(false)}
            onCreated={() => void mutate()}
          />
        )}
      </div>
    </div>
  );
});
