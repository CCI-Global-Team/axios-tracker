/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CCI: the single definition of the availability week on the client.
 *
 * The week starts on SUNDAY — services are Sunday, so the ministry week opens there, and a
 * Monday anchor would split a weekend across two declarations. The server agrees, and its
 * serializer rejects any week_start that is not a Sunday.
 */

/** ISO date (YYYY-MM-DD) of the Sunday opening the week that contains `from`. */
export const weekStartFor = (from: Date = new Date()): string => {
  const d = new Date(from);
  // getDay() is Sunday=0, so it is itself the offset back to Sunday.
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
};

/** Shift an ISO week-start by N weeks. */
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

/**
 * CCI: how a declared figure reads.
 *
 * "8h" alone cannot say whether someone answered for THIS week or set a standing commitment, and
 * "repeats" as a separate chip made the reader assemble the two halves themselves. Saying it in
 * one phrase - "8h this week" against "8h weekly" - is the whole distinction in the value itself.
 *
 * Defined once because it appears on five surfaces, and five copies drift.
 */
export const formatDeclaredHours = (hours: number, isRepeating: boolean): string =>
  isRepeating ? `${hours}h weekly` : `${hours}h this week`;

/**
 * The same distinction, for surfaces whose column heading already says "this week" - repeating the
 * words in every row of a column called "Available this week" is noise.
 */
export const formatDeclaredHoursShort = (hours: number, isRepeating: boolean): string =>
  isRepeating ? `${hours}h weekly` : `${hours}h`;
