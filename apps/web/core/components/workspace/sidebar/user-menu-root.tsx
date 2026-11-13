/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, Settings2 } from "lucide-react";
// plane imports
import { GOD_MODE_URL } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, CustomMenu } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useUser } from "@/hooks/store/user";

export const UserMenuRoot = observer(function UserMenuRoot() {
  // states
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  // router
  const router = useRouter();
  // store hooks
  const { toggleAnySidebarDropdown } = useAppTheme();
  const { data: currentUser } = useUser();
  const { signOut } = useUser();
  const { toggleProfileSettingsModal } = useCommandPalette();
  // derived values
  const isUserInstanceAdmin = false;
  const fullName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(" ");
  // translation
  const { t } = useTranslation();

  const handleSignOut = () => {
    signOut().catch(() =>
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("auth.sign_out.toast.error.title"),
        message: t("auth.sign_out.toast.error.message"),
      })
    );
  };

  // Toggle sidebar dropdown state when menu is open
  useEffect(() => {
    if (isUserMenuOpen) toggleAnySidebarDropdown(true);
    else toggleAnySidebarDropdown(false);
  }, [isUserMenuOpen, toggleAnySidebarDropdown]);

  return (
    <CustomMenu
      className="flex items-center"
      customButton={
        <AppSidebarItem
          variant="button"
          item={{
            icon: (
              <Avatar
                name={currentUser?.display_name}
                src={getFileURL(currentUser?.avatar_url ?? "")}
                size={20}
                shape="circle"
              />
            ),
            isActive: isUserMenuOpen,
          }}
        />
      }
      menuButtonOnClick={() => !isUserMenuOpen && setIsUserMenuOpen(true)}
      onMenuClose={() => setIsUserMenuOpen(false)}
      placement="bottom-end"
      maxHeight="2xl"
      optionsClassName="w-64 p-1.5 flex flex-col"
      closeOnSelect
    >
      {/* CCI: who you are in one row, then actions, then sign out on its own; no cover image to read text over. */}
      <div className="flex items-center gap-3 px-2 pt-1.5 pb-2.5">
        <Avatar
          name={currentUser?.display_name}
          src={getFileURL(currentUser?.avatar_url ?? "")}
          size={36}
          shape="circle"
          className="text-15 shrink-0 font-medium"
        />
        <div className="min-w-0">
          <p className="truncate text-body-sm-medium text-primary">{fullName || currentUser?.display_name}</p>
          <p className="truncate text-caption-md-regular text-tertiary">{currentUser?.email}</p>
        </div>
      </div>
      <div className="border-t border-subtle py-1">
        <CustomMenu.MenuItem
          onClick={() => toggleProfileSettingsModal({ activeTab: "general", isOpen: true })}
          className="flex items-center gap-2.5 py-1.5 max-sm:py-2.5"
        >
          <Settings className="size-4 shrink-0 text-tertiary" />
          {t("settings")}
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem
          onClick={() => toggleProfileSettingsModal({ activeTab: "preferences", isOpen: true })}
          className="flex items-center gap-2.5 py-1.5 max-sm:py-2.5"
        >
          <Settings2 className="size-4 shrink-0 text-tertiary" />
          {t("preferences")}
        </CustomMenu.MenuItem>
      </div>
      <div className="border-t border-subtle pt-1">
        <CustomMenu.MenuItem
          onClick={handleSignOut}
          className="group flex items-center gap-2.5 py-1.5 hover:text-danger-primary max-sm:py-2.5"
        >
          <LogOut className="size-4 shrink-0 text-tertiary group-hover:text-danger-primary" />
          {t("sign_out")}
        </CustomMenu.MenuItem>
      </div>
      {isUserInstanceAdmin && (
        <CustomMenu.MenuItem
          onClick={() => router.push(GOD_MODE_URL)}
          className="bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 hover:text-accent-secondary"
        >
          {t("enter_god_mode")}
        </CustomMenu.MenuItem>
      )}
    </CustomMenu>
  );
});
