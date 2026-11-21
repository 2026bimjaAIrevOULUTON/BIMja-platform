# BIMja: open BIM in your browser

**Live:** https://2026bimjaairevouluton.github.io/BIMja-platform/ · Status: [docs/STATUS.md](docs/STATUS.md) · Handover: [docs/HANDOVER.md](docs/HANDOVER.md)

BIMja is a static web app. It opens an IFC model in the browser, shows it in 3D, runs a handover data check, and exports the issues. Everything runs on your device, so the model is never uploaded. It works for people through the UI and for AI agents through `window.bimja`.

**v0 (today):**

| Area | What works |
|---|---|
| Model | 3D view, storey/class tree, search, properties and quantity sets, x-ray, horizontal section, PNG |
| Handover check | 9 baseline rules: name, storey, type (COBie), material, FireRating, IsExternal, LoadBearing, space names, base quantities. Gives a score, an issue list and a ghosted focus view on each element. |
| Exports | Issues CSV, report JSON, and a client-ready HTML report with a screenshot |
| 5D seed | Counts plus area, volume and length per class, read from `Qto_*` sets, with CSV export |
| Agent API | `window.bimja.commands()` lists the whole surface (from `src/commands/registry.js`); `describe`, `load`, `check_handover`, `quantity`, `select`, `isolate`, `section`, `camera`, `render`, `export_report`, `export_issues` |

Planned: Coordination (clash + BCF), 4D (P6/MSP schedule + timeline), cost rates for 5D, and the digital twin (sensor → GlobalId).

## Run locally
```bash
npm ci
npm run dev      # http://localhost:5173
npm test         # viewer + authoring + parity tests
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
- BIMja code: MIT.

This is a clean-room project built on open standards (IFC). It contains no Autodesk code or formats. To bring in Revit projects, export IFC from Revit.

Sample models are for testing only:
- *AC20-FZK-Haus*: Karlsruhe Institute of Technology (KIT) IFC sample, taken from the web-ifc test files.
- *Ifc4_SampleHouse*: from the [youshengCode/IfcSampleFiles](https://github.com/youshengCode/IfcSampleFiles) collection.

The sample files keep their original terms.
