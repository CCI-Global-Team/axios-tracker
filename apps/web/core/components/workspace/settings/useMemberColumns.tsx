/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel, LOGIN_MEDIUM_LABELS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { renderFormattedDate } from "@plane/utils";
import { MemberHeaderColumn } from "@/components/project/member-header-column";
import type { RowData } from "@/components/workspace/settings/member-columns";
import { AccountTypeColumn, NameColumn } from "@/components/workspace/settings/member-columns";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import type { IMemberFilters } from "@/store/member/utils";
// lib
import { weekStartFor } from "@/lib/availability-week";
import { DisciplineCell } from "@/components/discipline/discipline-cell";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

export const useMemberColumns = () => {
  // states
  const [removeMemberModal, setRemoveMemberModal] = useState<RowData | null>(null);

  const { workspaceSlug } = useParams();

  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const {
    workspace: {
      filtersStore: { filters, updateFilters, setAvailableHours, setDisciplines },
    },
  } = useMember();
  const { t } = useTranslation();

  // CCI: declared hours for the current week, keyed by member id. Supplementary information —
  // a failed request leaves the column showing a dash rather than blocking the members table,
  // which is why this never throws into render.
  const weekStart = weekStartFor();
  const { data: availabilityRows } = useSWR(
    workspaceSlug ? `WORKSPACE_MEMBER_AVAILABILITY_${workspaceSlug}_${weekStart}` : null,
    workspaceSlug ? () => workspaceService.fetchMemberAvailability(workspaceSlug.toString(), weekStart) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const hoursByMemberId = new Map<string, number>();
  (availabilityRows || []).forEach((row) => hoursByMemberId.set(row.member_id, row.available_hours));

  // Hand the same numbers to the store so the column is sortable. Without this the column
  // renders correctly and its sort silently does nothing, which is worse than no sort at all.
  useEffect(() => {
    setAvailableHours(Object.fromEntries(hoursByMemberId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availabilityRows]);

  // CCI: what each member works on. Same supplementary treatment as the hours above - a failed
  // request leaves the column empty rather than taking the members table down with it.
  const disciplineKey = workspaceSlug ? `WORKSPACE_MEMBER_DISCIPLINES_${workspaceSlug}` : null;
  const { data: disciplineData, mutate: mutateDisciplines } = useSWR(
    disciplineKey,
    workspaceSlug ? () => workspaceService.fetchMemberDisciplines(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const disciplineChoices = disciplineData?.choices ?? [];
  const disciplineByMemberId = new Map<string, { disciplines: string[]; source: string }>();
  (disciplineData?.members ?? []).forEach((row) =>
    disciplineByMemberId.set(row.member_id, { disciplines: row.disciplines, source: row.source })
  );

  // Hand the same values to the store so the column can be filtered on. Without this the chips
  // render and match nothing, which is worse than offering no filter.
  useEffect(() => {
    setDisciplines(Object.fromEntries([...disciplineByMemberId].map(([id, v]) => [id, v.disciplines])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disciplineData]);

  // derived values
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const handleDisciplineChange = async (memberId: string, disciplines: string[]) => {
    if (!workspaceSlug) return;
    await workspaceService.updateMemberDisciplines(workspaceSlug.toString(), {
      member_id: memberId,
      disciplines,
    });
    await mutateDisciplines();
  };

  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const isSuspended = (rowData: RowData) => rowData.is_active === false;

  // handlers
  const handleDisplayFilterUpdate = (filterUpdates: Partial<IMemberFilters>) => {
    updateFilters(filterUpdates);
  };

  const columns = [
    {
      key: "Full name",
      content: t("workspace_settings.settings.members.details.full_name"),
      thClassName: "text-left",
      thRender: () => (
        <MemberHeaderColumn
          property="full_name"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => (
        <NameColumn
          rowData={rowData}
          workspaceSlug={workspaceSlug}
          isAdmin={isAdmin}
          currentUser={currentUser}
          setRemoveMemberModal={setRemoveMemberModal}
        />
      ),
    },

    {
      key: "Display name",
      content: t("workspace_settings.settings.members.details.display_name"),
      tdRender: (rowData: RowData) => (
        <div className={`w-32 ${isSuspended(rowData) ? "text-placeholder" : ""}`}>{rowData.member.display_name}</div>
      ),
      thRender: () => (
        <MemberHeaderColumn
          property="display_name"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },

    {
      key: "Email address",
      content: t("workspace_settings.settings.members.details.email_address"),
      tdRender: (rowData: RowData) => (
        <div className={`w-48 truncate ${isSuspended(rowData) ? "text-placeholder" : ""}`}>{rowData.member.email}</div>
      ),
      thRender: () => (
        <MemberHeaderColumn
          property="email"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },

    {
      key: "Account type",
      content: t("workspace_settings.settings.members.details.account_type"),
      thRender: () => (
        <MemberHeaderColumn
          property="role"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => <AccountTypeColumn rowData={rowData} workspaceSlug={workspaceSlug} />,
    },

    {
      key: "Authentication",
      content: t("workspace_settings.settings.members.details.authentication"),
      tdRender: (rowData: RowData) => {
        if (isSuspended(rowData)) return null;
        const loginMedium = rowData.member.last_login_medium;
        if (!loginMedium) return null;
        return <div>{LOGIN_MEDIUM_LABELS[loginMedium]}</div>;
      },
    },

    {
      key: "Joining date",
      content: t("workspace_settings.settings.members.details.joining_date"),
      tdRender: (rowData: RowData) =>
        isSuspended(rowData) ? null : <div>{renderFormattedDate(rowData?.member?.joining_date)}</div>,
      thRender: () => (
        <MemberHeaderColumn
          property="joining_date"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },
    {
      // CCI: hours this member has declared for the current week. A dash means they have not
      // declared — deliberately distinct from a declared 0.
      key: "Available hours",
      content: "Available this week",
      thClassName: "text-left",
      tdRender: (rowData: RowData) => {
        if (isSuspended(rowData)) return null;
        const hours = hoursByMemberId.get(rowData?.member?.id ?? "");
        return hours === undefined ? (
          <div className="text-tertiary">&mdash;</div>
        ) : (
          <div className="font-medium tabular-nums">{hours}h</div>
        );
      },
      thRender: () => (
        <MemberHeaderColumn
          property="available_hours"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },
    {
      // CCI: what this member works on. Separate from project membership on purpose - a project
      // says which product someone can be assigned work in, this says what kind of work suits
      // them, and someone can be Frontend across all three products at once.
      key: "Discipline",
      content: "Discipline",
      thClassName: "text-left",
      tdRender: (rowData: RowData) => {
        if (isSuspended(rowData)) return null;
        const memberId = rowData?.member?.id ?? "";
        const row = disciplineByMemberId.get(memberId);
        return (
          <DisciplineCell
            memberId={memberId}
            value={row?.disciplines ?? []}
            choices={disciplineChoices}
            source={row?.source}
            canEdit={isAdmin}
            onChange={handleDisciplineChange}
          />
        );
      },
    },
  ];
  return { columns, workspaceSlug, removeMemberModal, setRemoveMemberModal };
};
