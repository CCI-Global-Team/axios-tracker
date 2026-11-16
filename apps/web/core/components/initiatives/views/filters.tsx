/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "react-router";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IIssueFilters, TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { WorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/base";
import { decodeFilterExpression, encodeFilterExpression } from "@/components/work-item-filters/url-filters";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";

const FILTER_PROPERTIES: TWorkItemFilterProperty[] = [
  "state_group",
  "state_id",
  "project_id",
  "module_id",
  "assignee_id",
  "priority",
  "label_id",
  "start_date",
  "target_date",
  "created_at",
  "updated_at",
  "mention_id",
];
const LEGACY_PARAMS = ["status", "project", "module", "assignee", "priority", "label", "due"];

export function useInitiativeFilters(workspaceSlug: string, initiativeId: string) {
  const [params, setParams] = useSearchParams();
  const { getFilter } = useWorkItemFilters();
  const entityId = `initiative:${workspaceSlug}:${initiativeId}`;
  const [snapshot, setSnapshot] = useState(() => ({
    entityId,
    expression: decodeFilterExpression(params.get("filters")) ?? {},
  }));
  // Keep a separate React snapshot: replace navigation does not always re-render this router.
  const current =
    snapshot.entityId === entityId
      ? snapshot
      : {
          entityId,
          expression: decodeFilterExpression(params.get("filters")) ?? {},
        };
  if (snapshot !== current) setSnapshot(current);
  const expression = current.expression;
  // The last ?filters= value this hook wrote, so the URL effect can tell its own writes from navigation.
  const lastWritten = useRef<string | null | undefined>(undefined);
  const writeUrl = useCallback(
    (nextExpression: TWorkItemFilterExpression) => {
      const encoded = Object.keys(nextExpression).length ? encodeFilterExpression(nextExpression) : null;
      lastWritten.current = encoded;
      const live = new URLSearchParams(window.location.search);
      if (live.get("filters") === encoded && !LEGACY_PARAMS.some((key) => live.has(key))) return;
      setParams(
        () => {
          const next = new URLSearchParams(window.location.search);
          LEGACY_PARAMS.forEach((key) => next.delete(key));
          if (encoded) next.set("filters", encoded);
          else next.delete("filters");
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );
  const updateFilters = useCallback(
    (nextExpression: TWorkItemFilterExpression) => {
      setSnapshot({ entityId, expression: nextExpression });
      writeUrl(nextExpression);
    },
    [entityId, writeUrl]
  );
  const syncFromUrl = useRef(() => {});
  syncFromUrl.current = () => {
    // Read the live URL, as the router's params may predate our own last write.
    const liveParams = new URLSearchParams(window.location.search);
    const live = liveParams.get("filters");
    if (live === lastWritten.current) return;
    const fromUrl = decodeFilterExpression(live) ?? {};
    if (LEGACY_PARAMS.some((key) => liveParams.has(key)) || (live && !decodeFilterExpression(live))) writeUrl(fromUrl);
    if (encodeFilterExpression(fromUrl) === encodeFilterExpression(expression)) return;
    const filter = getFilter(EIssuesStoreType.GLOBAL, entityId);
    if (filter) {
      filter.resetExpression(fromUrl);
      if (filter.hasActiveFilters) filter.toggleVisibility(true);
    } else updateFilters(fromUrl);
  };
  const urlFilters = params.get("filters");
  useEffect(() => syncFromUrl.current(), [urlFilters, entityId]);
  return { entityId, expression, updateFilters };
}

export type InitiativeFiltersProps = ReturnType<typeof useInitiativeFilters> & {
  workspaceSlug: string;
  projectIds: string[];
  moduleIds: string[];
};

export const InitiativeWorkItemFilters = observer(function InitiativeWorkItemFilters({
  entityId,
  expression,
  updateFilters,
  workspaceSlug,
  projectIds,
  moduleIds,
  children,
}: InitiativeFiltersProps & {
  children: (props: { filter: IWorkItemFilterInstance | undefined }) => ReactNode;
}) {
  const { getWorkspaceLabelIds } = useLabel();
  const { getModuleById } = useModule();
  const { getProjectById } = useProject();
  const {
    workspace: { getWorkspaceMemberIds },
  } = useMember();
  const { getProjectStateIds } = useProjectState();
  const initialWorkItemFilters = useMemo<IIssueFilters>(
    () => ({
      richFilters: expression,
      displayFilters: undefined,
      displayProperties: undefined,
      kanbanFilters: undefined,
    }),
    [expression]
  );
  return (
    <WorkItemFiltersHOC
      entityType={EIssuesStoreType.GLOBAL}
      entityId={entityId}
      workspaceSlug={workspaceSlug}
      // Track loaded metadata here so the shared config's memoized options refresh as it arrives.
      projectIds={projectIds.filter((id) => !!getProjectById(id))}
      moduleIds={moduleIds.filter((id) => !!getModuleById(id))}
      memberIds={getWorkspaceMemberIds(workspaceSlug)}
      labelIds={getWorkspaceLabelIds(workspaceSlug)}
      stateIds={projectIds.length === 1 ? getProjectStateIds(projectIds[0]) : undefined}
      filtersToShowByLayout={FILTER_PROPERTIES}
      initialWorkItemFilters={initialWorkItemFilters}
      updateFilters={updateFilters}
    >
      {children}
    </WorkItemFiltersHOC>
  );
});
