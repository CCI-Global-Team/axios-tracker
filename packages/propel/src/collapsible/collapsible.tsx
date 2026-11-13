/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { Collapsible as BaseCollapsible } from "@base-ui-components/react/collapsible";
import { clsx } from "clsx";

// Types
type CollapsibleContextType = {
  isOpen: boolean;
  onToggle: () => void;
};

type RootProps = {
  children: React.ReactNode;
  className?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
};

type TriggerProps = {
  children: React.ReactNode;
  className?: string;
  buttonRef?: React.RefObject<HTMLButtonElement>;
};

type ContentProps = {
  children: React.ReactNode;
  className?: string;
};

// Context
const CollapsibleContext = createContext<CollapsibleContextType | undefined>(undefined);

// Hook
const useCollapsible = () => {
  const context = useContext(CollapsibleContext);
  if (!context) {
    throw new Error("Collapsible compound components cannot be rendered outside the Collapsible component");
  }
  return context;
};

// Components
function Root({ children, className, isOpen: controlledIsOpen, onToggle, defaultOpen }: RootProps) {
  const [localIsOpen, setLocalIsOpen] = useState<boolean>(controlledIsOpen || defaultOpen || false);

  useEffect(() => {
    if (controlledIsOpen !== undefined) {
      setLocalIsOpen(controlledIsOpen);
    }
  }, [controlledIsOpen]);

  const handleToggle = useCallback(() => {
    if (controlledIsOpen !== undefined) {
      onToggle?.();
    } else {
      setLocalIsOpen((prev) => !prev);
    }
  }, [controlledIsOpen, onToggle]);

  return (
    // oxlint-disable-next-line jsx-no-constructed-context-values -- upstream shape; consumers are a handful of leaf nodes
    <CollapsibleContext.Provider value={{ isOpen: localIsOpen, onToggle: handleToggle }}>
      <BaseCollapsible.Root
        className={clsx(className)}
        defaultOpen={defaultOpen}
        open={localIsOpen}
        onOpenChange={handleToggle}
      >
        {children}
      </BaseCollapsible.Root>
    </CollapsibleContext.Provider>
  );
}

function Trigger({ children, className, buttonRef }: TriggerProps) {
  const { isOpen } = useCollapsible();

  return (
    <BaseCollapsible.Trigger data-panel-open={isOpen} ref={buttonRef} className={className}>
      {children}
    </BaseCollapsible.Trigger>
  );
}

function Content({ children, className }: ContentProps) {
  return (
    <BaseCollapsible.Panel
      className={clsx(
        // CCI: the height snaps and the content fades, so the page below reflows once instead of every frame.
        "flex flex-col overflow-hidden text-13 transition-opacity duration-120 ease-out-strong data-[ending-style]:opacity-0 data-[ending-style]:duration-80 data-[ending-style]:ease-exit data-[starting-style]:opacity-0",
        className
      )}
    >
      {children}
    </BaseCollapsible.Panel>
  );
}

// Compound Component
export const Collapsible = {
  CollapsibleRoot: Root,
  CollapsibleTrigger: Trigger,
  CollapsibleContent: Content,
};
