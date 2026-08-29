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
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, parsed));
};

type TSavedAvailability = {
  hours: string;
  note: string;
};

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
  const lastSavedRef = useRef<TSavedAvailability>({ hours: "", note: "" });

  useEffect(() => {
    if (!workspaceSlug) return;
    let isMounted = true;

    const loadAvailability = async () => {
      try {
        const rows = await workspaceService.fetchMemberAvailability(workspaceSlug);
        if (!isMounted) return;
        const mine = rows.find((row) => row.member_id === currentUser?.id);
        const nextHours = mine ? String(mine.available_hours) : "";
        const nextNote = mine?.note ?? "";
        setHours(nextHours);
        setNote(nextNote);
        lastSavedRef.current = { hours: nextHours, note: nextNote };
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

    const clampedHours = clampHours(hours);
    const clampedHoursStr = String(clampedHours);

    if (clampedHoursStr === lastSavedRef.current.hours && note === lastSavedRef.current.note) return;

    // Reflect the clamp in the field immediately so what's displayed matches what's sent.
    setHours(clampedHoursStr);

    try {
      const response = await workspaceService.updateMyAvailability(workspaceSlug, {
        week_start: currentMonday(),
        available_hours: clampedHours,
        note,
      });
      const savedHours = String(response.available_hours);
      const savedNote = response.note ?? "";
      setHours(savedHours);
      setNote(savedNote);
      lastSavedRef.current = { hours: savedHours, note: savedNote };
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: "Your availability for this week has been updated.",
      });
    } catch (_error) {
      setHours(lastSavedRef.current.hours);
      setNote(lastSavedRef.current.note);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Couldn't save",
        message: "Please try again.",
      });
    }
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
            onChange={(e) => setHours(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-20 rounded-md border border-subtle-1 bg-transparent px-2 py-1.5 text-body-sm-regular text-primary"
          />
          <input
            type="text"
            maxLength={NOTE_MAX_LENGTH}
            placeholder="Optional — e.g. evenings only"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-56 rounded-md border border-subtle-1 bg-transparent px-2 py-1.5 text-body-sm-regular text-primary"
          />
        </div>
      }
    />
  );
});
