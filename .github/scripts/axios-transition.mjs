/**
 * Move an Axios work item in response to a GitHub event.
 *
 *   branch created with a ticket key in the name               ->  In Progress
 *   PR open as a draft                                         ->  In Progress
 *   PR open and out of draft                                   ->  Ready for Review
 *   a reviewer requested changes, and has not been re-asked    ->  In Progress
 *   PR merged into the default branch                          ->  Ready for Test
 *
 * The PR rows are derived from the pull request as it stands when the job runs, not from the event
 * that fired it. Runs for one PR share a concurrency group, so a burst of events (open + three
 * review requests) collapses into one or two runs; the survivor has to be right about everything
 * that happened in between, and only the PR's current state can be.
 *
 * It also comments the pull request onto the work item, whether or not the state moves - see
 * linkPullRequest for why that separation matters - and comments the work item back onto the PR,
 * so the link goes both ways. See linkTicketsOnPullRequest for how that comment stays single.
 *
 * Run from .github/workflows/axios-transition.yml. Reads the GitHub event payload; talks to
 * Axios with the bot's API token.
 *
 * DESIGN NOTES, because each of these is a decision someone will want to revisit:
 *
 * ADVANCE ONLY, EXCEPT DURING REVIEW. Every state has a rank, and a transition applies only if it
 * moves the ticket forward. Without that, pushing a fix branch for a ticket already in Ready for
 * Test would drag it back to In Progress, and a merge would pull a Done ticket backwards. The one
 * exception is review: a PR going back to draft or getting changes requested moves the ticket from
 * Ready for Review back to In Progress, and a re-request moves it forward again. That back-and-forth
 * never reaches past Ready for Review — a QA bounce does NOT return a ticket in Ready for Test or
 * later to In Progress. QA owns those states and moves them by hand (ruling of 2026-09-25).
 *
 * STATES OUTSIDE THE RANK ARE LEFT ALONE. A project can add its own states (Gamma has UAT). An
 * unranked state used to count as rank 0, so any new PR would drag a UAT ticket back to In
 * Progress. Now an unranked current state means "not ours to move".
 *
 * NOT EVERY PROJECT HAS READY FOR REVIEW. Where it is missing the ticket goes to In Progress
 * instead, which is what the board meant before the state existed.
 *
 * CANCELLED IS TERMINAL. It sits outside the rank order entirely: nothing moves a cancelled
 * ticket, because reviving one should be a human decision.
 *
 * A MISSING TOKEN LOOKS LIKE A CLOUDFLARE PROBLEM. The WAF in front of Axios keys on the
 * presence of the X-Api-Key header: requests carrying it pass, requests without it get a 403
 * challenge page. So an absent or misspelled secret surfaces as Cloudflare HTML, not as Axios
 * saying 401 — which sends you debugging the edge instead of the secret. Hence the explicit
 * check for the token before any request is made.
 *
 * KEYS ARE AXIOS KEYS. GAM-142 means Axios work item 142 — the number the UI shows and the one
 * anyone copying a key out of Axios will have. The Jira key preserved in external_id on imported
 * items is archive metadata and is deliberately NOT consulted: this system tracks Axios, and a
 * lookup that sometimes meant one and sometimes the other would be worse than either.
 *
 * The two numberings have largely diverged (Axios sequence 187 is the item imported from Jira
 * GAM-248), so a branch still carrying an old Jira key will resolve to the wrong item or to
 * none. Open PRs written before the cutover need their keys rewritten to Axios numbers.
 *
 * NEVER FAILS THE BUILD. A PR with no ticket key is normal, not an error. Anything short of a
 * broken token logs what it decided and exits 0 — a red X on every keyless PR would train people
 * to ignore the check, and then it is worth nothing when it matters.
 */

import { pathToFileURL } from "node:url";

const AXIOS_HOST = process.env.AXIOS_HOST || "https://axios.joincci.org";
const WORKSPACE = process.env.AXIOS_WORKSPACE || "cci";
const TOKEN = process.env.AXIOS_BOT_TOKEN;
const GH_TOKEN = process.env.GITHUB_TOKEN;

