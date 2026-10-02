/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { TButtonVariant } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRelease, TReleaseIssue, TReleaseUndoResponse } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import type { TModalVariant } from "@plane/ui";
// hooks
import { useRelease } from "@/hooks/store/use-release";

type TAction = "freeze" | "plan" | "release" | "cancel" | "reopen" | "roll_back";

type TActionConfig = {
  label: string;
  buttonVariant: TButtonVariant;
  modalVariant: TModalVariant;
  title: string;
  confirm: string;
  loading: string;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  release: TRelease;
  items: TReleaseIssue[];
  /** called with the undo result so the page can list the items it left alone */
  onUndo: (result: TReleaseUndoResponse, action: "reopen" | "roll_back") => void;
};

const ACTIONS_BY_STATUS: Record<TRelease["status"], TAction[]> = {
  planning: ["freeze", "release", "cancel"],
  frozen: ["plan", "release", "cancel"],
  released: ["reopen", "roll_back"],
  rolled_back: ["reopen"],
  cancelled: [],
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const ReleaseActions = observer(function ReleaseActions(props: Props) {
  const { workspaceSlug, projectId, release, items, onUndo } = props;
  // states
  const [pending, setPending] = useState<TAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // store hooks
  const { updateRelease, markReleased, reopen, rollBack } = useRelease();
  // derived values
  const total = items.length || (release.total_items ?? 0);
  const shipped = items.length ? items.filter((item) => !!item.shipped_at).length : (release.shipped_items ?? 0);
  const unshipped = total - shipped;

  const config: Record<TAction, TActionConfig> = {
    freeze: {
      label: "Freeze",
      buttonVariant: "secondary",
      modalVariant: "primary",
      title: `Freeze ${release.name}?`,
      confirm: `Freezing marks the scope as final. The ${plural(total, "work item")} stay in the release and keep shipping as their code reaches production. No item changes state, and you can move it back to planning.`,
      loading: "Freezing",
    },
    plan: {
      label: "Back to planning",
      buttonVariant: "secondary",
      modalVariant: "primary",
      title: `Move ${release.name} back to planning?`,
      confirm: `The release goes back to Planning. Nothing happens to its ${plural(total, "work item")}.`,
      loading: "Moving",
    },
    release: {
      label: "Mark released",
      buttonVariant: "primary",
      modalVariant: "primary",
      title: `Mark ${release.name} released?`,
      confirm:
        unshipped > 0
          ? `${plural(unshipped, "work item")} of ${total} ${unshipped === 1 ? "has" : "have"} not shipped yet. ${unshipped === 1 ? "It" : "They"} will be recorded as shipped by hand and moved to Released (items already Done or Cancelled keep their state). The release closes as Released.`
          : `All ${plural(total, "work item")} have shipped. The release closes as Released.`,
      loading: "Releasing",
    },
    cancel: {
      label: "Cancel release",
      buttonVariant: "error-outline",
      modalVariant: "danger",
      title: `Cancel ${release.name}?`,
      confirm: `The release is cancelled and closed. Its ${plural(total, "work item")} stay listed here but no item changes state, and they become free to join another release.`,
      loading: "Cancelling",
    },
    reopen: {
      label: "Reopen",
      buttonVariant: "secondary",
      modalVariant: "primary",
      title: `Reopen ${release.name}?`,
      confirm: `${plural(shipped, "shipped work item")} still in Released will go back to the state they were in before (or Ready for Test). Items someone has already moved on, for example to Done, are left alone and listed afterwards. The release goes back to Frozen.`,
      loading: "Reopening",
    },
    roll_back: {
      label: "Roll back",
      buttonVariant: "error-outline",
      modalVariant: "danger",
      title: `Roll back ${release.name}?`,
      confirm: `${plural(shipped, "shipped work item")} still in Released will move back to Ready for Test. Items already moved on, for example to Done, are left alone and listed afterwards. The release is marked Rolled back and its items may join another release.`,
      loading: "Rolling back",
    },
  };

  const run = async (action: TAction) => {
    setIsSubmitting(true);
    try {
      if (action === "freeze") await updateRelease(workspaceSlug, projectId, release.id, { status: "frozen" });
      if (action === "plan") await updateRelease(workspaceSlug, projectId, release.id, { status: "planning" });
      if (action === "cancel") await updateRelease(workspaceSlug, projectId, release.id, { status: "cancelled" });
      if (action === "release") {
        const result = await markReleased(workspaceSlug, projectId, release.id);
        const moved = result?.results?.filter((entry) => entry.moved).length ?? 0;
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Released",
          message: `${release.name} is released. ${plural(moved, "work item")} moved to Released.`,
        });
      }
      if (action === "reopen" || action === "roll_back") {
        const result =
          action === "reopen"
            ? await reopen(workspaceSlug, projectId, release.id)
            : await rollBack(workspaceSlug, projectId, release.id);
        onUndo(result, action);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: action === "reopen" ? "Reopened" : "Rolled back",
          message: `${plural(result?.restored?.length ?? 0, "work item")} moved back. ${plural(
            result?.left_alone?.length ?? 0,
            "work item"
          )} left alone.`,
        });
      }
      setPending(null);
    } catch (error) {
      const body = error as Record<string, unknown> | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: typeof body?.error === "string" ? body.error : "The release could not be updated. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const actions = ACTIONS_BY_STATUS[release.status] ?? [];
  if (actions.length === 0) return null;
  const active = pending ? config[pending] : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={config[action].buttonVariant}
            size="lg"
            className="min-h-11 sm:min-h-0"
            onClick={() => setPending(action)}
          >
            {config[action].label}
          </Button>
        ))}
      </div>
      <AlertModalCore
        isOpen={!!pending}
        handleClose={() => !isSubmitting && setPending(null)}
        handleSubmit={() => pending && void run(pending)}
        isSubmitting={isSubmitting}
        variant={active?.modalVariant ?? "primary"}
        title={active?.title ?? ""}
        content={active?.confirm ?? ""}
        primaryButtonText={{ loading: active?.loading ?? "", default: active?.label ?? "" }}
        secondaryButtonText="Not now"
      />
    </>
  );
});
