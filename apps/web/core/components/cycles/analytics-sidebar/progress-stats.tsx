/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Tab } from "@headlessui/react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TWorkItemFilterCondition } from "@plane/shared-state";
import type { TCycleDistribution, TCycleEstimateDistribution, TCyclePlotType } from "@plane/types";
import { cn, toFilterArray } from "@plane/utils";
// components
import type { TAssigneeData } from "@/components/core/sidebar/progress-stats/assignee";
import { AssigneeStatComponent } from "@/components/core/sidebar/progress-stats/assignee";
import type { TLabelData } from "@/components/core/sidebar/progress-stats/label";
import { LabelStatComponent } from "@/components/core/sidebar/progress-stats/label";
import type { TSelectedFilterProgressStats } from "@/components/core/sidebar/progress-stats/shared";
import { createFilterUpdateHandler, PROGRESS_STATS } from "@/components/core/sidebar/progress-stats/shared";
import type { TStateGroupData } from "@/components/core/sidebar/progress-stats/state_group";
import { StateGroupStatComponent } from "@/components/core/sidebar/progress-stats/state_group";
// helpers
// hooks
import useLocalStorage from "@/hooks/use-local-storage";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

// Anchor to the same client-derived Monday the Task 1.4 availability widget uses (local date
// parts, never `toISOString()`), so the sidebar and the declare-hours control always agree on
// what "this week" means regardless of the server's timezone.
const currentMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type TCycleProgressStats = {
  cycleId: string;
  distribution: TCycleDistribution | TCycleEstimateDistribution | undefined;
  groupedIssues: Record<string, number>;
  handleFiltersUpdate: (condition: TWorkItemFilterCondition) => void;
  isEditable?: boolean;
  noBackground?: boolean;
  plotType: TCyclePlotType;
  roundedTab?: boolean;
  selectedFilters: TSelectedFilterProgressStats;
  size?: "xs" | "sm";
  totalIssuesCount: number;
};

