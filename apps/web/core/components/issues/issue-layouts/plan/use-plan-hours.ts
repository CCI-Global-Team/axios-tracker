/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";

// CCI: hours the viewer has typed into the Plan's Schedule. Kept in this browser only (v1): an item's estimate in
// hours, and a person's hours a week when it differs from what they declared in Availability.
type TPlanHours = { items: Record<string, number>; people: Record<string, number> };

const EMPTY: TPlanHours = { items: {}, people: {} };
const storageKey = (workspaceSlug: string) => `axios:plan-hours:${workspaceSlug}`;

function read(workspaceSlug: string): TPlanHours {
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceSlug));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TPlanHours>;
    return { items: parsed.items ?? {}, people: parsed.people ?? {} };
  } catch {
    return EMPTY;
  }
}

export function usePlanHours(workspaceSlug: string) {
  const [hours, setHours] = useState<TPlanHours>(EMPTY);

  useEffect(() => setHours(read(workspaceSlug)), [workspaceSlug]);

  const update = useCallback(
    (kind: keyof TPlanHours, id: string, value: number | null) => {
      setHours((prev) => {
        const nextKind = { ...prev[kind] };
        if (value === null || !Number.isFinite(value) || (kind === "people" ? value < 0 : value <= 0))
          delete nextKind[id];
        else nextKind[id] = Math.round(value * 10) / 10;
        const next = { ...prev, [kind]: nextKind };
        try {
          window.localStorage.setItem(storageKey(workspaceSlug), JSON.stringify(next));
        } catch {
          // storage blocked: keep the change for this visit only
        }
        return next;
      });
    },
    [workspaceSlug]
  );

  return {
    itemHours: hours.items,
    personHours: hours.people,
    setItemHours: useCallback((id: string, h: number | null) => update("items", id, h), [update]),
    setPersonHours: useCallback((id: string, h: number | null) => update("people", id, h), [update]),
  };
}
