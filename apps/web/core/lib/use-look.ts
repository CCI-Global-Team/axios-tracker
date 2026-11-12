import { useTheme } from "next-themes";
import { useUserProfile } from "@/hooks/store/user";
import { DEFAULT_LOOK, isLook } from "./look";
import type { TLook } from "./look";

export function useLook(): TLook {
  const { data: userProfile } = useUserProfile();
  const saved = userProfile?.theme?.look;
  return isLook(saved) ? saved : DEFAULT_LOOK;
}

// Themes that bring their own palette, where the navy chrome would fight it.
const CHROME_FREE_THEMES = new Set(["custom", "light-contrast", "dark-contrast"]);

/**
 * Attributes for app chrome (top bar, sidebars). Under CCI Navy they scope the dark token set
 * to the element, which looks.css paints navy in both light and dark mode.
 */
export function useChromeAttributes(): Record<string, string> {
  const look = useLook();
  const { theme } = useTheme();
  if (look !== "navy" || CHROME_FREE_THEMES.has(theme ?? "")) return {};
  return { "data-chrome": "", "data-theme": "dark" };
}

export function useChromeCanvasAttributes(): Record<string, string> {
  const chrome = useChromeAttributes();
  return "data-chrome" in chrome ? { "data-chrome-canvas": "" } : {};
}
