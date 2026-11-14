/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import useSWR from "swr";
import { CalendarDays, MoreHorizontal, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { ModuleIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssuesStoreType } from "@plane/types";
import { AlertModalCore, CustomMenu, Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { PlanBoard } from "@/components/issues/issue-layouts/plan/board";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { StoreContext } from "@/lib/store-context";
import { InitiativeService } from "@/services/initiative.service";
import { CreateUpdateInitiativeModal } from "./create-modal";
import { initiativeErrorMessage } from "./error";
import { InitiativeExample, InitiativeInfo } from "./explainer";
import { InitiativeModulePicker } from "./module-picker";
import { InitiativeProgress } from "./progress";

const service = new InitiativeService();

type Props = { workspaceSlug: string; initiativeId: string };

export const InitiativeDetail = observer(function InitiativeDetail({ workspaceSlug, initiativeId }: Props) {
  const rootStore = useContext(StoreContext);
  const navigate = useNavigate();
  const { fetchInitiative, getInitiativeById, removeModule, deleteInitiative } = useInitiative();
  const { fetchWorkspaceModules, fetchArchivedModules, getModuleById } = useModule();
  const { getProjectById } = useProject();
  const { getUserDetails } = useMember();
  const { allowPermissions } = useUserPermissions();
  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [removing, setRemoving] = useState<string>();

  const initiative = getInitiativeById(initiativeId);
  const details = useSWR(["INITIATIVE", workspaceSlug, initiativeId], () =>
    fetchInitiative(workspaceSlug, initiativeId)
  );
  // names for the linked modules: the workspace's open modules, plus a project's archived ones when one is linked
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
  // an edit made in the peek can change progress or drop a work item from these modules: reload when it closes
  const { peekIssue } = useIssueDetail();
  const peekWasOpen = useRef(false);
  useEffect(() => {
    if (peekWasOpen.current && !peekIssue) void Promise.all([details.mutate(), items.mutate()]);
    peekWasOpen.current = !!peekIssue;
  }, [peekIssue, details, items]);

  const remove = async (moduleId: string) => {
    setRemoving(moduleId);
    try {
      await removeModule(workspaceSlug, initiativeId, moduleId);
      await refresh();
    } catch (err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: initiativeErrorMessage(err, "The module could not be removed. Please try again."),
      });
    } finally {
      setRemoving(undefined);
    }
  };

  const destroy = async () => {
    setIsDeleting(true);
    try {
      await deleteInitiative(workspaceSlug, initiativeId);
      void navigate(`/${workspaceSlug}/initiatives`);
    } catch (err) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: initiativeErrorMessage(err, "The initiative could not be deleted."),
      });
      setIsDeleting(false);
      setDeleting(false);
    }
  };

  if (details.error && !initiative)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
        <Target className="size-10 text-placeholder" strokeWidth={1.5} aria-hidden />
        <h3 className="text-h5-medium text-primary">Initiative not found</h3>
        <p className="text-body-sm-regular text-tertiary">
          {initiativeErrorMessage(details.error, "It may have been deleted.")}
        </p>
        <Link to={`/${workspaceSlug}/initiatives`} className="text-body-sm-medium text-accent-primary">
          View all initiatives
        </Link>
      </div>
    );

  if (!initiative)
    return (
      <Loader className="space-y-3 p-4">
        <Loader.Item height="96px" />
        <Loader.Item height="420px" />
      </Loader>
    );

  const lead = initiative.lead_id ? getUserDetails(initiative.lead_id) : undefined;
  // linked modules under their project, projects in the order the API gives
  const groups = initiative.project_ids
    .map((projectId) => ({
      project: getProjectById(projectId),
      projectId,
      moduleIds: initiative.module_ids.filter((id) => getModuleById(id)?.project_id === projectId),
    }))
    .filter((g) => g.moduleIds.length);
  const hasModules = initiative.module_ids.length > 0;

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.GLOBAL}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <header className="grid shrink-0 grid-cols-1 gap-x-10 gap-y-4 border-b border-subtle px-4 py-4 sm:px-page-x lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 truncate text-20 font-semibold text-primary">{initiative.name}</h1>
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-layer-2 py-0.5 pr-0.5 pl-2 text-11 font-medium text-secondary">
                Initiative
                <InitiativeInfo className="size-5" />
              </span>
              {canEdit && (
                <CustomMenu
                  ariaLabel="Initiative actions"
                  customButton={
                    <span className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover">
                      <MoreHorizontal className="size-4" aria-hidden />
                    </span>
                  }
                  placement="bottom-start"
                  closeOnSelect
                >
                  <CustomMenu.MenuItem onClick={() => setEditing(true)} className="flex items-center gap-2">
                    <Pencil className="size-3.5" />
                    Edit details
                  </CustomMenu.MenuItem>
                  <CustomMenu.MenuItem
                    onClick={() => setDeleting(true)}
                    className="flex items-center gap-2 text-danger-primary"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </CustomMenu.MenuItem>
                </CustomMenu>
              )}
            </div>
            {initiative.description && (
              <p className="line-clamp-2 max-w-prose text-13 whitespace-pre-wrap text-secondary">
                {initiative.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-secondary">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5 text-tertiary" aria-hidden />
                {initiative.target_date ? `Target ${renderFormattedDate(initiative.target_date)}` : "No target date"}
              </span>
              {initiative.lead_id ? (
                <span className="inline-flex items-center gap-1.5">
                  <ButtonAvatars showTooltip={false} userIds={initiative.lead_id} />
                  {lead?.display_name ?? "Lead"}
                </span>
              ) : (
                <span className="text-placeholder">No lead</span>
              )}
            </div>

            {/* what it is made of: modules, under the project each lives in */}
            {hasModules && (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                {groups.map((g) => (
                  <div key={g.projectId} className="flex flex-wrap items-center gap-1.5">
                    <Tooltip tooltipContent={g.project?.name ?? "Project"}>
                      <span className="font-mono text-11 font-medium text-tertiary">{g.project?.identifier}</span>
                    </Tooltip>
                    {g.moduleIds.map((id) => (
                      <span
                        key={id}
                        className="group inline-flex h-7 items-center rounded-md border border-subtle bg-layer-1 text-12 text-primary max-sm:h-9"
                      >
                        {getModuleById(id)?.archived_at ? (
                          // archived modules have no page of their own to open
                          <span className="inline-flex h-full items-center gap-1.5 pr-1 pl-2 text-tertiary">
                            <ModuleIcon className="size-3.5" />
                            {getModuleById(id)?.name ?? "Module"}
                            <span className="text-11">(archived)</span>
                          </span>
                        ) : (
                          <Link
                            to={`/${workspaceSlug}/projects/${g.projectId}/modules/${id}`}
                            className="inline-flex h-full items-center gap-1.5 rounded-l-md pr-1 pl-2 outline-none hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)]"
                          >
                            <ModuleIcon className="size-3.5 text-tertiary" />
                            {getModuleById(id)?.name ?? "Module"}
                          </Link>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            aria-label={`Remove ${getModuleById(id)?.name ?? "module"} from this initiative`}
                            disabled={!!removing}
                            onClick={() => void remove(id)}
                            className="grid h-full w-6 place-items-center rounded-r-md text-placeholder outline-none hover:bg-layer-transparent-hover hover:text-secondary focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] disabled:opacity-50 max-sm:w-9"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
                {canEdit && (
                  <Button
                    variant="tertiary"
                    size="sm"
                    prependIcon={<Plus />}
                    onClick={() => setPicking(true)}
                    disabled={!modules.data}
                    className="max-sm:min-h-9"
                  >
                    Add modules
                  </Button>
                )}
              </div>
            )}
          </div>
          {hasModules && (
            <div className="lg:pt-1">
              <InitiativeProgress progress={initiative} />
            </div>
          )}
        </header>

        <section aria-label="Work items" className="relative min-h-0 flex-1">
          {!hasModules ? (
            <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
              <div className="space-y-1">
                <h3 className="text-h5-medium text-primary">Add the modules that make up this outcome</h3>
                <p className="text-body-sm-regular text-tertiary">From any project. Each one stays where it is.</p>
              </div>
              <InitiativeExample />
              {canEdit && (
                <Button
                  variant="primary"
                  size="xl"
                  className="min-h-11 sm:min-h-0"
                  prependIcon={<Plus />}
                  onClick={() => setPicking(true)}
                  disabled={!modules.data && !modules.error}
                >
                  Add modules
                </Button>
              )}
            </div>
          ) : items.error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <p className="text-13 text-secondary">Work items could not be loaded.</p>
              <Button variant="secondary" onClick={() => void items.mutate()}>
                Try again
              </Button>
            </div>
          ) : !items.data ? (
            <Loader className="space-y-3 p-4">
              <Loader.Item height="40px" />
              <Loader.Item height="320px" />
            </Loader>
          ) : (
            <PlanBoard
              workspaceSlug={workspaceSlug}
              issueIds={items.data}
              issueMap={rootStore.issue.issues.issuesMap}
              areaBy="project"
              isLoadingMore={false}
            />
          )}
        </section>
        <IssuePeekOverview />
      </div>
      {picking && (
        <InitiativeModulePicker
          workspaceSlug={workspaceSlug}
          initiativeId={initiativeId}
          moduleIds={(modules.data ?? []).map((module) => module.id)}
          onClose={() => setPicking(false)}
          onAdded={refresh}
        />
      )}
      <CreateUpdateInitiativeModal
        isOpen={editing}
        onClose={() => setEditing(false)}
        workspaceSlug={workspaceSlug}
        data={initiative}
      />
      <AlertModalCore
        isOpen={deleting}
        handleClose={() => !isDeleting && setDeleting(false)}
        handleSubmit={() => void destroy()}
        isSubmitting={isDeleting}
        variant="danger"
        title="Delete this initiative?"
        content={`${initiative.name} goes away. Its modules and work items stay in their projects.`}
        primaryButtonText={{ loading: "Deleting", default: "Delete" }}
        secondaryButtonText="Cancel"
      />
    </IssuesStoreContext.Provider>
  );
});
