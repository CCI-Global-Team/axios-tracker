/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CCI: the one place the availability week is defined on the client.
 *
 * The week starts on SUNDAY — services are Sunday, so the ministry week opens there, and a
 * Monday anchor would split a weekend across two declarations. The server agrees
 * (`current_week_start()` in views/workspace/availability.py) and the serializer rejects any
 * week_start that is not a Sunday.
 *
 * This used to be duplicated as a `currentMonday()` in both the preference widget and the cycle
 * sidebar. Two copies of a date rule is one copy too many: they can drift, and a week boundary
 * that disagrees between the writer and the reader means someone declares hours that never
 * appear anywhere.
 *
 * KNOWN LIMITATION: this derives the week from the VIEWER's local clock while the server derives
 * it from UTC. Across the Saturday-Sunday boundary those disagree, so a volunteer in Lagos
 * declaring late Saturday can write next week's row and one in Dallas can write last week's.
 * Callers should render the resolved span (see formatWeekRange) so a mismatch is at least
 * visible. The real fix is to derive the week server-side from the member's own timezone.
 */

/** ISO date (YYYY-MM-DD) of the Sunday opening the week that contains `from`. */
export const weekStartFor = (from: Date = new Date()): string => {
  const d = new Date(from);
  // JS getDay(): Sunday=0 … Saturday=6, so the offset back to Sunday is simply getDay().
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
};

/** Shift an ISO week-start by N weeks. Used by the week picker. */
export const shiftWeek = (isoWeekStart: string, weeks: number): string => {
  const d = fromISODate(isoWeekStart);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
};

const formatDay = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** "31 Aug – 6 Sep" for the week opening on `isoWeekStart`. */
export const formatWeekRange = (isoWeekStart: string): string => {
  const start = fromISODate(isoWeekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatDay(start)} – ${formatDay(end)}`;
};

export const isCurrentWeek = (isoWeekStart: string): boolean => isoWeekStart === weekStartFor();

/**
 * Parse as LOCAL midnight, not UTC. `new Date("2026-08-30")` is parsed as UTC midnight, which in
 * any negative-offset timezone renders as the 29th — the whole picker would be a day out for
 * everyone west of Greenwich.
 */
const fromISODate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
