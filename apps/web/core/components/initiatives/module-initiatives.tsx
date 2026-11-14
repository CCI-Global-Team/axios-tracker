/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
import { Plus, Target } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSearchSelect } from "@plane/ui";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useUserPermissions } from "@/hooks/store/user";
import { CreateUpdateInitiativeModal } from "./create-modal";
import { initiativeErrorMessage } from "./error";
import { INITIATIVE_DEFINITION } from "./explainer";

type Props = {
  workspaceSlug: string;
  moduleId: string;
  disabled?: boolean;
};

/** CCI: the module sidebar's Initiatives row — which initiatives this module counts towards, and a picker to change that. */
export const ModuleInitiatives = observer(function ModuleInitiatives({ workspaceSlug, moduleId, disabled }: Props) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const {
    fetchInitiatives,
    initiativeIdsForWorkspace,
    getInitiativeById,
    getInitiativeIdsForModule,
    addModules,
    removeModule,
  } = useInitiative();
  const { allowPermissions } = useUserPermissions();
  const isMember = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.WORKSPACE);
  useSWR(isMember ? ["INITIATIVES", workspaceSlug] : null, () => fetchInitiatives(workspaceSlug));

  if (!isMember) return null;
  const joined = getInitiativeIdsForModule(moduleId);

  const update = async (next: string[]) => {
    const add = next.filter((id) => !joined.includes(id));
    const remove = joined.filter((id) => !next.includes(id));
    setSaving(true);
    try {
      await Promise.all([
        ...add.map((id) => addModules(workspaceSlug, id, [moduleId])),
        ...remove.map((id) => removeModule(workspaceSlug, id, moduleId)),
      ]);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: initiativeErrorMessage(error, "The initiatives could not be updated. Please try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  const options = initiativeIdsForWorkspace.map((id) => {
    const name = getInitiativeById(id)?.name ?? "";
    return {
      value: id,
      query: name,
      content: (
        <span className="flex min-w-0 items-center gap-1.5">
          <Target className="size-3.5 shrink-0 text-tertiary" aria-hidden />
          <span className="truncate">{name}</span>
        </span>
      ),
    };
  });

  return (
    <div className="flex items-start justify-start gap-1">
      <div className="flex h-7 w-2/5 items-center justify-start gap-2 text-tertiary" title={INITIATIVE_DEFINITION}>
        <Target className="h-4 w-4" aria-hidden />
        <span className="text-14">Initiatives</span>
      </div>
      <div className="flex min-h-7 w-3/5 flex-wrap items-center gap-1">
        {joined.map((id) => (
          <Link
            key={id}
            to={`/${workspaceSlug}/initiatives/${id}`}
            className="inline-flex max-w-full items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-12 text-secondary hover:text-primary"
          >
            <Target className="size-3 shrink-0 text-tertiary" aria-hidden />
            <span className="truncate">{getInitiativeById(id)?.name}</span>
          </Link>
        ))}
        {!disabled && (
          <CustomSearchSelect
            value={joined}
            onChange={(next: string[]) => void update(next)}
            options={options}
            multiple
            disabled={saving}
            noChevron
            placement="bottom-end"
            customButton={
              <span className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-secondary">
                <Plus className="size-3" aria-hidden />
                {joined.length ? <span className="sr-only">Change initiatives</span> : "Add to initiative"}
              </span>
            }
            customButtonClassName="max-sm:min-h-11"
            footerOption={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded-sm px-1 py-1.5 text-left text-12 text-secondary hover:bg-layer-transparent-hover"
              >
                <Plus className="size-3" aria-hidden />
                New initiative
              </button>
            }
          />
        )}
        {disabled && !joined.length && <span className="px-1.5 text-13 text-placeholder">None</span>}
      </div>
      <CreateUpdateInitiativeModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        workspaceSlug={workspaceSlug}
        onCreated={(initiative) => void update([...joined, initiative.id])}
      />
    </div>
  );
});
