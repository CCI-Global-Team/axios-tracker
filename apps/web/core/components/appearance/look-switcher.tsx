/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Check } from "lucide-react";
import { setPromiseToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// hooks
import { useUserProfile } from "@/hooks/store/user";
// lib
import { applyLook, LOOKS } from "@/lib/look";
import type { TLook } from "@/lib/look";
import { useLook } from "@/lib/use-look";

export const LookSwitcher = observer(function LookSwitcher() {
  const { updateUserTheme } = useUserProfile();
  const current = useLook();

  const handleChange = (look: TLook) => {
    if (look === current) return;
    applyLook(look);
    const label = LOOKS.find((option) => option.value === look)?.label ?? look;
    setPromiseToast(updateUserTheme({ look }), {
      loading: "Saving look...",
      success: { title: `${label} applied`, message: () => "Your look follows you to every device." },
      error: { title: "Error!", message: () => "Couldn't save the look. Please try again." },
    });
  };

  return (
    <div className="flex w-full flex-col gap-3 py-3">
      <div className="flex flex-col gap-1">
        <h4 className="text-body-sm-medium text-primary">Look</h4>
        <p className="text-caption-md-regular text-secondary">Colours and shapes for light and dark mode.</p>
      </div>
      <div role="radiogroup" aria-label="Look" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {LOOKS.map((look) => {
          const selected = look.value === current;
          return (
            <button
              key={look.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleChange(look.value)}
              className={cn(
                "group flex items-center gap-3 rounded-lg border bg-surface-1 p-2 text-left transition-colors duration-150 lg:flex-col lg:items-stretch",
                selected
                  ? "border-accent-strong shadow-[0_0_0_1px_var(--border-color-accent-strong)]"
                  : "border-subtle-1 hover:border-strong"
              )}
            >
              <LookPreview
                preview={look.preview}
                rounded={look.value === "campus"}
                darkSidebar={look.value === "navy"}
              />
              <div className="flex min-w-0 flex-1 items-start gap-2 lg:px-1 lg:pb-1">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body-sm-medium text-primary">{look.label}</span>
                  <span className="text-caption-md-regular text-tertiary">{look.description}</span>
                </div>
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full transition-opacity duration-150",
                    selected ? "bg-accent-primary text-on-color opacity-100" : "opacity-0"
                  )}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

function LookPreview(props: { preview: (typeof LOOKS)[number]["preview"]; rounded: boolean; darkSidebar: boolean }) {
  const { preview, rounded, darkSidebar } = props;
  const line = darkSidebar ? "bg-white/30" : "bg-black/15";
  const radius = rounded ? "rounded-md" : "rounded-sm";
  return (
    <div
      aria-hidden
      className={cn("flex h-14 w-24 shrink-0 overflow-hidden border border-subtle lg:h-20 lg:w-full", radius)}
      style={{ background: preview.surface }}
    >
      <div className="flex w-1/4 flex-col gap-1 p-1.5" style={{ background: preview.sidebar }}>
        <span className={cn("h-1 w-full rounded-full", line)} />
        <span className={cn("h-1 w-3/4 rounded-full", line)} />
        <span className={cn("h-1 w-3/4 rounded-full", line)} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="flex items-center justify-between">
          <span className="h-1.5 w-1/3 rounded-full bg-black/20" />
          <span
            className={cn("h-2.5 w-6", rounded ? "rounded-full" : "rounded-[2px]")}
            style={{ background: preview.accent }}
          />
        </div>
        <span className="h-1 w-full rounded-full bg-black/10" />
        <span className="h-1 w-5/6 rounded-full bg-black/10" />
        <span className="h-1 w-2/3 rounded-full bg-black/10" />
      </div>
    </div>
  );
}
