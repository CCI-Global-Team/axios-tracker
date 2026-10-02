/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// CCI: Releases (GAM-400)
import type { TReleaseCandidate, TReleaseIssue, TReleaseStatus } from "@plane/types";

export const RELEASE_STATUS_LABEL: Record<TReleaseStatus, string> = {
  planning: "Planning",
  frozen: "Frozen",
  released: "Released",
  rolled_back: "Rolled back",
  cancelled: "Cancelled",
};

export const RELEASE_STATUS_CLASSES: Record<TReleaseStatus, string> = {
  planning: "bg-layer-2 text-secondary",
  frozen: "bg-accent-subtle text-accent-primary",
  released: "bg-success-subtle text-success-primary",
  rolled_back: "bg-danger-subtle text-danger-primary",
  cancelled: "bg-layer-1 text-placeholder",
};

/** Work can be added to, removed from and shipped through a release only while it is open. */
export const isReleaseOpen = (status: TReleaseStatus | undefined) => status === "planning" || status === "frozen";

export const releaseIssueKey = (item: Pick<TReleaseIssue | TReleaseCandidate, "project_identifier" | "sequence_id">) =>
  `${item.project_identifier}-${item.sequence_id}`;

export const browseUrl = (workspaceSlug: string, key: string) => `/${workspaceSlug}/browse/${key}/`;

/** "github:CCI-Global-Team/cci-backend@abc1234" → "cci-backend@abc1234"; "manual" → "marked released by hand". */
export const describeShippedVia = (via: string) => {
  if (!via) return "";
  if (via === "manual") return "marked released by hand";
  if (via.startsWith("github:")) {
    const ref = via.slice("github:".length);
    const [repo, sha] = ref.split("@");
    return `${repo.split("/").pop()}${sha ? `@${sha}` : ""}`;
  }
  return via;
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STATE_GROUP_ORDER = ["completed", "started", "unstarted", "backlog", "triage", "cancelled"];

/** Release notes drafted from the items: one heading per state, one bullet per item. */
export const draftReleaseNotes = (releaseName: string, items: TReleaseIssue[]) => {
  const groups = new Map<string, { group: string; items: TReleaseIssue[] }>();
  items.forEach((item) => {
    const name = item.state?.name ?? "No state";
    if (!groups.has(name)) groups.set(name, { group: item.state?.group ?? "", items: [] });
    groups.get(name)?.items.push(item);
  });
  const rank = (group: string) => {
    const index = STATE_GROUP_ORDER.indexOf(group);
    return index === -1 ? STATE_GROUP_ORDER.length : index;
  };
  const sections = [...groups.entries()]
    .toSorted(([, a], [, b]) => rank(a.group) - rank(b.group))
    .map(
      ([stateName, section]) =>
        `<h3>${escapeHtml(stateName)}</h3><ul>${section.items
          .map((item) => `<li><p>${escapeHtml(releaseIssueKey(item))} ${escapeHtml(item.name)}</p></li>`)
          .join("")}</ul>`
    )
    .join("");
  return `<h2>${escapeHtml(releaseName)}</h2>${sections || "<p></p>"}`;
};

/** Pull the offending item ids out of a 409 body, whatever the field is called. */
export const conflictIdsFromError = (error: Record<string, unknown> | undefined): string[] => {
  if (!error) return [];
  const ids = new Set<string>();
  Object.values(error).forEach((value) => {
    if (Array.isArray(value)) value.forEach((id) => typeof id === "string" && ids.add(id));
  });
  return [...ids];
};
