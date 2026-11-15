/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { CalendarDays, ChevronDown, ListFilter, Search, X } from "lucide-react";
import { ModuleIcon, PriorityIcon } from "@plane/propel/icons";
import { Tag } from "@plane/ui";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import type { FilterField, WorkItemFilterOption, WorkItemFilterOptions, WorkItemFilters } from "./model";
import { FILTER_FIELDS } from "./model";
import { GroupIcon, ITEM_FOCUS } from "./parts";

type FilterProps = {
  filters: WorkItemFilters;
  options: WorkItemFilterOptions;
  onToggle: (field: FilterField, value: string) => void;
};

function OptionIcon({ field, option }: { field: FilterField; option: WorkItemFilterOption }) {
  if (field === "status" || field === "project" || field === "assignee")
    return <GroupIcon group={{ ...option, kind: field, items: [] }} />;
  if (field === "module") return <ModuleIcon className="size-3.5 shrink-0" />;
  if (field === "label")
    return <span className="size-2.5 shrink-0 rounded-full bg-layer-2" style={{ backgroundColor: option.color }} />;
  if (field === "priority") {
    const priority = option.id;
    if (
      priority === "urgent" ||
      priority === "high" ||
      priority === "medium" ||
      priority === "low" ||
      priority === "none"
    )
      return <PriorityIcon priority={priority} className="size-3.5" />;
  }
  return <CalendarDays className="size-3.5 shrink-0" />;
}

function FilterSection({
  field,
  name,
  query,
  filters,
  options,
  onToggle,
}: FilterProps & {
  field: FilterField;
  name: string;
  query: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const matches = options[field].filter((option) =>
    `${name} ${option.name} ${option.identifier ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  if (!matches.length) return null;
  return (
    <div className="py-2">
      <FilterHeader
        title={`${name}${filters[field].length ? ` (${filters[field].length})` : ""}`}
        isPreviewEnabled={expanded}
        handleIsPreviewEnabled={() => setExpanded(!expanded)}
      />
      {expanded &&
        matches.map((option) => (
          <FilterOption
            key={option.id}
            isChecked={filters[field].includes(option.id)}
            onClick={() => onToggle(field, option.id)}
            icon={<OptionIcon field={field} option={option} />}
            title={
              <span title={option.name}>
                {option.identifier && <span className="text-tertiary">{option.identifier} · </span>}
                {option.name} <span className="text-tertiary">({option.count})</span>
              </span>
            }
          />
        ))}
    </div>
  );
}

export function WorkItemFiltersDropdown(props: FilterProps) {
  const [query, setQuery] = useState("");
  const count = FILTER_FIELDS.reduce((sum, { id }) => sum + props.filters[id].length, 0);
  const hasMatches = FILTER_FIELDS.some(({ id, name }) =>
    props.options[id].some((option) =>
      `${name} ${option.name} ${option.identifier ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
    )
  );
  return (
    <FiltersDropdown
      placement="bottom-start"
      menuButton={
        <span
          className={`flex h-7 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2.5 text-13 text-secondary max-sm:h-11 ${ITEM_FOCUS}`}
        >
          <ListFilter className="size-3.5" aria-hidden />
          Filters{count > 0 && <span className="text-accent-primary">({count})</span>}
          <ChevronDown className="size-3.5" aria-hidden />
        </span>
      }
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="bg-surface-1 p-2.5 pb-0">
          <label className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-1.5 py-1 text-11">
            <Search className="size-3 shrink-0 text-placeholder" aria-hidden />
            <input
              type="search"
              aria-label="Search filters"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full min-w-0 bg-surface-2 outline-none placeholder:text-placeholder max-sm:h-10"
            />
          </label>
        </div>
        <div className="vertical-scrollbar scrollbar-sm min-h-0 w-full divide-y divide-subtle-1 overflow-y-auto px-2.5">
          {FILTER_FIELDS.map(({ id, name }) => (
            <FilterSection key={id} {...props} field={id} name={name} query={query} />
          ))}
          {!hasMatches && <p className="py-2 text-11 text-placeholder italic">No matches found</p>}
        </div>
      </div>
    </FiltersDropdown>
  );
}

export function AppliedWorkItemFilters({ filters, options, onToggle, onClear }: FilterProps & { onClear: () => void }) {
  if (!FILTER_FIELDS.some(({ id }) => filters[id].length)) return null;
  return (
    <div
      aria-label="Applied filters"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4 py-2.5 sm:px-page-x"
    >
      {FILTER_FIELDS.filter(({ id }) => filters[id].length).map(({ id, name }) => (
        <Tag key={id} className="h-auto max-w-full min-w-0 flex-wrap">
          <span className="text-11 text-secondary">{name}</span>
          {filters[id].map((value) => {
            const option = options[id].find((entry) => entry.id === value);
            if (!option) return null;
            return (
              <span
                key={value}
                className="relative flex max-w-full min-w-0 items-center gap-1 rounded-sm bg-layer-1 p-1 text-11"
              >
                <OptionIcon field={id} option={option} />
                <span className="min-w-0 truncate" title={option.name}>
                  {option.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${name}: ${option.name}`}
                  onClick={() => onToggle(id, value)}
                  className={`grid size-3 shrink-0 place-items-center rounded-sm text-tertiary max-sm:size-11 ${ITEM_FOCUS}`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            );
          })}
        </Tag>
      ))}
      <button
        type="button"
        onClick={onClear}
        className={`rounded px-2 py-1 text-11 text-tertiary max-sm:min-h-11 ${ITEM_FOCUS}`}
      >
        Clear all
      </button>
    </div>
  );
}
