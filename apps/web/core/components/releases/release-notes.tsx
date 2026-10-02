/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { Wand2 } from "lucide-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { Button } from "@plane/propel/button";
import type { TNameDescriptionLoader, TRelease, TReleaseIssue } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
// components
import { DescriptionInput } from "@/components/editor/rich-text/description-input";
// hooks
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { draftReleaseNotes } from "./helpers";

type Props = {
  workspaceSlug: string;
  projectId: string;
  release: TRelease;
  items: TReleaseIssue[];
  canEdit: boolean;
};

const hasText = (html: string | undefined) => !!html && html.replace(/<[^>]*>/g, "").trim().length > 0;

export const ReleaseNotes = observer(function ReleaseNotes(props: Props) {
  const { workspaceSlug, projectId, release, items, canEdit } = props;
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // states
  const [saveState, setSaveState] = useState<TNameDescriptionLoader>("saved");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // store hooks
  const { updateRelease } = useRelease();

  const applyDraft = () => {
    // emitUpdate=true runs the editor's onChange, which autosaves like a typed edit
    editorRef.current?.setEditorValue(draftReleaseNotes(release.name, items), true);
    setIsConfirmOpen(false);
  };

  const handleDraft = () => {
    const current = editorRef.current?.getDocument().html ?? release.description_html;
    if (hasText(current)) setIsConfirmOpen(true);
    else applyDraft();
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-body-sm-medium text-primary">Release notes</h4>
        <div className="flex items-center gap-2">
          {saveState === "submitting" && <span className="text-body-xs-regular text-tertiary">Saving...</span>}
          {canEdit && (
            <Button
              variant="secondary"
              size="lg"
              className="min-h-11 sm:min-h-0"
              prependIcon={<Wand2 />}
              onClick={handleDraft}
              disabled={items.length === 0}
            >
              Draft from items
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-32 rounded-md border border-subtle px-3 py-2">
        <DescriptionInput
          key={release.id}
          containerClassName="border-none p-0! pl-0!"
          disabled={!canEdit}
          // releases have no asset type of their own, so images are switched off rather than half-uploaded
          disabledExtensions={["image"]}
          editorRef={editorRef}
          entityId={release.id}
          fileAssetType={EFileAssetType.PROJECT_DESCRIPTION}
          initialValue={release.description_html}
          onSubmit={async (value) => {
            await updateRelease(workspaceSlug, projectId, release.id, { description_html: value.description_html });
          }}
          placeholder="What is in this release, for the people who will use it."
          projectId={projectId}
          setIsSubmitting={setSaveState}
          workspaceSlug={workspaceSlug}
        />
      </div>
      <AlertModalCore
        isOpen={isConfirmOpen}
        handleClose={() => setIsConfirmOpen(false)}
        handleSubmit={applyDraft}
        isSubmitting={false}
        variant="primary"
        title="Replace the release notes?"
        content={`The current notes will be replaced by a draft listing the ${items.length} items, grouped by state.`}
        primaryButtonText={{ loading: "Replacing", default: "Replace notes" }}
      />
    </section>
  );
});
