/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ISSUE_LAYOUTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { ChevronDownIcon } from "@plane/propel/icons";
import { EIssueLayoutTypes } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { useIsPhoneWidth } from "@/hooks/use-is-phone-width";
import { IssueLayoutIcon } from "../../layout-icon";

// CCI: Table and Timeline need width; on a phone the menu offers List, Board, Calendar and Plan.
const WIDE_ONLY_LAYOUTS = new Set([EIssueLayoutTypes.SPREADSHEET, EIssueLayoutTypes.GANTT]);
export function MobileLayoutSelection({
  layouts,
  onChange,
  activeLayout,
}: {
  layouts: EIssueLayoutTypes[];
  onChange: (layout: EIssueLayoutTypes) => void;
  activeLayout?: EIssueLayoutTypes;
  isMobile?: boolean;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhoneWidth();
  return (
    <CustomMenu
      maxHeight={"md"}
      className="flex flex-grow justify-center text-13 text-secondary"
      placement="bottom-start"
      customButton={
        <Button variant="ghost" className="relative gap-1.5 px-2">
          {activeLayout && (
            <>
              <IssueLayoutIcon layout={activeLayout} size={14} strokeWidth={2} className={`h-3.5 w-3.5`} />
              <span className="text-13 text-secondary">
                {t(ISSUE_LAYOUTS.find((l) => l.key === activeLayout)?.i18n_label ?? "")}
              </span>
            </>
          )}
          <ChevronDownIcon className="my-auto size-3 text-secondary" strokeWidth={2} />
        </Button>
      }
      customButtonClassName="flex flex-grow justify-center text-secondary text-13"
      closeOnSelect
    >
      {ISSUE_LAYOUTS.filter((l) => layouts.includes(l.key) && !(isPhone && WIDE_ONLY_LAYOUTS.has(l.key))).map(
        (layout) => (
          <CustomMenu.MenuItem
            key={layout.key}
            onClick={() => {
              onChange(layout.key);
            }}
            className="flex items-center gap-2"
          >
            <IssueLayoutIcon layout={layout.key} className="h-3 w-3" />
            <div className="text-tertiary">{t(layout.i18n_label)}</div>
          </CustomMenu.MenuItem>
        )
      )}
    </CustomMenu>
  );
}
