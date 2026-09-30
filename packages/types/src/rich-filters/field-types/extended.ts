/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TBaseFilterFieldConfig } from "./shared";

/**
 * Extended filter types
 */
export const EXTENDED_FILTER_FIELD_TYPE = {
  /** Takes no value - the operator alone is the whole condition, as in "cycle is empty". */
  NONE: "none",
} as const;

/**
 * Configuration for an operator that carries no user-supplied value.
 */
export type TNoneFilterFieldConfig = TBaseFilterFieldConfig & {
  type: typeof EXTENDED_FILTER_FIELD_TYPE.NONE;
};

// -------- UNION TYPES --------

/**
 * All extended filter configurations
 */
export type TExtendedFilterFieldConfigs<_V extends TFilterValue = TFilterValue> = TNoneFilterFieldConfig;
