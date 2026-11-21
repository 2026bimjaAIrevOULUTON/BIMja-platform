# Status

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
