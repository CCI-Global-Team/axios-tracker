/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TInitiative, TInitiativeCreatePayload, TInitiativeUpdatePayload, TIssue } from "@plane/types";
import { APIService } from "@/services/api.service";

export class InitiativeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(slug: string) {
    return `/api/workspaces/${slug}/initiatives/`;
  }

  async list(slug: string): Promise<TInitiative[]> {
    return this.get(this.base(slug)).then((response) => response.data);
  }

  async retrieve(slug: string, id: string): Promise<TInitiative> {
    return this.get(`${this.base(slug)}${id}/`).then((response) => response.data);
  }

  async create(slug: string, data: TInitiativeCreatePayload): Promise<TInitiative> {
    return this.post(this.base(slug), data).then((response) => response.data);
  }

  async update(slug: string, id: string, data: TInitiativeUpdatePayload): Promise<TInitiative> {
    return this.patch(`${this.base(slug)}${id}/`, data).then((response) => response.data);
  }

  async deleteInitiative(slug: string, id: string): Promise<void> {
    await this.delete(`${this.base(slug)}${id}/`);
  }

  async addModules(slug: string, id: string, moduleIds: string[]): Promise<TInitiative> {
    return this.post(`${this.base(slug)}${id}/modules/`, { module_ids: moduleIds }).then((response) => response.data);
  }

  async removeModule(slug: string, id: string, moduleId: string): Promise<void> {
    await this.delete(`${this.base(slug)}${id}/modules/${moduleId}/`);
  }

  async listIssues(slug: string, id: string): Promise<TIssue[]> {
    return this.get(`${this.base(slug)}${id}/issues/`).then((response) => response.data);
  }
}
