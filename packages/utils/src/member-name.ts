/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TNameable = {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/**
 * CCI: the name to show a human.
 *
 * `display_name` is derived from the email local part at signup, so for almost everyone here it
 * reads as a handle — `kelvinanthony022`, `dikedaniel7917` — which nobody recognises in a list of
 * seventy. The real name lives in `first_name`, which for most of this workspace holds the WHOLE
 * name because `last_name` was never filled in; joining both and trimming handles either shape.
 *
 * Falls back to the handle rather than rendering an empty cell, since an account with no name at
 * all still has to be pickable.
 */
export const getMemberName = (user: TNameable | null | undefined): string => {
  if (!user) return "";
  const full = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return full || user.display_name || "";
};

/**
 * The handle, but only when it adds something the name does not. Used as a secondary line so two
 * people with similar names stay distinguishable without putting a redundant handle under every
 * row.
 */
export const getMemberHandle = (user: TNameable | null | undefined): string => {
  if (!user?.display_name) return "";
  return getMemberName(user) === user.display_name ? "" : user.display_name;
};

/**
 * CCI: whether a member matches what someone typed into a member search. People search for a
 * colleague by the name they know ("Happy", "Chukwuma"), not by the email-derived handle, so the
 * real name, the handle and the email all count. Case-insensitive; an empty query matches everyone.
 */
export const memberMatchesSearch = (
  user: (TNameable & { email?: string | null }) | null | undefined,
  query: string
): boolean => {
  if (!user) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${getMemberName(user)} ${user.display_name ?? ""} ${user.email ?? ""}`.toLowerCase().includes(needle);
};
