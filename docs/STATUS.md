# Status

## 2026-11-21: Five landmarks through every stage; location and simulation twin

**What moved**
- **Landmarks at Taj level of detail.** All five are built only from commands, with cut openings, sweeps, arrays and families:
  - **Burj Khalifa:**
    - 27 setback terraces and stainless nose fins;
    - six mechanical-floor bands;
    - observation decks at L124 and L148;
    - spire with 8 arrayed service rings;
    - three podium entrances cut in, with an "Entrance canopy" family.
  - **Pisa:**
    - entrance portal and gallery doorways in every storey (all leaning with the tower);
    - hollow belfry with six arched openings;
    - seven bells placed as a "Church bell" family.
  - **Fallingwater:**
    - arrayed sash on every level;
    - north stone wall with window slots;
    - hearth boulder;
    - study terrace parapet;
    - drive bridge and abutments over Bear Run.
  - **Vitra:**
    - "Engine bay door" family placed five times;
    - slot windows cut in the leaning wall;
    - club-room window band, roof plate, 24-tread stair and raking struts.
  - The invented lake, plaza and lawn were removed. The real surroundings now come from the map.
- **Location (headless):**
  - `geolocate {lat, lon}` takes a Google Maps pin. It sets the UTM CRS and an IfcMapConversion anchor that includes grid convergence, so local north is true north.
  - It also sets the time zone and the site pin.
  - The IFC gains IfcProjectedCRS (WGS84, UTM, zone) and TrueNorth.
  - UTM is our own Krüger series: it matches proj4 to under 0.1 mm, and the inverse is exact to 1e-9°.
  - `location` returns the record and a Google Maps link.
- **Map context (browser):**
  - OpenStreetMap tiles are draped under the model in true position. Each landmark sits on its real streets and river (e.g. the Yamuna north of the Taj).
  - Optional OSM neighbouring buildings come from Overpass, extruded to their tagged height.
  - Context only: never exported.
- **Simulation twin:**
  - `sun` gives the NOAA sun position, sunrise/sunset and clear-sky irradiance for any date and time at the location.
  - The viewer casts real shadows from that sun; "Play day" animates it.
  - `solar_study` simulates a day on the model's own geometry, using a depth buffer from the sun with slope-scaled bias and subdivided samples. It reports:
    - sun hours and kWh/m² per facade orientation and per element;
    - ground shadow area over time.
  - The heatmap colours the model by exposure.
- **4D for any model:** `auto_sequence` now sequences free-form solids: site works first, then rise by rise from the ground up, structure before envelope, with durations from volume. A `finish` date scales the programme to fit, so each landmark runs over its documented construction years (Pisa 1173–1372, Taj 1632–1653, …).
- **Coordination for authored models:**
  - `clash_model` computes exact intersection volumes on the geometry kernel, by discipline (ISO 19650 role codes A, S, M, E, P, C, L, F) or by IFC class.
  - Elements take an optional `discipline`, which prepares the federation split.
- **Stages:**
  - Each landmark carries its location, programme, illustrative cost rates in local currency and a drawing setup.
  - "Build landmark" runs model → locate → 5D → 4D → drawings, then shows the map and the sun.
- **More IFC classes for solids:** curtain wall, ramp, geographic element, furniture, and pipe/duct/cable-carrier segments. Also pumps, fans, chillers, cooling towers, AHUs, generators, transformers, distribution boards and tanks (needed for the data centre).

**Gates**
- `tests/twin.mjs`:
  - UTM, inverse and convergence match proj4 at 7 sites, both hemispheres and the Norway zone.
  - geolocate keeps local north true north.
  - Sun: equinox elevation is correct; Agra sunrise and sunset within ±3 min; midnight sun in Svalbard.
  - Block shadow 583 m² against 549 m² by hand. Clear-sky June roof 8.48 kWh/m².
  - OSM fixture parsed: heights from tags, the project's own footprint skipped, relations handled.
  - Located IFC is schema-valid; replay is identical.
- `tests/landmarks.mjs`, for every landmark:
  - every class priced;
  - the programme spans the documented years;
  - every element is in the 4D programme;
  - a drawing set exists;
  - clash checked every solid;
  - the solar study runs;
  - the IFC is georeferenced and valid, with all geometry built in IfcOpenShell.
- Parity: 89 of 89 commands. First load 278 KB of the 600 KB budget.
- Browser QA:
  - Taj, Burj and Fallingwater build with map, sun and shadows.
  - The heatmap, 4D Gantt, 5D estimate and discipline clashes all show.
  - 0 console errors.

