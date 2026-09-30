/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type {
  TAllAvailableOperatorsForDisplay,
  TFilterExpression,
  TFilterProperty,
  TSupportedOperators,
} from "@plane/types";
// local imports
import { getNegatedOperator } from "../../operators/shared";
import { isGroupNode, isNotGroupNode } from "../../types/core";
import { getGroupChildren } from "../../types/shared";

/**
 * Walks the tree looking for the node that holds `targetId` as a direct child, and reports whether
 * that holder is a NOT group.
 *
 * This deliberately does not reuse findImmediateParent from ./core: that module imports this one,
 * and making the cycle mutual would leave the binding in its temporal dead zone on some load
 * orders. The question asked here is narrower anyway.
 */
const isNegatedByParent = <P extends TFilterProperty>(expression: TFilterExpression<P>, targetId: string): boolean => {
  if (!isGroupNode(expression)) return false;

  const children = getGroupChildren(expression);
  if (children.some((child) => child.id === targetId)) {
    return isNotGroupNode(expression);
  }

  return children.some((child) => isNegatedByParent(child, targetId));
};

/**
 * Helper function to get the display operator for a condition.
 * This checks for NOT group context and applies negation if needed.
 * @param operator - The original operator
 * @param expression - The filter expression
 * @param conditionId - The ID of the condition
 * @returns The display operator (possibly negated)
 */
export const getDisplayOperator = <P extends TFilterProperty>(
  operator: TSupportedOperators,
  expression: TFilterExpression<P>,
  conditionId: string
): TAllAvailableOperatorsForDisplay => {
  // A condition sitting directly inside a NOT group is shown as its negated operator
  if (isNegatedByParent(expression, conditionId)) {
    return getNegatedOperator(operator);
  }

  // Otherwise, return the operator as-is
  return operator;
};
