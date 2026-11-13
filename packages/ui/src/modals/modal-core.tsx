/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Dialog, Transition } from "@headlessui/react";
import React, { Fragment } from "react";
// constants
import { cn } from "../utils";
import { EModalPosition, EModalWidth } from "./constants";
// helpers

type Props = {
  children: React.ReactNode;
  handleClose?: () => void;
  isOpen: boolean;
  position?: EModalPosition;
  width?: EModalWidth;
  className?: string;
};
export function ModalCore(props: Props) {
  const {
    children,
    handleClose,
    isOpen,
    position = EModalPosition.CENTER,
    width = EModalWidth.XXL,
    className = "",
  } = props;

  return (
    <Transition.Root show={isOpen} as={Fragment} appear>
      <Dialog as="div" className="relative z-30" onClose={() => handleClose && handleClose()}>
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-180 ease-out-strong"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-120 ease-exit"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-backdrop" />
        </Transition.Child>

        <div className="fixed inset-0 z-30 overflow-y-auto">
          <div className={position}>
            <Transition.Child
              as={Fragment}
              enter="transition-[opacity,translate,scale] duration-200 ease-out-strong"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-97"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="transition-[opacity,translate,scale] duration-140 ease-exit"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-97"
            >
              <Dialog.Panel
                className={cn(
                  "relative w-full transform rounded-lg bg-surface-1 text-left shadow-raised-200",
                  width,
                  className
                )}
              >
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