**Known limits**
- Cost rates are illustrative, not a cost plan. 4D durations inside the programme are proportioned by volume, not taken from historical records.
- Solar study:
  - clear sky only, no weather files;
  - no neighbouring buildings or terrain in the shadow calculation;
  - standard time without daylight saving;
  - no wind or CFD.
- OSM buildings use the public Overpass API. The parser is tested, but the live fetch is not: this sandbox cannot reach Overpass. OSM tiles follow the OSM tile policy (light use, attribution shown).
- Google Maps imagery needs a Google Maps Platform key. The Google Maps link opens the location; the basemap command takes any tile URL the user has rights to.
- Discipline clashes in the landmark studies are mostly intentional modelling overlaps (e.g. cornice and wall). They show the tool working, not design errors.

## 2026-11-21: D3 geometry kernel, LOD 350 landmarks, isometric drawings

**What moved**
- **Geometry kernel:** Manifold (Apache-2.0, 202 KB WebAssembly), lazy-loaded at startup, off the first paint. Commands stay synchronous and replayable once it has loaded.
- **New modelling commands** (all on `window.bimja`, MCP, the Create pane and the command palette; 83 commands in total):
  - `sweep`: a profile along a 3D path with mitred corners. Covers cornices, parapets, mouldings, handrails, kerbs, pipes and ducts.
  - `boolean`: difference, union or intersect against element ids or inline geometry specs. The base keeps its id and data.
  - `opening`: cuts an arched or square hole through any solid. Arch types: rect, semi, segmental, pointed, mughal.
  - `array`: linear (step) or polar (around a centre).
  - `family` and `place`: reusable assets with an IFC class, Uniclass 2015 code, AIM parameters and property sets.
- **Scripts:** a step tagged `{as: "x"}` can be referred to later as `"$x"`. Agents build a solid and cut it in one atomic, replayable script.
- **Lean:** now applies to every kind of solid, so cut arches follow Pisa's 3.97° lean exactly.
- **IFC:**
  - Family instances carry `BIMja_Family` and their own psets.
  - Uniclass is written as IfcClassification "Uniclass 2015" plus IfcClassificationReference, via IfcRelAssociatesClassification.
  - Marks are written to `Pset_BuildingElementProxyCommon.Reference`.
- **LOD 350 landmarks:**
  - **Taj Mahal:**
    - plinth with a 56-niche blind arcade and a cornice;
    - mausoleum with 4 cut mughal iwans, 16 stacked side alcoves and 8 chamfer alcoves;
    - pishtaq frames cut with the same arch, plus 8 guldastas;
    - cornice and parapet sweeps;
    - drum band, lotus crown and kalash;
    - "Chhatri 8-column" and "Minaret chhatri" families (Uniclass EF_30_10);
    - minarets with corbelled balconies and railings.
  - **Pisa:** blind arcade cut into the base drum, and six loggia arcades, each cut with 30 round arches, all leaning with the tower.
  - **Fallingwater:** rounded parapet sweeps on both cantilevers, arrayed Cherokee red sash, a 12-tread hatch stair to the stream and trellis beams.
  - **Vitra:** five engine bays and a ribbon window cut into the hall.
  - **Burj Khalifa:** unchanged.
- **Drawings:**
  - New isometric sheet type: true isometric with hidden lines, from the south-west and north-east, marked NTS.
  - When nothing fits at 1:100, the paper falls back to A0 if that allows a larger scale.
- **Licences:** NOTICE now lists manifold-3d (Apache-2.0) and delaunator (ISC). Full licence texts ship in `/licenses`.

**Gates**
- `tests/kernel.mjs` checks against closed-form values:
  - closed sweep 1.440 m³ (exact);
  - wall minus semicircular arch within 0.3%;
  - union 14.000 m³;
  - polar copy positions;
  - family placement and refusals.
- `tests/kernel.mjs` also checks the IFC: schema-valid, every shape builds in IfcOpenShell, Uniclass and psets present, deterministic export, identical log replay.
- All five landmarks: IFC valid, 0 geometry failures in IfcOpenShell.
  - Taj: 3.4 MB, 0.6 s.
  - Pisa: 7.3 MB, 1.4 s.
- Docs: 7 PDFs and 4 DXFs per house set, 0 DXF audit errors. Taj elevations render in 1.6 s.
- Parity: 83 of 83 commands. First load 260 KB of the 600 KB budget.
- Browser QA: Taj and Pisa build and render, and a pointed arch cut runs from `window.bimja`; 0 console errors.

