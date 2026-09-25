// Run with: node --test .github/scripts/axios-transition.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { outstandingChangeRequests, reviewTarget, shouldMove } from "./axios-transition.mjs";

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
  assert.deepEqual(outstandingChangeRequests([review("ada", "CHANGES_REQUESTED"), review("ada", "COMMENTED")]), ["ada"]);
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
