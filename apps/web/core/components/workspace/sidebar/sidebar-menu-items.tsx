/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import { Ellipsis } from "lucide-react";
// plane imports
import {
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// store hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import {
  usePersonalNavigationPreferences,
  useWorkspaceNavigationPreferences,
} from "@/hooks/use-navigation-preferences";
import { SidebarItemBase } from "./sidebar-item";

// CCI (Direction A): the top of the sidebar is Home and Your work, then anything the user pinned, then one
// "More" row that opens the extended sidebar with Projects, Drafts, Stickies and the workspace pages.
export const SidebarMenuItems = observer(function SidebarMenuItems() {
  // store hooks
  const { isExtendedSidebarOpened, toggleExtendedSidebar } = useAppTheme();
  // hooks
  const { preferences: personalPreferences } = usePersonalNavigationPreferences();
  const { preferences: workspacePreferences } = useWorkspaceNavigationPreferences();
  // translation
  const { t } = useTranslation();

  const staticNavigationItems = useMemo(() => {
    const items = [...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS];
    const yourWork = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["your-work"];
    if (personalPreferences.items.your_work?.enabled && yourWork) items.push(yourWork);
    return items;
  }, [personalPreferences]);

  const pinnedNavigationItems = useMemo(
    () =>
      WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS.filter((item) => workspacePreferences.items[item.key]?.is_pinned)
        // oxlint-disable-next-line oxc/no-map-spread
        .map((item) => ({ ...item, sort_order: workspacePreferences.items[item.key]?.sort_order ?? 0 }))
        // oxlint-disable-next-line unicorn/no-array-sort
        .sort((a, b) => a.sort_order - b.sort_order),
    [workspacePreferences]
  );

  return (
    <div className="flex flex-col gap-0.5">
      {staticNavigationItems.map((item) => (
        <SidebarItemBase key={item.key} item={item} />
      ))}
      {pinnedNavigationItems.map((item) => (
        <SidebarItemBase key={item.key} item={item} />
      ))}
      <SidebarNavItem isActive={!!isExtendedSidebarOpened}>
        <button
          type="button"
          onClick={() => toggleExtendedSidebar()}
          className="flex flex-grow items-center gap-1.5 py-[1px] text-13 leading-5 font-medium"
          id="extended-sidebar-toggle"
          aria-expanded={!!isExtendedSidebarOpened}
          aria-label={t(
            isExtendedSidebarOpened
              ? "aria_labels.app_sidebar.close_extended_sidebar"
              : "aria_labels.app_sidebar.open_extended_sidebar"
          )}
        >
          <Ellipsis className="size-4 flex-shrink-0" />
          <span>More</span>
        </button>
      </SidebarNavItem>
    </div>
  );
});
