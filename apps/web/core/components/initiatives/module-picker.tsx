/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Search } from "lucide-react";
import { Button } from "@plane/propel/button";
import { ModuleIcon } from "@plane/propel/icons";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useInitiative } from "@/hooks/store/use-initiative";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { initiativeErrorMessage } from "./error";

type Props = {
  workspaceSlug: string;
  initiativeId: string;
  /** the modules that can be picked (the workspace's modules the user can see) */
  moduleIds: string[];
  onClose: () => void;
  onAdded: () => Promise<unknown>;
};

export const InitiativeModulePicker = observer(function InitiativeModulePicker(props: Props) {
  const { workspaceSlug, initiativeId, moduleIds, onClose, onAdded } = props;
  const { addModules, getInitiativeById } = useInitiative();
  const { getModuleById } = useModule();
  const { getProjectById } = useProject();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const linked = new Set(getInitiativeById(initiativeId)?.module_ids ?? []);
  const q = query.trim().toLowerCase();
  const candidates = moduleIds
    .map((id) => getModuleById(id))
    .filter((m) => !!m && !linked.has(m.id))
    .filter((m) => {
      if (!q) return true;
      const project = getProjectById(m!.project_id);
      return [m!.name, project?.name, project?.identifier].some((s) => s?.toLowerCase().includes(q));
    });
  const projectIds = [...new Set(candidates.map((m) => m!.project_id))].toSorted((a, b) =>
    (getProjectById(a)?.name ?? "").localeCompare(getProjectById(b)?.name ?? "")
  );

  const toggle = (id: string, on: boolean) => setSelected((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  return (
    <ModalCore isOpen handleClose={() => !saving && onClose()} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form
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
            setError(initiativeErrorMessage(err, "The modules could not be added. Please try again."));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="space-y-3 p-5 pb-3">
          <div>
            <h3 className="text-18 font-medium text-secondary">Add modules</h3>
            <p className="text-13 text-tertiary">From any project. Each module stays in its own project.</p>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
            <Search className="size-3.5 text-placeholder" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search modules or projects"
              aria-label="Search modules or projects"
              className="h-full flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </label>
        </div>
        <div className="vertical-scrollbar scrollbar-sm max-h-[50vh] overflow-x-hidden overflow-y-auto px-3 pb-3">
          {!projectIds.length && (
            <p className="px-2 py-8 text-center text-13 text-tertiary">
              {q ? "No modules match." : "Every module you can see is already in this initiative."}
            </p>
          )}
          {projectIds.map((projectId) => {
            const project = getProjectById(projectId);
            return (
              <fieldset key={projectId} className="mb-2">
                <legend className="flex items-center gap-2 px-2 pt-2 pb-1 text-12 font-medium text-tertiary">
                  <span className="font-mono text-11">{project?.identifier}</span>
                  {project?.name}
                </legend>
                {candidates
                  .filter((m) => m!.project_id === projectId)
                  .map((m) => (
                    <label
                      key={m!.id}
                      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-13 text-primary hover:bg-layer-transparent-hover max-sm:min-h-11"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(m!.id)}
                        onChange={(e) => toggle(m!.id, e.target.checked)}
                        className="size-3.5 accent-[var(--txt-accent-primary)]"
                      />
                      <ModuleIcon className="size-3.5 shrink-0 text-tertiary" />
                      <span className="min-w-0 truncate">{m!.name}</span>
                    </label>
                  ))}
              </fieldset>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="px-5 pb-2 text-12 text-danger-primary">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <span className="text-12 text-tertiary tabular-nums">
            {selected.length ? `${selected.length} selected` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="lg" type="submit" loading={saving} disabled={!selected.length}>
              {saving ? "Adding" : selected.length > 1 ? `Add ${selected.length} modules` : "Add module"}
            </Button>
          </div>
        </div>
      </form>
    </ModalCore>
  );
});
