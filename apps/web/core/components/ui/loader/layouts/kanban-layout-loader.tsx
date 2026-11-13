/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef } from "react";
import { range } from "lodash-es";
// plane ui
import { ContentWrapper } from "@plane/ui";
// plane utils
import { cn } from "@plane/utils";

export const KanbanIssueBlockLoader = forwardRef(function KanbanIssueBlockLoader(
  { cardHeight = 100, shouldAnimate = true }: { cardHeight?: number; shouldAnimate?: boolean },
  ref: React.ForwardedRef<HTMLSpanElement>
) {
  return (
    // CCI: shaped like a card (key, title, a property row) so the board doesn't jump when it loads.
    <span
      ref={ref}
      className={cn("flex flex-col gap-2 rounded-lg border border-subtle bg-layer-2 p-2.5", {
        "motion-safe:animate-pulse": shouldAnimate,
      })}
      style={{ minHeight: `${Math.min(cardHeight, 84)}px` }}
    >
      <span className="h-3 w-12 rounded-sm bg-layer-1" />
      <span className="h-3.5 w-4/5 rounded-sm bg-layer-1" />
      <span className="mt-auto h-3 w-1/3 rounded-sm bg-layer-1" />
    </span>
  );
});

export function KanbanColumnLoader({
  cardsInColumn = 3,
  ignoreHeader = false,
  cardHeight = 100,
  shouldAnimate = true,
}: {
  cardsInColumn?: number;
  ignoreHeader?: boolean;
  cardHeight?: number;
  shouldAnimate?: boolean;
}) {
  return (
    <div className="flex w-[280px] flex-col gap-1.5 lg:w-[300px]">
      {!ignoreHeader && (
        <div
          className={cn("flex h-9 w-[280px] items-center gap-2 rounded-md bg-layer-1 px-2.5 lg:w-[300px]", {
            "motion-safe:animate-pulse": shouldAnimate,
          })}
        >
          <span className="size-3.5 rounded-full bg-layer-3" />
          <span className="h-3 w-20 rounded-sm bg-layer-3" />
        </div>
      )}
      {range(cardsInColumn).map((cardIndex) => (
        <KanbanIssueBlockLoader key={cardIndex} cardHeight={cardHeight} shouldAnimate={shouldAnimate} />
      ))}
    </div>
  );
}

KanbanIssueBlockLoader.displayName = "KanbanIssueBlockLoader";

export function KanbanLayoutLoader({ cardsInEachColumn = [2, 3, 2, 4, 3] }: { cardsInEachColumn?: number[] }) {
  return (
    <ContentWrapper className="flex-row gap-3 overflow-x-auto py-1.5">
      {cardsInEachColumn.map((cardsInColumn, columnIndex) => (
        // oxlint-disable-next-line react/no-array-index-key -- static skeleton columns
        <KanbanColumnLoader key={columnIndex} cardsInColumn={cardsInColumn} />
      ))}
    </ContentWrapper>
  );
}