export const CycleProgressStats = observer(function CycleProgressStats(props: TCycleProgressStats) {
  const {
    cycleId,
    distribution,
    groupedIssues,
    handleFiltersUpdate,
    isEditable = false,
    noBackground = false,
    plotType,
    roundedTab = false,
    selectedFilters,
    size = "sm",
    totalIssuesCount,
  } = props;
  // plane imports
  const { t } = useTranslation();
  // router
  const { workspaceSlug } = useParams();
  // store imports
  const { storedValue: currentTab, setValue: setCycleTab } = useLocalStorage(
    `cycle-analytics-tab-${cycleId}`,
    "stat-assignees"
  );
  // derived values
  const currentTabIndex = (tab: string): number => PROGRESS_STATS.findIndex((stat) => stat.key === tab);
  const currentDistribution = distribution as TCycleDistribution;
  const currentEstimateDistribution = distribution as TCycleEstimateDistribution;
  const selectedAssigneeIds = toFilterArray(selectedFilters?.assignees?.value || []) as string[];
  const selectedLabelIds = toFilterArray(selectedFilters?.labels?.value || []) as string[];
  const selectedStateGroups = toFilterArray(selectedFilters?.stateGroups?.value || []) as string[];

  // This is supplementary information layered on top of the sidebar's own data — a failed or
  // pending request must never block the sidebar, so the lookup simply stays empty (SWR keeps
  // `data` as `undefined` on error instead of throwing into render) and every assignee row falls
  // back to rendering with no availability text, same as before this feature existed.
  const weekStart = currentMonday();
  const { data: availabilityRows } = useSWR(
    workspaceSlug ? `WORKSPACE_MEMBER_AVAILABILITY_${workspaceSlug}_${weekStart}` : null,
    workspaceSlug ? () => workspaceService.fetchMemberAvailability(workspaceSlug.toString(), weekStart) : null,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );
  const availableHoursByMemberId: Record<string, number> = {};
  (availabilityRows || []).forEach((row) => {
    availableHoursByMemberId[row.member_id] = row.available_hours;
  });

  const distributionAssigneeData: TAssigneeData =
    plotType === "burndown"
      ? (currentDistribution?.assignees || []).map((assignee) => ({
          id: assignee?.assignee_id || undefined,
          title: assignee?.display_name || undefined,
          avatar_url: assignee?.avatar_url || undefined,
          completed: assignee.completed_issues,
          total: assignee.total_issues,
          availableHours: assignee?.assignee_id ? availableHoursByMemberId[assignee.assignee_id] : undefined,
        }))
      : (currentEstimateDistribution?.assignees || []).map((assignee) => ({
          id: assignee?.assignee_id || undefined,
          title: assignee?.display_name || undefined,
          avatar_url: assignee?.avatar_url || undefined,
          completed: assignee.completed_estimates,
          total: assignee.total_estimates,
          availableHours: assignee?.assignee_id ? availableHoursByMemberId[assignee.assignee_id] : undefined,
        }));

  const distributionLabelData: TLabelData =
    plotType === "burndown"
      ? (currentDistribution?.labels || []).map((label) => ({
          id: label?.label_id || undefined,
          title: label?.label_name || undefined,
          color: label?.color || undefined,
          completed: label.completed_issues,
          total: label.total_issues,
        }))
      : (currentEstimateDistribution?.labels || []).map((label) => ({
          id: label?.label_id || undefined,
          title: label?.label_name || undefined,
          color: label?.color || undefined,
          completed: label.completed_estimates,
          total: label.total_estimates,
        }));

  const distributionStateData: TStateGroupData = Object.keys(groupedIssues || {}).map((state) => ({
    state: state,
    completed: groupedIssues?.[state] || 0,
    total: totalIssuesCount || 0,
  }));

  const handleAssigneeFiltersUpdate = createFilterUpdateHandler(
    "assignee_id",
    selectedAssigneeIds,
    handleFiltersUpdate
  );
  const handleLabelFiltersUpdate = createFilterUpdateHandler("label_id", selectedLabelIds, handleFiltersUpdate);
  const handleStateGroupFiltersUpdate = createFilterUpdateHandler(
    "state_group",
    selectedStateGroups,
    handleFiltersUpdate
  );

  return (
    <div>
      <Tab.Group defaultIndex={currentTabIndex(currentTab ? currentTab : "stat-assignees")}>
        <Tab.List
          as="div"
          className={cn(
            `flex w-full items-center justify-between gap-2 rounded-md p-1`,
            roundedTab ? `rounded-3xl` : `rounded-md`,
            noBackground ? `` : `bg-layer-2`,
            size === "xs" ? `text-11` : `text-13`
          )}
        >
          {PROGRESS_STATS.map((stat) => (
            <Tab
              className={cn(
                `w-full cursor-pointer p-1 text-primary transition-all outline-none focus:outline-none`,
                roundedTab ? `rounded-3xl border border-subtle` : `rounded-sm`,
                stat.key === currentTab
                  ? "bg-layer-transparent-active text-secondary"
                  : "text-placeholder hover:text-secondary"
              )}
              key={stat.key}
              onClick={() => setCycleTab(stat.key)}
            >
              {t(stat.i18n_title)}
            </Tab>
          ))}
        </Tab.List>
        <Tab.Panels className="py-3 text-secondary">
          <Tab.Panel key={"stat-states"}>
            <StateGroupStatComponent
              distribution={distributionStateData}
              handleStateGroupFiltersUpdate={handleStateGroupFiltersUpdate}
              isEditable={isEditable}
              selectedStateGroups={selectedStateGroups}
              totalIssuesCount={totalIssuesCount}
            />
          </Tab.Panel>
          <Tab.Panel key={"stat-assignees"}>
            <AssigneeStatComponent
              distribution={distributionAssigneeData}
              handleAssigneeFiltersUpdate={handleAssigneeFiltersUpdate}
              isEditable={isEditable}
              selectedAssigneeIds={selectedAssigneeIds}
            />
          </Tab.Panel>
          <Tab.Panel key={"stat-labels"}>
            <LabelStatComponent
              distribution={distributionLabelData}
              handleLabelFiltersUpdate={handleLabelFiltersUpdate}
              isEditable={isEditable}
              selectedLabelIds={selectedLabelIds}
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
});
