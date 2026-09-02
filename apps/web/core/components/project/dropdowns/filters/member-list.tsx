/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { ChevronDownIcon } from "@plane/propel/icons";
import { EUserProjectRoles, EUserWorkspaceRoles } from "@plane/types";
// plane ui
import { CustomMenu } from "@plane/ui";
// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";

interface IRoleOption {
  value: string;
  label: string;
}

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (role: string) => void;
  memberType: "project" | "workspace";
  // CCI: optional extra groups. The project member list passes none and is unchanged; only the
  // workspace members page, which has disciplines and declared hours to filter on, supplies them.
  disciplineOptions?: IRoleOption[];
  appliedDisciplines?: string[];
  onDisciplineToggle?: (value: string) => void;
  appliedAvailability?: "declared" | "undeclared" | null;
  onAvailabilityToggle?: (value: "declared" | "undeclared") => void;
};

const PROJECT_ROLE_OPTIONS: IRoleOption[] = [
  { value: String(EUserProjectRoles.ADMIN), label: "Admin" },
  { value: String(EUserProjectRoles.MEMBER), label: "Member" },
  { value: String(EUserProjectRoles.GUEST), label: "Guest" },
];

const WORKSPACE_ROLE_OPTIONS: IRoleOption[] = [
  { value: String(EUserWorkspaceRoles.ADMIN), label: "Admin" },
  { value: String(EUserWorkspaceRoles.MEMBER), label: "Member" },
  { value: String(EUserWorkspaceRoles.GUEST), label: "Guest" },
  { value: "suspended", label: "Suspended" },
];

// Role filter group component
const RoleFilterGroup = observer(function RoleFilterGroup({
  appliedFilters,
  handleUpdate,
  memberType,
}: {
  appliedFilters: string[] | null;
  handleUpdate: (role: string) => void;
  memberType: "project" | "workspace";
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const appliedFiltersCount = appliedFilters?.length ?? 0;
  const roleOptions = memberType === "project" ? PROJECT_ROLE_OPTIONS : WORKSPACE_ROLE_OPTIONS;

  return (
    <div className="space-y-2">
      <FilterHeader
        title={`Roles${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={isExpanded}
        handleIsPreviewEnabled={() => setIsExpanded(!isExpanded)}
      />

      {isExpanded && (
        <div className="space-y-1">
          {roleOptions.map((role) => {
            const isSelected = appliedFilters?.includes(role.value) ?? false;
            return (
              <FilterOption
                key={`role-${role.value}`}
                isChecked={isSelected}
                title={role.label}
                onClick={() => handleUpdate(role.value)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

const SimpleFilterGroup = observer(function SimpleFilterGroup({
  title,
  options,
  applied,
  onToggle,
}: {
  title: string;
  options: IRoleOption[];
  applied: string[];
  onToggle: (value: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div className="space-y-2">
      <FilterHeader
        title={`${title}${applied.length > 0 ? ` (${applied.length})` : ""}`}
        isPreviewEnabled={isExpanded}
        handleIsPreviewEnabled={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && (
        <div className="space-y-1">
          {options.map((option) => (
            <FilterOption
              key={`${title}-${option.value}`}
              isChecked={applied.includes(option.value)}
              title={option.label}
              onClick={() => onToggle(option.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const AVAILABILITY_OPTIONS: IRoleOption[] = [
  { value: "declared", label: "Declared hours" },
  { value: "undeclared", label: "No answer" },
];

export const MemberListFilters = observer(function MemberListFilters(props: Props) {
  const {
    appliedFilters,
    handleUpdate,
    memberType,
    disciplineOptions,
    appliedDisciplines,
    onDisciplineToggle,
    appliedAvailability,
    onAvailabilityToggle,
  } = props;

  return (
    <div className="space-y-4">
      {/* Role Filter Group */}
      <RoleFilterGroup appliedFilters={appliedFilters} handleUpdate={handleUpdate} memberType={memberType} />

      {onDisciplineToggle && disciplineOptions && disciplineOptions.length > 0 && (
        <SimpleFilterGroup
          title="Discipline"
          options={disciplineOptions}
          applied={appliedDisciplines ?? []}
          onToggle={onDisciplineToggle}
        />
      )}

      {onAvailabilityToggle && (
        <SimpleFilterGroup
          title="Availability"
          options={AVAILABILITY_OPTIONS}
          applied={appliedAvailability ? [appliedAvailability] : []}
          onToggle={(v) => onAvailabilityToggle(v as "declared" | "undeclared")}
        />
      )}
    </div>
  );
});

// Dropdown component for member list filters
export const MemberListFiltersDropdown = observer(function MemberListFiltersDropdown(props: Props) {
  const { appliedFilters, appliedDisciplines, appliedAvailability } = props;

  // Counts every group, not just roles - a dot that ignores the discipline filter would say
  // "nothing applied" while the table is filtered.
  const appliedFiltersCount =
    (appliedFilters?.length ?? 0) + (appliedDisciplines?.length ?? 0) + (appliedAvailability ? 1 : 0);

  return (
    <CustomMenu
      customButton={
        <div className="relative">
          <Button variant="secondary" size="lg" className="flex items-center gap-2">
            <span>Filters</span>
            <ChevronDownIcon className="h-3 w-3" />
          </Button>
          {appliedFiltersCount > 0 && (
            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent-primary" />
          )}
        </div>
      }
      placement="bottom-start"
    >
      <MemberListFilters {...props} />
    </CustomMenu>
  );
});
