/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { SuspendedUserIcon } from "@plane/propel/icons";
import type { IUserLite } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, getMemberName } from "@plane/utils";

type Props = {
  userId: string;
  user: IUserLite | undefined;
  isCurrentUser?: boolean;
  isSuspended?: boolean;
  /** Right-aligned extra, e.g. declared hours and open items. */
  trailing?: ReactNode;
};

/**
 * CCI: one person in a member picker. Name on top; username and email underneath, so two people
 * with the same first name are told apart and a search on any of the three shows why a row
 * matched. Email is only present for viewers allowed to see it (members and admins).
 */
export function MemberPickerRow(props: Props) {
  const { userId, user, isCurrentUser = false, isSuspended = false, trailing } = props;
  const name = getMemberName(user);
  const details = [user?.display_name ? `@${user.display_name}` : "", user?.email ?? ""].filter(Boolean);

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex size-6 flex-shrink-0 items-center justify-center">
        {isSuspended ? (
          <SuspendedUserIcon className="size-4 text-placeholder" />
        ) : (
          <Avatar name={name} src={getFileURL(user?.avatar_url ?? "")} fallbackSeed={userId} size={24} />
        )}
      </div>
      <div className="min-w-0 flex-grow">
        <div className={cn("truncate text-13 text-primary", isSuspended && "text-placeholder")}>
          {name}
          {isCurrentUser && <span className="ml-1 text-tertiary">(you)</span>}
        </div>
        {details.length > 0 && <div className="truncate text-11 text-tertiary">{details.join(" · ")}</div>}
      </div>
      {trailing}
    </div>
  );
}
