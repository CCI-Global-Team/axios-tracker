/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import useSWR from "swr";
import { CalendarDays, Target } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { CreateUpdateInitiativeModal } from "./create-modal";
import { initiativeErrorMessage } from "./error";
import { INITIATIVE_TAGLINE, InitiativeExample, InitiativeInfo } from "./explainer";
import { InitiativeProgressBar } from "./progress";

/** Project keys as small chips, so a row shows which projects the initiative spans. */
export const ProjectKeys = observer(function ProjectKeys({ projectIds }: { projectIds: string[] }) {
  const { getProjectById } = useProject();
  const keys = projectIds.map((id) => getProjectById(id)).filter((p) => !!p);
  if (!keys.length) return <span className="text-12 text-placeholder">No modules yet</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((p) => (
        <Tooltip key={p.id} tooltipContent={p.name}>
          <span className="font-mono rounded-sm bg-layer-2 px-1.5 py-0.5 text-11 font-medium text-secondary">
            {p.identifier}
          </span>
        </Tooltip>
      ))}
    </span>
  );
});

const InitiativeRow = observer(function InitiativeRow({ workspaceSlug, id }: { workspaceSlug: string; id: string }) {
  const { getInitiativeById } = useInitiative();
  const initiative = getInitiativeById(id);
  if (!initiative) return null;
  const total = initiative.total_issues;
  return (
    <li>
      <Link
        to={`/${workspaceSlug}/initiatives/${id}`}
        className="grid min-h-11 grid-cols-1 gap-x-6 gap-y-2 border-b border-subtle px-4 py-3 outline-none hover:bg-layer-transparent-hover focus-visible:bg-layer-transparent-hover sm:px-page-x lg:grid-cols-[minmax(0,1fr)_auto_11rem_8rem_2rem] lg:items-center"
      >
        <span className="flex min-w-0 items-start gap-2.5">
          <Target className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-14 font-medium text-primary">{initiative.name}</span>
            {initiative.description && (
              <span className="block truncate text-12 text-tertiary">{initiative.description}</span>
            )}
          </span>
        </span>
        <span className="pl-6.5 lg:pl-0">
          <ProjectKeys projectIds={initiative.project_ids} />
        </span>
        <span className="flex items-center gap-2 pl-6.5 lg:pl-0">
          <InitiativeProgressBar progress={initiative} className="max-w-40 flex-1 lg:max-w-none" />
          <span className="shrink-0 text-12 text-secondary tabular-nums">
            {initiative.completed_issues}/{total}
          </span>
        </span>
        <span className="hidden items-center gap-1 text-12 text-secondary lg:flex">
          <CalendarDays className="size-3.5 text-tertiary" aria-hidden />
          {initiative.target_date ? (
            renderFormattedDate(initiative.target_date)
          ) : (
            <span className="text-placeholder">No target</span>
          )}
        </span>
        <span className="hidden lg:block">
          {initiative.lead_id && <ButtonAvatars showTooltip userIds={initiative.lead_id} />}
        </span>
      </Link>
    </li>
  );
});

export const InitiativesList = observer(function InitiativesList({ workspaceSlug }: { workspaceSlug: string }) {
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { fetchInitiatives, initiativeIdsForWorkspace } = useInitiative();
  const { allowPermissions } = useUserPermissions();
  const canEdit = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  const { data, error, isLoading, mutate } = useSWR(workspaceSlug ? ["INITIATIVES", workspaceSlug] : null, () =>
    fetchInitiatives(workspaceSlug)
  );
  const ids = initiativeIdsForWorkspace;

  if (error && !data)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-13 text-secondary">{initiativeErrorMessage(error, "Initiatives could not be loaded.")}</p>
        <Button variant="secondary" onClick={() => void mutate()}>
          Try again
        </Button>
      </div>
    );

  if (isLoading && !ids.length)
    return (
      <Loader className="space-y-2 p-4">
        <Loader.Item height="56px" />
        <Loader.Item height="56px" />
        <Loader.Item height="56px" />
      </Loader>
    );

  return (
    <div className="vertical-scrollbar scrollbar-md h-full w-full overflow-y-auto">
      {ids.length === 0 ? (
        <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <Target className="size-10 text-placeholder" strokeWidth={1.5} aria-hidden />
          <div className="space-y-1">
            <h3 className="text-h5-medium text-primary">No initiatives yet</h3>
            <p className="text-body-sm-regular text-tertiary">{INITIATIVE_TAGLINE}</p>
          </div>
          <InitiativeExample />
          {canEdit && (
            <Button variant="primary" size="xl" className="min-h-11 sm:min-h-0" onClick={() => setCreating(true)}>
              New initiative
            </Button>
          )}
        </div>
      ) : (
        <>
          <p className="flex items-center gap-1 px-4 pt-3 pb-2 text-12 text-tertiary sm:px-page-x">
            {INITIATIVE_TAGLINE}
            <InitiativeInfo />
          </p>
          <ul className="border-t border-subtle">
            {ids.map((id) => (
              <InitiativeRow key={id} workspaceSlug={workspaceSlug} id={id} />
            ))}
          </ul>
        </>
      )}
      <CreateUpdateInitiativeModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        workspaceSlug={workspaceSlug}
        onCreated={(i) => void navigate(`/${workspaceSlug}/initiatives/${i.id}`)}
      />
    </div>
  );
});
