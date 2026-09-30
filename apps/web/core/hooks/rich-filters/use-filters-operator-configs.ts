/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, COMPARISON_OPERATOR, EQUALITY_OPERATOR } from "@plane/types";

export type TFiltersOperatorConfigs = {
  allowedOperators: Set<TSupportedOperators>;
  allowNegative: true;
};

export type TUseFiltersOperatorConfigsProps = {
  workspaceSlug: string;
};

/**
 * The operators every work item filter may offer.
 *
 * Built from the composed operator sets rather than the core ones, so an operator added to the
 * extended set - "is empty", for instance - is offered without a second edit here.
 */
const ALLOWED_OPERATORS = new Set<TSupportedOperators>([
  ...Object.values(EQUALITY_OPERATOR),
  ...Object.values(COLLECTION_OPERATOR),
  ...Object.values(COMPARISON_OPERATOR),
]);

export const useFiltersOperatorConfigs = (_props: TUseFiltersOperatorConfigsProps): TFiltersOperatorConfigs => ({
  allowedOperators: ALLOWED_OPERATORS,
  allowNegative: true,
});
