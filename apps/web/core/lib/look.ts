/**
 * CCI looks: a palette and shape family layered on the light/dark theme.
 * The look is set as <html data-look>; tokens live in packages/tailwind-config/looks.css.
 */
export type TLook = "navy" | "ink" | "campus";

export const DEFAULT_LOOK: TLook = "navy";
export const LOOK_STORAGE_KEY = "axios-look";

export const LOOKS: { value: TLook; label: string; description: string; swatch: [string, string, string] }[] = [
  {
    value: "navy",
    label: "CCI Navy",
    description: "Navy sidebar and top bar, CCI red on the main action",
    swatch: ["oklch(0.227 0.063 261)", "#d71920", "#ffffff"],
  },
  {
    value: "ink",
    label: "Quiet Ink",
    description: "Near-monochrome, colour only where it means something",
    swatch: ["oklch(0.21 0.006 260)", "oklch(0.97 0.001 260)", "#ffffff"],
  },
  {
    value: "campus",
    label: "Campus Board",
    description: "Warm and rounder, with a friendlier typeface",
    swatch: ["#d71920", "oklch(0.97 0.0055 75)", "#ffffff"],
  },
];

export const isLook = (value: unknown): value is TLook => LOOKS.some((look) => look.value === value);

export function readStoredLook(): TLook | undefined {
  try {
    const stored = window.localStorage.getItem(LOOK_STORAGE_KEY);
    return isLook(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

export function applyLook(look: TLook) {
  document.documentElement.dataset.look = look;
  try {
    window.localStorage.setItem(LOOK_STORAGE_KEY, look);
  } catch {
    // storage blocked: the profile still carries the look
  }
}

/** Runs before first paint so a saved look does not flash the default. */
export const LOOK_BOOT_SCRIPT = `try{var l=localStorage.getItem("${LOOK_STORAGE_KEY}");if(l==="navy"||l==="ink"||l==="campus")document.documentElement.dataset.look=l}catch(e){}`;
