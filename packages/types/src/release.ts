/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400) — a batch of work items that reaches production together.

export type TReleaseStatus = "planning" | "frozen" | "released" | "rolled_back" | "cancelled";

export type TReleaseChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
};

export type TRelease = {
  id: string;
  name: string;
  version: string;
  /** the release notes */
  description_html: string;
  status: TReleaseStatus;
  target_date: string | null;
  released_at: string | null;
  owned_by: string | null;
  checklist: TReleaseChecklistItem[];
  sort_order: number;
  project: string;
  workspace: string;
  // counts, annotated by the list and detail endpoints
  total_items?: number;
  shipped_items?: number;
  unplanned_items?: number;
  ready_items?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
};

export type TReleaseStateLite = {
  id: string;
  name: string;
  group: string;
  color: string;
};

/** A work item as listed inside a release; `id` is the work item id. */
export type TReleaseIssue = {
  id: string;
  sequence_id: number;
  project_identifier: string;
  name: string;
  state: TReleaseStateLite | null;
  assignee_ids: string[];
  priority: string | null;
  shipped_at: string | null;
  shipped_via: string;
  is_unplanned: boolean;
  previous_state_name: string | null;
};

export type TReleaseCandidate = {
  id: string;
  sequence_id: number;
  project_identifier: string;
  name: string;
  state: TReleaseStateLite | null;
};

export type TReleaseFormData = Pick<TRelease, "name" | "version" | "target_date" | "owned_by">;

export type TReleaseUpdatePayload = Partial<
  Pick<TRelease, "name" | "version" | "description_html" | "target_date" | "owned_by" | "checklist">
> & { status?: Extract<TReleaseStatus, "planning" | "frozen" | "cancelled"> };

export type TReleaseShipResult = {
  key: string;
  issue_id: string;
  moved: boolean;
};

export type TReleaseMarkReleasedResponse = {
  release_id: string;
  status: TReleaseStatus;
  results: TReleaseShipResult[];
};

export type TReleaseUndoEntry = {
  key: string;
  issue_id: string;
  /** the state the item is in after the undo (restored) or was left in (left alone) */
  state: string | null;
};

export type TReleaseUndoResponse = {
  release_id: string;
  status: TReleaseStatus;
  restored: TReleaseUndoEntry[];
  left_alone: TReleaseUndoEntry[];
};

/** The release a work item currently belongs to (open first, else the most recent). */
export type TIssueRelease = {
  id: string;
  name: string;
  version: string;
  status: TReleaseStatus;
  shipped_at: string | null;
  is_unplanned: boolean;
};
