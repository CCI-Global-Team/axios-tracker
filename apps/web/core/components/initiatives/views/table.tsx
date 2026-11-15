/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { AreaDot, ItemKey } from "@/components/issues/issue-layouts/plan/parts";
import type { SortColumn } from "./model";
import { compareItems } from "./model";
import type { ViewProps } from "./parts";
import { Assignees, DueDate, EmptyLine, ITEM_FOCUS, ItemDate, Priority, State } from "./parts";

const COLUMNS: { id: SortColumn; name: string }[] = [
  { id: "item", name: "Item" },
  { id: "project", name: "Project" },
  { id: "module", name: "Module" },
  { id: "state", name: "State" },
  { id: "priority", name: "Priority" },
  { id: "assignees", name: "Assignees" },
  { id: "start", name: "Start" },
  { id: "due", name: "Due" },
];
export function TableView({ items, onOpen }: ViewProps) {
  const [sort, setSort] = useState<{ column: SortColumn; descending: boolean }>({ column: "state", descending: false });
  if (!items.length) return <EmptyLine />;
  const sorted = [...items].toSorted((a, b) => compareItems(a, b, sort.column) * (sort.descending ? -1 : 1));
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-x-contain">
      <table className="w-full min-w-[1100px] table-fixed border-collapse text-left text-12">
        <caption className="sr-only">Initiative work items</caption>
        <colgroup>
          <col className="w-80" />
          <col className="w-40" />
          <col className="w-40" />
          <col className="w-36" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-32" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-surface-1">
          <tr>
            {COLUMNS.map(({ id, name }) => (
              <th
                key={id}
                scope="col"
                aria-sort={sort.column === id ? (sort.descending ? "descending" : "ascending") : "none"}
                className="border-b border-subtle font-medium text-tertiary"
              >
                <button
                  type="button"
                  onClick={() => setSort({ column: id, descending: sort.column === id && !sort.descending })}
                  className={`flex min-h-11 w-full items-center gap-1 px-3 py-2 ${ITEM_FOCUS}`}
                >
                  {name}
                  {sort.column === id &&
                    (sort.descending ? (
                      <ArrowDown className="size-3" aria-hidden />
                    ) : (
                      <ArrowUp className="size-3" aria-hidden />
                    ))}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr
              key={item.id}
              onClick={() => onOpen(item)}
              className="cursor-pointer border-b border-subtle hover:bg-layer-transparent-hover"
            >
              <td className="p-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(item);
                  }}
                  className={`flex min-h-11 w-full min-w-0 flex-col items-start gap-1 px-3 py-2 text-left ${ITEM_FOCUS}`}
                >
                  <ItemKey node={item} area={item.area} />
                  <span className="w-full truncate text-13 text-primary">{item.name}</span>
                </button>
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-1.5">
                  <AreaDot area={item.projectArea} />
                  <span className="truncate text-secondary" title={item.projectName}>
                    {item.projectName}
                  </span>
                </span>
              </td>
              <td className="truncate px-3 py-2 text-secondary" title={item.modules.map((m) => m.name).join(", ")}>
                {item.modules.map((m) => m.name).join(", ") || "No module"}
              </td>
              <td className="px-3 py-2">
                <State item={item} />
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-1.5 text-secondary capitalize">
                  <Priority item={item} />
                  {item.priority}
                </span>
              </td>
              <td className="px-3 py-2">
                <Assignees item={item} />
              </td>
              <td className="px-3 py-2">
                <ItemDate value={item.startDate} />
              </td>
              <td className="px-3 py-2">
                <DueDate item={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
