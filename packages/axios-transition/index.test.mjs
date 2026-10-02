// Run with: node --test packages/axios-transition/*.test.mjs  (or pnpm --filter @plane/axios-transition test)
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configure,
  FatalError,
  handleEvent,
  outstandingChangeRequests,
  reviewTarget,
  shouldHandle,
  shouldMove,
} from "./index.mjs";

const review = (login, state) => ({ user: { login }, state });

test("a draft PR holds the ticket In Progress", () => {
  assert.equal(reviewTarget({ draft: true, requested_reviewers: [] }, []), "In Progress");
});

test("a PR out of draft with no verdicts is Ready for Review", () => {
  assert.equal(reviewTarget({ draft: false, requested_reviewers: [] }, []), "Ready for Review");
});

test("changes requested sends it back to In Progress", () => {
  const reviews = [review("ada", "CHANGES_REQUESTED")];
  assert.equal(reviewTarget({ draft: false, requested_reviewers: [] }, reviews), "In Progress");
});

test("re-requesting the reviewer who asked for changes makes it Ready for Review again", () => {
  const reviews = [review("ada", "CHANGES_REQUESTED")];
  const pr = { draft: false, requested_reviewers: [{ login: "ada" }] };
  assert.equal(reviewTarget(pr, reviews), "Ready for Review");
});

test("a comment after changes requested does not clear it; an approval or dismissal does", () => {
  assert.deepEqual(outstandingChangeRequests([review("ada", "CHANGES_REQUESTED"), review("ada", "COMMENTED")]), [
    "ada",
  ]);
  assert.deepEqual(outstandingChangeRequests([review("ada", "CHANGES_REQUESTED"), review("ada", "APPROVED")]), []);
  assert.deepEqual(outstandingChangeRequests([review("ada", "CHANGES_REQUESTED"), review("ada", "DISMISSED")]), []);
});

test("one reviewer's approval does not clear another's changes request", () => {
  const reviews = [review("ada", "CHANGES_REQUESTED"), review("bo", "APPROVED")];
  assert.deepEqual(outstandingChangeRequests(reviews), ["ada"]);
});

test("review states move both ways between In Progress and Ready for Review", () => {
  assert.equal(shouldMove("In Progress", "Ready for Review", { review: true }).move, true);
  assert.equal(shouldMove("Ready for Review", "In Progress", { review: true }).move, true);
  assert.equal(shouldMove("Todo", "Ready for Review", { review: true }).move, true);
});

test("a PR never pulls a ticket back out of Ready for Test or later", () => {
  for (const current of ["Ready for Test", "In Testing", "UAT", "Done"]) {
    assert.equal(shouldMove(current, "In Progress", { review: true }).move, false, current);
    assert.equal(shouldMove(current, "Ready for Review", { review: true }).move, false, current);
  }
});

test("a new branch does not pull Ready for Review back to In Progress", () => {
  assert.equal(shouldMove("Ready for Review", "In Progress").move, false);
});

test("merge advances from any review state, and Cancelled and custom states are left alone", () => {
  assert.equal(shouldMove("In Progress", "Ready for Test").move, true);
  assert.equal(shouldMove("Ready for Review", "Ready for Test").move, true);
  assert.equal(shouldMove("Cancelled", "In Progress", { review: true }).move, false);
  assert.equal(shouldMove("Blocked", "In Progress", { review: true }).move, false);
});

test("no move when already there", () => {
  assert.equal(shouldMove("Ready for Review", "Ready for Review", { review: true }).move, false);
});

// shouldHandle mirrors the callers' `on:` types and the reusable workflow's job-level `if:`.

test("push: only a newly created ref", () => {
  assert.equal(shouldHandle("push", { created: true, ref: "refs/heads/feat/GAM-1" }), true);
  assert.equal(shouldHandle("push", { created: false, ref: "refs/heads/feat/GAM-1" }), false);
  assert.equal(shouldHandle("push", { ref: "refs/heads/feat/GAM-1" }), false);
});

test("pull_request: the subscribed actions pass", () => {
  for (const action of ["opened", "reopened", "closed", "ready_for_review", "converted_to_draft"]) {
    assert.equal(shouldHandle("pull_request", { action, pull_request: { draft: false } }), true, action);
  }
});

test("pull_request: actions the callers do not subscribe to are refused", () => {
  for (const action of ["synchronize", "labeled", "assigned", "review_request_removed"]) {
    assert.equal(shouldHandle("pull_request", { action, pull_request: { draft: false } }), false, action);
  }
});

