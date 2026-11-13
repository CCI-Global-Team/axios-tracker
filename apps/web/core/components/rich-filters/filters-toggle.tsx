/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { FilterIcon, FilterAppliedIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
// components
import { AddFilterButton } from "@/components/rich-filters/add-filters/button";

type TFiltersToggleProps<P extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<P, E> | undefined;
};

export const FiltersToggle = observer(function FiltersToggle<P extends TFilterProperty, E extends TExternalFilter>(
  props: TFiltersToggleProps<P, E>
) {
  const { filter } = props;
  // derived values
  const hasAnyConditions = (filter?.allConditionsForDisplay.length ?? 0) > 0;
  const isFilterRowVisible = filter?.isVisible ?? false;
  const hasUpdates = filter?.canUpdateView === true && filter?.hasChanges === true;
  const showFilterRowChangesPill = hasUpdates || hasAnyConditions === true;
  const showAddFilterButton = !hasAnyConditions && !isFilterRowVisible && !hasUpdates;

  const handleToggleFilter = () => {
    if (!filter) {
      console.error("Filters toggle error - filter instance not available");
      return;
    }
    filter.toggleVisibility();
  };

  // Base classes when filter is active
  const activeFilterBaseClasses =
    "text-accent-primary border border-accent-subtle-1 hover:border-accent-subtle-1 active:border-accent-subtle-1 focus:border-accent-subtle-1";

  // State classes that prevent hover/active/focus color changes
  const noHoverStateClasses = "hover:text-accent-primary active:text-accent-primary focus:text-accent-primary";

  // Background classes based on toggle state (darker when open, lighter when closed)
  const backgroundClasses = isFilterRowVisible
    ? "bg-accent-subtle-hover hover:bg-accent-subtle-hover active:bg-accent-subtle-hover focus:bg-accent-subtle-hover"
    : "bg-accent-subtle hover:bg-accent-subtle active:bg-accent-subtle focus:bg-accent-subtle";

  const buttonClassName = cn({
    [activeFilterBaseClasses]: showFilterRowChangesPill,
    [backgroundClasses]: showFilterRowChangesPill,
    [noHoverStateClasses]: showFilterRowChangesPill,
  });

  const iconClassName = cn({
    "text-accent-primary [&_path]:fill-current": showFilterRowChangesPill,
  });

  // Show the add filter button when there are no active conditions, the filter row is hidden, and no unsaved changes exist
  if (filter && showAddFilterButton) {
    return (
      <AddFilterButton
        filter={filter}
        buttonConfig={{
          variant: "ghost",
          className: "h-7 rounded-md px-2 text-13 font-medium text-secondary",
          label: "Filter",
        }}
        onFilterSelect={() => filter?.toggleVisibility(true)}
      />
    );
  }

  const ToggleIcon = showFilterRowChangesPill ? FilterAppliedIcon : FilterIcon;
  return (
    <Button
      size="lg"
      variant="ghost"
      onClick={handleToggleFilter}
      aria-expanded={isFilterRowVisible}
      className={cn("gap-1 px-2 text-13 font-medium text-secondary", buttonClassName)}
      prependIcon={<ToggleIcon className={cn("size-4", iconClassName)} />}
    >
      Filter
    </Button>
  );
});
