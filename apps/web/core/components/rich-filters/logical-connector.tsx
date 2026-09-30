/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
// plane imports
import { cn } from "@plane/propel/utils";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
import { LOGICAL_OPERATOR } from "@plane/types";

const OPERATOR_LABEL = {
  [LOGICAL_OPERATOR.AND]: "and",
  [LOGICAL_OPERATOR.OR]: "or",
  [LOGICAL_OPERATOR.NOT]: "not",
} as const;

type TLogicalConnectorProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E>;
  isDisabled?: boolean;
};

/**
 * The word between two filter chips. Clicking it swaps every chip in the bar between "and" and
 * "or", because they all share one group - there is no way to join two chips differently from
 * the rest without nesting, which the bar does not draw.
 *
 * When the expression is nested it reads as plain text: the conditions shown are joined by more
 * than one operator, so there is nothing a single control could honestly change.
 */
export const LogicalConnector = observer(function LogicalConnector<
  P extends TFilterProperty,
  E extends TExternalFilter,
>(props: TLogicalConnectorProps<P, E>) {
  const { filter, isDisabled = false } = props;
  // derived values
  const logicalOperator = filter.rootLogicalOperator;
  const canChange = filter.canChangeRootLogicalOperator && !isDisabled;

  if (!logicalOperator) return null;

  const label = OPERATOR_LABEL[logicalOperator];

  if (!canChange) {
    return <span className="px-1 text-11 text-placeholder select-none">{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() =>
        filter.setRootLogicalOperator(
          logicalOperator === LOGICAL_OPERATOR.AND ? LOGICAL_OPERATOR.OR : LOGICAL_OPERATOR.AND
        )
      }
      aria-label={`Join filters with ${label === "and" ? "or" : "and"} instead`}
      className={cn(
        "rounded px-1 text-11 text-secondary transition-colors",
        "focus-visible:ring-accent-primary hover:bg-layer-2-hover hover:text-primary focus-visible:ring-1 focus-visible:outline-none"
      )}
    >
      {label}
    </button>
  );
});