test("pull_request edited: only when the title changed", () => {
  const pr = { draft: false };
  assert.equal(
    shouldHandle("pull_request", { action: "edited", pull_request: pr, changes: { title: { from: "x" } } }),
    true
  );
  assert.equal(
    shouldHandle("pull_request", { action: "edited", pull_request: pr, changes: { body: { from: "x" } } }),
    false
  );
  assert.equal(shouldHandle("pull_request", { action: "edited", pull_request: pr }), false);
});

test("pull_request review_requested: not on a draft", () => {
  assert.equal(shouldHandle("pull_request", { action: "review_requested", pull_request: { draft: false } }), true);
  assert.equal(shouldHandle("pull_request", { action: "review_requested", pull_request: { draft: true } }), false);
});

const submitted = (state) => ({ action: "submitted", review: { state }, pull_request: { number: 1 } });

test("pull_request_review: only a verdict or a dismissal", () => {
  assert.equal(shouldHandle("pull_request_review", submitted("approved")), true);
  assert.equal(shouldHandle("pull_request_review", submitted("changes_requested")), true);
  assert.equal(shouldHandle("pull_request_review", submitted("commented")), false);
  assert.equal(shouldHandle("pull_request_review", { action: "dismissed", review: { state: "dismissed" } }), true);
  assert.equal(shouldHandle("pull_request_review", { action: "edited", review: { state: "approved" } }), false);
});

test("string comparisons are case-insensitive, as in GitHub expressions", () => {
  assert.equal(shouldHandle("pull_request_review", { action: "submitted", review: { state: "APPROVED" } }), true);
});

test("any other event is refused", () => {
  for (const name of ["ping", "issues", "create", "delete", "check_run"]) {
    assert.equal(shouldHandle(name, { action: "opened", created: true }), false, name);
  }
});

// Config: per call, over configure(), over the environment.

test("an explicitly undefined token is not replaced by the environment's", async () => {
  process.env.AXIOS_BOT_TOKEN = "from-env";
  try {
    await assert.rejects(handleEvent("push", { created: true }, "o/r", { token: undefined }), FatalError);
  } finally {
    delete process.env.AXIOS_BOT_TOKEN;
  }
});

test("per-call host, workspace, token and log are used", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, key: init.headers["X-Api-Key"] });
    return new Response(JSON.stringify({ results: [{ identifier: "GAM" }] }), { status: 200 });
  });
  configure({ host: "https://configured.example", token: "configured" });
  const lines = [];
  try {
    await handleEvent(
      "push",
      { created: true, ref: "refs/heads/chore/no-key", repository: { default_branch: "main" } },
      "o/r",
      { host: "https://axios.test", workspace: "ws", token: "per-call", log: (...a) => lines.push(a.join(" ")) }
    );
  } finally {
    configure({});
  }
  assert.deepEqual(calls, [{ url: "https://axios.test/api/v1/workspaces/ws/projects/", key: "per-call" }]);
  assert.deepEqual(lines, ["known projects: GAM", "no work item key found — nothing to do"]);
});

// GAM-400: pushes to a release branch ship work items through POST /releases/ship/.

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** Stub fetch by URL. `routes` maps a substring of the URL to a body or a function returning a
 *  Response; every call is recorded. An unrouted request is a test failure. */
function stubFetch(t, routes) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : undefined });
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    const route = routes[hit];
    return typeof route === "function" ? route(url, init) : json(route);
  });
  return calls;
}

const PROJECTS = { results: [{ identifier: "GAM" }, { identifier: "T30" }] };
const shipped = (keys) => ({
  results: keys.map((key) => ({ key, release_id: "r1", moved: true, unplanned: false, already: false })),
  unknown: [],
});
const opts = (lines) => ({
  host: "https://axios.test",
  workspace: "ws",
  token: "bot",
  githubToken: "gh",
  log: (...a) => lines.push(a.join(" ")),
});
const releasePush = (commits, extra = {}) => ({
  ref: "refs/heads/production",
  before: "1111111111111111111111111111111111111111",
  after: "abc1234def5678abc1234def5678abc1234def56",
  commits: commits.map((message) => ({ message })),
  repository: { default_branch: "main" },
  ...extra,
});
const shipCalls = (calls) => calls.filter((c) => c.url.endsWith("/releases/ship/"));

test("push: a release branch counts even when the branch already exists; deleting it does not", () => {
  assert.equal(shouldHandle("push", { ref: "refs/heads/production", created: false }), true);
  assert.equal(shouldHandle("push", { ref: "refs/heads/production", deleted: true }), false);
  assert.equal(shouldHandle("push", { ref: "refs/heads/main", created: false }), false);
  assert.equal(shouldHandle("push", { ref: "refs/tags/production" }), false);
});

