/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, ReactElement, SetStateAction } from "react";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useIsPhoneWidth } from "@/hooks/use-is-phone-width";
// helpers
import { usePlatformOS } from "@plane/hooks";
import { cn } from "@plane/utils";

interface ResizableSidebarProps {
  showPeek?: boolean;
  togglePeek: (value?: boolean) => void;
  isCollapsed?: boolean;
  width: number;
  setWidth: Dispatch<SetStateAction<number>>;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultCollapsed?: boolean;
  peekDuration?: number;
  toggleCollapsed: (value?: boolean) => void;
  onWidthChange?: (width: number) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
  /** Extra attributes for the sidebar panels, e.g. the navy chrome scope. */
  panelAttributes?: Record<string, string>;
  children?: ReactElement;
  extendedSidebar?: ReactElement;
  isAnyExtendedSidebarExpanded?: boolean;
  isAnySidebarDropdownOpen?: boolean;
}

export function ResizableSidebar({
  showPeek = false,
  togglePeek,
  peekDuration = 500,
  isCollapsed = false,
  toggleCollapsed: toggleCollapsedProp,
  onCollapsedChange,
  width,
  setWidth,
  onWidthChange,
  minWidth = 236,
  maxWidth = 350,
  className = "",
  panelAttributes,
  children,
  extendedSidebar,
  isAnyExtendedSidebarExpanded = false,
  isAnySidebarDropdownOpen = false,
}: ResizableSidebarProps) {
  // states
  const [isResizing, setIsResizing] = useState(false);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  // refs
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const initialWidthRef = useRef<number>(0);
  const initialMouseXRef = useRef<number>(0);
  // hooks
  const { isMobile: isMobileOS } = usePlatformOS();
  // CCI: below 768px the sidebar overlays the page whatever the device, so a narrow window or split view
  // doesn't squeeze the content into a sliver.
  const isNarrow = useIsPhoneWidth();
  const isMobile = isMobileOS || isNarrow;
  // CCI: on a phone the overlay starts closed and closes after each navigation, so a page never
  // opens hidden behind it.
  const pathname = usePathname();
  useEffect(() => {
    if (isMobile) toggleCollapsedProp(true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- react to width and route changes only
  }, [isMobile, pathname]);
  // handlers
  const setShowPeek = useCallback(
    (value: boolean) => {
      togglePeek(value);
    },
    [togglePeek]
  );

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - initialMouseXRef.current;
      const newWidth = Math.min(Math.max(initialWidthRef.current + deltaX, minWidth), maxWidth);
      setWidth(newWidth);
    },
    [isResizing, minWidth, maxWidth, setWidth]
  );

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      setIsResizing(true);
      initialWidthRef.current = width;
      initialMouseXRef.current = e.clientX;
    },
    [width]
  );

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    toggleCollapsedProp();
    setShowPeek(false);
    setIsHoveringTrigger(false);
    if (peekTimeoutRef.current) {
      clearTimeout(peekTimeoutRef.current);
    }
  }, [toggleCollapsedProp, setShowPeek]);

  const handlePeekEnter = useCallback(() => {
    if (isCollapsed && showPeek) {
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    }
  }, [isCollapsed, showPeek]);

  const handlePeekLeave = useCallback(() => {
    if (isCollapsed && !isAnyExtendedSidebarExpanded && !isAnySidebarDropdownOpen) {
      peekTimeoutRef.current = setTimeout(() => {
        setShowPeek(false);
      }, peekDuration);
    }
  }, [isCollapsed, peekDuration, setShowPeek, isAnyExtendedSidebarExpanded, isAnySidebarDropdownOpen]);

  // Set up event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleResize, stopResizing]);

  // Clean up timeout on unmount
  useEffect(
    () => () => {
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAnySidebarDropdownOpen && isCollapsed && isHoveringTrigger) {
      handlePeekLeave();
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnySidebarDropdownOpen]);

  useEffect(() => {
    if (!isAnyExtendedSidebarExpanded && isCollapsed && isHoveringTrigger) {
      handlePeekLeave();
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyExtendedSidebarExpanded]);

  // Reset peek when sidebar is expanded
  useEffect(() => {
    if (!isCollapsed) {
      setShowPeek(false);
      setIsHoveringTrigger(false);
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
      }
    }
  }, [isCollapsed, setShowPeek]);

  // Call external handlers when state changes
  useEffect(() => {
    onWidthChange?.(width);
  }, [width, onWidthChange]);

  useEffect(() => {
    onCollapsedChange?.(isCollapsed);
  }, [isCollapsed, onCollapsedChange]);

  return (
    <>
      {/* CCI: a scrim behind the overlaid sidebar on narrow screens. It swallows the tap; the sidebar's
          outside-click handler closes it. */}
      {isMobile && !isCollapsed && (
        <div aria-hidden className="fixed inset-0 z-[19] bg-black/30 motion-safe:animate-fade-in" />
      )}
      {/* Main Sidebar */}
      <div
        id="main-sidebar"
        {...panelAttributes}
        className={cn(
          "z-20 h-full bg-surface-1", // CCI: navy against the white work area needs no divider
          // CCI: on phones the overlay slides (transform only); on desktop the width snaps, so the work area
          // reflows once instead of on every frame.
          isMobile &&
            (isCollapsed
              ? "transition-[translate,opacity] duration-180 ease-exit"
              : "transition-[translate,opacity] duration-240 ease-out-strong"),
          isCollapsed ? "translate-x-[-100%] opacity-0" : "translate-x-0 opacity-100",
          isCollapsed && !isMobile && "w-0",
          isMobile && isCollapsed && "pointer-events-none",
          isMobile && "absolute",
          className
        )}
        style={{
          width: `${isCollapsed && !isMobile ? 0 : width}px`,
          minWidth: `${isCollapsed && !isMobile ? 0 : width}px`,
          maxWidth: `${isCollapsed && !isMobile ? 0 : width}px`,
        }}
        role="complementary"
        aria-label="Main sidebar"
        data-prevent-outside-click={isMobile}
      >
        <aside
          className={cn(
            "group/sidebar relative flex h-full w-full flex-col overflow-hidden bg-surface-1 pt-3",
            isAnyExtendedSidebarExpanded && "rounded-none"
          )}
        >
          {children}

          {/* Resize Handle */}
          <div
            className={cn(
              "absolute z-[20] h-full w-1 cursor-ew-resize transition-all duration-200",
              !isResizing && "hover:bg-surface-2",
              isResizing && "w-1.5 bg-layer-1",
              "top-0 right-0"
            )}
            // onDoubleClick toggle sidebar
            onDoubleClick={() => toggleCollapsed()}
            onMouseDown={(e) => startResizing(e)}
            role="separator"
            aria-label="Resize sidebar"
          />
        </aside>
      </div>
      {/* Peek View */}
      <div
        className={cn(
          "shadow-sm absolute left-0 z-20 h-full bg-surface-1",
          !isResizing && "transition-[translate,opacity] duration-180 ease-out-strong",
          isCollapsed && showPeek ? "translate-x-0 opacity-100" : "translate-x-[-100%] opacity-0",
          "pointer-events-none",
          isCollapsed && showPeek && "pointer-events-auto",
          !showPeek ? "w-0" : "w-full"
        )}
        style={{
          width: `${width}px`,
        }}
        {...panelAttributes}
        onMouseEnter={handlePeekEnter}
        onMouseLeave={handlePeekLeave}
        role="complementary"
        aria-label="Sidebar peek view"
      >
        <aside
          className={cn(
            "group/sidebar relative z-20 flex h-full w-full flex-col overflow-hidden bg-surface-1 pt-4",
            "self-center rounded-md rounded-tl-none rounded-bl-none border-r border-subtle",
            isAnyExtendedSidebarExpanded && "rounded-none"
          )}
        >
          {children}
          {/* Resize Handle */}
          <div
            className={cn(
              "absolute z-[20] h-full w-1 cursor-ew-resize transition-all duration-200",
              !isResizing && "hover:bg-surface-2",
              isResizing && "bg-layer-1",
              "top-0 right-0"
            )}
            // onDoubleClick toggle sidebar
            onDoubleClick={() => toggleCollapsed()}
            onMouseDown={(e) => startResizing(e)}
            role="separator"
            aria-label="Resize sidebar"
          />
        </aside>
      </div>

      {/* Extended Sidebar */}
      {extendedSidebar}
    </>
  );
}
