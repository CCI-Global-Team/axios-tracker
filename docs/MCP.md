# Connecting an MCP client to Axios

Axios exposes Plane's REST API, and the official
[`@makeplane/plane-mcp-server`](https://www.npmjs.com/package/@makeplane/plane-mcp-server) speaks to
it. That lets you read and file work items from an MCP-capable client instead of the web UI.

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
| Server | `@makeplane/plane-mcp-server` |
| API host | `https://axios.joincci.org` |
| Workspace slug | `cci` |
| Auth header | `X-Api-Key: <your token>` |

For a Claude Desktop / Claude Code style config:

```json
{
  "mcpServers": {
    "axios": {
      "command": "npx",
      "args": ["-y", "@makeplane/plane-mcp-server"],
      "env": {
        "PLANE_API_HOST_URL": "https://axios.joincci.org",
        "PLANE_API_KEY": "<your token>",
        "PLANE_WORKSPACE_SLUG": "cci"
      }
    }
  }
}
```

Check the package's own README for the current env var names — they are the package's contract, not
ours, and may change between versions.

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
- CCI's own additions — the weekly availability endpoints — are not part of the MCP server's tool
  set. They are reachable over the same API if you want them.

## If you get stuck

Post in the team Discord rather than opening an issue on upstream's tracker — this is CCI's
deployment, and upstream cannot see or help with it.
