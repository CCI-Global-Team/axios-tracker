/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { observer } from "mobx-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useUser, useUserSettings } from "@/hooks/store/user";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

const MIN_HOURS = 0;
const MAX_HOURS = 80;
const NOTE_MAX_LENGTH = 255;

const currentMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const clampHours = (raw: string): number => {
  const parsed = Number(raw);
  if (raw.trim() === "" || Number.isNaN(parsed)) return 0;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(parsed)));
};

type TSavedAvailability = {
  hours: string;
  note: string;
};

type TFocusedField = "hours" | "note" | null;

const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};

export const AvailabilityPreference = observer(function AvailabilityPreference() {
  // hooks
  const { data: currentUser } = useUser();
  const { data: currentUserSettings } = useUserSettings();
  const workspaceSlug =
    currentUserSettings?.workspace?.last_workspace_slug || currentUserSettings?.workspace?.fallback_workspace_slug;

  // state
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  // refs — last-known-good values, in-flight/queued save bookkeeping, and per-field interaction
  // tracking, none of which should trigger re-renders on their own.
  const lastSavedRef = useRef<TSavedAvailability>({ hours: "", note: "" });
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const focusedFieldRef = useRef<TFocusedField>(null);
  const hoursTouchedRef = useRef(false);
  const noteTouchedRef = useRef(false);

  useEffect(() => {
    if (!workspaceSlug) return;
    let isMounted = true;

    const loadAvailability = async () => {
      try {
        // Anchor the prefill fetch to the same client-derived Monday the save uses, so the GET
        // and the POST always agree on "this week" regardless of the server's own timezone.
        const weekStart = currentMonday();
        const rows = await workspaceService.fetchMemberAvailability(workspaceSlug, weekStart);
        if (!isMounted) return;
        const mine = rows.find((row) => row.member_id === currentUser?.id);
        const nextHours = mine ? String(mine.available_hours) : "";
        const nextNote = mine?.note ?? "";
        lastSavedRef.current = { hours: nextHours, note: nextNote };
        // Don't clobber a value the user already started typing before the prefill resolved.
        if (!hoursTouchedRef.current) setHours(nextHours);
        if (!noteTouchedRef.current) setNote(nextNote);
      } catch (_error) {
        // Fetch failed — leave the control empty rather than blocking the rest of the page.
      }
    };

    void loadAvailability();

    return () => {
      isMounted = false;
    };
  }, [workspaceSlug, currentUser?.id]);

  const handleSave = async () => {
    if (!workspaceSlug) return;

    // Serialize saves: if one is already in flight, ask it to re-check when it's done instead of
    // firing a second overlapping request (which could land out of order and produce duplicate
    // toasts, or overwrite a value the user is still editing).
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    // An untouched, never-declared field is "" and must stay a no-op — it must NOT be treated as
    // an explicit declaration of 0 hours. Only an actual typed "0" (which is not empty) proceeds.
    const hoursEmpty = hours.trim() === "";
    const hadNoDeclarationYet = lastSavedRef.current.hours === "";
    if (hoursEmpty && hadNoDeclarationYet && note === lastSavedRef.current.note) return;

    const clampedHours = clampHours(hours);
    const clampedHoursStr = String(clampedHours);
    const noteToSave = note;

    if (clampedHoursStr === lastSavedRef.current.hours && noteToSave === lastSavedRef.current.note) return;

    // Reflect the clamp in the field immediately so what's displayed matches what's sent.
    setHours(clampedHoursStr);

    isSavingRef.current = true;
    try {
      const response = await workspaceService.updateMyAvailability(workspaceSlug, {
        week_start: currentMonday(),
        available_hours: clampedHours,
        note: noteToSave,
      });
      const savedHours = String(response.available_hours);
      const savedNote = response.note ?? "";
      lastSavedRef.current = { hours: savedHours, note: savedNote };
      // Only apply the echo to a field that (a) isn't currently focused and (b) still holds
      // exactly what THIS request sent. Checking focus alone isn't enough: a field can be blurred
      // (no longer focused) with its new value queued for a follow-up save that hasn't gone out
      // yet — in that case this response is stale for that field and must not clobber it.
      setHours((current) =>
        focusedFieldRef.current !== "hours" && current === clampedHoursStr ? savedHours : current
      );
      setNote((current) => (focusedFieldRef.current !== "note" && current === noteToSave ? savedNote : current));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: "Your availability for this week has been updated.",
      });
    } catch (_error) {
      const { hours: lastHours, note: lastNote } = lastSavedRef.current;
      setHours((current) => (focusedFieldRef.current !== "hours" && current === clampedHoursStr ? lastHours : current));
      setNote((current) => (focusedFieldRef.current !== "note" && current === noteToSave ? lastNote : current));
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't save",
        message: "Please try again.",
      });
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void handleSave();
      }
    }
  };

  const handleHoursBlur = () => {
    if (focusedFieldRef.current === "hours") focusedFieldRef.current = null;
    void handleSave();
  };

  const handleNoteBlur = () => {
    if (focusedFieldRef.current === "note") focusedFieldRef.current = null;
    void handleSave();
  };

  if (!workspaceSlug) return null;

  return (
    <SettingsControlItem
      title="Availability this week"
      description="Tell your leads how many hours you can give this week. Update it whenever your week changes."
      control={
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={MIN_HOURS}
            max={MAX_HOURS}
            step={1}
            placeholder="0"
            value={hours}
            aria-label="Hours available this week"
            onChange={(e) => {
              hoursTouchedRef.current = true;
              setHours(e.target.value);
            }}
            onFocus={() => {
              focusedFieldRef.current = "hours";
            }}
            onBlur={handleHoursBlur}
            onKeyDown={handleKeyDown}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-20 rounded-md border border-subtle-1 bg-transparent px-2 py-1.5 text-body-sm-regular text-primary"
          />
          <input
            type="text"
            maxLength={NOTE_MAX_LENGTH}
            placeholder="Optional — e.g. evenings only"
            value={note}
            aria-label="Availability note"
            onChange={(e) => {
              noteTouchedRef.current = true;
              setNote(e.target.value);
            }}
            onFocus={() => {
              focusedFieldRef.current = "note";
            }}
            onBlur={handleNoteBlur}
            onKeyDown={handleKeyDown}
            className="w-56 rounded-md border border-subtle-1 bg-transparent px-2 py-1.5 text-body-sm-regular text-primary"
          />
        </div>
      }
    />
  );
});
