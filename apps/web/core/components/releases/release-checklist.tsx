/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useState } from "react";
import { observer } from "mobx-react";
import { v4 as uuidv4 } from "uuid";
import { Pencil, Plus, Trash2 } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRelease, TReleaseChecklistItem } from "@plane/types";
import { Checkbox, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useRelease } from "@/hooks/store/use-release";
import { useUser } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  release: TRelease;
  canEdit: boolean;
};

const ICON_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-sm text-tertiary hover:bg-layer-transparent-hover hover:text-secondary sm:size-7";

export const ReleaseChecklist = observer(function ReleaseChecklist(props: Props) {
  const { workspaceSlug, projectId, release, canEdit } = props;
  // states
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  // store hooks
  const { updateRelease } = useRelease();
  const { data: currentUser } = useUser();
  // derived values
  const checklist = release.checklist ?? [];
  const doneCount = checklist.filter((item) => item.done).length;

  const save = async (next: TReleaseChecklistItem[]) => {
    try {
      await updateRelease(workspaceSlug, projectId, release.id, { checklist: next });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "The checklist could not be saved." });
    }
  };

  const toggle = (id: string) =>
    save(
      checklist.map((item) =>
        item.id === id
          ? {
              ...item,
              done: !item.done,
              done_at: item.done ? null : new Date().toISOString(),
              done_by: item.done ? null : (currentUser?.id ?? null),
            }
          : item
      )
    );

  const add = async () => {
    const text = newText.trim();
    if (!text) return;
    setNewText("");
    await save([...checklist, { id: uuidv4(), text, done: false, done_at: null, done_by: null }]);
  };

  const commitEdit = async () => {
    const id = editingId;
    const text = editingText.trim();
    setEditingId(null);
    if (!id) return;
    const current = checklist.find((item) => item.id === id);
    if (!current || !text || text === current.text) return;
    await save(checklist.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const remove = (id: string) => save(checklist.filter((item) => item.id !== id));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-body-sm-medium text-primary">Go-live checklist</h4>
        <span className="text-body-xs-regular text-tertiary">
          {doneCount} / {checklist.length} done
        </span>
      </div>
      <div className="rounded-md border border-subtle">
        {checklist.length === 0 && <p className="px-3 py-3 text-body-xs-regular text-tertiary">No checks yet.</p>}
        {checklist.map((item) => (
          <div key={item.id} className="flex items-center gap-2 border-b border-subtle px-2 last:border-b-0">
            <label
              htmlFor={`release-check-${item.id}`}
              className="grid size-11 shrink-0 cursor-pointer place-items-center sm:size-7"
            >
              <Checkbox
                id={`release-check-${item.id}`}
                checked={item.done}
                disabled={!canEdit}
                onChange={() => void toggle(item.id)}
                aria-label={`Mark "${item.text}" ${item.done ? "not done" : "done"}`}
              />
            </label>
            {editingId === item.id ? (
              <Input
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => void commitEdit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitEdit();
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="w-full text-13"
                // the field replaces the text the user just chose to edit
                // oxlint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            ) : (
              <span
                className={cn("min-w-0 flex-1 py-2 text-body-xs-regular break-words text-primary", {
                  "text-tertiary line-through": item.done,
                })}
              >
                {item.text}
              </span>
            )}
            {canEdit && editingId !== item.id && (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  className={ICON_BUTTON}
                  aria-label={`Edit "${item.text}"`}
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingText(item.text);
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  aria-label={`Delete "${item.text}"`}
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add a check, e.g. Cache warmed"
            className="min-h-11 w-full text-13 sm:min-h-0"
          />
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="min-h-11 sm:min-h-0"
            prependIcon={<Plus />}
            disabled={!newText.trim()}
          >
            Add
          </Button>
        </form>
      )}
    </section>
  );
});
