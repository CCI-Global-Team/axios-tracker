/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import type { TIssueMap, TMemberAvailability } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { IssueService } from "@/services/issue/issue.service";
import { IssueRelationService } from "@/services/issue/issue_relation.service";
import { WorkspaceService } from "@/services/workspace.service";
// local
import type { TPlanItem } from "./model";
import { buildPlanGraph } from "./model";

const issueService = new IssueService();
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
/** what the areas are grouped by: the scope's own grouping, or a fallback when that leaves a single area */
export type TPlanAreaKind = "module" | "project" | "parent" | "label";

/** how the area grouping reads in the UI: "Progress by label", "No label" */
export const AREA_NOUN: Record<TPlanAreaKind, string> = {
  module: "module",
  project: "project",
  parent: "parent item",
  label: "label",
};

type TGrouping = {
  kind: TPlanAreaKind;
  keyOf: (issue: TIssueMap[string]) => string | null;
  nameOf: (key: string) => string;
};

/** two or more groups, each item in at most one; a fallback must also cover at least half the items */
const groupCount = (keys: (string | null)[]) => new Set(keys.filter(Boolean)).size;
const covers = (keys: (string | null)[]) => keys.filter(Boolean).length * 2 >= keys.length;
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
  const { getLabelById, fetchWorkspaceLabels } = useLabel();

  const issues = issueIds.map((id) => issueMap[id]).filter(Boolean);
  const projectIds = [...new Set(issues.map((i) => i.project_id).filter((p): p is string => !!p))].toSorted();

  useSWR(workspaceSlug ? `PLAN_STATES_${workspaceSlug}` : null, () => fetchWorkspaceStates(workspaceSlug), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  useSWR(
    workspaceSlug && areaBy === "module" ? `PLAN_MODULES_${workspaceSlug}` : null,
    () => fetchWorkspaceModules(workspaceSlug),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );
  useSWR(workspaceSlug ? `PLAN_LABELS_${workspaceSlug}` : null, () => fetchWorkspaceLabels(workspaceSlug), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
  // parents outside the loaded items, so a parent grouping can show their names
  const missingParents = [
    ...new Map(
      issues
        .filter((i) => i.parent_id && !issueMap[i.parent_id])
        .map((i) => [i.parent_id!, i.project_id ?? ""] as const)
    ),
  ].toSorted(([a], [b]) => a.localeCompare(b));
  const parents = useSWR(
    workspaceSlug && missingParents.length
      ? `PLAN_PARENTS_${workspaceSlug}_${missingParents.map(([id]) => id).join(",")}`
      : null,
    async () => {
      const byProject = new Map<string, string[]>();
      missingParents.forEach(([id, projectId]) => byProject.set(projectId, [...(byProject.get(projectId) ?? []), id]));
      const lists = await Promise.all(
        [...byProject].map(([projectId, ids]) =>
          issueService.retrieveIssues(workspaceSlug, projectId, ids).catch(() => [])
        )
      );
      return new Map(lists.flat().map((p) => [p.id, p.name]));
    },
    { revalidateOnFocus: false }
  );

  const relations = useSWR(
    workspaceSlug && projectIds.length ? `PLAN_RELATIONS_${workspaceSlug}_${projectIds.join(",")}` : null,
    () => relationService.listWorkspaceRelations(workspaceSlug, projectIds),
    { revalidateOnFocus: false }
  );
  const { peekIssue } = useIssueDetail();
  const peekOpen = !!peekIssue;
  const wasPeekOpen = useRef(peekOpen);
  const { mutate: refreshRelations } = relations;
  useEffect(() => {
    if (wasPeekOpen.current && !peekOpen) void refreshRelations();
    wasPeekOpen.current = peekOpen;
  }, [peekOpen, refreshRelations]);

  const availability = useSWR(
    workspaceSlug ? `PLAN_AVAILABILITY_${workspaceSlug}` : null,
    () => workspaceService.fetchMemberAvailability(workspaceSlug),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  // Read observable fields on every observer render, including after unrelated React updates.
  const { items, areas, areaKind } = (() => {
    const moduleName = (id: string) => getModuleById(id)?.name ?? "";
    // an item with several labels goes with the one most items share, so groups stay broad
    const labelUse = new Map<string, number>();
    issues.forEach((i) => (i.label_ids ?? []).forEach((l) => labelUse.set(l, (labelUse.get(l) ?? 0) + 1)));
    const labelName = (id: string) => getLabelById(id)?.name ?? "";

    const primary: TGrouping =
      areaBy === "module"
        ? {
            kind: "module",
            keyOf: (i) =>
              [...(i.module_ids ?? [])].toSorted((a, b) => moduleName(a).localeCompare(moduleName(b)))[0] ?? null,
            nameOf: moduleName,
          }
        : { kind: "project", keyOf: (i) => i.project_id ?? null, nameOf: (id) => getProjectById(id)?.name ?? "" };
    const fallbacks: TGrouping[] = [
      {
        kind: "parent",
        keyOf: (i) => i.parent_id ?? null,
        nameOf: (id) => issueMap[id]?.name ?? parents.data?.get(id) ?? "",
      },
      {
        kind: "label",
        keyOf: (i) =>
          [...(i.label_ids ?? [])].toSorted(
            (a, b) => (labelUse.get(b) ?? 0) - (labelUse.get(a) ?? 0) || labelName(a).localeCompare(labelName(b))
          )[0] ?? null,
        nameOf: labelName,
      },
    ];
    const keysFor = (g: TGrouping) => issues.map((i) => g.keyOf(i));
    const primaryKeys = keysFor(primary);
    let chosen = { grouping: primary, keys: primaryKeys };
    if (groupCount(primaryKeys) < 2) {
      for (const g of fallbacks) {
        const keys = keysFor(g);
        if (groupCount(keys) >= 2 && covers(keys)) {
          chosen = { grouping: g, keys };
          break;
        }
      }
    }

    const areaMap = new Map<string, TPlanArea>();
    chosen.keys.forEach((id) => {
      if (id && !areaMap.has(id)) areaMap.set(id, { id, name: chosen.grouping.nameOf(id) || "Unnamed", hue: "" });
    });
    const planItems: TPlanItem[] = issues.map((issue, index) => {
      const state = getStateById(issue.state_id);
      return {
        id: issue.id,
        key: `${getProjectIdentifierById(issue.project_id) ?? ""}-${issue.sequence_id}`,
        name: issue.name,
        projectId: issue.project_id ?? "",
        stateGroup: state?.group ?? "backlog",
        stateName: state?.name ?? "",
        priority: issue.priority ?? "none",
        ownerId: [...(issue.assignee_ids ?? [])].toSorted()[0] ?? null,
        areaId: chosen.keys[index],
        isArchived: !!issue.archived_at,
      };
    });
    const sorted = [...areaMap.values()].toSorted((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    sorted.forEach((a, i) => (a.hue = AREA_HUES[i % AREA_HUES.length]));
    return { items: planItems, areas: sorted, areaKind: chosen.grouping.kind };
  })();

  const itemsKey = JSON.stringify(items);
  const graph = useMemo(
    () =>
      buildPlanGraph(
        JSON.parse(itemsKey) as TPlanItem[],
        relations.data?.relations ?? [],
        relations.data?.work_items ?? {}
      ),
    [itemsKey, relations.data]
  );

  const declared = useMemo(() => {
    const map = new Map<string, number>();
    (availability.data ?? []).forEach((row: TMemberAvailability) => {
      if (row.available_hours >= 0) map.set(row.member_id, row.available_hours);
    });
    return map;
  }, [availability.data]);

  const people = (() => {
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
  })();

  return {
    graph,
    areas,
    areaKind,
    people,
    isRelationsLoading: relations.isLoading,
    relationsError: relations.error as unknown,
    retryRelations: () => relations.mutate(),
  };
}
