/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { EIssueLayoutTypes } from "@plane/types";
import { cn } from "@plane/utils";

// CCI (Direction A): the layouts as a row of text tabs under the header, the active one underlined in brand red.
// Phones keep the layout menu in the mobile header.
const TABS: { key: EIssueLayoutTypes; i18n: string }[] = [
  { key: EIssueLayoutTypes.LIST, i18n: "issue.layouts.list" },
  { key: EIssueLayoutTypes.KANBAN, i18n: "issue.layouts.kanban" },
  { key: EIssueLayoutTypes.CALENDAR, i18n: "issue.layouts.calendar" },
  { key: EIssueLayoutTypes.SPREADSHEET, i18n: "issue.layouts.spreadsheet" },
  { key: EIssueLayoutTypes.GANTT, i18n: "issue.layouts.gantt" },
];

type Props = {
  selectedLayout: EIssueLayoutTypes | undefined;
  onChange: (layout: EIssueLayoutTypes) => void;
  /** The tabs show but take no clicks, e.g. while the filters they would change are still loading. */
  disabled?: boolean;
};

export function LayoutTabs({ selectedLayout, onChange, disabled = false }: Props) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label="Layout"
      className="hidden h-10 flex-shrink-0 items-stretch gap-5 overflow-x-auto border-b border-subtle bg-surface-1 px-page-x [scrollbar-width:none] md:flex"
    >
      {TABS.map(({ key, i18n }) => {
        const isActive = selectedLayout === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => !isActive && onChange(key)}
            className={cn(
              "-mb-px flex items-center rounded-t-sm border-b-2 text-13 whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] disabled:cursor-default",
              isActive
                ? "border-[var(--axios-brand)] font-semibold text-primary"
                : "border-transparent font-medium text-tertiary hover:text-secondary"
            )}
          >
            {t(i18n)}
          </button>
        );
      })}
    </div>
  );
}
