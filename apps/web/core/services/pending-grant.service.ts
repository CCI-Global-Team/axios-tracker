/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** CCI: what a member picker was choosing someone for, held until an invited person accepts. */
export type TPendingGrantKind =
  | "project_member"
  | "label_owner"
  | "project_default_assignee"
  | "project_lead"
  | "issue_assignee";

/** CCI: the field a picker was opened from. targetId is the label or work item, when there is one. */
export type TPendingGrantTarget = {
  kind: TPendingGrantKind;
  targetId?: string;
};

export type TPendingGrant = {
  id: string;
  email: string;
  kind: TPendingGrantKind;
  project_id: string;
  target_id: string | null;
  invite_id: string;
  created_by: string | null;
  created_at: string;
};

export type TPendingGrantCreatePayload = {
  email: string;
  kind: TPendingGrantKind;
  project_id: string;
  target_id?: string | null;
};

export class PendingGrantService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(slug: string) {
    return `/api/workspaces/${slug}/pending-grants/`;
  }

  async list(slug: string, projectId: string): Promise<TPendingGrant[]> {
    return this.get(this.base(slug), { params: { project_id: projectId } }).then((response) => response.data);
  }

  async create(slug: string, data: TPendingGrantCreatePayload): Promise<TPendingGrant> {
    return this.post(this.base(slug), data)
      .then((response) => response.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancel(slug: string, id: string): Promise<void> {
    await this.delete(`${this.base(slug)}${id}/`).catch((error) => {
      throw error?.response?.data;
    });
  }
}