// Rank, not a list: the comparison is what enforces advance-only. Cancelled is deliberately
// absent — see above.
const RANK = {
  Backlog: 1,
  Todo: 2,
  "In Progress": 3,
  "Ready for Review": 4,
  "Ready for Test": 5,
  "In Testing": 6,
  UAT: 7,
  Done: 8,
};
const TERMINAL = new Set(["Cancelled"]);
// The states a PR's review can move a ticket between, in either direction.
const REVIEW_STATES = new Set(["In Progress", "Ready for Review"]);

const log = (...a) => console.log(...a);

/** Whether a ticket in `current` should move to `target`. `review` marks a target that came from
 *  the PR's draft/review status, which may move backwards within REVIEW_STATES. */
export function shouldMove(current, target, { review = false } = {}) {
  if (TERMINAL.has(current)) return { move: false, why: `is ${current} — leaving it alone` };
  const from = RANK[current];
  const to = RANK[target];
  if (from === undefined) return { move: false, why: `is in "${current}", which this automation does not manage` };
  if (from === to) return { move: false, why: `already ${current}` };
  if (review && REVIEW_STATES.has(target) && from <= RANK["Ready for Review"]) return { move: true };
  if (to < from) return { move: false, why: `already ${current} — not moving back to ${target}` };
  return { move: true };
}

/** Reviewers whose latest verdict is "changes requested" and who have not been asked to look again.
 *  `reviews` is GitHub's list for the PR, oldest first. Comments do not change a verdict; an
 *  approval or a dismissal replaces it. A re-request puts the reviewer back in requested_reviewers
 *  while their old review stands, which is how GitHub says "the author thinks this is addressed". */
export function outstandingChangeRequests(reviews, requestedReviewers = []) {
  const latest = new Map();
  for (const r of reviews) {
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state) && r.user?.login) {
      latest.set(r.user.login, r.state);
    }
  }
  const reasked = new Set(requestedReviewers.map((u) => u.login));
  return [...latest].filter(([login, state]) => state === "CHANGES_REQUESTED" && !reasked.has(login)).map(([l]) => l);
}

/** The state an open PR puts its ticket in. */
export function reviewTarget(pr, reviews) {
  if (pr.draft) return "In Progress";
  return outstandingChangeRequests(reviews, pr.requested_reviewers).length ? "In Progress" : "Ready for Review";
}