test("push: release branches come from config, then AXIOS_RELEASE_BRANCHES", () => {
  const push = { ref: "refs/heads/release" };
  assert.equal(shouldHandle("push", push, { releaseBranches: "staging, release" }), true);
  assert.equal(shouldHandle("push", push, { releaseBranches: ["release"] }), true);
  assert.equal(shouldHandle("push", { ref: "refs/heads/production" }, { releaseBranches: "release" }), false);
  process.env.AXIOS_RELEASE_BRANCHES = "release";
  try {
    assert.equal(shouldHandle("push", push), true);
    assert.equal(shouldHandle("push", { ref: "refs/heads/production" }), false);
  } finally {
    delete process.env.AXIOS_RELEASE_BRANCHES;
  }
});

test("a push to production ships the keys in its commit messages, once", async (t) => {
  const calls = stubFetch(t, { "/projects/": PROJECTS, "/releases/ship/": shipped(["GAM-12", "T30-3"]) });
  const lines = [];
  await handleEvent(
    "push",
    releasePush(["fix: thing GAM-12", "feat: other (T30-3) and gam-12 again", "chore: RFC-2 no project"]),
    "CCI-Global-Team/cci-backend",
    opts(lines)
  );
  const ships = shipCalls(calls);
  assert.equal(ships.length, 1);
  assert.equal(ships[0].method, "POST");
  assert.deepEqual(ships[0].body, { keys: ["GAM-12", "T30-3"], via: "github:CCI-Global-Team/cci-backend@abc1234" });
  assert.equal(ships[0].url, "https://axios.test/api/v1/workspaces/ws/releases/ship/");
  assert.ok(!calls.some((c) => c.url.startsWith("https://api.github.com")), "no PR lookups without PR refs");
  assert.ok(lines.includes("  GAM-12: -> Released"));
  assert.ok(lines.includes("shipped 2, moved 2, unplanned 0, already 0, unknown 0"));
});

test("merge and squash commits are resolved through the PRs they name", async (t) => {
  const calls = stubFetch(t, {
    "/projects/": PROJECTS,
    "/pulls/459": { title: "Hotfix redis pool", head: { ref: "hotfix/GAM-326-redis" } },
    "/pulls/27": { title: "Add verse of the day T30-9", head: { ref: "feat/verse" } },
    "/releases/ship/": shipped(["GAM-326", "T30-9", "GAM-1"]),
  });
  await handleEvent(
    "push",
    releasePush([
      "Merge pull request #459 from CCI-Global-Team/hotfix/redis\n\nHotfix",
      "feat: verse of the day (#27)",
      "fix: GAM-1 (see #3 in the notes)",
    ]),
    "CCI-Global-Team/cci-backend",
    opts([])
  );
  const prLookups = calls.filter((c) => c.url.startsWith("https://api.github.com")).map((c) => c.url);
  assert.deepEqual(prLookups, [
    "https://api.github.com/repos/CCI-Global-Team/cci-backend/pulls/459",
    "https://api.github.com/repos/CCI-Global-Team/cci-backend/pulls/27",
  ]);
  assert.deepEqual(shipCalls(calls)[0].body.keys.toSorted(), ["GAM-1", "GAM-326", "T30-9"]);
});

test("PR lookups stop at 50", async (t) => {
  const calls = stubFetch(t, {
    "/projects/": PROJECTS,
    "/pulls/": { title: "no key", head: { ref: "x" } },
    "/compare/": { commits: [] },
  });
  const lines = [];
  const messages = Array.from({ length: 60 }, (_, i) => `Merge pull request #${i + 1} from o/b`);
  await handleEvent("push", releasePush(messages), "o/r", opts(lines));
  assert.equal(calls.filter((c) => c.url.includes("/pulls/")).length, 50);
  assert.equal(shipCalls(calls).length, 0);
  assert.ok(lines.includes("push to production: no work item key found — nothing to ship"));
});

