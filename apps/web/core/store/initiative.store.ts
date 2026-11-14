/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type { TInitiative, TInitiativeCreatePayload, TInitiativeUpdatePayload } from "@plane/types";
import { InitiativeService } from "@/services/initiative.service";
import type { CoreRootStore } from "./root.store";

export interface IInitiativeStore {
  initiativeMap: Record<string, TInitiative>;
  initiativeIdsForWorkspace: string[];
  getInitiativeById: (id: string) => TInitiative | undefined;
  getInitiativeIdsForModule: (moduleId: string) => string[];
  fetchInitiatives: (slug: string) => Promise<TInitiative[]>;
  fetchInitiative: (slug: string, id: string) => Promise<TInitiative>;
  createInitiative: (slug: string, data: TInitiativeCreatePayload) => Promise<TInitiative>;
  updateInitiative: (slug: string, id: string, data: TInitiativeUpdatePayload) => Promise<TInitiative>;
  deleteInitiative: (slug: string, id: string) => Promise<void>;
  addModules: (slug: string, id: string, moduleIds: string[]) => Promise<void>;
  removeModule: (slug: string, id: string, moduleId: string) => Promise<void>;
}

export class InitiativeStore implements IInitiativeStore {
  initiativeMap: Record<string, TInitiative> = {};
  workspaceSlugById: Record<string, string> = {};
  // Each finished mutation stamps its initiative. A fetch that started before the stamp holds older data
  // for that row, so it must neither overwrite the row nor bring a deleted one back.
  private version = 0;
  private stampedAt: Record<string, number> = {};
  private service = new InitiativeService();
  rootStore: CoreRootStore;

  constructor(rootStore: CoreRootStore) {
    this.rootStore = rootStore;
    makeObservable(this, {
      initiativeMap: observable,
      workspaceSlugById: observable,
      initiativeIdsForWorkspace: computed,
      fetchInitiatives: action,
      fetchInitiative: action,
      createInitiative: action,
      updateInitiative: action,
      deleteInitiative: action,
      addModules: action,
      removeModule: action,
    });
  }

  get initiativeIdsForWorkspace() {
    return Object.values(this.initiativeMap)
      .filter((row) => this.workspaceSlugById[row.id] === this.rootStore.router.workspaceSlug)
      .toSorted((a, b) => a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at))
      .map((row) => row.id);
  }

  getInitiativeById = computedFn((id: string) => this.initiativeMap[id]);
  getInitiativeIdsForModule = computedFn((moduleId: string) =>
    this.initiativeIdsForWorkspace.filter((id) => this.initiativeMap[id].module_ids.includes(moduleId))
  );

  private stamp = (id: string) => {
    this.version += 1;
    this.stampedAt[id] = this.version;
  };

  private changedSince = (id: string, start: number) => (this.stampedAt[id] ?? 0) > start;

  private save = (slug: string, row: TInitiative) => {
    this.initiativeMap[row.id] = row;
    this.workspaceSlugById[row.id] = slug;
  };

  fetchInitiatives = async (slug: string) => {
    const start = this.version;
    const rows = await this.service.list(slug);
    runInAction(() => {
      Object.keys(this.initiativeMap).forEach((id) => {
        if (this.workspaceSlugById[id] === slug && !this.changedSince(id, start)) {
          delete this.initiativeMap[id];
          delete this.workspaceSlugById[id];
        }
      });
      rows.forEach((row) => {
        if (!this.changedSince(row.id, start)) this.save(slug, row);
      });
    });
    return rows;
  };

  fetchInitiative = async (slug: string, id: string) => {
    const start = this.version;
    const row = await this.service.retrieve(slug, id);
    runInAction(() => {
      if (!this.changedSince(id, start)) this.save(slug, row);
    });
    return row;
  };

  createInitiative = async (slug: string, data: TInitiativeCreatePayload) => {
    const row = await this.service.create(slug, data);
    runInAction(() => {
      this.stamp(row.id);
      this.save(slug, row);
    });
    return row;
  };

  updateInitiative = async (slug: string, id: string, data: TInitiativeUpdatePayload) => {
    const start = this.version;
    const row = await this.service.update(slug, id, data);
    runInAction(() => {
      const stale = this.changedSince(id, start);
      this.stamp(id);
      if (!stale) this.save(slug, row);
    });
    return row;
  };

  deleteInitiative = async (slug: string, id: string) => {
    await this.service.deleteInitiative(slug, id);
    runInAction(() => {
      this.stamp(id);
      delete this.initiativeMap[id];
      delete this.workspaceSlugById[id];
    });
  };

  addModules = async (slug: string, id: string, moduleIds: string[]) => {
    await this.service.addModules(slug, id, moduleIds);
    runInAction(() => this.stamp(id));
    await this.fetchInitiative(slug, id);
  };

  removeModule = async (slug: string, id: string, moduleId: string) => {
    await this.service.removeModule(slug, id, moduleId);
    runInAction(() => this.stamp(id));
    await this.fetchInitiative(slug, id);
  };
}
