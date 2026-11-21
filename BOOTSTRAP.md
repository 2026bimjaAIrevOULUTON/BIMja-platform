# Connect an agent to BIMja

BIMja is one static web app plus a small local MCP server. People and agents use the same commands. Each change in the log is marked with who made it. An agent's writes arrive as **proposals** that a person applies, unless the agent sends `apply: true` (for headless batch runs).

## 1. Requirements
- Node.js 20 or newer (https://nodejs.org)
- Git (https://git-scm.com)

## 2. Get the server
```bash
git clone https://github.com/2026bimjaAIrevOULUTON/BIMja-platform.git
cd BIMja-platform
npm ci --omit=dev        # installs the pinned versions from package-lock.json; there is no postinstall step
```

## 3. Add it to your MCP client

**Attached mode** (recommended): you and the agent share the tab you have open.
```json
{ "mcpServers": { "bimja": { "command": "node", "args": ["mcp/bimja-mcp.mjs", "--open"] } } }
```
1. The server prints a link with a one-time token in the `#fragment`, and opens it with `--open`.
2. Open that link in your browser. The tab shows "🤖 <agent> connected".
3. Chrome may ask to allow access to devices on your local network. Choose **Allow**: the server listens on 127.0.0.1 only.

**Headless mode**: no browser. Authoring, schedules and scripts run in Node.
```json
{ "mcpServers": { "bimja": { "command": "node", "args": ["mcp/bimja-mcp.mjs", "--headless"] } } }
```

**Options:**

| Option | What it does |
|---|---|
| `--app <url>` | Use another deployment, e.g. a local `npm run dev` |
| `--port <n>` | Fixed port |
| `--apply` | Agent writes apply directly (use with care) |

## 4. First calls an agent should make
1. `commands`: the whole surface, with arguments, refusals and where each command lives in the UI.
2. `describe`: model summary (counts, storeys, issues, bbox, CRS).
3. Write commands such as `walls`, `door` and `room` return a **proposal** plus a diff. The person sees it under **Log** and applies or rejects it.
4. `render`: a PNG of the view, so the agent can check its own work.

**Refusals** are typed and never change anything:
- `stale_rev`: the response includes a diff. Re-read, then retry, at most 3 times.
- `locked`: a person is touching that element.
- `paused`: agents are paused. The change was queued as a proposal.
- `out_of_bounds`, `would_overlap`, `no_such_element`, `bad_arg`, `not_implemented`.

## Security
- Binds to 127.0.0.1 only.
- The session token travels in the URL fragment and is removed from the address bar as soon as the tab connects.
- Origin allowlist: the BIMja app and local dev servers.
- No telemetry. Models never leave your device.
