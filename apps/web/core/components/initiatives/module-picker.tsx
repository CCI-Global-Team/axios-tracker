/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { initiativeErrorMessage } from "./error";

export const InitiativeModulePicker = observer(function InitiativeModulePicker({
  workspaceSlug,
  initiativeId,
  moduleIds,
  onClose,
  onAdded,
}: {
  workspaceSlug: string;
  initiativeId: string;
  moduleIds: string[];
  onClose: () => void;
  onAdded: () => Promise<unknown>;
}) {
  const { addModules, getInitiativeById } = useInitiative();
  const { getModuleById } = useModule();
  const { getProjectById } = useProject();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const linked = getInitiativeById(initiativeId)?.module_ids ?? [];
  const candidates = moduleIds.map((id) => getModuleById(id)).filter((module) => module && !linked.includes(module.id));
  const projectIds = [...new Set(candidates.map((module) => module!.project_id))];

  return (
    <ModalCore isOpen handleClose={() => !saving && onClose()} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form
        className="space-y-4 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving || !selected.length) return;
          setSaving(true);
          setError(undefined);
          try {
            await addModules(workspaceSlug, initiativeId, selected);
            await onAdded();
            onClose();
          } catch (err) {
            setError(initiativeErrorMessage(err, "Unable to add modules. Please try again."));
          } finally {
            setSaving(false);
          }
        }}
      >
        <h2 className="text-18 font-medium">Add modules</h2>
        <div className="max-h-96 space-y-4 overflow-y-auto">
          {!projectIds.length && <p>No more modules are available.</p>}
          {projectIds.map((projectId) => (
            <fieldset key={projectId} className="space-y-2">
              <legend className="font-medium">{getProjectById(projectId)?.identifier ?? projectId}</legend>
              {candidates
                .filter((module) => module?.project_id === projectId)
                .map(
                  (module) =>
                    module && (
                      <label key={module.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(module.id)}
                          onChange={(event) => {
                            setSelected((ids) =>
                              event.target.checked ? [...ids, module.id] : ids.filter((id) => id !== module.id)
                            );
                          }}
                        />
                        {module.name}
                      </label>
                    )
                )}
            </fieldset>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !selected.length}>
            {saving ? "Adding…" : "Add modules"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
});
