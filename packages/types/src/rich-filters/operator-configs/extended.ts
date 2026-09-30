/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TNoneFilterFieldConfig } from "../field-types/extended";
import { EXTENDED_COLLECTION_OPERATOR } from "../operators/extended";

// ----------------------------- EXACT Operator -----------------------------
export type TExtendedExactOperatorConfigs = never;

// ----------------------------- IN Operator -----------------------------
export type TExtendedInOperatorConfigs = never;

// ----------------------------- RANGE Operator -----------------------------
export type TExtendedRangeOperatorConfigs = never;

// ----------------------------- ISNULL Operator -----------------------------
export type TExtendedIsNullOperatorConfigs = TNoneFilterFieldConfig;

// ----------------------------- Extended Operator Specific Configs -----------------------------
export type TExtendedOperatorSpecificConfigs = {
  [EXTENDED_COLLECTION_OPERATOR.IS_NULL]: TExtendedIsNullOperatorConfigs;
};
