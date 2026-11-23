# BIMja workflows (verified recipes)

Each recipe is a list of commands; send them one by one over MCP, wrap them in `script` for one atomic step, or put them in a runner plan (`scripts/bimja.mjs`). All values in mm unless named otherwise. Every recipe below was run headlessly against the engine.

Contents: 1 Project start · 2 Building shell · 3 Families and equipment · 4 Services (sweeps) · 5 Zones and grids · 6 Coordination · 7 4D · 8 5D, assets, handover · 9 Place: location, sun, site, city · 10 Digital twin · 11 Agent team · 12 Drawings and issue · 13 Large builds · 14 Troubleshooting

## 1. Project start
```json
[{"name":"describe","args":{}},
 {"name":"project_brief","args":{"name":"Plant room demo","client":"Demo","type":"building","lod_target":300}},
 {"name":"geolocate","args":{"lat":17.385,"lon":78.4867,"height_m":540,"timezone":5.5,"label":"Hyderabad"}}]
```
A new project has **Level 1 at 0 and Level 2 at 3000**. Add further levels above (`level {name, elevation}`), never a second one at 0. `type` values for the brief: building, data_centre, excavation, airport, process_plant, institute, infrastructure, heritage.

## 2. Building shell
```json
[{"name":"walls","args":{"points":[[0,0],[24000,0],[24000,12000],[0,12000]],"closed":true}},
 {"name":"door","args":{"at":[3000,0]}},
 {"name":"window","args":{"at":[24000,6000]}},
 {"name":"room","args":{"name":"Plant room","at":[12000,6000],"number":"P.01"}},
 {"name":"floor","args":{"from_walls":true}},
 {"name":"roof","args":{"overhang":300}}]
```
Wall height = distance to the level above unless `height` is given. Doors/windows find their host wall from `at`; refusals `out_of_bounds` / `would_overlap` mean the opening doesn't fit — move it. Types: `type {kind:"wall", name, thickness, fireRating, isExternal}` then `walls {type}`. Edit with `set`, `move`, `delete`; find with `query {kind, level, type}`; list with `schedule {kind:"doors"}`.
Free-form: `mass` (outline + height, `top_scale`, `top_shift`, `twist_deg`, `lean_deg`), `revolve` ([r,z] profile), `sweep`, `boolean`, `opening` (arches), `array`. Landmarks in the app were built this way.

## 3. Families and equipment
```json
[{"name":"family","args":{"name":"Chiller 500 kW","ifc_class":"IfcChiller","parameters":{"Cooling_kW":500,"Manufacturer":"assumed"},
   "parts":[{"shape":"box","min":[-1500,-600,0],"max":[1500,600,2000]}]}},
 {"name":"script","args":{"commands":[
   {"name":"place","as":"ch1","args":{"family":"Chiller 500 kW","at":[6000,8000,0],"mark":"CH-01"}},
   {"name":"place","as":"p1","args":{"family":"Pump 20 L/s","at":[6000,3000,0],"mark":"P-01"}},
   {"name":"connect","args":{"from":"$p1","to":"$ch1","medium":"chw","rating":"20 L/s"}}]}}]
```
- Parts: `box {min,max}` or `revolve {center:[x,y], profile:[[r,z],...]}`; several parts make one family. Geometry is in the family's local axes; `place {rotation_deg}` turns it.
- IFC class decides discipline and drawing treatment (IfcTransformer, IfcElectricDistributionBoard, IfcElectricGenerator, IfcElectricFlowStorageDevice → E; IfcChiller, IfcPump, IfcCoolingTower, IfcHeatExchanger, IfcUnitaryEquipment, IfcValve, IfcTank → M; IfcFurniture racks; IfcValve with family discipline F for fire).
- `mark` is the equipment tag shown on drawings and in assets — keep it short (`CH-01`, `A-UPS-L1A`).
- Optional: `uniclass {code,title}`, `psets`. Put assumptions in parameters (e.g. `AsBuiltStatus: "Assumed – not field-verified"`).

