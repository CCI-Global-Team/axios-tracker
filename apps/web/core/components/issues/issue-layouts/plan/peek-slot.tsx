/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/**
 * The work item sidebar is portaled outside the Plan board, so a React context can't reach it. While a Plan board
 * is open it registers how to draw its section for an item here, and the sidebar draws whatever is registered.
 */
type TRenderer = (issueId: string) => ReactNode;

let renderer: TRenderer | null = null;
const listeners = new Set<() => void>();

export function setPlanPeekSection(next: TRenderer | null) {
  renderer = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const read = () => renderer;

/** Whether a Plan board is open, so the sidebar starts compact. */
export function usePlanPeekActive() {
  return useSyncExternalStore(subscribe, read, read) !== null;
}

/** The Plan's section in the work item sidebar; nothing outside a Plan board. */
export function PlanPeekSlot({ issueId }: { issueId: string }) {
  const render = useSyncExternalStore(subscribe, read, read);
  return render ? render(issueId) : null;
}
