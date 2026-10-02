/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import { orderBy, set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
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
import { ReleaseService } from "@/services/release.service";
// store
import type { CoreRootStore } from "./root.store";

export interface IReleaseStore {
  // observables
  releaseMap: Record<string, TRelease>;
  releaseIssuesMap: Record<string, TReleaseIssue[]>;
  fetchedMap: Record<string, boolean>;
  issueReleaseMap: Record<string, TIssueRelease | null>;
  // computed actions
  getProjectReleaseIds: (projectId: string) => string[] | null;
  getReleaseById: (releaseId: string) => TRelease | undefined;
  getReleaseIssues: (releaseId: string) => TReleaseIssue[] | undefined;
  getIssueRelease: (issueId: string) => TIssueRelease | null | undefined;
  // actions
  fetchReleases: (workspaceSlug: string, projectId: string) => Promise<TRelease[]>;
  fetchReleaseDetails: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TRelease>;
  createRelease: (workspaceSlug: string, projectId: string, data: Partial<TReleaseFormData>) => Promise<TRelease>;
  updateRelease: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: TReleaseUpdatePayload
  ) => Promise<TRelease>;
  deleteRelease: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  fetchReleaseIssues: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TReleaseIssue[]>;
  addReleaseIssues: (workspaceSlug: string, projectId: string, releaseId: string, issueIds: string[]) => Promise<void>;
  removeReleaseIssue: (workspaceSlug: string, projectId: string, releaseId: string, issueId: string) => Promise<void>;
  markReleased: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TReleaseMarkReleasedResponse>;
  reopen: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TReleaseUndoResponse>;
  rollBack: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<TReleaseUndoResponse>;
  fetchCandidates: (workspaceSlug: string, projectId: string, search?: string) => Promise<TReleaseCandidate[]>;
  fetchIssueRelease: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssueRelease | null>;
}

