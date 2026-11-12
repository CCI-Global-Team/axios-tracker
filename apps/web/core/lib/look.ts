/**
 * CCI looks: a palette and shape family layered on the light/dark theme.
 * The look is set as <html data-look>; tokens live in packages/tailwind-config/looks.css.
 */
export type TLook = "navy" | "ink" | "campus";

export const DEFAULT_LOOK: TLook = "navy";
export const LOOK_STORAGE_KEY = "axios-look";

type TLookOption = {
  value: TLook;
  label: string;
  description: string;
  /** Colours for the picker's miniature: sidebar, work area, primary action. */
  preview: { sidebar: string; surface: string; accent: string };
};

export const LOOKS: TLookOption[] = [
  {
    value: "navy",
    label: "CCI Navy",
    description: "Navy sidebar and top bar, CCI red on the main action",
    preview: { sidebar: "oklch(0.227 0.063 261)", surface: "#ffffff", accent: "#d71920" },
  },
  {
    value: "ink",
    label: "Quiet Ink",
    description: "Near-monochrome, colour only where it means something",
    preview: { sidebar: "oklch(0.955 0.0012 260)", surface: "#ffffff", accent: "oklch(0.21 0.006 260)" },
  },
  {
    value: "campus",
    label: "Campus Board",
    description: "Warm and rounder, with a friendlier typeface",
    preview: { sidebar: "oklch(0.955 0.0072 75)", surface: "#ffffff", accent: "#d71920" },
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
