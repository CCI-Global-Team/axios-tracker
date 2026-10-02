/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: public share links (GAM-401) — create, copy and revoke the links that give a work item a rich
// preview in chat apps. Only the link's URL is public; the item itself still needs a login.
import { useState } from "react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { copyTextToClipboard, renderFormattedDate } from "@plane/utils";
// services
import type { TWorkItemPublicLink } from "@/services/issue/work_item_public_link.service";
import { WorkItemPublicLinkService } from "@/services/issue/work_item_public_link.service";

const publicLinkService = new WorkItemPublicLinkService();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

export function WorkItemPublicLinkModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, issueId } = props;
  // states
  const [includeDescription, setIncludeDescription] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // fetch only while open, so the menu entry costs nothing until it is used
  const {
    data: links,
    isLoading,
    mutate,
  } = useSWR(
    isOpen ? `WORK_ITEM_PUBLIC_LINKS_${issueId}` : null,
    () => publicLinkService.list(workspaceSlug, projectId, issueId),
    { revalidateOnFocus: false }
  );

  const copy = async (link: TWorkItemPublicLink) => {
    try {
      await copyTextToClipboard(link.url);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Public link copied", message: link.url });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Could not copy", message: link.url });
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const link = await publicLinkService.create(workspaceSlug, projectId, issueId, {
        include_description: includeDescription,
      });
      await mutate((current) => [link, ...(current ?? [])], { revalidate: false });
      await copy(link);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "The public link could not be created." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (link: TWorkItemPublicLink) => {
    setRevokingId(link.id);
    try {
      await publicLinkService.revoke(workspaceSlug, projectId, issueId, link.id);
      await mutate((current) => (current ?? []).filter((item) => item.id !== link.id), { revalidate: false });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Link revoked",
        message: "Chat previews already posted may show the old card for a few minutes.",
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "The link could not be revoked." });
    } finally {
      setRevokingId(null);
    }
  };

  const handleClose = () => {
    setIncludeDescription(false);
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      {/* the menu also lives in the peek view, which closes on any click outside itself */}
      <div data-prevent-outside-click>
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <h3 className="text-18 font-medium text-secondary">Public link</h3>
            <p className="text-body-xs-regular text-tertiary">
              Anyone with this link sees the key, title and state in chat previews — not the rest of the work item.
            </p>
          </div>
          <label
            htmlFor={`public-link-description-${issueId}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-body-xs-regular text-secondary sm:min-h-0"
          >
            <Checkbox
              id={`public-link-description-${issueId}`}
              checked={includeDescription}
              onChange={(e) => setIncludeDescription(e.target.checked)}
            />
            Include the first lines of the description
          </label>
          <div className="space-y-2">
            <h4 className="text-body-xs-medium text-secondary">Live links</h4>
            {isLoading ? (
              <Loader className="space-y-1">
                <Loader.Item height="36px" />
              </Loader>
            ) : !links || links.length === 0 ? (
              <p className="text-body-xs-regular text-placeholder">No public links for this work item.</p>
            ) : (
              <ul className="divide-y divide-subtle rounded-md border border-subtle">
                {links.map((link) => (
                  <li key={link.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono truncate text-body-xs-regular text-primary">{link.url}</p>
                      <p className="text-caption-md-regular text-tertiary">
                        {renderFormattedDate(link.created_at)}
                        {link.include_description ? " · with description" : ""}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="min-h-11 sm:min-h-0"
                      onClick={() => void copy(link)}
                    >
                      Copy
                    </Button>
                    <Button
                      variant="error-outline"
                      size="lg"
                      className="min-h-11 sm:min-h-0"
                      loading={revokingId === link.id}
                      onClick={() => void handleRevoke(link)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
          <Button variant="secondary" size="lg" className="min-h-11 sm:min-h-0" onClick={handleClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="min-h-11 sm:min-h-0"
            loading={isCreating}
            onClick={() => void handleCreate()}
          >
            Create and copy link
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
