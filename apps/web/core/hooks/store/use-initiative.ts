/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { IInitiativeStore } from "@/store/initiative.store";

export const useInitiative = (): IInitiativeStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useInitiative must be used within StoreProvider");
  return context.initiative;
};
