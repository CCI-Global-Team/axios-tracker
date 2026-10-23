/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { describe, expect, it, vi } from "vitest";
import { buildSupportIntake, checkHookSecret, handleSupportForm, parseUploads } from "@/lib/support-form";
import type { SupportFormConfig } from "@/lib/support-form";

const entry = (extra: Record<string, unknown> = {}) => ({
  id: "95489",
  form_id: "48",
  date_created: "2026-08-02 07:39:28",
  "1.3": "Ada",
  "1.6": "Lovelace",
  "3": "ada@example.com",
  "4": "+44 7700 900123",
  "13": "Bug/feedback",
  "12": "",
  "14": "iPhone",
  "15": "",
  "16": "The app crashes when I open sermons.",
  ...extra,
});

describe("buildSupportIntake", () => {
  it("names the item after the subject and the start of the message", () => {
    const item = buildSupportIntake(entry());
    expect(item.name).toBe("Bug/feedback: The app crashes when I open sermons.");
    expect(item.external_source).toBe("gravity-forms");
    expect(item.external_id).toBe("48-95489");
  });

  it("cuts a long message to one line with an ellipsis", () => {
    const item = buildSupportIntake(entry({ "16": `${"word ".repeat(30)}\nsecond line` }));
    expect(item.name.startsWith("Bug/feedback: word word")).toBe(true);
    expect(item.name.endsWith("…")).toBe(true);
    expect(item.name).not.toContain("\n");
    expect(item.name.length).toBeLessThanOrEqual("Bug/feedback: ".length + 71);
  });

  it("uses the free-text subject when the subject is Others", () => {
    expect(buildSupportIntake(entry({ "13": "Others", "12": "Giving receipts" })).name).toMatch(/^Giving receipts: /);
    expect(buildSupportIntake(entry({ "13": "Others", "12": "" })).name).toMatch(/^Others: /);
    expect(buildSupportIntake(entry({ "13": "Help", "12": "ignored" })).name).toMatch(/^Help: /);
  });

  it("falls back to Support request, and to the subject alone with no message", () => {
    expect(buildSupportIntake(entry({ "13": "", "16": "" })).name).toBe("Support request");
    expect(buildSupportIntake(entry({ "16": "  " })).name).toBe("Bug/feedback");
  });

  it("shows Andriod as Android", () => {
    expect(buildSupportIntake(entry({ "14": "Andriod" })).description_html).toContain(
      "<strong>Device</strong> Android"
    );
    expect(buildSupportIntake(entry()).description_html).toContain("<strong>Device</strong> iPhone");
  });

  it("escapes every value", () => {
    const item = buildSupportIntake(entry({ "13": "Others", "12": "<b>x</b>", "16": "<script>alert(1)</script>" }));
    expect(item.description_html).not.toContain("<script>");
    expect(item.description_html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(item.description_html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("keeps the message's paragraphs and line breaks", () => {
    const html = buildSupportIntake(entry({ "16": "one\ntwo\n\nthree" })).description_html;
    expect(html).toContain("<p>one<br />two</p><p>three</p>");
  });

  it("dates the item from date_created, in UTC", () => {
    const item = buildSupportIntake(entry());
    expect(item.created_at).toBe("2026-08-02T07:39:28Z");
    expect(item.description_html).toContain("<strong>Submitted</strong> 2 Aug 2026, 07:39 UTC");
    expect(buildSupportIntake(entry({ date_created: "yesterday" })).created_at).toBeUndefined();
  });

  it("lists attachments and links to the form entry", () => {
    const html = buildSupportIntake(
      entry({ "15": "https://forms.joincci.org/wp-content/uploads/gravity_forms/48/shot%201.png" })
    ).description_html;
    expect(html).toContain("<strong>Attachments</strong>");
    expect(html).toContain(
      'href="https://forms.joincci.org/wp-content/uploads/gravity_forms/48/shot%201.png">shot 1.png<'
    );
    expect(html).toContain(
      'href="https://forms.joincci.org/wp-admin/admin.php?page=gf_entries&amp;view=entry&amp;id=48&amp;lid=95489"'
    );
    expect(buildSupportIntake(entry(), { wpBase: "https://wp.test/" }).description_html).toContain(
      'href="https://wp.test/wp-admin/admin.php?'
    );
  });

  it("shows who wrote in by name and email, never by phone", () => {
    const item = buildSupportIntake(entry({ "15": "https://a.test/x.png" }));
    expect(item.description_html).toContain(
      '<p><strong>From</strong> Ada Lovelace · <a href="mailto:ada@example.com">ada@example.com</a></p>'
    );
    const out = JSON.stringify(item);
    for (const phone of ["7700", "900123"]) expect(out).not.toContain(phone);
    expect(item.name).not.toContain("Ada");
  });

  it("escapes the reporter and drops an email that is not an address", () => {
    const html = buildSupportIntake(entry({ "1.3": "<b>Bo</b>", "1.6": "", "3": "not-an-email" })).description_html;
    expect(html).toContain("<p><strong>From</strong> &lt;b&gt;Bo&lt;/b&gt;</p>");
    expect(html).not.toContain("mailto:");
  });

  it("leaves the From line out when there is no name or email", () => {
    const html = buildSupportIntake(entry({ "1.3": "", "1.6": "", "3": "" })).description_html;
    expect(html).not.toContain("<strong>From</strong>");
  });
});

describe("parseUploads", () => {
  it("reads a comma list, a JSON array, or nothing, keeping only http(s)", () => {
    expect(parseUploads("https://a.test/1.png, http://a.test/2.png")).toEqual([
      "https://a.test/1.png",
      "http://a.test/2.png",
    ]);
    expect(parseUploads('["https://a.test/1.png","javascript:alert(1)"]')).toEqual(["https://a.test/1.png"]);
    expect(parseUploads("ftp://a.test/x, not a url, data:text/html,hi")).toEqual([]);
    expect(parseUploads("")).toEqual([]);
    expect(parseUploads(undefined)).toEqual([]);
  });
});

describe("checkHookSecret", () => {
  it("accepts only the exact secret", () => {
    expect(checkHookSecret("s3cret", "s3cret")).toBe(true);
    expect(checkHookSecret("s3cret", undefined)).toBe(false);
    expect(checkHookSecret("s3cret", "")).toBe(false);
    expect(checkHookSecret("s3cret", "s3cre")).toBe(false);
    expect(checkHookSecret("s3cret", "s3creT")).toBe(false);
  });
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("handleSupportForm", () => {
  const cfg: SupportFormConfig = {
    secret: "s3cret",
    projectId: "proj-uuid",
    token: "bot-token",
    host: "https://axios.test",
    workspace: "cci",
  };
  const run = (fetchImpl: typeof fetch, overrides: Partial<SupportFormConfig> = {}, header = "s3cret") => {
    const log = vi.fn();
    const sleep = vi.fn(() => Promise.resolve());
    const result = handleSupportForm(
      { secretHeader: header, body: entry() },
      { ...cfg, ...overrides },
      {
        fetch: fetchImpl,
        sleep,
        log,
      }
    );
    return { result, log, sleep };
  };

  it("creates the intake item and answers 201", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json(201, { id: "intake-1" })));
    const { result, log } = run(fetchImpl as unknown as typeof fetch);
    expect(await result).toEqual({ status: 201, body: { status: "created", id: "intake-1" } });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://axios.test/api/v1/workspaces/cci/projects/proj-uuid/intake-issues/");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe("bot-token");
    const sent = JSON.parse(init.body as string) as { issue: Record<string, unknown> };
    expect(sent.issue).toMatchObject({
      priority: "none",
      external_source: "gravity-forms",
      external_id: "48-95489",
      created_at: "2026-08-02T07:39:28Z",
    });
    expect(init.body).toContain("ada@example.com");
    expect(init.body).not.toContain("7700 900123");
    for (const [line] of log.mock.calls) expect(String(line)).not.toMatch(/ada@example\.com|Lovelace/);
    expect(log).toHaveBeenCalledWith("SUPPORT_FORM: entry 95489 -> created intake-1");
  });

  it("treats 409 from Axios as already there", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json(409, { error: "exists", id: "intake-1", issue_id: "i-1" })));
    expect(await run(fetchImpl as unknown as typeof fetch).result).toEqual({
      status: 200,
      body: { status: "exists", id: "intake-1" },
    });
  });

  it("retries 429 using Retry-After", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { "retry-after": "3" }))
      .mockResolvedValueOnce(json(429, {}))
      .mockResolvedValueOnce(json(201, { id: "intake-2" }));
    const { result, sleep } = run(fetchImpl as unknown as typeof fetch);
    expect((await result).status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[3000], [4000]]);
  });

  it("gives up after 5 retries and answers 502", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json(429, {})));
    expect((await run(fetchImpl as unknown as typeof fetch).result).status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("answers 502 when Axios fails or cannot be reached", async () => {
    expect((await run((() => Promise.resolve(json(500, {}))) as unknown as typeof fetch).result).status).toBe(502);
    expect((await run((() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch).result).status).toBe(502);
  });

  it("rejects a wrong or missing secret with 401 and calls nothing", async () => {
    const fetchImpl = vi.fn();
    expect((await run(fetchImpl as unknown as typeof fetch, {}, "nope").result).status).toBe(401);
    expect(
      (await handleSupportForm({ secretHeader: undefined, body: entry() }, cfg, { fetch: fetchImpl })).status
    ).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is dormant (503) without the secret or the project id", async () => {
    const fetchImpl = vi.fn();
    expect((await run(fetchImpl as unknown as typeof fetch, { secret: undefined }).result).status).toBe(503);
    expect((await run(fetchImpl as unknown as typeof fetch, { projectId: undefined }).result).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects other forms and entries without an id with 422", async () => {
    const fetchImpl = vi.fn();
    const call = (body: unknown) => handleSupportForm({ secretHeader: "s3cret", body }, cfg, { fetch: fetchImpl });
    expect((await call(entry({ form_id: "33" }))).status).toBe(422);
    expect((await call(entry({ id: "" }))).status).toBe(422);
    expect((await call([entry()])).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not run the same entry twice at once", async () => {
    let release!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (release = r)));
    const first = run(fetchImpl as unknown as typeof fetch).result;
    const second = await run(fetchImpl as unknown as typeof fetch).result;
    expect(second).toEqual({ status: 409, body: { status: "in_flight" } });
    release(json(201, { id: "intake-3" }));
    expect((await first).status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
