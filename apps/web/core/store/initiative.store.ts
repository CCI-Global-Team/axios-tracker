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
  private updateSeq: Record<string, number> = {};
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

  private save = (slug: string, row: TInitiative) => {
    this.initiativeMap[row.id] = row;
    this.workspaceSlugById[row.id] = slug;
  };

  fetchInitiatives = async (slug: string) => {
    const rows = await this.service.list(slug);
    runInAction(() => {
      Object.keys(this.initiativeMap).forEach((id) => {
        if (this.workspaceSlugById[id] === slug) {
          delete this.initiativeMap[id];
          delete this.workspaceSlugById[id];
        }
      });
      rows.forEach((row) => this.save(slug, row));
    });
    return rows;
  };

  fetchInitiative = async (slug: string, id: string) => {
    const row = await this.service.retrieve(slug, id);
    runInAction(() => this.save(slug, row));
    return row;
  };

  createInitiative = async (slug: string, data: TInitiativeCreatePayload) => {
    const row = await this.service.create(slug, data);
    runInAction(() => this.save(slug, row));
    return row;
  };

  updateInitiative = async (slug: string, id: string, data: TInitiativeUpdatePayload) => {
    const seq = (this.updateSeq[id] ?? 0) + 1;
    this.updateSeq[id] = seq;
    const row = await this.service.update(slug, id, data);
    if (this.updateSeq[id] === seq) runInAction(() => this.save(slug, row));
    return row;
  };

  deleteInitiative = async (slug: string, id: string) => {
    await this.service.deleteInitiative(slug, id);
    runInAction(() => {
      delete this.initiativeMap[id];
      delete this.workspaceSlugById[id];
    });
  };

  addModules = async (slug: string, id: string, moduleIds: string[]) => {
    await this.service.addModules(slug, id, moduleIds);
    await this.fetchInitiative(slug, id);
  };

  removeModule = async (slug: string, id: string, moduleId: string) => {
    await this.service.removeModule(slug, id, moduleId);
    await this.fetchInitiative(slug, id);
  };
}
