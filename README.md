# BIMja: BIM in your browser

**Live:** https://2026bimjaairevouluton.github.io/BIMja-platform/ · Status: [docs/STATUS.md](docs/STATUS.md) · Handover: [docs/HANDOVER.md](docs/HANDOVER.md)

BIMja is a static web app for BIM on open standards (IFC): model, coordinate, schedule (4D), cost (5D) and run a georeferenced digital twin, all in the browser. Your model is never uploaded. Every capability is one command, reachable from the UI, from `window.bimja`, and from AI agents over MCP (`node mcp/bimja-mcp.mjs`); agents propose changes and a person applies them.

| Area | What works | Checked against |
|---|---|---|
| Model | Open IFC, 3D view, storey/class tree, properties, x-ray, section, PNG, first-person walkthrough | |
| Create | Levels, walls (butt joins), doors, windows, floors, roofs, rooms, free-form masses (taper, setback, twist, lean) and revolved solids (domes, minarets); plan drawing tools; schedules; IFC4 and GLB export | IFC round-trip gate; IfcOpenShell validation and geometry build |
| Landmark samples | Pisa, Taj Mahal, Fallingwater, Burj Khalifa, Vitra Fire Station: simplified massing studies built only from commands, credited to their architects | Valid IFC, key dimensions asserted |
| Handover check | 9 rules, score, issues, HTML report | Same score after export → reopen |
| Coordination | Federate models, clash (hard/soft, worker), issues, viewpoints, BCF 2.1 in/out | IfcOpenShell clash; BCF XSD |
| 4D | Activities, link by element or rule, P6 XML + MS Project XML import, auto sequence, timeline, play, Gantt | ifc4d task counts |
| 5D | Unit rates on quantities, estimate + CSV, asset register, COBie 2.4 .xlsx | ifc5d quantities (0.5%); COBie structure check |
| Geo + twin | EPSG CRS, IfcMapConversion, basemap/GeoJSON overlays; sensors bound to GlobalIds, simulated/WebSocket/MQTT feeds, alerts that select the element, history kept in IndexedDB | PROJ (pyproj) within 0.74 mm; real MQTT broker |
| Agents | 66 commands with args, refusals and UI paths; log, undo, replay, attribution, stale-rev, locks, pause | Parity test |

## Set up on a Windows PC and connect an agent
See [docs/SETUP.md](docs/SETUP.md): run the app locally, connect Claude Code, Codex, Cursor, VS Code (Copilot) or Claude Desktop over MCP, and replicate the repo into a private enterprise organisation.

## Run locally
```bash
npm ci
npm run dev      # http://localhost:5173
npm test         # all gates (reference gates need Python: see .github/workflows/deploy.yml)
npm run budget   # after build: first-load size gate (600 KB gz)
npm run build    # static site in dist/
```
Open your own model with the **Open IFC** button or by dropping a file on the page. You can also pass one in the link: `?model=https://…/file.ifc` (the server must allow CORS).

## Deploy
Each push to `main` runs the tests, builds the site, and publishes it to **GitHub Pages**. Turn this on under Settings → Pages → Source: GitHub Actions.

If the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set, the workflow also deploys to **Cloudflare Pages** (project `bimja-platform`). The app uses single-threaded web-ifc, so no special headers are needed.

## Agent example
```js
bimja.commands();                 // what this app can do
await bimja.load("models/AC20-FZK-Haus.ifc.txt");
const r = bimja.check_handover();          // { score, high, medium, low, byRule, issues[] }
bimja.select(r.issues[0].globalId);
const qto = bimja.quantity();
bimja.describe();                 // counts, storeys, issues, bbox
```

## Stack and licences
- [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (MPL-2.0): parses IFC and generates geometry, in WASM.
- [three.js](https://threejs.org) (MIT): rendering.
- BIMja code: proprietary, all rights reserved (see [LICENSE](LICENSE)). Versions published before the licence change remain under MIT for those who received them.

This is a clean-room project built on open standards (IFC). It contains no Autodesk code or formats. To bring in Revit projects, export IFC from Revit.

Sample models are for testing only:
- *AC20-FZK-Haus*: Karlsruhe Institute of Technology (KIT) IFC sample, taken from the web-ifc test files.
- *Ifc4_SampleHouse*: from the [youshengCode/IfcSampleFiles](https://github.com/youshengCode/IfcSampleFiles) collection.

The sample files keep their original terms.