## 4. Services as sweeps
Pipes, ducts, busways and trays are `sweep` with a profile (section in mm) and a 3D path:
```json
{"name":"sweep","args":{"name":"CHW supply main","system":"CHW-S","profile":[[-80,0],[80,0],[80,160],[-80,160]],
  "path":[[2000,10500,3200],[22000,10500,3200]],"ifc_class":"IfcPipeSegment","discipline":"M","layer":"M-CHW"}}
```
- Use `IfcPipeSegment` (pipes; drafted plans label `system DNxxx CL +z`), `IfcCableCarrierSegment` (busway if the name contains "busway", ladder if "ladder", else tray), `IfcDuctSegment`.
- A round pipe: an octagon profile of radius r; the drafted label picks DN from the outside diameter. Size from flow (e.g. ≤ 2.1 m/s), not guesswork.
- Give every run a `system` (one per network/pod/row). Runs sharing a label are labelled once with "TYP.". Supply solid, return dashed: put "return" in the name.
- Route crossings at different levels; `clash_model` will find pipes through pipes.

## 5. Zones and grids
```json
[{"name":"zone","args":{"name":"Plant room","code":"PR","outline":[[-4000,-4000],[28000,-4000],[28000,16000],[-4000,16000]]}},
 {"name":"grid","args":{"name":"1","zone":"PR","start":[0,-3000],"end":[0,15000]}},
 {"name":"grid","args":{"name":"A","zone":"PR","start":[-3000,0],"end":[27000,0]}}]
```
- The zone code is the ISO 19650 volume field of every sheet cropped to it (2–4 capitals/digits). Make the outline cover the building plus room for grid bubbles.
- Grid lines extend ~3 m past the building; numbered lines one way, lettered the other. Drafted plans draw bubbles, chains (`7300`) and overall dimensions from them.
- Big buildings: add child zones `{code:"HA1", parent:"HA", outline:…}` covering parts that fit A0 at 1:100 (see drawings.md). Children share the parent's grids. Put the split line where nothing major crosses it (a cold aisle, a wall line).

## 6. Coordination
- `federation` lists discipline models (one IFC container each); `export_ifc {discipline:"M"}` returns that model's IFC text.
- `clash_model {a:"M", b:"S", min_volume_m3:0.01}` — exact solid intersections, headless. Fix by rerouting or moving; re-run until 0 or every remaining clash is accepted.
- Attached only: `federate` other IFCs, `clash`, `issue`, `viewpoint`, `bcf_export`/`bcf_import`, `isolate`, `render`.

## 7. 4D
`auto_sequence {start:"2027-01-04"}` builds a sequence from the model (slab → walls → openings → fit-out → roof per level). Or `activity {name, start, duration_days, after}` + `link {activity, elements | rule:{kind, level, ifc_class, storey}, mode}`; `schedule_import` takes P6 XML / MSPDI. `timeline {date}` gives built/active/hidden counts; `animate {from,to,step_days}`.

## 8. 5D, assets, handover
- `cost {sample:true}` loads labelled sample INR rates; real projects pass `rates:[{code, description, match:{ifc_class|type|name|storey}, basis:"count|NetVolume|NetSideArea|NetArea|Length", unit, rate}]`. `estimate {format:"csv"}` for a spreadsheet; unpriced classes are listed — price them or say so.
- `asset {rule:{ifc_class:"IfcChiller"}, tag_prefix:"CH-", manufacturer, model_number, warranty_years, maintenance_days}`. `tag_prefix` generates new tags (CH-001…); to keep the drawing marks as asset tags, register each element with `asset {element, tag:"CH-01"}` instead.
- COBie today leaves System and Connection sheets empty (connections are not exported yet) and space for equipment as n/a — say so when you hand it over.
- `cobie` → COBie 2.4 XLSX (base64). `check_handover` lists missing data. `quantity` (attached) for counts/areas/volumes.