async function github(path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function axios(path, init = {}) {
  const res = await fetch(`${AXIOS_HOST}/api/v1/workspaces/${WORKSPACE}${path}`, {
    ...init,
    headers: { "X-Api-Key": TOKEN, "Content-Type": "application/json", ...init.headers },
  });
  return res;
}

/** Ticket keys look like GAM-142. Only keys whose prefix is a real project count, so a branch
 *  named `RFC-2` or `UTF-8-fix` does not send us looking for work items that never existed. */
function extractKeys(text, identifiers) {
  if (!text) return [];
  const found = text.toUpperCase().match(/\b[A-Z][A-Z0-9]*-\d+\b/g) || [];
  return [...new Set(found.filter((k) => identifiers.has(k.split("-")[0])))];
}

/** Other OPEN pull requests in this repo mentioning the same key, as `{ number, draft }`. A ticket
 *  with three PRs is not ready for test when the first one merges, nor ready for review while one
 *  of the others is still a draft. */
async function otherOpenPRs(key, repo, thisNumber) {
  if (!GH_TOKEN) return [];
  const q = encodeURIComponent(`repo:${repo} is:pr is:open ${key}`);
  const res = await github(`/search/issues?q=${q}&per_page=50`);
  if (!res.ok) {
    log(`  ! could not search for sibling PRs (HTTP ${res.status}); proceeding without the check`);
    return [];
  }
  const body = await res.json();
  return (
    (body.items || [])
      .filter((i) => i.number !== thisNumber)
      // The search index matches the key loosely; confirm it really appears in the title or branch.
      .filter((i) => (i.title || "").toUpperCase().includes(key))
      .map((i) => ({ number: i.number, draft: Boolean(i.draft) }))
  );
}

/** Put the pull request on the work item, so someone reading the ticket can find the code.
 *
 *  Deliberately separate from the state change and run BEFORE it: the link is useful even when
 *  the ticket does not move — a second PR against a ticket already In Progress, or a merge held
 *  back because sibling PRs are still open, are exactly the cases where you want the trail.
 *
 *  Idempotent by searching existing comments for the PR's own URL, because the same PR fires this
 *  on open and again on merge, and a ticket accumulating the same link four times is noise. */
async function linkPullRequest(issue, pr) {
  const url = pr?.html_url;
  if (!url) return;

  const title = String(pr.title || url).slice(0, 255);
  const base = `/projects/${issue.project}/issues/${issue.id}/links/`;

  // A real link, not a comment: the work item has a Links section built for exactly this, and a
  // link put there is a first-class thing you can see, open and remove. Buried in the activity
  // feed it scrolls away under every subsequent state change.
  const listed = await axios(base);
  if (listed.ok) {
    const existing = ((await listed.json()).results || []).find((l) => l.url === url);
    if (existing) {
      // The PR title can change after the link is made; keep the label honest.
      if (existing.title === title) return log(`  ${url} already linked`);
      const patched = await axios(`${base}${existing.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      return log(
        patched.ok ? `  retitled the link to ${url}` : `  could not retitle the link (HTTP ${patched.status})`
      );
    }
  } else {
    // Not fatal: the API rejects a duplicate URL on the same work item, so a blind POST is safe.
    log(`  could not read links (HTTP ${listed.status}) — posting anyway`);
  }

  const res = await axios(base, { method: "POST", body: JSON.stringify({ url, title }) });
  if (res.ok) return log(`  linked ${url}`);
  // 400 here is almost always the serializer's own "URL already exists for this Issue".
  const detail = (await res.text()).slice(0, 120);
  log(res.status === 400 ? `  ${url} already linked` : `  could not link PR (HTTP ${res.status}) ${detail}`);
}

/** Hidden marker so the bot can find and UPDATE its own comment instead of stacking a new one
 *  every time the PR is edited, reopened or merged. */
const PR_COMMENT_MARKER = "<!-- axios-tracker:work-items -->";

/** Put the Axios work item(s) on the pull request, so someone reading the PR can get to the
 *  ticket. The mirror of linkPullRequest: each side should point at the other, and a link that
 *  only goes one way means whoever starts at the PR still has to go hunting. */
async function linkTicketsOnPullRequest(repo, prNumber, keys) {
  if (!GH_TOKEN || !repo || !prNumber || !keys.length) return;

  const lines = keys.map((k) => `- [${k}](${AXIOS_HOST}/${WORKSPACE}/browse/${k}/)`);
  const body = [PR_COMMENT_MARKER, "**Axios**", ...lines].join("\n");
  const api = "https://api.github.com";
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const listed = await fetch(`${api}/repos/${repo}/issues/${prNumber}/comments?per_page=100`, { headers });
  if (listed.ok) {
    const existing = (await listed.json()).find((c) => (c.body || "").includes(PR_COMMENT_MARKER));
    if (existing) {
      // Same keys as last time: nothing to say, and an edit would bump the PR for no reason.
      if ((existing.body || "").trim() === body.trim()) return log(`  PR comment already current`);
      const patched = await fetch(`${api}/repos/${repo}/issues/comments/${existing.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      });
      return log(
        patched.ok ? `  updated the PR comment` : `  could not update the PR comment (HTTP ${patched.status})`
      );
    }
  } else {
    log(`  could not read PR comments (HTTP ${listed.status}) — posting a new one`);
  }

  const posted = await fetch(`${api}/repos/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });
  log(posted.ok ? `  linked ${keys.join(", ")} on the PR` : `  could not comment on the PR (HTTP ${posted.status})`);
}

async function transition(key, targetName, { repo, prNumber, pr, review = false } = {}) {
  const issueRes = await axios(`/issues/${key}/`);
  if (issueRes.status === 404) {
    log(`  ${key}: no such work item — skipping`);
    return null;
  }
  if (!issueRes.ok) {
    log(`  ${key}: lookup failed (HTTP ${issueRes.status}) — skipping`);
    return null;
  }
  const issue = await issueRes.json();

  // Before the rank checks below, all of which can return early.
  await linkPullRequest(issue, pr);

  const statesRes = await axios(`/projects/${issue.project}/states/`);
  if (!statesRes.ok) {
    log(`  ${key}: could not read states (HTTP ${statesRes.status})`);
    return issue;
  }
  const states = (await statesRes.json()).results || [];
  const byId = Object.fromEntries(states.map((s) => [s.id, s.name]));
  const currentName = byId[issue.state] || "(unknown)";

  // A PR that is ready on its own still leaves the ticket In Progress while another PR for it is a
  // draft: the least-ready PR speaks for the ticket.
  if (targetName === "Ready for Review" && repo) {
    const drafts = (await otherOpenPRs(key, repo, prNumber)).filter((p) => p.draft);
    if (drafts.length) {
      log(`  ${key}: draft PRs still open (${drafts.map((p) => `#${p.number}`).join(", ")}) — holding at In Progress`);
      targetName = "In Progress";
    }
  }

  let target = states.find((s) => s.name === targetName);
  if (!target && targetName === "Ready for Review") {
    log(`  ${key}: project has no "Ready for Review" state — using In Progress`);
    targetName = "In Progress";
    target = states.find((s) => s.name === targetName);
  }
  if (!target) {
    log(`  ${key}: project has no "${targetName}" state — skipping`);
    return issue;
  }

  const decision = shouldMove(currentName, targetName, { review });
  if (!decision.move) {
    log(`  ${key}: ${decision.why}`);
    return issue;
  }

  if (targetName === "Ready for Test" && repo) {
    const siblings = await otherOpenPRs(key, repo, prNumber);
    if (siblings.length) {
      log(`  ${key}: still has open PRs (${siblings.map((p) => `#${p.number}`).join(", ")}) — not advancing yet`);
      return issue;
    }
  }

  const patch = await axios(`/projects/${issue.project}/issues/${issue.id}/`, {
    method: "PATCH",
    body: JSON.stringify({ state: target.id }),
  });
  if (patch.ok) log(`  ${key}: ${currentName} -> ${targetName}`);
  else log(`  ${key}: PATCH failed (HTTP ${patch.status}) ${(await patch.text()).slice(0, 200)}`);
  return issue;
}

/** The pull request as it is now. The event's copy can be minutes old: runs for one PR queue behind
 *  each other, and a queued run is replaced by the next event rather than run twice. */
async function currentPullRequest(repo, fromEvent) {
  if (!GH_TOKEN) return fromEvent;
  const res = await github(`/repos/${repo}/pulls/${fromEvent.number}`);
  if (res.ok) return res.json();
  log(`  could not refresh the PR (HTTP ${res.status}) — using the event's copy`);
  return fromEvent;
}

/** Where an open PR puts its ticket, or null when the reviews cannot be read — guessing would move
 *  a ticket someone has just asked for changes on. */
async function openPullRequestTarget(repo, pr) {
  if (pr.draft) return "In Progress";
  const res = await github(`/repos/${repo}/pulls/${pr.number}/reviews?per_page=100`);
  if (!res.ok) {
    log(`  could not read reviews (HTTP ${res.status}) — leaving the state alone`);
    return null;
  }
  const reviews = await res.json();
  const blocking = outstandingChangeRequests(reviews, pr.requested_reviewers);
  if (blocking.length) log(`  changes requested by ${blocking.join(", ")}, not yet re-requested`);
  return reviewTarget(pr, reviews);
}

/** A broken token or an unreachable Axios: the only failures worth a red X. */
export class FatalError extends Error {}

/** Handle one GitHub event. Exported so the webhook receiver runs exactly this, not a copy. */
export async function handleEvent(name, event, repo) {
  if (!TOKEN) throw new FatalError("AXIOS_BOT_TOKEN is not set");

  const projRes = await axios("/projects/");
  if (!projRes.ok) throw new FatalError(`cannot reach Axios (HTTP ${projRes.status})`);
  const identifiers = new Set(((await projRes.json()).results || []).map((p) => p.identifier));
  log(`known projects: ${[...identifiers].join(", ")}`);

  let keys = [];
  let target = null;
  let review = false;
  let prNumber;
  // Declared out here because transition() below needs it, and a push event simply leaves it
  // undefined - linkPullRequest returns immediately without one.
  let pr;

  if (name === "pull_request" || name === "pull_request_review") {
    pr = await currentPullRequest(repo, event.pull_request);
    prNumber = pr.number;
    // The title wins when it carries a key. A branch name is fixed once it is pushed and
    // people have it checked out, so it is the field that goes stale; the title is the one
    // anyone can correct. Reading both would mean a corrected title still fires the old key
    // from the branch, and the correction would achieve nothing.
    keys = extractKeys(pr.title, identifiers);
    if (!keys.length) keys = extractKeys(pr.head?.ref, identifiers);

    // Read from the PR, not the action: this run may stand in for a queued `closed` it replaced.
    if (pr.state === "closed") {
      if (!pr.merged) return log("PR closed without merging — nothing to do");
      const base = pr.base?.ref;
      const dflt = event.repository?.default_branch;
      // Only merges into the default branch mean "this is in". A feature-into-feature merge
      // is bookkeeping between branches, not delivery.
      if (base !== dflt) return log(`merged into ${base}, not ${dflt} — nothing to do`);
      target = "Ready for Test";
    } else {
      target = await openPullRequestTarget(repo, pr);
      review = true;
    }
  } else if (name === "push") {
    // Only when the branch is first pushed. Acting on every push would call the API on each
    // commit to say nothing changed, and the very first push is what "work started" means.
    if (!event.created) return log("not a new branch — nothing to do");
    const branch = (event.ref || "").replace("refs/heads/", "");
    if (branch === event.repository?.default_branch) return log("default branch — nothing to do");
    keys = extractKeys(branch, identifiers);
    target = "In Progress";
  } else {
    return log(`unhandled event ${name}`);
  }

  if (!keys.length) return log("no work item key found — nothing to do");
  log(`${keys.length} key(s): ${keys.join(", ")} -> ${target ?? "(state unchanged)"}`);
  // Track which keys are real work items, so the PR only links tickets that actually exist.
  const resolved = [];
  for (const key of keys) {
    // Sequential on purpose; the lint rule's Promise.all suggestion does not apply. Axios
    // throttles at 60 requests a minute and each transition spends three or four, so firing a
    // PR's keys in parallel is how you get a 429 instead of a state change.
    // eslint-disable-next-line no-await-in-loop
    const issue = target
      ? await transition(key, target, { repo, prNumber, pr, review })
      : await linkOnly(key, pr);
    if (issue) resolved.push(key);
  }

  if (pr) await linkTicketsOnPullRequest(repo, prNumber, resolved);
}

/** Link the PR onto the work item without touching its state. */
async function linkOnly(key, pr) {
  const res = await axios(`/issues/${key}/`);
  if (!res.ok) {
    log(`  ${key}: lookup failed (HTTP ${res.status}) — skipping`);
    return null;
  }
  const issue = await res.json();
  await linkPullRequest(issue, pr);
  return issue;
}

async function main() {
  const { readFile } = await import("node:fs/promises");
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  await handleEvent(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_REPOSITORY);
}

// Run only as a script, so the tests and the webhook receiver can import the pieces.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    if (e instanceof FatalError) {
      console.error(`::error::${e.message}`);
      process.exit(1);
    }
    // Deliberately not a failure: see NEVER FAILS THE BUILD above.
    console.log(`::warning::axios transition errored: ${e.message}`);
  });
}
