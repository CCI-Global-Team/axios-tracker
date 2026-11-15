/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AreaDot, ItemKey } from "@/components/issues/issue-layouts/plan/parts";
import type { GroupedViewProps } from "./parts";
import { Assignees, DueDate, EmptyLine, GroupIcon, ITEM_FOCUS, Priority, State } from "./parts";

export function ListView({ items, groups, onOpen }: GroupedViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const prefix = useId();
  if (!items.length) return <EmptyLine />;
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      {groups.map((group, index) => {
        const open = !collapsed.has(group.id);
        const Icon = open ? ChevronDown : ChevronRight;
        const contentId = `${prefix}-${index}`;
        return (
          <section key={group.id}>
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
                className={`flex min-h-11 w-full items-center gap-2 border-b border-subtle bg-layer-1 px-4 py-2 text-left text-12 font-medium text-secondary sm:px-page-x ${ITEM_FOCUS}`}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <GroupIcon group={group} />
                <span className="truncate">{group.name}</span>
                <span className="text-11 text-tertiary">{group.items.length}</span>
              </button>
            </h3>
            <div id={contentId} hidden={!open}>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item)}
                  className={`flex min-h-11 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-subtle px-4 py-2 text-left sm:px-page-x ${ITEM_FOCUS}`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3 max-sm:basis-full">
                    <ItemKey node={item} area={item.area} />
                    <span className="min-w-0 truncate text-13 text-primary">{item.name}</span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 max-sm:w-full">
                    <span className="inline-flex items-center gap-1.5 text-11 text-tertiary sm:w-16">
                      <AreaDot area={item.projectArea} />
                      {item.projectIdentifier}
                    </span>
                    <span className="min-w-0 sm:w-36">
                      <State item={item} />
                    </span>
                    <span className="sm:w-5">
                      <Priority item={item} />
                    </span>
                    <span className="sm:w-24">
                      <Assignees item={item} />
                    </span>
                    <span className="sm:w-16 sm:text-right">
                      <DueDate item={item} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
