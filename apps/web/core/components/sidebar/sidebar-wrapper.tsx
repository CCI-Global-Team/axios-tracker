/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { PreferencesIcon } from "@plane/propel/icons";
import { ScrollArea } from "@plane/propel/scrollarea";
// components
import { CustomizeNavigationDialog } from "@/components/navigation/customize-navigation-dialog";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import useSize from "@/hooks/use-window-size";
// plane web components
import { AppSidebarToggleButton } from "./sidebar-toggle-button";
import { IconButton } from "@plane/propel/icon-button";

type TSidebarWrapperProps = {
  title: string;
  children: React.ReactNode;
  quickActions?: React.ReactNode;
};

export const SidebarWrapper = observer(function SidebarWrapper(props: TSidebarWrapperProps) {
  const { title, children, quickActions } = props;
  // state
  const [isCustomizeNavDialogOpen, setIsCustomizeNavDialogOpen] = useState(false);
  // store hooks
  const { toggleSidebar, sidebarCollapsed } = useAppTheme();
  const windowSize = useSize();
  // refs
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClickDetector(ref, () => {
    if (sidebarCollapsed === false && window.innerWidth < 768) {
      toggleSidebar();
    }
  });

  // Phones always keep the sidebar closed. On tablets it starts closed, and closes again when the window
  // narrows from desktop, so the list gets the width; it can still be opened from the toggle.
  const lastWidth = useRef<number | null>(null);
  useEffect(() => {
    const width = windowSize[0];
    if (!width) return;
    const previous = lastWidth.current;
    lastWidth.current = width;
    if (sidebarCollapsed) return;
    if (width < 768) toggleSidebar(true);
    else if (width < 1024 && (previous === null || previous >= 1024)) toggleSidebar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize]);

  return (
    <>
      <CustomizeNavigationDialog isOpen={isCustomizeNavDialogOpen} onClose={() => setIsCustomizeNavDialogOpen(false)} />
      <div ref={ref} className="flex h-full w-full flex-col">
        {/* CCI: no title row. The new-work-item action shares one row with the customise and collapse buttons. */}
        <div className="flex items-center gap-1 px-3">
          <div className="min-w-0 flex-1">{quickActions}</div>
          <IconButton
            size="base"
            variant="ghost"
            icon={PreferencesIcon}
            onClick={() => setIsCustomizeNavDialogOpen(true)}
            aria-label={title ? `Customize ${title.toLowerCase()} navigation` : "Customize navigation"}
          />
          <AppSidebarToggleButton />
        </div>

        <ScrollArea
          orientation="vertical"
          scrollType="hover"
          size="sm"
          rootClassName="size-full overflow-x-hidden overflow-y-auto"
          viewportClassName="flex flex-col gap-3 overflow-x-hidden h-full w-full overflow-y-auto px-3 pt-3 pb-0.5"
        >
          {children}
        </ScrollArea>
      </div>
    </>
  );
});
