/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Due to some weird issue with the import order, the import of useFontFaceObserver
// should be after the imported here rather than some below helper functions as it is in the original file

import useFontFaceObserver from "use-font-face-observer";
// plane imports
import type { TLogoProps } from "@plane/types";
// local imports
import { getEmojiSize, stringToEmoji } from "./helper";
import { LUCIDE_ICONS_LIST } from "./lucide-icons";

type Props = {
  logo?: TLogoProps;
  size?: number;
  type?: "lucide" | "material";
  /** CCI: a project's identifier; with no logo set, the project shows its colour dot instead of a grey box. */
  seed?: string;
};

const PROJECT_DOT_HUES = [25, 250, 140, 300, 60, 200, 340, 100];

/** CCI: a project's hue, hashed from its identifier so the project has the same colour everywhere. */
export function projectHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PROJECT_DOT_HUES[Math.abs(hash) % PROJECT_DOT_HUES.length];
}

/** CCI: a project's colour square. */
export function ProjectDot({ seed, size = 9 }: { seed: string; size?: number }) {
  const hue = projectHue(seed);
  return (
    <span
      aria-hidden
      className="inline-block flex-shrink-0"
      style={{ width: size, height: size, borderRadius: Math.max(2, size / 3), background: `oklch(0.64 0.14 ${hue})` }}
    />
  );
}

export function Logo({ logo, size = 16, type = "material", seed }: Props) {
  const isMaterialSymbolsFontLoaded = useFontFaceObserver([
    {
      family: "Material Symbols Rounded",
      style: "normal",
      weight: "normal",
      stretch: "condensed",
    },
  ]);

  // Reusable loading skeleton
  const loadingSkeleton = <span style={{ height: size, width: size }} className="rounded-sm bg-layer-1" />;

  // CCI: no logo set — a project shows its colour dot, centred in the logo's box; anything else stays blank.
  const emptyLogo = (
    <span style={{ height: size, width: size }} className="inline-flex flex-shrink-0 items-center justify-center">
      {seed ? <ProjectDot seed={seed} size={Math.round(size * 0.6)} /> : null}
    </span>
  );

  // Early returns for loading/empty states
  if (!logo || !logo.in_use) return emptyLogo;

  const { in_use, emoji, icon } = logo;
  const value = in_use === "emoji" ? emoji?.value : icon?.name;

  if (!value) return emptyLogo;

  // Emoji rendering
  if (in_use === "emoji") {
    return (
      <span
        className="flex items-center justify-center"
        style={{
          fontSize: `${getEmojiSize(size)}rem`,
          lineHeight: `${getEmojiSize(size)}rem`,
          height: size,
          width: size,
        }}
      >
        {stringToEmoji(emoji?.value || "")}
      </span>
    );
  }

  // Icon rendering
  if (in_use === "icon") {
    const color = icon?.color;

    // Lucide icon
    if (type === "lucide") {
      const lucideIcon = LUCIDE_ICONS_LIST.find((item) => item.name === value);
      if (!lucideIcon) return null;

      const LucideIconElement = lucideIcon.element;
      return <LucideIconElement style={{ color, height: size, width: size }} />;
    }

    if (!isMaterialSymbolsFontLoaded) return loadingSkeleton;

    // Material icon
    return (
      <span
        className="material-symbols-rounded"
        style={{
          fontSize: size,
          color,
          scale: "115%",
        }}
      >
        {value}
      </span>
    );
  }

  return null;
}
