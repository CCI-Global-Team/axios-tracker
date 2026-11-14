/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
import { PlanBoard } from "@/components/issues/issue-layouts/plan/board";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { StoreContext } from "@/lib/store-context";
import { InitiativeService } from "@/services/initiative.service";
import { initiativeErrorMessage } from "./error";
import { InitiativesHeader } from "./header";
import { InitiativeModulePicker } from "./module-picker";

const service = new InitiativeService();
const noOp = () => {};

export const InitiativeDetail = observer(function InitiativeDetail({
  workspaceSlug,
  initiativeId,
}: {
  workspaceSlug: string;
  initiativeId: string;
}) {
  const rootStore = useContext(StoreContext);
  const { fetchInitiative, getInitiativeById, removeModule } = useInitiative();
  const { fetchWorkspaceModules, fetchArchivedModules, getModuleById } = useModule();
  const { getProjectById } = useProject();
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const initiative = getInitiativeById(initiativeId);
  const details = useSWR(["INITIATIVE", workspaceSlug, initiativeId], () =>
    fetchInitiative(workspaceSlug, initiativeId)
  );
  const modules = useSWR(
    details.data ? ["INITIATIVE_MODULES", workspaceSlug, initiativeId, details.data.module_ids] : null,
    async () => {
      const activeModules = await fetchWorkspaceModules(workspaceSlug);
      const activeIds = new Set(activeModules.map((module) => module.id));
      if (details.data?.module_ids.some((id) => !activeIds.has(id))) {
        await Promise.all(details.data.project_ids.map((projectId) => fetchArchivedModules(workspaceSlug, projectId)));
      }
      return activeModules;
    }
  );
  const items = useSWR(["INITIATIVE_ISSUES", workspaceSlug, initiativeId], async () => {
    const issues = await service.listIssues(workspaceSlug, initiativeId);
    rootStore.issue.issues.addIssue(issues);
    return issues.map((issue) => issue.id);
  });
  const refresh = async () => {
    await Promise.all([details.mutate(), items.mutate()]);
  };

  if (details.error)
    return (
      <p role="alert" className="p-6">
        {initiativeErrorMessage(details.error, "Unable to load the initiative.")}{" "}
        <button onClick={() => void details.mutate()}>Retry</button>
      </p>
    );
  if (details.isLoading || !initiative) return <p className="p-6">Loading initiative…</p>;

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.GLOBAL}>
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="h-full overflow-y-auto px-6 py-6 md:px-9">
          <Link className="mb-4 inline-block underline" to={`/${workspaceSlug}/initiatives`}>
            All initiatives
          </Link>
          <InitiativesHeader title={initiative.name}>
            <Button onClick={() => setPicking(true)} disabled={modules.isLoading || !!modules.error}>
              Add modules
            </Button>
          </InitiativesHeader>
          <p className="mb-4 whitespace-pre-wrap">{initiative.description}</p>
          <p className="mb-4">
            {initiative.completed_issues} of {initiative.total_issues} done
          </p>
          <section aria-label="Linked modules" className="mb-6 space-y-4">
            {!initiative.module_ids.length && <p>No modules linked yet.</p>}
            {modules.error && (
              <p role="alert">
                Unable to load module names. <button onClick={() => void modules.mutate()}>Retry</button>
              </p>
            )}
            {initiative.project_ids.map((projectId) => (
              <div key={projectId}>
                <h2 className="font-semibold">{getProjectById(projectId)?.identifier ?? projectId}</h2>
                <ul className="space-y-2">
                  {initiative.module_ids
                    .filter((id) => getModuleById(id)?.project_id === projectId)
                    .map((id) => (
                      <li key={id} className="flex items-center gap-4">
                        <Link className="underline" to={`/${workspaceSlug}/projects/${projectId}/modules/${id}`}>
                          {getProjectById(projectId)?.identifier ?? projectId} · {getModuleById(id)?.name ?? id}
                        </Link>
                        <Button
                          variant="secondary"
                          disabled={!!removing}
                          onClick={async () => {
                            setRemoving(id);
                            setActionError(undefined);
                            try {
                              await removeModule(workspaceSlug, initiativeId, id);
                              await refresh();
                            } catch (err) {
                              setActionError(
                                initiativeErrorMessage(err, "Unable to remove the module. Please try again.")
                              );
                            } finally {
                              setRemoving(undefined);
                            }
                          }}
                        >
                          {removing === id ? "Removing…" : "Remove"}
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            {actionError && <p role="alert">{actionError}</p>}
          </section>
          <section aria-label="Initiative work items" className="relative h-[650px] min-h-96 border-t border-subtle">
            {items.error ? (
              <p role="alert">
                Unable to load work items. <button onClick={() => void items.mutate()}>Retry</button>
              </p>
            ) : items.isLoading ? (
              <p>Loading work items…</p>
            ) : (
              <PlanBoard
                workspaceSlug={workspaceSlug}
                issueIds={items.data ?? []}
                issueMap={rootStore.issue.issues.issuesMap}
                areaBy="project"
                isLoadingMore={false}
                loadingError={false}
                onRetryLoading={noOp}
              />
            )}
          </section>
        </div>
        <IssuePeekOverview />
        {picking && (
          <InitiativeModulePicker
            workspaceSlug={workspaceSlug}
            initiativeId={initiativeId}
            moduleIds={(modules.data ?? []).map((module) => module.id)}
            onClose={() => setPicking(false)}
            onAdded={refresh}
          />
        )}
      </div>
    </IssuesStoreContext.Provider>
  );
});
