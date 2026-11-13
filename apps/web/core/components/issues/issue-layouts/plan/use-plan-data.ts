/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import type { TIssueMap, TMemberAvailability } from "@plane/types";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { IssueRelationService } from "@/services/issue/issue_relation.service";
import { WorkspaceService } from "@/services/workspace.service";
// local
import type { TPlanItem } from "./model";
import { buildPlanGraph } from "./model";

const relationService = new IssueRelationService();
const workspaceService = new WorkspaceService();

/** Fixed hues for areas (modules or projects); they only colour small markers, so they hold up in both themes. */
const AREA_HUES = [
  "#2457b3",
  "#23804f",
  "#b26a00",
  "#7a4fb0",
  "#0f8a8a",
  "#c2417a",
  "#8a6d1f",
  "#c0392b",
  "#4b6cc1",
  "#64748b",
];
export const NO_AREA_HUE = "#8b919c";

export type TPlanArea = { id: string; name: string; hue: string };
export type TPlanPerson = { id: string; name: string; avatarUrl?: string; declaredHours: number | null };

export function usePlanData(args: {
  workspaceSlug: string;
  issueIds: string[];
  issueMap: TIssueMap;
  /** areas are modules inside one project, projects across a workspace view */
  areaBy: "module" | "project";
}) {
  const { workspaceSlug, issueIds, issueMap, areaBy } = args;
  const { getStateById, fetchWorkspaceStates } = useProjectState();
  const { getModuleById, fetchWorkspaceModules } = useModule();
  const { getProjectIdentifierById, getProjectById } = useProject();
  const { getUserDetails } = useMember();

  const issues = useMemo(() => issueIds.map((id) => issueMap[id]).filter(Boolean), [issueIds, issueMap]);
  const projectIds = useMemo(
    () => [...new Set(issues.map((i) => i.project_id).filter((p): p is string => !!p))].toSorted(),
    [issues]
  );

  useSWR(workspaceSlug ? `PLAN_STATES_${workspaceSlug}` : null, () => fetchWorkspaceStates(workspaceSlug), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  useSWR(
    workspaceSlug && areaBy === "module" ? `PLAN_MODULES_${workspaceSlug}` : null,
    () => fetchWorkspaceModules(workspaceSlug),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );
  const relations = useSWR(
    workspaceSlug && projectIds.length ? `PLAN_RELATIONS_${workspaceSlug}_${projectIds.join(",")}` : null,
    () => relationService.listWorkspaceRelations(workspaceSlug, projectIds),
    { revalidateOnFocus: false }
  );
  const availability = useSWR(
    workspaceSlug ? `PLAN_AVAILABILITY_${workspaceSlug}` : null,
    () => workspaceService.fetchMemberAvailability(workspaceSlug),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  const { items, areas } = useMemo(() => {
    const areaMap = new Map<string, TPlanArea>();
    const areaOf = (id: string | null | undefined, name: () => string | undefined) => {
      if (!id) return null;
      if (!areaMap.has(id)) areaMap.set(id, { id, name: name() ?? "Unnamed", hue: "" });
      return id;
    };
    const planItems: TPlanItem[] = issues.map((issue) => {
      const state = getStateById(issue.state_id);
      const moduleId = [...(issue.module_ids ?? [])].toSorted((a, b) =>
        (getModuleById(a)?.name ?? "").localeCompare(getModuleById(b)?.name ?? "")
      )[0];
      const areaId =
        areaBy === "module"
          ? areaOf(moduleId, () => getModuleById(moduleId)?.name)
          : areaOf(issue.project_id, () => getProjectById(issue.project_id)?.name);
      return {
        id: issue.id,
        key: `${getProjectIdentifierById(issue.project_id) ?? ""}-${issue.sequence_id}`,
        name: issue.name,
        projectId: issue.project_id ?? "",
        stateGroup: state?.group ?? "backlog",
        stateName: state?.name ?? "",
        priority: issue.priority ?? "none",
        ownerId: [...(issue.assignee_ids ?? [])].toSorted()[0] ?? null,
        areaId,
        isArchived: !!issue.archived_at,
      };
    });
    const sorted = [...areaMap.values()].toSorted((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    sorted.forEach((a, i) => (a.hue = AREA_HUES[i % AREA_HUES.length]));
    return { items: planItems, areas: sorted };
  }, [issues, areaBy, getStateById, getModuleById, getProjectById, getProjectIdentifierById]);

  const graph = useMemo(
    () => buildPlanGraph(items, relations.data?.relations ?? [], relations.data?.work_items ?? {}),
    [items, relations.data]
  );

  const declared = useMemo(() => {
    const map = new Map<string, number>();
    (availability.data ?? []).forEach((row: TMemberAvailability) => {
      if (row.available_hours > 0) map.set(row.member_id, row.available_hours);
    });
    return map;
  }, [availability.data]);

  const people = useMemo(() => {
    const ids = new Set<string>();
    graph.nodes.forEach((n) => n.ownerId && ids.add(n.ownerId));
    const list: TPlanPerson[] = [...ids].map((id) => {
      const user = getUserDetails(id);
      return {
        id,
        name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.display_name || "Unknown",
        avatarUrl: user?.avatar_url,
        declaredHours: declared.get(id) ?? null,
      };
    });
    return list.toSorted((a, b) => a.name.localeCompare(b.name));
  }, [graph, declared, getUserDetails]);

  return {
    graph,
    areas,
    people,
    isRelationsLoading: relations.isLoading,
    relationsError: relations.error as unknown,
    retryRelations: () => relations.mutate(),
  };
}
