/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Disclosure, Transition } from "@headlessui/react";
import React, { useState, useEffect, useCallback } from "react";

export type TCollapsibleProps = {
  title: string | React.ReactNode;
  children: React.ReactNode;
  buttonRef?: React.RefObject<HTMLButtonElement>;
  className?: string;
  buttonClassName?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
};

export function Collapsible(props: TCollapsibleProps) {
  const { title, children, buttonRef, className, buttonClassName, isOpen, onToggle, defaultOpen } = props;
  // state
  const [localIsOpen, setLocalIsOpen] = useState<boolean>(Boolean(isOpen || defaultOpen));

  useEffect(() => {
    if (isOpen !== undefined) {
      setLocalIsOpen(isOpen);
    }
  }, [isOpen]);

  // handlers
  const handleOnClick = useCallback(() => {
    if (isOpen !== undefined) {
      if (onToggle) onToggle();
    } else {
      setLocalIsOpen((prev) => !prev);
    }
  }, [isOpen, onToggle]);

  return (
    <Disclosure as="div" className={className}>
      <Disclosure.Button ref={buttonRef} className={buttonClassName} onClick={handleOnClick}>
        {title}
      </Disclosure.Button>
      <Transition
        show={localIsOpen}
        // CCI: the height snaps and the content fades, so the page below reflows once instead of every frame.
        enter="transition-opacity duration-120 ease-out-strong"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-80 ease-exit"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        className="grid overflow-hidden"
      >
        <Disclosure.Panel static className="min-h-0">
          {children}
        </Disclosure.Panel>
      </Transition>
    </Disclosure>
  );
}