## 9. Place: location, sun, site, city
- `geolocate` (lat/lon/height/timezone/orient) sets UTM CRS and IfcMapConversion; `location` reads it back with a Maps link.
- `sun {date, time}` (local standard time), `solar_study`, `live_data` (weather, air quality, earthquakes; network needed).
- Terrain: `survey_import {format:"csv|xyz|dxf|landxml|las|ply", data|base64}` → `site_grade {ffl (m), plinth (mm), margin, cut_slope:"H:V", fill_slope}` → `site_report`; `site_clear` to undo.
- City context: `city_plan` turns OpenStreetMap XML/JSON around the site into layered commands (roads, kerbs, water, landscape, infill); attached: `map_context`, `basemap`, `overlay`, `layer_visibility`.

## 10. Digital twin (attached)
`sensor {id, kind:"temperature|humidity|co2|occupancy|energy", min, max, element}` → `bind {sensor, element}` → `feed {mode:"simulated|ws|mqtt|off", url, topic, interval_ms}` → `history`. Never put feed passwords in shared notes. Readings stay in the browser (IndexedDB).

## 11. Agent team
`project_brief {type}` → `team_assemble {type, add, remove}` → `team`, `responsibility_matrix` (RACI), `delivery_status`, `handover_mark`. In the app, the team builds a project as work packages attributed to each role (Planner, Surveyor, Architect, Coordinator, Draftsman, Estimator, Asset Manager and specialists). When you act as a role, pass `owner` in your own notes and keep the order: brief → site → design → coordination → documents → cost/programme → handover.

## 12. Drawings and issue
```json
[{"name":"drawing_setup","args":{"project_code":"DMO","project_name":"Plant room demo","client":"Demo","author":"Agent","notes":{"M":["Chilled water 7/12 °C (assumed)."]}}},
 {"name":"sheet","args":{"kind":"ga","zone":"PR"}},
 {"name":"sheet","args":{"kind":"mech","zone":"PR"}},
 {"name":"drawing","args":{"sheet":"D1","format":"svg"}},
 {"name":"publish","args":{"status":"S2","date":"2026-11-23"}}]
```
Quick generic set: `sheets_auto` (register, plans, elevations, sections, schedules). Check every drafted sheet's `qa`; see drawings.md. `publish` returns a zip with the PDF set, one PDF + DXF per container and the XLSX register; `register` lists issues.

## 13. Large builds
- Generate commands with code (loops over grids, rows, blocks) and send them in `script` packages of 25–50; tag with `as` inside a package; a later package refers to elements by the `mark`-derived ids it got back, or by re-querying.
- Keep a plan file of the commands (the runner format) so the build is reproducible and replayable; the log is the source of truth.
- Run `connect` steps only after both ends exist (put them after the packages that create them).
- Measure: element counts via `describe`, clashes via `clash_model`, drawings via `qa`.

## 14. Troubleshooting
| Refusal / symptom | Cause | Fix |
|---|---|---|
| `door is taller than wall (0 mm)` | a level added at the same elevation as an existing one | delete it; add levels above |
| `unknown reference $x` | `as` used on a step whose result has no single id (e.g. `walls`) or not inside the same `script` | host by position (`at`), or query ids |
| `stale_rev` | someone changed the model | re-read (`describe`), retry ≤ 3 times |
| `locked` / `paused` | a person is editing / agents paused | wait, ask, or queue as proposal |
| `… needs the browser view` | viewer command in headless mode | run attached, or skip (render, clash, BCF, sensors) |
| drafted sheet `qa.missing` not empty | labels with nowhere to go | split the zone, shorten marks, enlarge the zone outline margin |
| drafted sheet at 1:200 or smaller | zone too large for the paper at 1:100 | split into parent/child zones |
