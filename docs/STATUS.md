# Status

## 2026-11-21: M1 (command bus and two actors). Gate PASSED (Chrome); Firefox and Safari not yet verified

**What moved**
- **Command bus** (`src/core/bus.js`):
  - the contract `{id, name, args, rev, actor, dry_run, session}` → `{ok, rev, changed, diff, refusals}`;
  - typed refusals, idempotent ids, `stale_rev` with a diff;
  - 3-second soft locks on pointer-down;
  - agent writes become proposals (apply/reject), and `pause_agents` queues them;
  - session-grouped undo/redo, and replay.
- **Registry:** 56 commands, of which 36 are live and 20 are stubs that refuse with `not_implemented`. It drives `window.bimja` (generated), the MCP tool list, the **command palette** (Ctrl/⌘+K) and the parity test.
- **Create tab:** walls, door, window, floor, room and roof tools (each opens its command with an example), Build a sample house, schedules (wall/door/window/room/floor/roof), Delete, and authored elements shown in 3D.
- **Log tab:** colour-coded by who acted (person or agent), with pending proposals (Apply/Reject) and log export. Agent ghost cursors appear in the viewport.
- **Header:** undo/redo, pause agents (P), Save/Open project (`.bimja.json`). Keyboard: Ctrl+Z/Y, Del, P, Ctrl+K.
- **MCP server** (`mcp/bimja-mcp.mjs`), stdio:
  - *attached mode*: bridges to the open tab over ws://127.0.0.1 with a token in the URL fragment and an origin allowlist;
  - *headless mode*: the same engine runs in Node.
  - `BOOTSTRAP.md` and `.mcp.json` added.

**Gates**
- `tests/bus.mjs`: replay gives byte-identical output, plus stale_rev, locks, proposals, pause, idempotency, atomic script and session undo. Pass.
- `tests/mcp.mjs` (headless MCP, attribution): pass.
- Parity: pass (36 live, all reachable from the UI and `window.bimja`).
- Budget: 170 KB of 600 KB. Timings: `commands` 0.03 ms, `describe` 0.1 ms, `render` 78 ms.
- Browser, headless Chrome: an MCP agent connects to the open tab, its proposal is applied by a person, and typed refusals (would_overlap, stale_rev, locked) and render all work. 0 errors.
- **Not verified:**
  - Firefox and Safari: there are no such browsers in this workspace.
  - Real Chrome's local-network permission prompt: headless Chrome doesn't show it.
  - If Safari blocks ws://127.0.0.1 from https, the fallback is `--headless`.

**Deviation from plan**
- M2 (Rust→WASM engine) is deferred, using the plan's own fallback: keep the JS engine. The command contract and tests stay the spec, so Rust can replace the engine later without changing callers.

**Single next step**
- M3: plan-view drawing tools and IFC4/glTF export with the round-trip gate.


## 2026-11-21: M0 (foundation). Gate PASSED

**What moved**
- Code is now in `2026bimjaAIrevOULUTON/BIMja-platform`. The repo's initial commit is kept in the history.
- web-ifc is **lazy-loaded**:
  - first load went from 532 KB to **147 KB gzipped** (budget 600 KB);
  - web-ifc (373 KB gz) and its WASM load only when a model is opened.
- No sample auto-loads. A welcome card offers Open IFC, drag-and-drop, or a sample.
- **Command registry** (`src/commands/registry.js`): 50 commands across 7 domains (12 live, 16 spec, 22 stub). `window.bimja.commands()` and `describe()` added.
- **Gates in CI** (`npm test`, `npm run budget`, `npm run sbom`):
  - Parity: every live command has a UI control in index.html and is on `window.bimja`, or has a written headless reason.
  - Budget: first load ≤600 KB gzipped.
  - SBOM: CycloneDX, published as `sbom.cdx.json` next to the app.
- Added `NOTICE`. Licence is MIT in both LICENSE and package.json.

**Gates**
- Tests: viewer, authoring and parity all pass locally.
- Budget: 147.3 / 600 KB.
- Browser QA (headless Chrome, desktop and mobile): 0 errors.
- CI on GitHub: test, build, budget and SBOM all pass (run 44867919940).
- GitHub Pages: **live** at https://2026bimjaairevouluton.github.io/BIMja-platform/. The owner enabled Pages, and run 44868312442 succeeded.
- Live-site QA (headless Chrome, desktop and mobile): both samples load, `describe` and `commands` (50) work, 0 errors.

**What broke**
- The first parity run caught 4 live UI commands missing from `window.bimja`. Fixed.

**Single next step**
- M1: the command bus. One `execute({id, name, args, rev, actor, session, dry_run})` drives UI, `window.bimja` and MCP, with a log, replay, attribution, `stale_rev` and soft locks.
- The attached-mode spike runs first: does a GitHub Pages tab reach `ws://127.0.0.1` in Chrome, Firefox and Safari?
