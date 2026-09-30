/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAllAvailableOperatorsForDisplay, TNegatedOperator, TSupportedOperators } from "@plane/types";
import { NEGATED_OPERATOR_PREFIX } from "@plane/types";

/**
 * Result type for operator conversion
 */
export type TOperatorForPayload = {
  operator: TSupportedOperators;
  isNegation: boolean;
};

/**
 * Checks whether a display operator is a negated one.
 * @param displayOperator - The operator from the UI
 * @returns True if the operator is the negated variant of a supported operator
 */
export const isNegatedOperator = (
  displayOperator: TAllAvailableOperatorsForDisplay
): displayOperator is TNegatedOperator => displayOperator.startsWith(NEGATED_OPERATOR_PREFIX);

/**
 * Returns the negated variant of a supported operator.
 * @param operator - The positive operator
 * @returns The negated operator
 */
export const getNegatedOperator = (operator: TSupportedOperators): TNegatedOperator =>
  `${NEGATED_OPERATOR_PREFIX}${operator}`;

/**
 * Converts a display operator to the format needed for supported by filter expression condition.
 * @param displayOperator - The operator from the UI
 * @returns Object with supported operator and negation flag
 */
export const getOperatorForPayload = (displayOperator: TAllAvailableOperatorsForDisplay): TOperatorForPayload => {
  if (isNegatedOperator(displayOperator)) {
    return {
      operator: displayOperator.slice(NEGATED_OPERATOR_PREFIX.length) as TSupportedOperators,
      isNegation: true,
    };
  }

  return {
    operator: displayOperator,
    isNegation: false,
  };
};
