/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { API_BASE_URL } from "@plane/constants";
import type {
  TIssueRelease,
  TRelease,
  TReleaseCandidate,
  TReleaseFormData,
  TReleaseIssue,
  TReleaseMarkReleasedResponse,
  TReleaseUndoResponse,
  TReleaseUpdatePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TReleaseServiceError = { status?: number } & Record<string, unknown>;

const toError = (error: any): TReleaseServiceError => ({
  status: error?.response?.status,
  ...error?.response?.data,
});

export class ReleaseService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/releases/`;
  }

  async getReleases(workspaceSlug: string, projectId: string): Promise<TRelease[]> {
    return this.get(this.base(workspaceSlug, projectId))
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async createRelease(workspaceSlug: string, projectId: string, data: Partial<TReleaseFormData>): Promise<TRelease> {
    return this.post(this.base(workspaceSlug, projectId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async getRelease(workspaceSlug: string, projectId: string, releaseId: string): Promise<TRelease> {
    return this.get(`${this.base(workspaceSlug, projectId)}${releaseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async updateRelease(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: TReleaseUpdatePayload
  ): Promise<TRelease> {
    return this.patch(`${this.base(workspaceSlug, projectId)}${releaseId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async deleteRelease(workspaceSlug: string, projectId: string, releaseId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}${releaseId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw toError(error);
      });
  }

  async getReleaseIssues(workspaceSlug: string, projectId: string, releaseId: string): Promise<TReleaseIssue[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}${releaseId}/issues/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  /** Rejects with status 409 when any of the items already sits in another open release. */
  async addReleaseIssues(
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    issueIds: string[]
  ): Promise<unknown> {
    return this.post(`${this.base(workspaceSlug, projectId)}${releaseId}/issues/`, { issue_ids: issueIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async removeReleaseIssue(workspaceSlug: string, projectId: string, releaseId: string, issueId: string) {
    return this.delete(`${this.base(workspaceSlug, projectId)}${releaseId}/issues/${issueId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw toError(error);
      });
  }

  async markReleased(
    workspaceSlug: string,
    projectId: string,
    releaseId: string
  ): Promise<TReleaseMarkReleasedResponse> {
    return this.post(`${this.base(workspaceSlug, projectId)}${releaseId}/mark-released/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async reopen(workspaceSlug: string, projectId: string, releaseId: string): Promise<TReleaseUndoResponse> {
    return this.post(`${this.base(workspaceSlug, projectId)}${releaseId}/reopen/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async rollBack(workspaceSlug: string, projectId: string, releaseId: string): Promise<TReleaseUndoResponse> {
    return this.post(`${this.base(workspaceSlug, projectId)}${releaseId}/roll-back/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw toError(error);
      });
  }

  async getCandidates(workspaceSlug: string, projectId: string, search?: string): Promise<TReleaseCandidate[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/release-candidates/`, {
      params: search ? { search } : {},
    })
      .then((response) => {
        const data = response?.data;
        return Array.isArray(data) ? data : (data?.results ?? []);
      })
      .catch((error) => {
        throw toError(error);
      });
  }

  async getIssueRelease(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueRelease | null> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/release/`)
      .then((response) => {
        const data = response?.data;
        if (!data || typeof data !== "object") return null;
        // The link may be returned flat or wrap the release; either way the UI needs the release id.
        const release = data.release && typeof data.release === "object" ? data.release : data;
        const id = data.release_id ?? release.id;
        if (!id) return null;
        return {
          id,
          name: release.name ?? data.release_name ?? "",
          version: release.version ?? "",
          status: release.status ?? data.status,
          shipped_at: data.shipped_at ?? null,
          is_unplanned: Boolean(data.is_unplanned),
        };
      })
      .catch((error) => {
        throw toError(error);
      });
  }
}
