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
