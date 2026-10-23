/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * CCI: GAM-572. Mobile-app support form (Gravity Forms form 48 on forms.joincci.org) -> a Pending
 * item in the MOB project's Intake.
 *
 * The item shows who wrote in, by name (1.3/1.6) and email (3), so whoever triages can reply. The
 * phone number (4) is never read; it stays in WordPress, behind the form entry link.
 */

import { timingSafeEqual } from "node:crypto";

export const SUPPORT_FORM_ID = "48";
export const EXTERNAL_SOURCE = "gravity-forms";
export const DEFAULT_WP_BASE = "https://forms.joincci.org";

const FIELD = {
  subject: "13",
  otherSubject: "12",
  device: "14",
  uploads: "15",
  message: "16",
  firstName: "1.3",
  lastName: "1.6",
  email: "3",
  campus: "17",
} as const;
const NAME_MESSAGE_CHARS = 70;
const RATE_LIMIT_RETRIES = 5;
const RATE_LIMIT_MAX_WAIT_MS = 60_000;

export type SupportFormEntry = Record<string, unknown>;

export interface SupportIntake {
  name: string;
  description_html: string;
  created_at?: string;
  external_source: string;
  external_id: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const field = (entry: SupportFormEntry, id: string): string => {
  const value = entry[id];
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
};

export function subjectOf(entry: SupportFormEntry): string {
  const subject = field(entry, FIELD.subject);
  const other = field(entry, FIELD.otherSubject);
  if (subject.toLowerCase() === "others" && other) return other;
  return subject || "Support request";
}

/** Who wrote in: name and email only. The phone number is deliberately not read. */
export function reporterOf(entry: SupportFormEntry): { name: string; email: string } {
  const name = [field(entry, FIELD.firstName), field(entry, FIELD.lastName)].filter(Boolean).join(" ");
  const email = field(entry, FIELD.email);
  return { name, email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? email : "" };
}

function reporterHtml(entry: SupportFormEntry): string {
  const { name, email } = reporterOf(entry);
  if (!name && !email) return "";
  const parts = [name && escapeHtml(name), email && `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`];
  return `<p><strong>From</strong> ${parts.filter(Boolean).join(" · ")}</p>`;
}

/** The form's own spelling is "Andriod"; the value is kept as sent and only displayed correctly. */
export function deviceLabel(device: string): string {
  return device === "Andriod" ? "Android" : device;
}

/** Field 15 arrives as a comma list, a JSON array string, or nothing. Only http(s) URLs survive. */
export function parseUploads(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let items: unknown[] = raw.split(",");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      // Not JSON after all; fall back to the comma list.
    }
  }
  return items
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => {
      try {
        const { protocol } = new URL(item);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    });
}

/** "2026-08-02 07:39:28" (Gravity Forms stores UTC) -> a Date, or undefined. */
export function parseEntryDate(raw: unknown): Date | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "2 Aug 2026, 07:39 UTC" */
export function formatSubmitted(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function itemName(subject: string, message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  if (!line) return subject;
  const cut = line.length > NAME_MESSAGE_CHARS ? `${line.slice(0, NAME_MESSAGE_CHARS).trimEnd()}…` : line;
  return `${subject}: ${cut}`;
}

function messageHtml(message: string): string {
  return message
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${para.split("\n").map(escapeHtml).join("<br />")}</p>`)
    .join("");
}

function fileLabel(url: string): string {
  try {
    const last = new URL(url).pathname.replace(/\/+$/, "").split("/").pop();
    return last ? decodeURIComponent(last) : url;
  } catch {
    return url;
  }
}

export function entryUrl(wpBase: string, entryId: string): string {
  return `${wpBase.replace(/\/$/, "")}/wp-admin/admin.php?page=gf_entries&view=entry&id=${SUPPORT_FORM_ID}&lid=${encodeURIComponent(entryId)}`;
}

/** The Intake item for one entry. Pure: reads the reporter's name and email, the subject, device,
 *  uploads, message and date. Never the phone number. */
export function buildSupportIntake(entry: SupportFormEntry, { wpBase = DEFAULT_WP_BASE } = {}): SupportIntake {
  const entryId = field(entry, "id");
  const subject = subjectOf(entry);
  const device = field(entry, FIELD.device);
  const campus = field(entry, FIELD.campus);
  const message = typeof entry[FIELD.message] === "string" ? (entry[FIELD.message] as string) : "";
  const uploads = parseUploads(entry[FIELD.uploads]);
  const submitted = parseEntryDate(entry.date_created);

  const html: string[] = [];
  if (submitted) html.push(`<p><strong>Submitted</strong> ${escapeHtml(formatSubmitted(submitted))}</p>`);
  const from = reporterHtml(entry);
  if (from) html.push(from);
  if (campus) html.push(`<p><strong>Campus</strong> ${escapeHtml(campus)}</p>`);
  html.push(`<p><strong>Subject</strong> ${escapeHtml(subject)}</p>`);
  if (device) html.push(`<p><strong>Device</strong> ${escapeHtml(deviceLabel(device))}</p>`);
  html.push(messageHtml(message) || "<p><em>No message.</em></p>");
  if (uploads.length) {
    html.push("<p><strong>Attachments</strong></p>");
    html.push(
      `<ul>${uploads
        .map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(fileLabel(url))}</a></li>`)
        .join("")}</ul>`
    );
  }
  html.push(`<p><a href="${escapeHtml(entryUrl(wpBase, entryId))}">Open the form entry</a></p>`);

  return {
    name: itemName(subject, message),
    description_html: html.join(""),
    ...(submitted ? { created_at: submitted.toISOString().replace(/\.000Z$/, "Z") } : {}),
    external_source: EXTERNAL_SOURCE,
    external_id: `${SUPPORT_FORM_ID}-${entryId}`,
  };
}

