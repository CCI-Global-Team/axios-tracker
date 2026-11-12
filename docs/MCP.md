# Connecting an MCP client to Axios

Axios exposes Plane's REST API, and Plane's MCP server
[`plane-mcp-server`](https://pypi.org/project/plane-mcp-server/) (Python, run with `uvx`) speaks to
it. That lets you read and file work items from an MCP-capable client instead of the web UI. It
replaces the older npm package `@makeplane/plane-mcp-server`.

The MCP server runs **on your machine**, not on the Axios server. Nothing is installed centrally —
each person sets up their own client with their own token.

## 1. Create your API token

In Axios: **workspace settings → API tokens → Add API token**.

Copy it immediately; it is shown once.

Two things worth understanding before you do:

- **The token carries your own permissions.** Anything you can do in Axios, a client holding this
  token can do. It is a credential, not a config value — treat it like a password.
- **Create your own rather than sharing one.** Tokens are per-user, so revoking one person's access
  does not disrupt anyone else, and the audit trail stays meaningful.

## 2. Point your MCP client at Axios

The exact config file depends on your client. The values are always the same:

| Setting | Value |
|---|---|
| Server | `uvx plane-mcp-server@0.3.5 stdio` |
| `PLANE_BASE_URL` | `https://axios.joincci.org` |
| `PLANE_WORKSPACE_SLUG` | `cci` |
| `PLANE_API_KEY` | `<your token>` |

Keep the version pinned. Everyone runs the same release, and an upstream release can't break
everyone at once. Bump it on purpose, after rerunning the checks in "Known failures on Axios".
You need [`uv`](https://docs.astral.sh/uv/) installed for `uvx`.

For Claude Code:

```bash
claude mcp add axios -s user \
  -e PLANE_BASE_URL=https://axios.joincci.org \
  -e PLANE_API_KEY=<your token> \
  -e PLANE_WORKSPACE_SLUG=cci \
  -- uvx plane-mcp-server@0.3.5 stdio
```

For Claude Desktop or any other client with a JSON config:

```json
{
  "mcpServers": {
    "axios": {
      "command": "uvx",
      "args": ["plane-mcp-server@0.3.5", "stdio"],
      "env": {
        "PLANE_BASE_URL": "https://axios.joincci.org",
        "PLANE_API_KEY": "<your token>",
        "PLANE_WORKSPACE_SLUG": "cci"
      }
    }
  }
}
```

Each tool covers one resource, and reads, writes and deletes share it: `workitem` lists, updates
and deletes work items. Allowing a tool for reads therefore allows its writes and deletes too. In
Claude Code, auto mode blocks these writes until you approve them or add allow rules such as
`mcp__axios__workitem` and `mcp__axios__workitem_comment`. An allow rule for `workitem` can't delete
work items, though: Axios refuses API-key deletes of work items, projects, states, cycles, labels,
modules and intake items. Delete those in the web app, or set a work item's state to Cancelled.
Deleting comments and links, and removing work items from cycles and modules, still work.

## 3. Check it works

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-Api-Key: <your token>" \
  https://axios.joincci.org/api/v1/workspaces/cci/projects/
```

- **200** — working.
- **403 with `{"detail":"Given API token is not valid"}`** — the token is wrong, revoked, or has a
  stray space. Note this is a 403, not the 401 you might expect.
- **403 with a `Cf-Mitigated: challenge` response header** — you are being stopped before reaching
  Axios, so the token is not the problem. Flag it in the team Discord.

## Scope and limits

- The token is **workspace-scoped**. It reaches `cci` and nothing else.
- The API is Plane's, so upstream's
  [API documentation](https://developers.plane.so/api-reference/introduction) applies directly.
- CCI's own additions, the weekly availability endpoints, are not part of the MCP server's tool
  set. They use session auth, so an API token can't reach them.
- Requests are limited to 600 a minute per token.

## Ticket states

Agents change a ticket's state only when the person asks, never as a side effect of other work.
Ready for Review and Ready for Test stay with the PR automation. This is guidance; Axios doesn't
enforce it.

GAM's states are Backlog, Todo, In Progress, Ready for Review, Ready for Test, In Testing, UAT,
Done, Released and Cancelled.

Add this to your agent's instructions (`CLAUDE.md`, `AGENTS.md` or similar):

```markdown
## Axios board

- Change an Axios ticket's state only when the person asks, never as a
  side effect of other work. Never move tickets to Ready for Review or
  Ready for Test; the PR automation does that.
```

## What common asks cost

Writes take internal IDs, so an agent first looks up the names it was given. These are Plane MCP
calls for an agent that starts with no IDs, measured against Axios:

| Ask | Calls | Path |
|---|---|---|
| Move GAM-n to a named state | 3 | `workitem retrieve_by_identifier` → `state list` → `workitem update` |
| Assign GAM-n to a named person | 3 | `workitem retrieve_by_identifier` → `member list_project` → `workitem manage_assignee` |
| Comment on GAM-n | 2 | `workitem retrieve_by_identifier` → `workitem_comment create` |
| Show GAM-n with comments | 2–3 | `workitem retrieve_by_identifier` → `workitem_comment list`, then `member list_project` to name authors |
| What's in a sprint | 3 | `project list` → `cycle list` → `cycle list_workitems` |
| What's assigned to me | 1 | `workitem list` with no `project_id` and `pql` set to `assignee = currentUser() AND stateGroup IN openStates()` |

Before limited PQL (GAM-737), "what's assigned to me" took 17 or more calls and loaded every work item
in your projects into the agent's context, about 150 KB in November 2026. The workspace-wide list
covers only projects you're an active member of.

## PQL on Axios

Axios supports part of PQL on `workitem list` (with or without `project_id`), `cycle list_workitems`
and `module list_workitems`:

- **Fields:** `assignee`, `state`, `stateGroup`, `priority`, `label`, `cycle`, `module`, `project`,
  `createdBy`, `mention`, `subscriber`, `startDate`, `dueDate`, `createdAt`, `updatedAt`.
- **Operators:**
  - `=`, `!=`, `IN`, `NOT IN`, `AND`, `OR`, `NOT` and parentheses.
  - `IS [NOT] NULL` and `IS [NOT] EMPTY` on `assignee`, `label`, `cycle` and `module`.
  - `<`, `<=`, `>`, `>=` and `BETWEEN` on dates written `"YYYY-MM-DD"`.
- **Functions:** `currentUser()`, `activeCycle()`, `openStates()`, `closedStates()` and
  `activeStates()`.

UUID fields take UUIDs, so look names up first (`state list`, `member list_project` and so on).
Anything else gets a 400 that names the unsupported part. The server adds its full PQL reference and a
hint to retry, but retrying with that part won't help: leave it out and filter the results yourself.

`activeCycle()` needs a cycle with a start and end date around today. If none has one, Axios returns
a 400 saying so, rather than an empty list that would read as an empty sprint. Use `cycle list` and
the cycle's UUID instead.

Two tips for agents:

- Pass `expand=state` on `workitem` and `cycle list_workitems` to get state names without a
  `state list` call.
- Match cycles by `name`. On the Jira-imported GAM cycles, `external_id` doesn't always match the
  name.

## Known failures on Axios

Checked with `plane-mcp-server` 0.3.5 against Axios on 4 November 2026.

| Call | Result | Notes |
|---|---|---|
| `pql` with a field, operator or function outside "PQL on Axios" | 400 naming the unsupported part. The server passes it back as a normal result with the full PQL reference and a hint to retry. | Retrying with that part won't help. Leave it out and filter the results yourself. |
| `workitem count` | 404 | |
| `workitem search` with `pql` | Refused by the server: "search does not take: pql" | Plain `search` with `query` works. |
| `work_log` | 404 | |
| `customer`, `initiative`, `page` | 404 | Axios has no API routes for these. |
| `workitem list` with `per_page` over 100 | Refused by the server | Page with `cursor`. |
| `delete` on `workitem`, `project`, `state`, `cycle`, `label`, `module` or `intake` | 403: "Deleting this with an API key is turned off on Axios" | Retrying won't help. Delete in the web app, or set the work item's state to Cancelled. |

Everything else needed for day-to-day work was checked and works: projects, states, labels, members,
cycles (list, read, add and remove work items), work items (read by `GAM-n`, list per project,
search, create, update, assign, label), comments (list, create, update, delete), links and activity.

## If you get stuck

Post in the team Discord rather than opening an issue on upstream's tracker — this is CCI's
deployment, and upstream cannot see or help with it.
