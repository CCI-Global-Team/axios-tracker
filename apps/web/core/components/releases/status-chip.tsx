/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import type { TReleaseStatus } from "@plane/types";
import { cn } from "@plane/utils";
// local imports
import { RELEASE_STATUS_CLASSES, RELEASE_STATUS_LABEL } from "./helpers";

type Props = {
  status: TReleaseStatus;
  className?: string;
};

export function ReleaseStatusChip({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 text-caption-md-medium whitespace-nowrap",
        RELEASE_STATUS_CLASSES[status] ?? RELEASE_STATUS_CLASSES.planning,
        className
      )}
    >
      {RELEASE_STATUS_LABEL[status] ?? status}
    </span>
  );
}
