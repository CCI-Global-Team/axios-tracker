/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useInitiative } from "@/hooks/store/use-initiative";
import { initiativeErrorMessage } from "./error";

export function CreateInitiativeModal({
  workspaceSlug,
  onClose,
  onCreated,
}: {
  workspaceSlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createInitiative } = useInitiative();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <ModalCore isOpen handleClose={() => !saving && onClose()} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <form
        className="space-y-4 p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving || !name.trim()) return;
          setSaving(true);
          setError(undefined);
          try {
            await createInitiative(workspaceSlug, { name: name.trim(), description });
            onCreated();
            onClose();
          } catch (err) {
            setError(initiativeErrorMessage(err, "Unable to create the initiative. Please try again."));
          } finally {
            setSaving(false);
          }
        }}
      >
        <h2 className="text-18 font-medium">New initiative</h2>
        <label className="block space-y-1">
          <span>Name</span>
          <input
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="block w-full rounded border border-subtle bg-surface-1 p-2"
          />
        </label>
        <label className="block space-y-1">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="block w-full rounded border border-subtle bg-surface-1 p-2"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create initiative"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
