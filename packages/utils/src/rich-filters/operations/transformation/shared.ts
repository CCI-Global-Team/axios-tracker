/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterGroupNode, TFilterNotGroupNode, TFilterProperty } from "@plane/types";
import { processGroupNode } from "../../types/shared";
import type { TTreeTransformFn, TTreeTransformResult } from "./core";
import { transformExpressionTree, transformGroupWithChildren } from "./core";

/**
 * Transforms a NOT group by transforming its single child.
 * A NOT whose child transformed away is meaningless, so it is removed with the child.
 */
const transformNotGroup = <P extends TFilterProperty>(
  group: TFilterNotGroupNode<P>,
  transformFn: TTreeTransformFn<P>
): TTreeTransformResult<P> => {
  const childResult = transformExpressionTree(group.child, transformFn);

  if (childResult.expression === null) {
    return { expression: null, shouldNotify: childResult.shouldNotify };
  }

  return {
    expression: { ...group, child: childResult.expression },
    shouldNotify: childResult.shouldNotify,
  };
};

/**
 * Transforms groups by processing children.
 * Handles AND/OR groups with children and NOT groups with single child.
 * @param group - The group to transform
 * @param transformFn - The transformation function
 * @returns The transformation result
 */
export const transformGroup = <P extends TFilterProperty>(
  group: TFilterGroupNode<P>,
  transformFn: TTreeTransformFn<P>
): TTreeTransformResult<P> =>
  processGroupNode(group, {
    onAndGroup: (andGroup) => transformGroupWithChildren(andGroup, transformFn),
    onOrGroup: (orGroup) => transformGroupWithChildren(orGroup, transformFn),
    onNotGroup: (notGroup) => transformNotGroup(notGroup, transformFn),
  });
