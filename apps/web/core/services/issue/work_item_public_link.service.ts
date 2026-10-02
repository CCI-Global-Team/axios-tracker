/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: public share links for a single work item (GAM-401)
import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export type TWorkItemPublicLink = {
  id: string;
  token: string;
  /** absolute share url, e.g. https://axios.joincci.org/s/<token> */
  url: string;
  include_description: boolean;
  created_at: string;
  created_by: string | null;
  revoked_at: string | null;
};

export class WorkItemPublicLinkService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/public-links/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TWorkItemPublicLink[]> {
    return this.get(this.base(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { include_description: boolean }
  ): Promise<TWorkItemPublicLink> {
    return this.post(this.base(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async revoke(workspaceSlug: string, projectId: string, issueId: string, linkId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId, issueId)}${linkId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
