/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";

import { useTranslation } from "@plane/i18n";
import { TrashIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
import {
  convertBytesToSize,
  getFileExtension,
  getFileName,
  getFileURL,
  isPreviewableImage,
  renderFormattedDate,
} from "@plane/utils";
// components
//
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { getFileIcon } from "@/components/icons";
// helpers
// hooks
import { AttachmentImagePreview } from "@/components/issues/attachment/attachment-image-preview";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMember } from "@/hooks/store/use-member";
import { usePlatformOS } from "@/hooks/use-platform-os";

type TIssueAttachmentsListItem = {
  attachmentId: string;
  disabled?: boolean;
  issueServiceType?: TIssueServiceType;
};

export const IssueAttachmentsListItem = observer(function IssueAttachmentsListItem(props: TIssueAttachmentsListItem) {
  const { t } = useTranslation();
  // props
  const { attachmentId, disabled, issueServiceType = EIssueServiceType.ISSUES } = props;
  // store hooks
  const { getUserDetails } = useMember();
  const {
    attachment: { getAttachmentById },
    toggleDeleteAttachmentModal,
  } = useIssueDetail(issueServiceType);
  // derived values
  const attachment = attachmentId ? getAttachmentById(attachmentId) : undefined;
  const fileName = getFileName(attachment?.attributes.name ?? "");
  const fileExtension = getFileExtension(attachment?.attributes.name ?? "");
  const fileIcon = getFileIcon(fileExtension, 18);
  const fileURL = getFileURL(attachment?.asset_url ?? "");
  // Requires a URL as well as a previewable extension: getFileURL can return undefined, and a
  // preview with no source is a broken box rather than a preview.
  const isImage = !!fileURL && isPreviewableImage(attachment?.attributes.name);
  // hooks
  const { isMobile } = usePlatformOS();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  if (!attachment) return <></>;

  return (
    <>
      {isImage && (
        <AttachmentImagePreview
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          src={fileURL}
          alt={`${fileName}.${fileExtension}`}
        />
      )}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          // Images open in place; anything the browser cannot render still goes to a new tab.
          if (isImage) setIsPreviewOpen(true);
          else window.open(fileURL, "_blank");
        }}
      >
        <div className="group flex h-11 items-center justify-between gap-3 pr-2 pl-9 hover:bg-surface-2">
          <div className="flex items-center gap-3 truncate text-13">
            <div className="flex items-center gap-3">
              {isImage ? (
                <img
                  src={fileURL}
                  alt=""
                  loading="lazy"
                  className="size-7 flex-shrink-0 rounded border border-subtle object-cover"
                  // Fall back to the generic icon rather than a broken-image box.
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                fileIcon
              )}
            </div>
            <Tooltip tooltipContent={`${fileName}.${fileExtension}`} isMobile={isMobile}>
              <p className="truncate font-medium text-secondary">{`${fileName}.${fileExtension}`}</p>
            </Tooltip>
            <span className="flex size-1.5 rounded-full bg-layer-1" />
            <span className="flex-shrink-0 text-placeholder">{convertBytesToSize(attachment.attributes.size)}</span>
          </div>

          <div className="flex items-center gap-3">
            {attachment?.created_by && (
              <>
                <Tooltip
                  isMobile={isMobile}
                  tooltipContent={`${
                    getUserDetails(attachment?.created_by)?.display_name ?? ""
                  } uploaded on ${renderFormattedDate(attachment.updated_at)}`}
                >
                  <div className="flex items-center justify-center">
                    <ButtonAvatars showTooltip userIds={attachment?.created_by} />
                  </div>
                </Tooltip>
              </>
            )}

            <CustomMenu ellipsis closeOnSelect placement="bottom-end" disabled={disabled}>
              <CustomMenu.MenuItem
                onClick={() => {
                  toggleDeleteAttachmentModal(attachmentId);
                }}
              >
                <div className="flex items-center gap-2">
                  <TrashIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{t("common.actions.delete")}</span>
                </div>
              </CustomMenu.MenuItem>
            </CustomMenu>
          </div>
        </div>
      </button>
    </>
  );
});