**Known limits**
- The landmarks are LOD 350 *studies*, not survey-accurate: proportions come from published dimensions and photographs. There is no inlay, calligraphy, jaali or interior.
- Burj Khalifa has not been upgraded yet; the next candidates are its facade fins and spire setbacks.
- CSG output is triangulated, so a cut element exports as a faceted Brep, which is heavier than an extrusion.
- Not built yet:
  - unrolled facades;
  - spool sheets with a bill of materials;
  - shop drawings and millwork details;
  - O&M cut sheets;
  - LOIN/federation strategy documents.

## 2026-11-21: D2 site from survey (terrain, contours, grading, earthworks, site drawings)

**What moved**
- **Survey readers:**
  - CSV/XYZ/TXT (header or P,E,N,Z,code).
  - DXF: POINT with Z, spot-level TEXT, LINE/3D POLYLINE, contours as LWPOLYLINE with elevation, 3DFACE.
  - LandXML: TIN Pnts or CgPoints (N E Z order handled).
  - LAS 1.0–1.4: point formats 0–10, ground class 2 preferred.
  - PLY: ascii and binary.
  - Large clouds are thinned to a lowest-point ground grid.
  - E57/LAZ are refused with a clear "convert to LAS" message.
- **Location:**
  - `site_pin` takes a Google-Maps-style lat/lon and suggests the UTM CRS.
  - "Terrain from pin" (browser) sets the CRS and anchor, then samples AWS open Terrain Tiles (Terrarium) around the pin into survey points.
- **Terrain:** Delaunay TIN, height grid, contours (marching squares, auto interval, major every 5).
- **Grading (`site_grade`):** a platform around the building footprint at FFL minus plinth, with cut and fill batters (H:V) that daylight into the survey. It reports cut, fill and net volumes and areas.
- **Site in 3D:** under the building, either existing ground or the graded platform, with contours.
- **Site in IFC:** IfcGeographicElement TERRAIN (IfcTriangulatedFaceSet) for existing and proposed ground. IfcSite carries RefElevation = FFL and the pin's latitude and longitude.
- **Drawings:**
  - Site plan: existing contours (major labelled; dashed once graded) and proposed contours; platform with levels; the building cut; FFL; E/N grid ticks; survey and earthworks notes.
  - Site section S-S: existing and proposed ground profiles with the building section.
  - `sheets_auto` adds both sheets when a survey exists.
- **Site workspace:** pin, import (files plus three samples), terrain from pin, grading inputs, earthworks table, terrain and contour toggles.

**Gates**
- Samples read (CSV 949, DXF 910, LandXML 600 points).
- A DXF written by ezdxf (R2018: LWPOLYLINE elevation, POINT, TEXT) is read with every contour and spot level present.
- Synthetic LAS 1.2 (format 1) and 1.4 (format 6) read, with vegetation dropped by ground class. PLY ascii and binary read.
- Junk in every format is refused.
- Grading on flat ground matches the analytic frustum within 0.06%.
- The terrain IFC is schema-valid and IfcOpenShell builds its geometry.
- The site plan shows FFL, earthworks and the map grid.
- A log replay gives an identical site.
- Browser QA: sample survey, grade, 3D, undo; 0 errors. Budget 252 KB of 600 KB.

**Known limits**
- Terrain from pin needs internet in the browser and has not been tested against the live tile server from CI (the decoder is tested). Tiles give about 5 m spacing at zoom 15, which is fine for feasibility but is not a survey.
- One platform per site; no retaining walls, roads or drainage falls yet.
- Breaklines from DXF are sampled as points (no constrained TIN).

## 2026-11-21: D1 drawing engine (plans, elevations, sections, schedules → PDF, DXF, Excel; ISO 19650)

**What moved**
- **Drawing views from the model** (headless, the same in the browser, MCP and CI):
  - **Plans:** cut walls with clean joins, door leaves and swings, window sills and glass, room names, numbers and areas, opening marks, chain and overall dimensions, and any mass cut at the plan height.
  - **Elevations and sections:** hidden lines removed with a software depth buffer, including the silhouettes of domes and other curved forms; cut faces filled; level datums.
- **Sheets:**
  - Three selectable standards: ISO 19650 + UK National Annex, US NCS + ISO 19650 process, and IS 962/NBC + ISO 19650 naming. Each sets its own layers, title block, sheet numbers and paper.
  - Automatic paper size (smallest ISO A sheet that takes 1:50, then 1:100) and preferred scales.
  - The grid layout is chosen per sheet (towers get one row).
  - IS/NBC plans add an area statement.
