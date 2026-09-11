/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";

import { useTranslation } from "@plane/i18n";
import { LinkIcon, CopyIcon, EditIcon, TrashIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// ui
import { CustomMenu } from "@plane/ui";
import { calculateTimeAgo, copyTextToClipboard } from "@plane/utils";
// helpers
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TLinkOperationsModal } from "./create-update-link-modal";

type TIssueLinkItem = {
  linkId: string;
  linkOperations: TLinkOperationsModal;
  isNotAllowed: boolean;
  issueServiceType?: TIssueServiceType;
};

export const IssueLinkItem = observer(function IssueLinkItem(props: TIssueLinkItem) {
  // props
  const { linkId, linkOperations, isNotAllowed, issueServiceType = EIssueServiceType.ISSUES } = props;
  // hooks
  const { t } = useTranslation();
  const {
    toggleIssueLinkModal: toggleIssueLinkModalStore,
    setIssueLinkData,
    link: { getLinkById },
  } = useIssueDetail(issueServiceType);
  const { isMobile } = usePlatformOS();
  const linkDetail = getLinkById(linkId);
  if (!linkDetail) return <></>;

  // const Icon = getIconForLink(linkDetail.url);
  const faviconUrl: string | undefined = linkDetail.metadata?.favicon;
  // CCI: a stored favicon is not necessarily loadable. Rows written before the crawler validated
  // content type hold `data:text/html` - a whole challenge page - which renders as a broken-image
  // icon. Falling back on error covers those without a data migration, and any future bad value.
  const [faviconFailed, setFaviconFailed] = useState(false);
  const hasOwnTitle = !!linkDetail.title && linkDetail.title !== "";
  const linkTitle: string | undefined = linkDetail.metadata?.title;

  const toggleIssueLinkModal = (modalToggle: boolean) => {
    toggleIssueLinkModalStore(modalToggle);
    setIssueLinkData(linkDetail);
  };
  return (
    <>
      <div
        key={linkId}
        className="group 3xl:col-span-2 col-span-12 flex h-10 flex-shrink-0 items-center justify-between gap-3 rounded-sm border-[0.5px] border-subtle bg-surface-2 px-3 hover:bg-layer-1 lg:col-span-6 xl:col-span-4 2xl:col-span-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {faviconUrl && !faviconFailed ? (
            <img src={faviconUrl} alt="" className="size-4 flex-shrink-0" onError={() => setFaviconFailed(true)} />
          ) : (
            <LinkIcon className="size-4 flex-shrink-0 text-tertiary group-hover:text-primary" />
          )}
          <Tooltip tooltipContent={linkDetail.url} isMobile={isMobile}>
            <a
              href={linkDetail.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-0 flex-1 cursor-pointer items-center text-body-xs-regular"
            >
              <span className="w-0 flex-1 truncate">
                {/* CCI: the crawled title only fills in for a title the person did not give. It
                    used to be appended to theirs, so a link they had already named read
                    "GAM-145 - the root fix Just a moment..." - the crawler having been served a
                    bot-challenge page by our own edge. Their own words are never improved by
                    whatever a <title> tag happened to say. */}
                {hasOwnTitle ? linkDetail.title : linkTitle && linkTitle !== "" ? linkTitle : linkDetail.url}
              </span>
            </a>
          </Tooltip>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <p className="group-hover-text-secondary p-1 align-bottom text-caption-sm-regular leading-5 text-placeholder">
            {calculateTimeAgo(linkDetail.created_at)}
          </p>
          {/* A real button, not a span: this was a click handler on static markup, so copying a
              link was impossible by keyboard. The element carries the role and the Enter/Space
              handling for free. */}
          <button
            type="button"
            aria-label={t("common.link_copied")}
            onClick={() => {
              copyTextToClipboard(linkDetail.url);
              setToast({
                type: TOAST_TYPE.SUCCESS,
                title: t("common.link_copied"),
                message: t("common.link_copied_to_clipboard"),
              });
            }}
            className="relative grid cursor-pointer place-items-center rounded-sm p-1 text-placeholder outline-none group-hover:text-secondary hover:bg-layer-1"
          >
            <CopyIcon className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>
          <CustomMenu
            ellipsis
            buttonClassName="text-placeholder group-hover:text-secondary"
            placement="bottom-end"
            closeOnSelect
            disabled={isNotAllowed}
          >
            <CustomMenu.MenuItem
              className="flex items-center gap-2"
              onClick={() => {
                toggleIssueLinkModal(true);
              }}
            >
              <EditIcon className="h-3 w-3 stroke-[1.5] text-secondary" />
              {t("common.actions.edit")}
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem
              className="flex items-center gap-2"
              onClick={() => {
                linkOperations.remove(linkDetail.id);
              }}
            >
              <TrashIcon className="h-3 w-3" />
              {t("common.actions.delete")}
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      </div>
    </>
  );
});
