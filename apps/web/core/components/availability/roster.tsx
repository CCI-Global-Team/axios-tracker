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
import {
  formatDeclaredHoursShort,
  formatWeekRange,
  isCurrentWeek,
  shiftWeek,
  weekStartFor,
} from "@/lib/availability-week";
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
  /** when carried, the week it was actually declared in */
  carriedFrom: string;
  /** the member marked this as repeating until they change it */
  isRepeating: boolean;
  /** what this member works on; set by an admin, not self-declared */
  disciplines: string[];
};

type TProps = { workspaceSlug: string };

export const AvailabilityRoster = observer(function AvailabilityRoster({ workspaceSlug }: TProps) {
  const [weekStart, setWeekStart] = useState<string>(() => weekStartFor());
  // Narrowing the roster rather than the week. Kept separate from weekStart so stepping between
  // weeks holds the filter — comparing the same discipline across two weeks is the point.
  const [disciplineFilter, setDisciplineFilter] = useState<string | null>(null);
  const [hoursOnly, setHoursOnly] = useState(false);

  const {
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();

  const { data, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_AVAILABILITY_${workspaceSlug}_${weekStart}` : null,
    workspaceSlug ? () => workspaceService.fetchMemberAvailability(workspaceSlug, weekStart) : null,
    { revalidateOnFocus: false }
  );

  // Disciplines do not change by week, so this is fetched once and reused as the week is stepped
  // through. Hours answer "who is free"; discipline answers "free to do what" — the pair is the
  // question a lead actually has, and splitting them across two pages meant doing the join by hand.
  const { data: disciplineData } = useSWR(
    workspaceSlug ? `WORKSPACE_MEMBER_DISCIPLINES_${workspaceSlug}` : null,
    workspaceSlug ? () => workspaceService.fetchMemberDisciplines(workspaceSlug) : null,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  // The API returns only the rows that EXIST. Joining against the full member list is what turns
  // "here are two declarations" into "here are 25 people, 23 of whom haven't told us" — and the
  // second is the question a lead actually has. A member with no row is `hours: null`, which is
  // deliberately distinct from a member who declared 0.
  const rows: TRow[] = useMemo(() => {
    const byMember = new Map<string, TMemberAvailability>();
    (data || []).forEach((row) => byMember.set(row.member_id, row));
    const disciplinesByMember = new Map<string, string[]>();
    (disciplineData?.members || []).forEach((row) => disciplinesByMember.set(row.member_id, row.disciplines));

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
          carriedFrom: row?.source_week_start ?? "",
          isRepeating: row?.is_persistent ?? false,
          disciplines: disciplinesByMember.get(memberId) ?? [],
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
  }, [data, disciplineData, workspaceMemberIds, getWorkspaceMemberDetails]);

  const disciplineChoices = disciplineData?.choices ?? [];
  const disciplineLabel = new Map(disciplineChoices.map((c) => [c.value, c.label]));
  // Offer only disciplines somebody in this workspace actually holds.
  const offeredDisciplines = disciplineChoices.filter((c) => rows.some((r) => r.disciplines.includes(c.value)));
  const isFiltered = disciplineFilter !== null || hoursOnly;

  const visibleRows = rows.filter((r) => {
    if (hoursOnly && r.hours === null) return false;
    if (disciplineFilter && !r.disciplines.includes(disciplineFilter)) return false;
    return true;
  });

  // Three states, not two. "Told us this week", "repeating until changed" and
  // "never said" are different facts, and a lead chasing people needs the third separated from
  // the other two.
  //
  // Counted over the FILTERED rows, so the tiles describe the table beneath them. Totals that
  // stayed workspace-wide while the table showed six people would just be a second, contradictory
  // answer on the same screen; the heading says which set is being counted.
  const withHours = visibleRows.filter((r) => r.hours !== null);
  const repeating = withHours.filter((r) => r.isRepeating);
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

        {(offeredDisciplines.length > 0 || rows.length > 0) && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHoursOnly((v) => !v)}
              className={cn(
                "text-xs rounded-full border px-2.5 py-1 font-medium",
                hoursOnly
                  ? "border-accent-strong bg-accent-primary text-on-color"
                  : "border-subtle text-tertiary hover:text-secondary"
              )}
            >
              Has hours
            </button>
            {offeredDisciplines.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setDisciplineFilter((v) => (v === c.value ? null : c.value))}
                className={cn(
                  "text-xs rounded-full border px-2.5 py-1 font-medium",
                  disciplineFilter === c.value
                    ? "border-accent-strong bg-accent-primary text-on-color"
                    : "border-subtle text-tertiary hover:text-secondary"
                )}
              >
                {c.label}
              </button>
            ))}
            {isFiltered && (
              <button
                type="button"
                onClick={() => {
                  setDisciplineFilter(null);
                  setHoursOnly(false);
                }}
                className="text-xs px-2 py-1 text-tertiary underline hover:text-secondary"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="mb-5 flex flex-wrap gap-3">
          <Summary
            label={isFiltered ? "Have hours (filtered)" : "Have hours"}
            value={`${withHours.length} of ${visibleRows.length}`}
          />
          <Summary label="Weekly" value={`${repeating.length}`} />
          <Summary label={isFiltered ? "Hours (filtered)" : "Total hours"} value={`${totalHours}h`} />
          <Summary label="No answer" value={`${visibleRows.length - withHours.length}`} muted />
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
                  <th className="px-4 py-2.5 font-medium">Discipline</th>
                  <th className="px-4 py-2.5 text-right font-medium whitespace-nowrap">Hours</th>
                  <th className="px-4 py-2.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.memberId} className="border-t border-subtle">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.displayName} src={getFileURL(row.avatarUrl)} fallbackSeed={row.memberId} />
                        <span className={cn("truncate", row.hours === null && "text-tertiary")}>{row.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {row.disciplines.length === 0 ? (
                        <span className="text-tertiary">&mdash;</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.disciplines.map((slug) => (
                            <span
                              key={slug}
                              className="text-xs rounded border border-subtle bg-surface-2 px-1.5 py-0.5 whitespace-nowrap text-secondary"
                            >
                              {disciplineLabel.get(slug) ?? slug}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap tabular-nums">
                      {row.hours === null ? (
                        <span className="font-normal text-tertiary">&mdash;</span>
                      ) : (
                        // The distinction lives in the value now rather than a chip beside it, so
                        // "8h weekly" reads as one fact instead of two halves to assemble. The
                        // title keeps the origin week: "weekly" says the number is not fresh, the
                        // date says how stale, and staleness is what gets acted on.
                        <span
                          title={
                            !row.isRepeating
                              ? undefined
                              : row.carriedFrom
                                ? `Set in the week of ${formatWeekRange(row.carriedFrom)} and carried forward`
                                : "Set this week, and carries into later weeks until changed"
                          }
                        >
                          {formatDeclaredHoursShort(row.hours, row.isRepeating)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-secondary">{row.note}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-tertiary">
                      {rows.length === 0 ? "No members in this workspace yet." : "No one matches those filters."}
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
          . A dash under Hours means they haven&apos;t declared for this week &mdash; which is not the same as declaring
          zero. Disciplines are set by an admin on the members page, not declared by the member.
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