/** Whether the X-Axios-Hook-Secret header matches. Gravity Forms cannot sign bodies, so a shared
 *  secret header is the auth. Timing-safe; the length check first because timingSafeEqual throws. */
export function checkHookSecret(secret: string, header: string | undefined): boolean {
  if (!header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export interface SupportFormConfig {
  secret?: string;
  projectId?: string;
  token?: string;
  host: string;
  workspace: string;
  wpBase?: string;
}

export interface SupportFormDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface SupportFormResult {
  status: number;
  body: Record<string, unknown>;
}

/** Seconds from Retry-After, else exponential backoff from 2s; same as @plane/axios-transition. */
function retryDelayMs(res: Response, attempt: number): number {
  const header = Number(res.headers.get("retry-after"));
  const ms = Number.isFinite(header) && header > 0 ? header * 1000 : 2000 * 2 ** attempt;
  return Math.min(ms, RATE_LIMIT_MAX_WAIT_MS);
}

async function postWithRetry(
  url: string,
  init: RequestInit,
  deps: Required<SupportFormDeps>,
  attempt = 0
): Promise<Response> {
  const res = await deps.fetch(url, init);
  if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return res;
  await deps.sleep(retryDelayMs(res, attempt));
  return postWithRetry(url, init, deps, attempt + 1);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const inFlight = new Set<string>();

/**
 * One webhook request, start to finish. Answers synchronously - the form is low volume and a
 * non-2xx lets Gravity Forms show the failure on the entry - so the outcome is the HTTP response.
 */
export async function handleSupportForm(
  input: { secretHeader: string | undefined; body: unknown },
  cfg: SupportFormConfig,
  deps: SupportFormDeps = {}
): Promise<SupportFormResult> {
  const d: Required<SupportFormDeps> = {
    fetch: deps.fetch ?? fetch,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    log: deps.log ?? (() => {}),
  };

  if (!cfg.secret) return { status: 503, body: { error: "support form hook not configured" } };
  if (!checkHookSecret(cfg.secret, input.secretHeader)) return { status: 401, body: { error: "invalid secret" } };
  if (!cfg.projectId || !cfg.token) return { status: 503, body: { error: "support form hook not configured" } };

  const entry = input.body;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { status: 400, body: { error: "body must be a JSON object (one Gravity Forms entry)" } };
  }
  const fields = entry as SupportFormEntry;
  if (field(fields, "form_id") !== SUPPORT_FORM_ID) {
    return { status: 422, body: { error: `form_id must be ${SUPPORT_FORM_ID}` } };
  }
  const entryId = field(fields, "id");
  if (!entryId) return { status: 422, body: { error: "entry id is missing" } };

  if (inFlight.has(entryId)) {
    d.log(`SUPPORT_FORM: entry ${entryId} -> already in flight`);
    return { status: 409, body: { status: "in_flight" } };
  }
  inFlight.add(entryId);
  try {
    const item = buildSupportIntake(fields, { wpBase: cfg.wpBase });
    const url = `${cfg.host.replace(/\/$/, "")}/api/v1/workspaces/${cfg.workspace}/projects/${cfg.projectId}/intake-issues/`;
    const res = await postWithRetry(
      url,
      {
        method: "POST",
        headers: { "X-Api-Key": cfg.token, "Content-Type": "application/json" },
        body: JSON.stringify({ issue: { ...item, priority: "none" } }),
      },
      d
    );
    const body = await readJson(res);
    if (res.status === 201) {
      d.log(`SUPPORT_FORM: entry ${entryId} -> created ${String(body.id)}`);
      return { status: 201, body: { status: "created", id: body.id } };
    }
    if (res.status === 409) {
      d.log(`SUPPORT_FORM: entry ${entryId} -> exists ${String(body.id)}`);
      return { status: 200, body: { status: "exists", id: body.id } };
    }
    d.log(`SUPPORT_FORM: entry ${entryId} -> Axios answered HTTP ${res.status}`);
    return { status: 502, body: { error: `Axios answered HTTP ${res.status}` } };
  } catch (error) {
    d.log(`SUPPORT_FORM: entry ${entryId} -> failed: ${error instanceof Error ? error.message : String(error)}`);
    return { status: 502, body: { error: "could not reach Axios" } };
  } finally {
    inFlight.delete(entryId);
  }
}
