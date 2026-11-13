/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ScrollArea } from "@plane/propel/scrollarea";
import { cn } from "@plane/utils";
import { useChromeAttributes } from "@/lib/use-look";
// local imports
import { WorkspaceSettingsSidebarHeader } from "./header";
import { WorkspaceSettingsSidebarItemCategories } from "./item-categories";

type Props = {
  className?: string;
};

export function WorkspaceSettingsSidebarRoot(props: Props) {
  const { className } = props;

  // CCI: the settings sidebar wears the same navy chrome as the app sidebar.
  const chromeAttributes = useChromeAttributes();

  return (
    <div {...chromeAttributes} className="flex h-full shrink-0">
      <ScrollArea
        scrollType="hover"
        orientation="vertical"
        size="sm"
        rootClassName={cn("h-full w-[250px] shrink-0 animate-fade-in overflow-y-scroll bg-surface-1", className)}
      >
        <WorkspaceSettingsSidebarHeader />
        <WorkspaceSettingsSidebarItemCategories />
      </ScrollArea>
    </div>
  );
}
