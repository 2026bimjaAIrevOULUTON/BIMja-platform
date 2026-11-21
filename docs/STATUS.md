# Status

## 2026-11-21: M6 (4D scheduling). Gate PASSED

**What moved**
- **Commands (all headless, MCP and UI):** `activity` (add/edit/delete; construct, demolish or temporary; `after` adds a finish-to-start link), `link` (by element id/GlobalId, or a rule: kind + level for authored, IFC class + storey for an open IFC; the rule is resolved once and recorded in the log), `schedule_import`, `auto_sequence`, `timeline`, `animate`.
- **Import:** Primavera P6 XML and MS Project XML (MSPDI), our own parser (no LGPL code shipped). It follows IfcOpenShell ifc4d's rules: MSPDI summary tasks become WBS by OutlineLevel, null rows are skipped, links to activities outside the file are dropped.
- **Auto sequence:** builds a schedule from the authored model (per level: slab, walls, doors and windows, fit-out; then roof), chained finish-to-start.
- **Timeline:** at any date each linked element is hidden (not started), orange (in progress), built, existing or removed. `timeline` also returns link warnings (successor starts before its predecessor allows).
- **4D pane:** import, sample P6 schedule, auto sequence, add activity, link the selection or by rule, date slider, play, Gantt with a "today" line. Clicking a bar jumps to it and selects its elements.
- Schedule state is saved with the project, undoable, and agents propose by default like every other write.

**Gates**
- **Task counts vs ifc4d 0.9.0** (`tests/time.mjs`, CI installs ifc4d, test-only): P6 sample 14 activities / 5 WBS / 13 links, MSPDI sample 14 / 5 / 13: identical. The P6 and MSPDI files of the same programme parse to the same activities and dates.
- **Deterministic frames:** same date gives the same state hash; animation frames are identical on repeat and after a log replay. In the browser, the rendered PNG hash is identical when returning to the same date.
- Fuzz: 300 corrupted schedules return an error object, never a crash.
- Browser QA: auto sequence, timeline, play, sample P6 + link by rule, agent proposal: 0 errors.
- Parity: 58 live, 3 stubs (M7). Budget: under 600 KB first load.

**Known limits**
- Dates are calendar days; working calendars and resource loading from P6/MSPDI are read but not used for scheduling (no CPM recalculation). Link violations are reported, not fixed.
- No IfcWorkSchedule/IfcTask export yet (the schedule travels in the .bimja.json project file).

**Single next step**
- M7: 5D. `cost` (unit rates on quantities), `asset`, `cobie`.

## 2026-11-21: M5 (georeferencing and digital twin). Gate PASSED

**What moved**
- **`crs`:** EPSG code, never a bare lat/long.
  - Built in: WGS84, Web Mercator, WGS84 UTM 32601–32660 and 32701–32760, ETRS89 UTM, BNG 27700, India NSF LCC 7755, NY State Plane 2263, Lambert-93 2154.
  - Any other code works with its proj4 definition.
  - proj4js (MIT) loads lazily.
- **`anchor`:** IfcMapConversion maths, from easting/northing or lat/lon, with height, rotation to grid north and scale. Lat/lon is resolved to E/N inside the logged command, so a replay is exact.
- **IFC:** export writes IfcProjectedCRS + IfcMapConversion; import reads them and applies them to the project.
- **No-CRS warning:** shown in the UI (a banner in Twin and a badge in the footer) and to agents (`describe.crs_warning`).
- **Map:**
  - `basemap`: XYZ tiles from a URL the user supplies; none by default.
  - `overlay`: GeoJSON by URL or inline; ArcGIS REST is consumed via `f=geojson`.
  - The map draws the model footprint, overlays and live sensor markers.
- **Twin:**
  - `sensor`: temperature, humidity, CO₂, occupancy or energy, with thresholds; `bind` ties it to a GlobalId or authored id.
  - `feed`: simulated (seeded, deterministic), a WebSocket JSON contract, or off.
  - **Alerts select their element.** Live values show on elements as tinted labels.
  - History scrub bar (in memory).

**Gates**
- **CRS** (`tests/geo.mjs`): proj4js agrees with PROJ 9.8 (pyproj) within **0.74 mm** across 7 CRSs. IfcMapConversion maths is exact, and the CRS and anchor survive an IFC round trip.
- **Browser QA:**
  - with no CRS, the warning shows in the UI and in `describe`;
  - the CRS + anchor (Pune, UTM 43N) are set; the IFC exports with IfcMapConversion and reopens with the same anchor;
  - a simulated alert selected its element in **0.1 ms** (gate: ≤1 s);
  - 0 errors.
- Parity: 52 live. Budget: 193.6 KB of 600 KB.

