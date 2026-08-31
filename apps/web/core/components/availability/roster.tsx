/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { ChevronLeftIcon, ChevronRightIcon } from "@plane/propel/icons";
import type { TMemberAvailability } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
// lib
import { formatWeekRange, isCurrentWeek, shiftWeek, weekStartFor } from "@/lib/availability-week";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type TRow = {
  memberId: string;
  displayName: string;
  avatarUrl: string;
  hours: number | null;
  note: string;
  /** true when this value was carried from an earlier week rather than declared for this one */
  isCarried: boolean;
};

type TProps = { workspaceSlug: string };

export const AvailabilityRoster = observer(function AvailabilityRoster({ workspaceSlug }: TProps) {
  const [weekStart, setWeekStart] = useState<string>(() => weekStartFor());

  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();

  const { data, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_AVAILABILITY_${workspaceSlug}_${weekStart}` : null,
    workspaceSlug ? () => workspaceService.fetchMemberAvailability(workspaceSlug, weekStart) : null,
    { revalidateOnFocus: false }
  );

  // The API returns only the rows that EXIST. Joining against the full member list is what turns
  // "here are two declarations" into "here are 25 people, 23 of whom haven't told us" — and the
  // second is the question a lead actually has. A member with no row is `hours: null`, which is
  // deliberately distinct from a member who declared 0.
  const rows: TRow[] = useMemo(() => {
    const byMember = new Map<string, TMemberAvailability>();
    (data || []).forEach((row) => byMember.set(row.member_id, row));

    return (workspaceMemberIds || [])
      .map((memberId) => {
        const details = getWorkspaceMemberDetails(memberId);
        const row = byMember.get(memberId);
        return {
          memberId,
          displayName: details?.member?.display_name ?? "",
          avatarUrl: details?.member?.avatar_url ?? "",
          hours: row ? row.available_hours : null,
          note: row?.note ?? "",
          isCarried: row?.is_carried ?? false,
        };
      })
      .toSorted((a, b) => {
        // Declared first, most hours at the top — the person with capacity is who you are
        // looking for. Undeclared sink to the bottom, alphabetically, as a to-chase list.
        if (a.hours === null && b.hours === null) return a.displayName.localeCompare(b.displayName);
        if (a.hours === null) return 1;
        if (b.hours === null) return -1;
        if (b.hours !== a.hours) return b.hours - a.hours;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [data, workspaceMemberIds, getWorkspaceMemberDetails]);

  // Three states, not two. "Told us this week", "standing commitment carried forward" and
  // "never said" are different facts, and a lead chasing people needs the third separated from
  // the other two.
  const withHours = rows.filter((r) => r.hours !== null);
  const declaredThisWeek = withHours.filter((r) => !r.isCarried);
  const carried = withHours.filter((r) => r.isCarried);
  const totalHours = withHours.reduce((sum, r) => sum + (r.hours ?? 0), 0);

  return (
    <div className="h-full w-full overflow-y-auto px-6 py-6 md:px-9">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Availability</h3>
            {/* Naming the span matters: the week is anchored on Sunday and derived from the
                viewer's clock, so an unlabelled "this week" is a claim the reader cannot check. */}
            <p className="text-sm mt-1 text-secondary">
              Week of {formatWeekRange(weekStart)}
              {isCurrentWeek(weekStart) ? " · this week" : ""}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
              aria-label="Previous week"
              className="rounded-sm border border-subtle p-1.5 hover:bg-surface-2"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(weekStartFor())}
              disabled={isCurrentWeek(weekStart)}
              className="text-xs rounded-sm border border-subtle px-2.5 py-1.5 font-medium hover:bg-surface-2 disabled:opacity-40"
            >
              This week
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
              aria-label="Next week"
              className="rounded-sm border border-subtle p-1.5 hover:bg-surface-2"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-3">
          <Summary label="Declared this week" value={`${declaredThisWeek.length} of ${rows.length}`} />
          <Summary label="Standing" value={`${carried.length}`} />
          <Summary label="Total hours" value={`${totalHours}h`} />
          <Summary label="No answer" value={`${rows.length - withHours.length}`} muted />
        </div>

        {isLoading && !data ? (
          <Loader className="space-y-2">
            {["a", "b", "c", "d", "e", "f"].map((row) => (
              <Loader.Item key={row} height="44px" />
            ))}
          </Loader>
        ) : (
          <div className="overflow-hidden rounded-lg border border-subtle">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-xs bg-surface-2 text-left tracking-wide text-tertiary uppercase">
                  <th className="px-4 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Hours</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.memberId} className="border-t border-subtle">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.displayName} src={getFileURL(row.avatarUrl)} />
                        <span className={cn("truncate", row.hours === null && "text-tertiary")}>{row.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {row.hours === null ? (
                        <span className="font-normal text-tertiary">&mdash;</span>
                      ) : (
                        `${row.hours}h`
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-secondary">
                      {row.isCarried && (
                        <span className="text-xs mr-2 rounded-sm bg-surface-2 px-1.5 py-0.5 text-tertiary">
                          standing
                        </span>
                      )}
                      {row.note}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-tertiary">
                      No members in this workspace yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs mt-4 text-tertiary">
          Members declare their hours in{" "}
          <a href="/settings/profile/preferences" className="underline hover:text-secondary">
            profile preferences
          </a>
          . A dash means they haven&apos;t declared for this week &mdash; which is not the same as declaring zero.
        </p>
      </div>
    </div>
  );
});

const Summary = ({ label, value, muted }: { label: string; value: string; muted?: boolean }) => (
  <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-2.5">
    <div className={cn("text-lg font-semibold tabular-nums", muted && "text-tertiary")}>{value}</div>
    <div className="text-xs text-tertiary">{label}</div>
  </div>
);