- **ISO 19650 information management:**
  - Container names in Project-Originator-Volume-Level-Type-Role-Number form, e.g. TAJ-BJA-ZZ-00-DR-A-1001.
  - UK NA suitability codes S0–S4, A1–A5, B1 and CR, with CDE state.
  - Revisions P01… for S codes and C01… once authorised.
  - A drawing register (MIDP) that records every issue.
- **Commands:** `drawing_setup`, `sheets_auto`, `sheet`, `drawing` (svg|pdf|dxf), `publish`, `register`. Agents' publishes are proposals like any write.
- **Publish zip:**
  - The PDF set, plus one PDF and one DXF per container.
  - An XLSX with the register and the door, window, room, wall, floor and element schedules.
  - A README.
  - DXF is R12 at true scale (1 unit = 1 mm) with standard layers and filled cut walls.
  - DWG: save as DWG from AutoCAD, or batch-convert with the ODA File Converter. DWG is a closed format and is not written natively.
- **Landmarks** carry their own plan cuts (e.g. Taj at +8.0 m and +39.7 m), so `sheets_auto` gives meaningful plans for each.
- **Drawings workspace:** set-up, sheet list, live sheet preview (re-drawn when the model changes), PDF/DXF per sheet, and Publish with status.

**Gates**
- The plan carries the model's data: room name, area and the 10 230 mm overall dimension, cut walls filled, D01/W01 marks.
- Revisions follow the status family (P01 → P02 → C01).
- Publish is byte-identical for the same model and arguments.
- Independent readers open every file in CI: pypdf for 6 PDFs (5 pages in the set), ezdxf for the DXFs (recover + audit: 0 errors, standard layers, SOLID fills), openpyxl for the workbook.
- US NCS sheet A-101; the IS/NBC area statement; Taj elevations with more than 800 visible line segments in under 1 s.
- Parity: 72 commands. Budget: 238 KB of 600 KB.

**Known limits**
- Plans dimension the outer chain and overall only; there are no interior or opening dimensions yet.
- Text widths are approximate (Helvetica metrics), and there are no leaders or callouts.
- Wall layers are not drawn per layer in plan (a single cut fill).
- Sections cut the whole model at its middle by default.
- No site plan yet (D2).

## 2026-11-21: Free-form modelling (mass, revolve) and five landmark massing studies

**What moved**
- **`mass`:** extrude any outline. It can taper (top_scale), shift (setbacks, cantilevers), twist, and lean about a pivot.
- **`revolve`:** sweep an [r, z] profile around a centre to make domes, onion domes, minarets, drums and round columns.
- Both are agent commands like any other: they appear in the palette, `window.bimja` and MCP, and in the Create toolbar.
- **One solid serves everything:** a single polyhedral solid feeds the 3D view, the IFC export (IfcFacetedBrep with any IFC class) and the quantities (exact volume, surface area and height in Qto sets). The three always agree.
- **Landmark samples:** built only from commands, one undo step each, credited to their architects, with the credit written into the IFC project description:
  - Leaning Tower of Pisa: 223 commands, 3.97° lean.
  - Taj Mahal: 73 commands, 72.8 m.
  - Fallingwater: 27 commands, cantilevered terraces.
  - Burj Khalifa: 30 commands, Y-plan with 27 setbacks, 828 m.
  - Vitra Fire Station: 9 commands, leaning planes and a knife-edge canopy.
  
  They are in Samples and on the welcome card. All are simplified massing studies, not affiliated with the owners.
- Camera fit now keeps the whole model in view, including tall towers and narrow screens.

**Gates**
- Volumes are exact on reference shapes: a box comes out at 6.000 m³, and a 96-segment cylinder within 0.1% of π.
- All five landmark IFCs are schema-valid (0 issues), and every element's geometry builds in IfcOpenShell (362/362). Exports are deterministic. Key dimensions are asserted: Burj 828 m, Taj 70–76 m, and Pisa's belfry offset matches 3.97°.
- All earlier gates, the parity check (66 commands) and the browser QA pass. Budget: 221 KB of 600 KB.

**Known limits**
- No openings or booleans inside masses yet; the arcades are columns, not cut arches.
- No curved walls (approximate them with segments or a revolve).
- Masses carry no type, so the handover check flags "type" on them.
- Landmark colours are display-only (not written to IFC).

## 2026-11-21: M8 (late items). Walkthrough, twin history and MQTT done; NWD cut

