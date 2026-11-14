/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "./issue";

export type TIssueRelation = Record<TIssueRelationTypes, TIssue[]>;

export type TIssueRelationMap = {
  [issue_id: string]: Record<TIssueRelationTypes, string[]>;
};

export type TIssueRelationIdMap = Record<TIssueRelationTypes, string[]>;

export type TIssueRelationTypes = "blocking" | "blocked_by" | "duplicate" | "relates_to";

/** CCI: a stored relation row, as the workspace work-item-relations endpoint returns it (Plan layout). */
export type TWorkItemRelationEdge = {
  id: string;
  relation_type: string;
  issue_id: string;
  related_issue_id: string;
  project_id: string;
  related_project_id: string;
};

/** CCI: just enough about either end of a relation to show it when it sits outside the plan's scope. */
export type TWorkItemRelationEnd = {
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  state_group: string;
  state_name: string;
  is_archived: boolean;
};

export type TWorkItemRelationsResponse = {
  relations: TWorkItemRelationEdge[];
  work_items: Record<string, TWorkItemRelationEnd>;
};
