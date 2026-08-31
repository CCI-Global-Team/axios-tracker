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
      filtersStore: { filters, updateFilters, setAvailableHours },
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

  // derived values
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

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
  ];
  return { columns, workspaceSlug, removeMemberModal, setRemoveMemberModal };
};
