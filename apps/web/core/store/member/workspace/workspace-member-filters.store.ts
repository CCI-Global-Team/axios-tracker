/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { EUserPermissions } from "@plane/constants";
import type { IUserLite } from "@plane/types";
// local imports
import type { IMemberFilters } from "../utils";
import { sortWorkspaceMembers } from "../utils";

// Workspace membership interface matching the store structure
interface IWorkspaceMembership {
  id: string;
  member: string;
  role: EUserPermissions;
  is_active?: boolean;
}

export interface IWorkspaceMemberFiltersStore {
  // observables
  filters: IMemberFilters;
  availableHoursByMemberId: Record<string, number>;
  disciplinesByMemberId: Record<string, string[]>;
  // computed actions
  getFilteredMemberIds: (
    members: IWorkspaceMembership[],
    memberDetailsMap: Record<string, IUserLite>,
    getMemberKey: (member: IWorkspaceMembership) => string
  ) => string[];
  // actions
  updateFilters: (filters: Partial<IMemberFilters>) => void;
  setAvailableHours: (hoursByMemberId: Record<string, number>) => void;
  setDisciplines: (disciplinesByMemberId: Record<string, string[]>) => void;
}

export class WorkspaceMemberFiltersStore implements IWorkspaceMemberFiltersStore {
  // observables
  filters: IMemberFilters = {};
  // CCI: declared hours for the current week, keyed by member id. Lives here rather than in the
  // column component because sorting happens in this store — a value the sort cannot see is a
  // column that renders but cannot be ordered by.
  availableHoursByMemberId: Record<string, number> = {};
  // CCI: same reasoning as the hours above — filtering happens in this store, and a value the
  // filter cannot see is a column that renders but cannot be filtered by.
  disciplinesByMemberId: Record<string, string[]> = {};

  constructor() {
    makeObservable(this, {
      // observables
      filters: observable,
      availableHoursByMemberId: observable,
      disciplinesByMemberId: observable,
      // actions
      updateFilters: action,
      setAvailableHours: action,
      setDisciplines: action,
    });
  }

  /**
   * @description get filtered and sorted member ids
   * @param members - array of workspace membership objects
   * @param memberDetailsMap - map of member details by user id
   * @param getMemberKey - function to get member key from membership object
   */
  getFilteredMemberIds = computedFn(
    (
      members: IWorkspaceMembership[],
      memberDetailsMap: Record<string, IUserLite>,
      getMemberKey: (member: IWorkspaceMembership) => string
    ): string[] => {
      if (!members || members.length === 0) return [];

      // Apply filters and sorting
      const sortedMembers = sortWorkspaceMembers(
        members,
        memberDetailsMap,
        getMemberKey,
        this.filters,
        this.availableHoursByMemberId,
        this.disciplinesByMemberId
      );

      return sortedMembers.map(getMemberKey);
    }
  );

  /**
   * @description update filters
   * @param filters - partial filters to update
   */
  updateFilters = (filters: Partial<IMemberFilters>) => {
    this.filters = { ...this.filters, ...filters };
  };

  /**
   * @description record declared hours so the members table can sort by them
   */
  setAvailableHours = (hoursByMemberId: Record<string, number>) => {
    this.availableHoursByMemberId = hoursByMemberId;
  };

  /**
   * @description record disciplines so the members table can filter by them
   */
  setDisciplines = (disciplinesByMemberId: Record<string, string[]>) => {
    this.disciplinesByMemberId = disciplinesByMemberId;
  };
}
