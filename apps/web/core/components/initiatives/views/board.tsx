/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Card, ItemKey } from "@/components/issues/issue-layouts/plan/parts";
import type { GroupedViewProps } from "./parts";
import { Assignees, DueDate, EmptyLine, GroupIcon, ITEM_FOCUS, Priority, State } from "./parts";

export function BoardView({ items, groups, onOpen }: GroupedViewProps) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-contain p-4 max-sm:snap-x max-sm:snap-mandatory sm:px-page-x">
      {!items.length && <EmptyLine />}
      <div className="flex min-w-0 items-start gap-3">
        {groups.map((group) => (
          <section
            key={group.id}
            aria-label={`${group.name} (${group.items.length})`}
            className={`shrink-0 snap-start rounded-lg border border-subtle bg-surface-2 ${group.items.length ? "w-[280px] max-sm:w-[85vw]" : "w-12"}`}
          >
            <h3
              className={`flex gap-2 p-3 text-12 font-medium text-secondary ${group.items.length ? "items-center" : "min-h-40 items-center [writing-mode:vertical-rl]"}`}
            >
              <GroupIcon group={group} />
              <span className="min-w-0 truncate" title={group.name}>
                {group.name}
              </span>
              <span className="text-11 text-tertiary">{group.items.length}</span>
            </h3>
            {!!group.items.length && (
              <div className="space-y-2 px-2 pb-2">
                {group.items.map((item) => (
                  <Card key={item.id} className="overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      className={`flex w-full min-w-0 flex-col gap-2 p-3 text-left ${ITEM_FOCUS}`}
                    >
                      <ItemKey node={item} area={item.area} />
                      <span className="line-clamp-2 w-full text-13 font-medium break-words text-primary">
                        {item.name}
                      </span>
                      <span className="flex w-full min-w-0 items-center justify-between gap-2">
                        <State item={item} />
                        <Priority item={item} />
                      </span>
                      <span className="flex w-full flex-wrap items-center justify-between gap-2">
                        <Assignees item={item} />
                        <DueDate item={item} />
                      </span>
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
