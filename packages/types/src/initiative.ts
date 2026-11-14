/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TInitiativeProgress = {
  total_issues: number;
  completed_issues: number;
  cancelled_issues: number;
  started_issues: number;
  unstarted_issues: number;
  backlog_issues: number;
};

export type TInitiative = TInitiativeProgress & {
  id: string;
  name: string;
  description: string;
  lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  module_ids: string[];
  project_ids: string[];
};

export type TInitiativeCreatePayload = Pick<TInitiative, "name"> &
  Partial<Pick<TInitiative, "description" | "lead_id" | "start_date" | "target_date" | "sort_order">>;
export type TInitiativeUpdatePayload = Partial<TInitiativeCreatePayload>;
