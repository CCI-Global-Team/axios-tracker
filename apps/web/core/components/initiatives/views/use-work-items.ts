/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentProps } from "react";
import type { PlanBoard } from "@/components/issues/issue-layouts/plan/board";
import { usePlanData } from "@/components/issues/issue-layouts/plan/use-plan-data";
import { useMember } from "@/hooks/store/use-member";
import { useLabel } from "@/hooks/store/use-label";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import type { WorkItem } from "./model";
import { compareItems } from "./model";

export type WorkItemsProps = ComponentProps<typeof PlanBoard>;

// Called inside an observer: read observable issue fields on each render, including peek edits.
export function useWorkItems(props: WorkItemsProps): WorkItem[] {
  const { graph, areas, people } = usePlanData({ ...props, areaBy: "project" });
  const { getProjectById } = useProject();
  const { getModuleById } = useModule();
  const { getUserDetails } = useMember();
  const { getLabelById } = useLabel();
  const { getStateById } = useProjectState();
  const areaMap = new Map(areas.map((area) => [area.id, area]));
  const personMap = new Map(people.map((person) => [person.id, person]));
  return props.issueIds
    .flatMap((id): WorkItem[] => {
      const issue = props.issueMap[id];
      const node = graph.nodes.get(id);
      if (!issue || !node) return [];
      const project = getProjectById(node.projectId);
      const state = getStateById(issue.state_id);
      return [
        {
          id,
          key: node.key,
          name: issue.name,
          projectId: node.projectId,
          projectName: project?.name ?? "Unknown project",
          projectIdentifier: project?.identifier ?? node.key.split("-")[0],
          area: areaMap.get(node.areaId ?? ""),
          projectArea: areaMap.get(node.projectId),
          stateGroup: node.stateGroup,
          stateName: node.stateName || "Unknown state",
          stateColor: state?.color,
          priority: issue.priority ?? "none",
          people: [...new Set(issue.assignee_ids ?? [])]
            .map((personId) => {
              const known = personMap.get(personId);
              if (known) return known;
              const user = getUserDetails(personId);
              return {
                id: personId,
                name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.display_name || "Unknown",
                avatarUrl: user?.avatar_url,
                declaredHours: null,
              };
            })
            .toSorted((a, b) => a.name.localeCompare(b.name)),
          modules: [...new Set(issue.module_ids ?? [])]
            .map((moduleId) => ({ id: moduleId, name: getModuleById(moduleId)?.name ?? "Unknown module" }))
            .toSorted((a, b) => a.name.localeCompare(b.name)),
          labels: [...new Set(issue.label_ids ?? [])].map((labelId) => {
            const label = getLabelById(labelId);
            return { id: labelId, name: label?.name ?? "Unknown label", color: label?.color };
          }),
          startDate: issue.start_date?.slice(0, 10) ?? null,
          dueDate: issue.target_date?.slice(0, 10) ?? null,
          isArchived: !!issue.archived_at,
        },
      ];
    })
    .toSorted((a, b) => compareItems(a, b, "state"));
}