**What moved**
- **`walkthrough`:** first-person walk in the 3D view. WASD or arrows to move, drag to look, Q/E for up/down, Shift to run, Esc to leave. It starts at eye height facing the most open direction, and stops 0.3 m short of any wall.
- **Twin history in IndexedDB:** readings persist in this browser across reloads (batched writes; nothing is uploaded). The scrub bar is restored after a reload. `history` returns the newest N readings (optionally per sensor), or clears them; there is also a CSV download.
- **MQTT feed:** `feed {mode:"mqtt", url:"wss://…", topic:"bimja/#"}`. A minimal MQTT 3.1.1 client over WebSocket, with no dependencies. Payloads are JSON `{sensor, value}` or a number on `bimja/<sensor>`. Credentials are never written to the command log.

**Gates**
- **MQTT:** a real broker (aedes, test-only dev dependency, MIT) over WebSocket delivers QoS 0 and QoS 1 messages, both JSON and number payloads; 200 malformed packets are handled.
- **Browser QA:**
  - MQTT readings from a local broker raised an alert that selected its element;
  - history survived a page reload (IndexedDB);
  - the walkthrough started, moved and stopped at a wall, and Esc left it;
  - 0 errors.
- Parity: 64 live commands, 0 stubs. Budget: 211 KB of 600 KB.

**Cut (brief's cut order)**
- **NWD reading: cut.** It needs reverse-engineering a proprietary container (the brief's last resort). Ask Navisworks users for IFC + BCF instead; both work today.
- The walkthrough has no VR/WebXR mode.

**Not yet verified**
- Firefox and Safari. All browser QA so far is headless Chrome (desktop and mobile sizes).
- Chrome's Local Network Access prompt for attached-agent mode on a real machine.

**Single next step**
- Run the app on Firefox and Safari, then do one end-to-end agent session over MCP on a real laptop.

## 2026-11-21: M7 (5D cost, assets, COBie). Gate PASSED

**What moved**
- **Wall joins fixed (found by the gate):** walls used to overlap at corners and T-junctions, so per-element volumes double-counted about 3% at corners. Walls now butt-join (one wall runs through, the other stops at its face), the exported geometry has no overlaps, and wall quantities follow the built length.
- **`cost`:** unit rates matched by IFC class (subtypes included), type text, name or storey, priced on count or any base quantity (NetVolume, NetSideArea, NetArea, NetFloorArea, Area, Length), with an optional factor. `sample:true` loads clearly labelled **sample** INR rates to replace with your own.
- **`estimate`:** lines (qty × rate), total, unpriced classes and missing-quantity warnings; CSV export. It is live on the model: delete a door and the estimate drops at once. It works on the authored model and on any open IFC (from its Qto sets).
- **`asset`:** register elements (one, a list, or a rule such as all doors) with tag, manufacturer, model, serial, install date, warranty and maintenance interval.
- **`cobie`:** COBie 2.4 workbook (.xlsx, all 18 sheets): Contact, Facility, Floor, Space, Type, Component (doors, windows, equipment classes, registered assets; each placed in the room(s) it opens into), and PM Jobs from maintenance intervals. Deterministic.
- 5D pane: sample rates, add rate, estimate table (click a line to see its elements), CSV, register assets, COBie download.
- **No stubs left:** 62 commands, all live.

**Gates**
- **Quantities vs IfcOpenShell ifc5d 0.9.0** (geometry takeoff of the exported IFC, CI only): 69 values (walls, slabs, spaces, windows) all within 0.5%; worst 0.0000%. Exterior wall lengths add up to the 36 m centre-line perimeter (no double counting).
- **COBie:** an independent Python checker opens the .xlsx with openpyxl and checks every COBie 2.4 sheet and column, no blank required fields, unique keys, CreatedBy → Contact, Space → Floor, Component → Type and Space, Job → Type: passes.
- Estimate arithmetic exact; replaying the log gives the same estimate and the same COBie bytes.
- Browser QA: sample rates, estimate, assets, COBie on the authored house and on AC20-FZK-Haus.ifc: 0 errors. Budget: 208 KB of 600 KB.

**Known limits**
- The COBie check is structural (sheets, columns, keys, references). Categories are plain labels, not OmniClass codes, and it has not been through the official COBie QC tool.
- For an open IFC, COBie components have Space "n/a" (we don't compute room containment for IFC doors yet), and the 5D quantities are the file's own Qto sets.
- Sample rates are illustrative, not a market rate book.

**Single next step**
- M8 (cuttable): walkthrough, historical twin series in IndexedDB, MQTT, NWD read. Then cross-browser testing (Firefox, Safari).

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
