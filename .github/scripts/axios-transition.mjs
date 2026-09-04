/**
 * Advance an Axios work item in response to a GitHub event.
 *
 *   branch created / PR opened, with a ticket key in the name  ->  In Progress
 *   PR merged into the default branch                          ->  Ready for Test
 *
 * Run from .github/workflows/axios-transition.yml. Reads the GitHub event payload; talks to
 * Axios with the bot's API token.
 *
 * DESIGN NOTES, because each of these is a decision someone will want to revisit:
 *
 * ADVANCE ONLY. Every state has a rank, and a transition applies only if it moves the ticket
 * forward. Without that, pushing a fix branch for a ticket already in Ready for Test would drag
 * it back to In Progress, and a merge would pull a Done ticket backwards. The consequence worth
 * knowing: a QA bounce does NOT return the ticket to In Progress — the board will show Ready for
 * Test while someone is actively fixing. If that turns out to matter, the fix is to allow
 * In Progress to move backwards from Ready for Test specifically, not to abandon the rule.
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
  "Ready for Test": 4,
  "In Testing": 5,
  Done: 6,
};
const TERMINAL = new Set(["Cancelled"]);

const log = (...a) => console.log(...a);

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

/** Other OPEN pull requests in this repo mentioning the same key. A ticket with three PRs is not
 *  ready for test when the first one merges. */
async function otherOpenPRs(key, repo, thisNumber) {
  if (!GH_TOKEN) return [];
  const q = encodeURIComponent(`repo:${repo} is:pr is:open ${key}`);
  const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=50`, {
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: "application/vnd.github+json" },
  });
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
      .map((i) => `#${i.number}`)
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

  const listed = await axios(`/projects/${issue.project}/issues/${issue.id}/comments/`);
  if (listed.ok) {
    const existing = (await listed.json()).results || [];
    if (existing.some((c) => (c.comment_html || "").includes(url))) return;
  } else {
    // Not fatal: a duplicate link is better than losing the link entirely.
    log(`  could not read comments (HTTP ${listed.status}) — posting anyway`);
  }

  const title = String(pr.title || "").replace(/[<>&]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const res = await axios(`/projects/${issue.project}/issues/${issue.id}/comments/`, {
    method: "POST",
    body: JSON.stringify({
      comment_html: `<p>Pull request: <a href="${url}">${url}</a><br/>${title}</p>`,
    }),
  });
  log(res.ok ? `  linked ${url}` : `  could not link PR (HTTP ${res.status})`);
}

async function transition(key, targetName, { repo, prNumber, pr } = {}) {
  const issueRes = await axios(`/issues/${key}/`);
  if (issueRes.status === 404) return log(`  ${key}: no such work item — skipping`);
  if (!issueRes.ok) return log(`  ${key}: lookup failed (HTTP ${issueRes.status}) — skipping`);
  const issue = await issueRes.json();

  // Before the rank checks below, all of which can return early.
  await linkPullRequest(issue, pr);

  const statesRes = await axios(`/projects/${issue.project}/states/`);
  if (!statesRes.ok) return log(`  ${key}: could not read states (HTTP ${statesRes.status})`);
  const states = (await statesRes.json()).results || [];
  const byId = Object.fromEntries(states.map((s) => [s.id, s.name]));
  const target = states.find((s) => s.name === targetName);
  if (!target) return log(`  ${key}: project has no "${targetName}" state — skipping`);

  const currentName = byId[issue.state] || "(unknown)";
  if (TERMINAL.has(currentName)) return log(`  ${key}: is ${currentName} — leaving it alone`);

  const from = RANK[currentName] ?? 0;
  const to = RANK[targetName] ?? 0;
  if (to <= from) return log(`  ${key}: already ${currentName} — not moving back to ${targetName}`);

  if (targetName === "Ready for Test" && repo) {
    const siblings = await otherOpenPRs(key, repo, prNumber);
    if (siblings.length) {
      return log(`  ${key}: still has open PRs (${siblings.join(", ")}) — not advancing yet`);
    }
  }

  const patch = await axios(`/projects/${issue.project}/issues/${issue.id}/`, {
    method: "PATCH",
    body: JSON.stringify({ state: target.id }),
  });
  if (patch.ok) log(`  ${key}: ${currentName} -> ${targetName}`);
  else log(`  ${key}: PATCH failed (HTTP ${patch.status}) ${(await patch.text()).slice(0, 200)}`);
}

async function main() {
  if (!TOKEN) {
    console.error("::error::AXIOS_BOT_TOKEN is not set");
    process.exit(1);
  }

  const projRes = await axios("/projects/");
  if (!projRes.ok) {
    console.error(`::error::cannot reach Axios (HTTP ${projRes.status})`);
    process.exit(1);
  }
  const identifiers = new Set(((await projRes.json()).results || []).map((p) => p.identifier));
  log(`known projects: ${[...identifiers].join(", ")}`);

  const event = JSON.parse(await (await import("node:fs/promises")).readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const name = process.env.GITHUB_EVENT_NAME;
  const repo = process.env.GITHUB_REPOSITORY;

  let keys = [];
  let target = null;
  let prNumber;
  // Declared out here because transition() below needs it, and a push event simply leaves it
  // undefined - linkPullRequest returns immediately without one.
  let pr;

  if (name === "pull_request") {
    pr = event.pull_request;
    prNumber = pr.number;
    // The title wins when it carries a key. A branch name is fixed once it is pushed and
    // people have it checked out, so it is the field that goes stale; the title is the one
    // anyone can correct. Reading both would mean a corrected title still fires the old key
    // from the branch, and the correction would achieve nothing.
    keys = extractKeys(pr.title, identifiers);
    if (!keys.length) keys = extractKeys(pr.head?.ref, identifiers);

    if (event.action === "closed") {
      if (!pr.merged) return log("PR closed without merging — nothing to do");
      const base = pr.base?.ref;
      const dflt = event.repository?.default_branch;
      // Only merges into the default branch mean "this is in". A feature-into-feature merge
      // is bookkeeping between branches, not delivery.
      if (base !== dflt) return log(`merged into ${base}, not ${dflt} — nothing to do`);
      target = "Ready for Test";
    } else {
      target = "In Progress";
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
  log(`${keys.length} key(s): ${keys.join(", ")} -> ${target}`);
  // Sequential on purpose; the lint rule's Promise.all suggestion does not apply. Axios throttles
  // at 60 requests a minute and each transition spends three or four, so firing a PR's keys in
  // parallel is how you get a 429 instead of a state change.
  // eslint-disable-next-line no-await-in-loop
  for (const key of keys) await transition(key, target, { repo, prNumber, pr });
}

main().catch((e) => {
  // Deliberately not a failure: see NEVER FAILS THE BUILD above.
  console.log(`::warning::axios transition errored: ${e.message}`);
});