export class ReleaseStore implements IReleaseStore {
  releaseMap: Record<string, TRelease> = {};
  releaseIssuesMap: Record<string, TReleaseIssue[]> = {};
  fetchedMap: Record<string, boolean> = {};
  issueReleaseMap: Record<string, TIssueRelease | null> = {};
  // root store
  rootStore;
  // services
  releaseService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      releaseMap: observable,
      releaseIssuesMap: observable,
      fetchedMap: observable,
      issueReleaseMap: observable,
      fetchReleases: action,
      fetchReleaseDetails: action,
      createRelease: action,
      updateRelease: action,
      deleteRelease: action,
      fetchReleaseIssues: action,
      addReleaseIssues: action,
      removeReleaseIssue: action,
      markReleased: action,
      reopen: action,
      rollBack: action,
      fetchIssueRelease: action,
    });
    this.rootStore = _rootStore;
    this.releaseService = new ReleaseService();
  }

  // computed actions
  getProjectReleaseIds = computedFn((projectId: string): string[] | null => {
    if (!this.fetchedMap[projectId]) return null;
    const releases = Object.values(this.releaseMap).filter((release) => release.project === projectId);
    return orderBy(releases, ["created_at"], ["desc"]).map((release) => release.id);
  });

  getReleaseById = computedFn((releaseId: string): TRelease | undefined => this.releaseMap[releaseId]);

  getReleaseIssues = computedFn((releaseId: string): TReleaseIssue[] | undefined => this.releaseIssuesMap[releaseId]);

  getIssueRelease = computedFn((issueId: string): TIssueRelease | null | undefined => this.issueReleaseMap[issueId]);

  // helpers
  private setRelease = (release: TRelease, projectId: string) => {
    // the serializer may omit `project`; the list belongs to the project it was fetched for
    const { project_id } = release as TRelease & { project_id?: string };
    set(this.releaseMap, [release.id], { ...release, project: release.project ?? project_id ?? projectId });
  };

  // actions
  fetchReleases = async (workspaceSlug: string, projectId: string) => {
    const releases = await this.releaseService.getReleases(workspaceSlug, projectId);
    runInAction(() => {
      Object.values(this.releaseMap)
        .filter((release) => release.project === projectId)
        .forEach((release) => delete this.releaseMap[release.id]);
      releases.forEach((release) => this.setRelease(release, projectId));
      set(this.fetchedMap, [projectId], true);
    });
    return releases;
  };

  fetchReleaseDetails = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const release = await this.releaseService.getRelease(workspaceSlug, projectId, releaseId);
    runInAction(() => this.setRelease(release, projectId));
    return release;
  };

  createRelease = async (workspaceSlug: string, projectId: string, data: Partial<TReleaseFormData>) => {
    const release = await this.releaseService.createRelease(workspaceSlug, projectId, data);
    runInAction(() => this.setRelease(release, projectId));
    return release;
  };

  updateRelease = async (workspaceSlug: string, projectId: string, releaseId: string, data: TReleaseUpdatePayload) => {
    const previous = this.releaseMap[releaseId];
    // optimistic, so checklist ticks and notes feel instant
    if (previous) runInAction(() => set(this.releaseMap, [releaseId], { ...previous, ...data }));
    try {
      const release = await this.releaseService.updateRelease(workspaceSlug, projectId, releaseId, data);
      // keep the counts the list endpoint annotated if the PATCH response does not carry them
      runInAction(() => this.setRelease({ ...previous, ...release }, projectId));
      return release;
    } catch (error) {
      if (previous) runInAction(() => set(this.releaseMap, [releaseId], previous));
      throw error;
    }
  };

  deleteRelease = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    await this.releaseService.deleteRelease(workspaceSlug, projectId, releaseId);
    runInAction(() => {
      delete this.releaseMap[releaseId];
      delete this.releaseIssuesMap[releaseId];
    });
  };

  fetchReleaseIssues = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const issues = await this.releaseService.getReleaseIssues(workspaceSlug, projectId, releaseId);
    runInAction(() => set(this.releaseIssuesMap, [releaseId], issues ?? []));
    return issues;
  };

  /** Refetch both the release (status, counts) and its items after anything that changes them. */
  private refresh = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    await Promise.all([
      this.fetchReleaseDetails(workspaceSlug, projectId, releaseId),
      this.fetchReleaseIssues(workspaceSlug, projectId, releaseId),
    ]);
    // a work item's sidebar row may now point somewhere else
    runInAction(() => {
      this.issueReleaseMap = {};
    });
  };

  addReleaseIssues = async (workspaceSlug: string, projectId: string, releaseId: string, issueIds: string[]) => {
    await this.releaseService.addReleaseIssues(workspaceSlug, projectId, releaseId, issueIds);
    await this.refresh(workspaceSlug, projectId, releaseId);
  };

  removeReleaseIssue = async (workspaceSlug: string, projectId: string, releaseId: string, issueId: string) => {
    await this.releaseService.removeReleaseIssue(workspaceSlug, projectId, releaseId, issueId);
    await this.refresh(workspaceSlug, projectId, releaseId);
  };

  markReleased = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const response = await this.releaseService.markReleased(workspaceSlug, projectId, releaseId);
    await this.refresh(workspaceSlug, projectId, releaseId);
    return response;
  };

  reopen = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const response = await this.releaseService.reopen(workspaceSlug, projectId, releaseId);
    await this.refresh(workspaceSlug, projectId, releaseId);
    return response;
  };

  rollBack = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const response = await this.releaseService.rollBack(workspaceSlug, projectId, releaseId);
    await this.refresh(workspaceSlug, projectId, releaseId);
    return response;
  };

  fetchCandidates = async (workspaceSlug: string, projectId: string, search?: string) =>
    this.releaseService.getCandidates(workspaceSlug, projectId, search);

  fetchIssueRelease = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const release = await this.releaseService.getIssueRelease(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.issueReleaseMap, [issueId], release));
    return release;
  };
}
