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

  // `handleSave` is a plain function recreated every render, and a queued re-invocation (fired
  // from inside a PREVIOUS call's `finally`) runs whichever closure it was created in — not
  // necessarily the latest one. Reading `hours`/`note` state directly there can replay stale
  // values from the render the in-flight save started in. These refs are kept in lockstep with
  // the input values on every keystroke so any invocation of `handleSave`, however old its
  // closure, always reads the CURRENT value.
  const hoursRef = useRef("");
  const noteRef = useRef("");

  // Tracks whether the component is still mounted. `handleSave` can be re-invoked asynchronously
  // from its own `finally` block (the queued-save mechanism below) well after the event that
  // originally triggered it — including after the user has navigated away from this settings page.
  // Checked at the top of `handleSave` so neither a direct call nor a queued one fires a network
  // request or a toast for a component that's no longer on screen.
  //
  // The flag is (re-)set to `true` from INSIDE the effect body, not just via `useRef(true)`'s
  // initial value — React StrictMode (enabled for this app, see entry.client.tsx) double-invokes
  // effects in development: mount → cleanup → mount. That simulated cleanup would otherwise leave
  // this ref stuck at `false` forever after the very first real mount, since `useRef`'s initializer
  // only applies once and is never re-read on the second mount.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
        if (!hoursTouchedRef.current) {
          hoursRef.current = nextHours;
          setHours(nextHours);
        }
        if (!noteTouchedRef.current) {
          noteRef.current = nextNote;
          setNote(nextNote);
        }
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
    if (!isMountedRef.current || !workspaceSlug) return;

    // Serialize saves: if one is already in flight, ask it to re-check when it's done instead of
    // firing a second overlapping request (which could land out of order and produce duplicate
    // toasts, or overwrite a value the user is still editing).
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    // An untouched, never-declared field is "" and must stay a no-op — it must NOT be treated as
    // an explicit declaration of 0 hours. Only an actual typed "0" (which is not empty) proceeds.
    // Read from the refs, not the `hours`/`note` state captured by this closure: a queued
    // re-invocation (see the `finally` block below) reuses whichever closure was created when the
    // FIRST save in a burst started, so the state variables it closed over can be stale by the
    // time it actually runs. The refs are updated synchronously on every keystroke regardless of
    // which render's closure is asking, so they're always current.
    const hoursEmpty = hoursRef.current.trim() === "";
    const hadNoDeclarationYet = lastSavedRef.current.hours === "";
    if (hoursEmpty && hadNoDeclarationYet && noteRef.current === lastSavedRef.current.note) return;

    const clampedHours = clampHours(hoursRef.current);
    const clampedHoursStr = String(clampedHours);
    const noteToSave = noteRef.current;

    if (clampedHoursStr === lastSavedRef.current.hours && noteToSave === lastSavedRef.current.note) return;

    // Reflect the clamp in the field immediately so what's displayed matches what's sent.
    hoursRef.current = clampedHoursStr;
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
      if (focusedFieldRef.current !== "hours" && hoursRef.current === clampedHoursStr) {
        hoursRef.current = savedHours;
        setHours(savedHours);
      }
      if (focusedFieldRef.current !== "note" && noteRef.current === noteToSave) {
        noteRef.current = savedNote;
        setNote(savedNote);
      }
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: "Your availability for this week has been updated.",
      });
    } catch (_error) {
      // If another save is already queued to run immediately after this one, do NOT revert to
      // the last-confirmed values now. Reverting here would force `hoursRef`/`noteRef` back to
      // "" for anyone who has never successfully saved before, and the queued save's own guard
      // would then read that "" as "field is empty" rather than "this attempt failed" — combined
      // with a real edit to the OTHER field, that used to slip past the no-declaration guard and
      // send `available_hours: 0`, an hours value the volunteer never typed. Leaving the refs (and
      // the displayed values) exactly as the user left them lets the queued call re-derive its
      // payload from what's actually on screen, so it retries with the real intended hours AND
      // the new edit together, instead of a corrupted mix of a synthetic revert and a real edit.
      if (!pendingSaveRef.current) {
        const { hours: lastHours, note: lastNote } = lastSavedRef.current;
        if (focusedFieldRef.current !== "hours" && hoursRef.current === clampedHoursStr) {
          hoursRef.current = lastHours;
          setHours(lastHours);
        }
        if (focusedFieldRef.current !== "note" && noteRef.current === noteToSave) {
          noteRef.current = lastNote;
          setNote(lastNote);
        }
      }
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
              hoursRef.current = e.target.value;
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
              noteRef.current = e.target.value;
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
