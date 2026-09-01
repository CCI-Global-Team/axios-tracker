/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TAvatarSize = "sm" | "md" | "base" | "lg" | number;

/**
 * Get the size details based on the size prop
 * @param size The size of the avatar
 * @returns The size details
 */
export const getSizeInfo = (size: TAvatarSize) => {
  switch (size) {
    case "sm":
      return {
        avatarSize: "h-4 w-4",
        fontSize: "text-11",
        spacing: "-space-x-1",
      };
    case "md":
      return {
        avatarSize: "h-5 w-5",
        fontSize: "text-11",
        spacing: "-space-x-1",
      };
    case "base":
      return {
        avatarSize: "h-6 w-6",
        fontSize: "text-13",
        spacing: "-space-x-1.5",
      };
    case "lg":
      return {
        avatarSize: "h-7 w-7",
        fontSize: "text-13",
        spacing: "-space-x-1.5",
      };
    default:
      return {
        avatarSize: "h-5 w-5",
        fontSize: "text-11",
        spacing: "-space-x-1",
      };
  }
};

/**
 * Get the border radius based on the shape prop
 * @param shape The shape of the avatar
 * @returns The border radius
 */
export const getBorderRadius = (shape: "circle" | "square") => {
  switch (shape) {
    case "circle":
      return "rounded-full";
    case "square":
      return "rounded-sm";
    default:
      return "rounded-full";
  }
};

/**
 * Check if the value is a valid number
 * @param value The value to check
 * @returns Whether the value is a valid number or not
 */
export const isAValidNumber = (value: unknown) => typeof value === "number" && !isNaN(value);

// CCI: a deterministic colour per person for the initial-letter fallback.
//
// Every fallback avatar used to be the same teal, so a list of people without profile pictures
// read as one repeated blob and the initial was the only thing telling them apart. Colour does
// most of that work before you read anything.
//
// Every entry clears 4.5:1 against the white initial (WCAG AA), so the letter stays legible on
// all of them, and the hues are spread far enough apart to be told apart at 20px. The original
// teal is kept first so existing avatars mostly do not change.
export const AVATAR_FALLBACK_COLORS = [
  "#028375", // teal
  "#0B6FA4", // blue
  "#4A5C9E", // indigo
  "#6B4E9E", // purple
  "#8C3F6B", // magenta
  "#A03E5C", // rose
  "#B04A2F", // burnt orange
  "#A3612A", // amber
  "#7A4E2D", // brown
  "#3D6B35", // green
  "#2E7D8F", // cyan
  "#57606A", // slate
];

/** Stable colour for `seed`. The same person gets the same colour on every device and every
 *  reload, which is the whole point - a colour that shuffles is worse than no colour. */
export const getAvatarFallbackColor = (seed?: string) => {
  if (!seed) return AVATAR_FALLBACK_COLORS[0];
  // djb2. Not for security - just needs to be stable and to spread short strings well.
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) hash = (hash * 33) ^ seed.charCodeAt(i);
  return AVATAR_FALLBACK_COLORS[Math.abs(hash) % AVATAR_FALLBACK_COLORS.length];
};