test("a push of 20 or more commits reads the full list from the compare API", async (t) => {
  const page1 = Array.from({ length: 100 }, (_, i) => ({ commit: { message: `chore ${i}` } }));
  const calls = stubFetch(t, {
    "/projects/": PROJECTS,
    "/compare/": (url) =>
      json({ commits: url.endsWith("page=1") ? page1 : [{ commit: { message: "feat: early work GAM-77" } }] }),
    "/releases/ship/": shipped(["GAM-5", "GAM-77"]),
  });
  const messages = Array.from({ length: 20 }, (_, i) => (i === 0 ? "fix GAM-5" : `chore ${i}`));
  await handleEvent("push", releasePush(messages), "o/r", opts([]));
  const compares = calls.filter((c) => c.url.includes("/compare/")).map((c) => c.url);
  assert.deepEqual(compares, [
    "https://api.github.com/repos/o/r/compare/1111111111111111111111111111111111111111...abc1234def5678abc1234def5678abc1234def56?per_page=100&page=1",
    "https://api.github.com/repos/o/r/compare/1111111111111111111111111111111111111111...abc1234def5678abc1234def5678abc1234def56?per_page=100&page=2",
  ]);
  assert.deepEqual(shipCalls(calls)[0].body.keys, ["GAM-5", "GAM-77"]);
});

test("fewer than 20 commits: the payload is complete, no compare call", async (t) => {
  const calls = stubFetch(t, { "/projects/": PROJECTS, "/releases/ship/": shipped(["GAM-5"]) });
  await handleEvent("push", releasePush(["fix GAM-5"]), "o/r", opts([]));
  assert.ok(!calls.some((c) => c.url.includes("/compare/")));
});

test("the ship summary reports already-shipped, unplanned and unknown keys, and a failure is logged", async (t) => {
  let fail = false;
  stubFetch(t, {
    "/projects/": PROJECTS,
    "/releases/ship/": () =>
      fail
        ? new Response("nope", { status: 404 })
        : json({
            results: [
              { key: "GAM-1", release_id: "r", moved: false, unplanned: false, already: true },
              { key: "GAM-2", release_id: "r", moved: true, unplanned: true, already: false },
            ],
            unknown: ["GAM-999"],
          }),
  });
  const lines = [];
  await handleEvent("push", releasePush(["GAM-1 GAM-2 GAM-999"]), "o/r", opts(lines));
  assert.ok(lines.includes("  GAM-1: already shipped"));
  assert.ok(lines.includes("  GAM-2: -> Released (unplanned)"));
  assert.ok(lines.includes("  no such work item: GAM-999"));
  assert.ok(lines.includes("shipped 1, moved 1, unplanned 1, already 1, unknown 1"));
  fail = true;
  const failed = [];
  await handleEvent("push", releasePush(["GAM-1"]), "o/r", opts(failed));
  assert.ok(failed.includes("  ship failed (HTTP 404) nope"));
});

test("a push to a non-release branch that already exists ships nothing", async (t) => {
  const calls = stubFetch(t, { "/projects/": PROJECTS });
  const lines = [];
  await handleEvent("push", releasePush(["fix GAM-5"], { ref: "refs/heads/main" }), "o/r", opts(lines));
  assert.equal(calls.length, 1);
  assert.ok(lines.includes("not a new branch — nothing to do"));
});

test("deleting the release branch ships nothing", async (t) => {
  const calls = stubFetch(t, { "/projects/": PROJECTS });
  await handleEvent("push", releasePush([], { deleted: true, after: "0".repeat(40) }), "o/r", opts([]));
  assert.equal(shipCalls(calls).length, 0);
});

test("Released ranks between UAT and Done, and nothing pulls it back", () => {
  assert.equal(shouldMove("UAT", "Released").move, true);
  assert.equal(shouldMove("Released", "Done").move, true);
  for (const current of ["Released", "Done"]) {
    assert.equal(shouldMove(current, "Ready for Test").move, false, current);
    assert.equal(shouldMove(current, "In Progress", { review: true }).move, false, current);
  }
});

test("a merge to main leaves a Released ticket where it is", async (t) => {
  const pr = {
    number: 9,
    state: "closed",
    merged: true,
    title: "fix GAM-12",
    head: { ref: "fix/GAM-12" },
    base: { ref: "main" },
    html_url: "https://github.com/o/r/pull/9",
  };
  const calls = stubFetch(t, {
    "/projects/p1/states/": {
      results: [
        { id: "s-rft", name: "Ready for Test" },
        { id: "s-rel", name: "Released" },
      ],
    },
    "/projects/p1/issues/i1/links/": { results: [{ url: pr.html_url, title: pr.title }] },
    "/projects/": PROJECTS,
    "/issues/GAM-12/": { id: "i1", project: "p1", state: "s-rel" },
    "/pulls/9": pr,
    "/issues/9/comments": [],
  });
  const lines = [];
  await handleEvent(
    "pull_request",
    { action: "closed", pull_request: pr, repository: { default_branch: "main" } },
    "o/r",
    opts(lines)
  );
  assert.ok(!calls.some((c) => c.method === "PATCH"), "no state PATCH");
  assert.ok(lines.includes("  GAM-12: already Released — not moving back to Ready for Test"));
});
