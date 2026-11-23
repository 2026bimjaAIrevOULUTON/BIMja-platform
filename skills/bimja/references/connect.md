# Connecting an agent app to BIMja

All routes start from a clone of the repo:
```bash
git clone https://github.com/2026bimjaAIrevOULUTON/BIMja-platform.git
cd BIMja-platform && npm ci --omit=dev     # Node 20+; pinned versions, no postinstall step
```
In the snippets, `/abs/BIMja-platform` is that clone's absolute path (MCP clients often start servers outside the project folder).

## Modes
- **Attached** (`--open`): the server prints a link with a one-time token in the `#fragment` and opens it. The browser tab shows "🤖 <agent> connected". Agent writes arrive as proposals the person applies under **Log**; the person can pause agents. Use when someone is watching. Chrome may ask to allow local-network access: choose Allow (the server listens on 127.0.0.1 only).
- **Headless** (`--headless`): the same engine in Node, no browser. Add `--apply` (or pass `"apply": true` on each write): without it every write comes back as a proposal, and with no browser nobody can apply it, so the model never changes. Viewer commands (render, camera, clash, BCF, sensors, basemap…) refuse with `unavailable`; everything else works. Use for IDE/CLI agents without a browser, CI and cloud agents.
- **Options**: `--app <url>` another deployment (e.g. `http://localhost:5173` from `npm run dev`), `--port <n>`, `--apply` (agent writes apply directly — only for unattended batch runs).

## Claude Code / Claude desktop
Project file `.mcp.json` (already in the repo):
```json
{ "mcpServers": { "bimja": { "command": "node", "args": ["mcp/bimja-mcp.mjs", "--open"] } } }
```

## Codex (CLI and IDE extension share this)
`~/.codex/config.toml`, or `.codex/config.toml` in a trusted project:
```toml
[mcp_servers.bimja]
command = "node"
args = ["/abs/BIMja-platform/mcp/bimja-mcp.mjs", "--open"]   # no browser: "--headless", "--apply"
```
Or `codex mcp add bimja -- node /abs/BIMja-platform/mcp/bimja-mcp.mjs --headless --apply`. In the TUI, `/mcp` lists active servers. Skills: copy or link `skills/bimja` into `.codex/skills/` (repo) or `~/.codex/skills/`.

## Cursor
`.cursor/mcp.json` in the project (commit it for the team) or `~/.cursor/mcp.json`:
```json
{ "mcpServers": { "bimja": { "command": "node", "args": ["/abs/BIMja-platform/mcp/bimja-mcp.mjs", "--open"] } } }
```
Known limits: the Cursor CLI agent has had trouble reading the project-level file (use the global one); Cursor cloud agents load MCP servers from cursor.com/agents settings, not local files — use `--headless --apply` there. Skills: `~/.cursor/skills/bimja/`.

## GitHub Copilot cloud (coding) agent
Repository **Settings → Copilot → MCP configuration** (Code & automation section):
```json
{ "mcpServers": { "bimja": { "type": "local", "command": "node", "args": ["mcp/bimja-mcp.mjs", "--headless", "--apply"], "tools": ["*"] } } }
```
No browser exists there, so always headless. Copilot calls tools without asking; its work returns as a pull request to review. Add `npm ci` to `copilot-setup-steps.yml` so the server's dependencies are installed.

## No MCP at all
`node skills/bimja/scripts/bimja.mjs plan.json --out out/ [--project in.bimja.json] [--save out.bimja.json]` runs a JSON list of commands headlessly and writes every file produced (drawings as PDF/SVG/DXF via the `@drawings` macro or `drawing` steps, IFC, COBie, publish zips, CSV) plus `results.json` with each step's result and drawing QA. Exit code 1 if a step was refused.

## Browser console
`await bimja.run("describe")`, `await bimja.run("walls", {points: [...], closed: true})`. Writes from the console are proposals unless you pass `{apply: true}` as the third argument.
