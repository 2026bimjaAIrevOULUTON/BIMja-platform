# BIMja setup: Windows PC, agent connection and enterprise replication

This guide covers three jobs:
1. run BIMja on a Windows PC;
2. connect an AI agent (Claude Code, Codex, Cursor, VS Code with GitHub Copilot, Claude Desktop) over MCP;
3. replicate the repository into a private enterprise organisation.

It is written so that an agent (for example Codex) can follow it step by step.

BIMja is proprietary software (see [LICENSE](../LICENSE)). This repository is private. Do not publish or fork it outside the organisations BIMja has approved.

---

## 1. Run BIMja on a Windows PC

### Prerequisites
| Tool | Version | Install (PowerShell) |
|---|---|---|
| Git | any recent | `winget install --id Git.Git -e` |
| Node.js | 20 LTS or newer (tested on 22) | `winget install --id OpenJS.NodeJS.LTS -e` |
| Chrome or Edge | current | already on most PCs |
| GitHub CLI (optional) | current | `winget install --id GitHub.cli -e` |

Close and reopen PowerShell after installing so `git`, `node` and `npm` are on the PATH. Check with:

```powershell
git --version; node --version; npm --version
```

### Clone and run
The repository is private, so sign in first. Use `gh auth login`, or a Git credential prompt with a GitHub account that has access.

```powershell
cd $HOME\Documents
git clone https://github.com/2026bimjaAIrevOULUTON/BIMja-platform.git
cd BIMja-platform
npm ci
npm run dev
```

Open **http://localhost:5173** in Chrome. Everything runs in the browser on your PC, and models are not uploaded.

Other commands:

```powershell
npm test          # all test gates (some reference gates need Python; see .github/workflows/deploy.yml)
npm run build     # static site in dist\
npx vite preview --port 8099   # serve the built site at http://localhost:8099
```

---

## 2. Connect an agent over MCP

The MCP server is `mcp/bimja-mcp.mjs`. It runs in two modes.

| Mode | Command | Use it for |
|---|---|---|
| **Attached** | `node mcp/bimja-mcp.mjs --open` (defaults to http://localhost:5173) | Working with a person watching. The server opens the BIMja tab and bridges to it over a token-protected `ws://127.0.0.1` socket. Agent changes appear as proposals that you approve on screen. All commands work, including ones that need the 3D view. |
| **Headless** | `node mcp/bimja-mcp.mjs --headless --apply` | Batch work with no browser: authoring, schedules, drawings, exports. Commands that need the 3D view (rendering, viewer screenshots, in-view clash display) return "unavailable". `--apply` applies agent writes directly. Leave it out to keep the propose-and-approve step. |

For attached mode, start `npm run dev` first (step 1), so `http://localhost:5173` is serving. The server only accepts connections from `localhost:5173`, `127.0.0.1:5173` and `localhost:8099`, or from the URL given with `--app`.

Use **absolute paths** in the configs below. Replace `C:\Users\<you>\Documents\BIMja-platform` with your clone path, and use forward slashes or doubled backslashes inside JSON.

### Claude Code
The repository already contains `.mcp.json`. Start Claude Code in the repository folder and approve the `bimja` server when asked. To point it at your local app, edit the args:

```json
{ "mcpServers": { "bimja": { "command": "node", "args": ["mcp/bimja-mcp.mjs", "--app", "http://localhost:5173", "--open"] } } }
```

### Codex (CLI or IDE extension)
Add this to `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.bimja]
command = "node"
args = ["C:/Users/<you>/Documents/BIMja-platform/mcp/bimja-mcp.mjs", "--app", "http://localhost:5173", "--open"]
```

For headless batch runs, use `args = [".../mcp/bimja-mcp.mjs", "--headless", "--apply"]`.

Codex also picks up the operating skill from `.codex/skills/bimja`. It explains every command family and the drawing QA rule. Ask Codex to read `skills/bimja/SKILL.md` before it starts.

### Cursor
The repository contains `.cursor/mcp.json`, which uses `${workspaceFolder}`. Open the folder in Cursor and enable the `bimja` server under Settings → MCP. Add `"--app", "http://localhost:5173"` to the args to use your local app.

### VS Code with GitHub Copilot (agent mode)
Create `.vscode/mcp.json` in the repository:

```json
{
  "servers": {
    "bimja": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/mcp/bimja-mcp.mjs", "--app", "http://localhost:5173", "--open"]
    }
  }
}
```

Then open Copilot Chat, switch to **Agent** mode and enable the `bimja` tools.

### Claude Desktop
Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bimja": {
      "command": "node",
      "args": ["C:/Users/<you>/Documents/BIMja-platform/mcp/bimja-mcp.mjs", "--app", "http://localhost:5173", "--open"]
    }
  }
}
```

Restart Claude Desktop.

### Without MCP
Any agent that can run commands can use the runner: `node skills/bimja/scripts/bimja.mjs plan.json --out out/`. See `skills/bimja/SKILL.md`.

### Check the connection
Ask the agent to call `commands`, then `describe`. It should list about 66 commands and the current model summary. In attached mode, the BIMja tab shows the agent as connected.

---

## 3. Replicate into a private enterprise organisation

Use this when an organisation has a separate written licence from BIMja (see LICENSE §4) to run its own branded copy.

### 3.1 Create the empty private repository
In the enterprise organisation, create a new **private** repository (for example `org-name/bimja-<org>`). Do not initialise it with a README, licence or .gitignore.

### 3.2 Mirror the code
Use a full mirror so branches and tags come across:

```powershell
git clone --mirror https://github.com/2026bimjaAIrevOULUTON/BIMja-platform.git bimja-mirror.git
cd bimja-mirror.git
git push --mirror https://github.com/<org-name>/bimja-<org>.git
cd ..
git clone https://github.com/<org-name>/bimja-<org>.git
cd bimja-<org>
npm ci
npm test
```

Keep the original as an upstream remote, so licensed updates can be pulled in later:

```powershell
git remote add upstream https://github.com/2026bimjaAIrevOULUTON/BIMja-platform.git
git fetch upstream
git merge upstream/main     # when an update is released to the organisation
```

### 3.3 Branding and theme
| What | Where |
|---|---|
| Colours, fonts, spacing | `src/style.css` (theme variables at the top) |
| App name, page title, footer | `index.html` |
| MCP default app URL | `mcp/bimja-mcp.mjs` (`BIMJA_APP` env var or `--app`) |
| Agent operating guide | `skills/bimja/` and `AGENTS.md` |

Keep `LICENSE`, `NOTICE` and the third-party licence texts in `public/licenses`. The organisation's own agreement governs its copy (LICENSE §4).

### 3.4 Hosting inside the organisation
The app is a static site (`npm run build` → `dist/`). Host it on any internal static host: GitHub Pages for private repositories (available on GitHub Enterprise), Azure Static Web Apps, IIS or an internal web server. The workflow in `.github/workflows/deploy.yml` builds and tests on every push to `main`. Adjust its deploy step to the organisation's host and remove the Cloudflare step if it isn't used.

### 3.5 Checklist for an agent doing the replication
1. Confirm the target repository is private and empty.
2. Mirror (3.2) and run `npm ci` and `npm test`. All gates must pass before any change.
3. Apply branding (3.3) on a branch, run `npm test` again, open a pull request for a person to review.
4. Set up hosting (3.4). Check that the site loads and that `node mcp/bimja-mcp.mjs --app <internal URL> --open` connects.
5. Do not make the repository public, push it to other organisations or remove licence notices.