**Known limits and cuts (in the brief's cut order)**
- proj4js's inverse 7-parameter datum shift closes to about 1 mm on BNG (27700). The forward transform is within 0.74 mm of PROJ.
- **MQTT adapter cut**: the WebSocket JSON contract covers live feeds; MQTT-over-WS can come later.
- Historical series are kept in memory (5,000 readings), not IndexedDB. This is the brief's cut item 3.

**Single next step**
- M6: 4D. Activities, P6 XML / MSPDI import, linking tasks to elements, timeline and animation.


## 2026-11-21: M4 (coordination: federation, clash, issues, BCF). Gate PASSED

**What moved**
- **`federate`:** open more IFC models alongside the main one. Each is tinted, can be toggled, and its element ids are prefixed per model.
  - Models now load in their real coordinates (no `COORDINATE_TO_ORIGIN`), so federated models line up.
  - Models far from the origin (georeferenced) are re-centred by one shared offset.
- **`clash`** (`src/coord/clash.js`, runs in a Web Worker):
  - AABB sweep broad phase, triangle SAT narrow phase, point-in-mesh containment, soft clearance clashes.
  - Severity by penetration depth.
  - Doors and windows in their host walls are ignored, and same-class pairs by default within one set.
  - Sets are chosen by model name, IFC class or `all`. Authored elements take part too.
- **`issue`:** created from a clash, from a viewpoint or from elements; status, priority, assignee and comments; attributed and undoable.
- **`viewpoint`:** saves the camera (converted to IFC Z-up), the selection and a snapshot.
- **`bcf_export` / `bcf_import`:** BCF 2.1. The import's writes go through `bcf_merge`, so they are logged, attributed and undoable.
  - The zip reader/writer and the XML reader are our own code (no dependencies).
  - Output is deterministic: dates and GUIDs are fixed in the command args, so a replay gives the same bytes.

**Gates**
- **Clash** (`tests/clash.mjs`): the same hard-clash pairs as IfcOpenShell 0.8.5's clash tree on a reference pair of models (3 = 3). The 0.9 pip build ships no clash queries, so CI pins 0.8.5, for testing only.
- **BCF** (`tests/bcf.mjs`):
  - export → import gives identical topics;
  - every markup, viewpoint and version file validates against buildingSMART's BCF 2.1 XSDs with xmllint (the XSDs are fetched at test time, not vendored);
  - 200 random or truncated inputs return errors and never throw.
- **Browser QA:**
  - authored house vs federated model: 3 hard clashes;
  - an issue from a clash, an issue from a viewpoint, and an agent issue (3 issues);
  - BCF export (98 KB) imports on a fresh page as 3 issues, and re-exports byte-identical;
  - clash run on everything in 6 ms; 0 errors.
- Parity: 45 live. Budget: 186.5 KB of 600 KB.

**Known limits**
- Penetration depth is the overlap of the two bounding boxes, a conservative estimate.
- Clearance clashes use the gap between bounding boxes.
- Spaces and openings are not clashed.

**Single next step**
- M5: georeferencing (IfcMapConversion/IfcProjectedCRS read and write, EPSG via proj4js, basemap) and the digital twin (sensor bindings, simulated feed, alerts).


## 2026-11-21: M3 (modelling UI and IFC/glTF export). Gate PASSED

**What moved**
- **Plan view** (Create → Draw in plan):
  - draw walls by clicking, with 100 mm grid, endpoint and 15° angle snaps and a live length readout; click the first point to close;
  - place doors and windows on walls, and rooms inside walls (named);
  - select, pan, zoom and fit; a level picker and a wall-type picker;
  - keyboard: W, D, N, R, V, F, Enter, Esc.
  - Every click emits the same command an agent would send.
- **`export_ifc`:** authored model → IFC4.
  - Writes walls (type, material layer set, Pset_WallCommon, Qto), openings with doors and windows (fills/voids, marks, Pset_*Common, Qto), slabs (floor/roof), spaces (LongName, Qto) and storeys.
  - Deterministic GlobalIds and byte-identical output on repeat.
  - Never invents data the model doesn't have. The round-trip gate caught this: the exporter had been adding a placeholder material and FireRating, and now doesn't.
  - When only an IFC is open, it re-saves that IFC unchanged.
- **`export_gltf`:** GLB of the 3D view; the exporter loads lazily (10 KB).
- **`check_handover`:** also runs on the authored model before export.

**Gates**
- **Round trip** (`tests/roundtrip.mjs`):
  - Complete model: 100% before export = 100% after reopening.
  - Deliberately incomplete model: 82% = 82%, with the same failures rule by rule.
  - Classes, counts and GlobalIds all survive.
- **IfcOpenShell 0.9.0 schema validation:** 0 issues on both exported files. Runs in CI only, never bundled.
- **Browser QA:** a building drawn purely by clicks, then IFC (23 KB) and GLB (`glTF` magic) exported. Reopened IFC scores 100% = 100%. 0 errors.
- Parity: 38 live. Budget: 178 KB of 600 KB.

**Known losses** (`EXPORT_LOSSES`):
- The roof overhang shows in 3D only.
- Wall corners are overlapping extrusions; there is no IfcRelConnectsPathElements yet.
- Wall layers are a type material set only.

**What broke**
- web-ifc moves models to the origin (`COORDINATE_TO_ORIGIN`), so a reopened export sits offset from the authored model. Federation in M4 must apply the coordination matrix.

**Single next step**
- M4: federate (with coordinate alignment), BVH clash, issues, viewpoints, BCF import/export.


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
