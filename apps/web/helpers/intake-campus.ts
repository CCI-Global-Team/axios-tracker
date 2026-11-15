/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueLabel } from "@plane/types";

/** CCI: support desk. Support requests carry their campus as a child of this project label. */
export const CAMPUS_PARENT_LABEL = "Campus";

/** Campus labels (children of "Campus", by name) apart from every other label; the "Campus" parent
 *  itself goes in neither list, since no item carries it. */
export function splitCampusLabels(labels: IIssueLabel[] | undefined): {
  campusLabels: IIssueLabel[];
  otherLabels: IIssueLabel[];
} {
  const all = labels ?? [];
  const parent = all.find(
    (label) => !label.parent && label.name.trim().toLowerCase() === CAMPUS_PARENT_LABEL.toLowerCase()
  );
  if (!parent) return { campusLabels: [], otherLabels: all };
  const campusLabels = all.filter((label) => label.parent === parent.id).toSorted((a, b) => a.name.localeCompare(b.name));
  const otherLabels = all.filter((label) => label.id !== parent.id && label.parent !== parent.id);
  return { campusLabels, otherLabels };
}
