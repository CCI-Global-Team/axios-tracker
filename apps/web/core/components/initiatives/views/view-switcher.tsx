/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useSearchParams } from "react-router";
import { Tooltip } from "@plane/propel/tooltip";
import { EIssueLayoutTypes } from "@plane/types";
import { cn } from "@plane/utils";
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";

const VIEWS = [
  { id: "plan", name: "Plan", layout: EIssueLayoutTypes.PLAN },
  { id: "table", name: "Table", layout: EIssueLayoutTypes.SPREADSHEET },
  { id: "board", name: "Board", layout: EIssueLayoutTypes.KANBAN },
  { id: "list", name: "List", layout: EIssueLayoutTypes.LIST },
  { id: "calendar", name: "Calendar", layout: EIssueLayoutTypes.CALENDAR },
] as const;
export type InitiativeView = (typeof VIEWS)[number]["id"];
export function useInitiativeView() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find(({ id }) => id === params.get("view"))?.id ?? "plan";
  const setView = (next: InitiativeView) =>
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        updated.set("view", next);
        return updated;
      },
      { replace: true }
    );
  return { view, setView };
}
export function ViewSwitcher({ view, onChange }: { view: InitiativeView; onChange: (view: InitiativeView) => void }) {
  return (
    <div className="shrink-0 border-b border-subtle px-4 py-2.5 sm:px-page-x">
      <div
        role="tablist"
        aria-label="Work item view"
        className="inline-flex rounded-md bg-layer-2 p-0.5 max-sm:grid max-sm:w-full max-sm:grid-cols-5"
      >
        {VIEWS.map(({ id, name, layout }, index) => (
          <Tooltip key={id} tooltipContent={name}>
            <button
              type="button"
              role="tab"
              aria-label={name}
              aria-selected={view === id}
              tabIndex={view === id ? 0 : -1}
              id={`initiative-tab-${id}`}
              aria-controls="initiative-work-items-panel"
              onClick={() => onChange(id)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % VIEWS.length
                    : event.key === "ArrowLeft"
                      ? (index + VIEWS.length - 1) % VIEWS.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? VIEWS.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                onChange(VIEWS[next].id);
                document.getElementById(`initiative-tab-${VIEWS[next].id}`)?.focus();
              }}
              className={cn(
                "flex h-7 items-center justify-center gap-1.5 rounded-sm px-2.5 text-13 whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-accent-strong)] max-sm:h-10",
                view === id
                  ? "bg-layer-1 font-medium text-primary shadow-raised-100"
                  : "text-tertiary hover:text-secondary"
              )}
            >
              <IssueLayoutIcon layout={layout} size={14} className="shrink-0" />
              <span className="hidden sm:inline">{name}</span>
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
