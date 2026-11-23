# BIMja command catalogue

Generated from `src/commands/registry.js` by `node scripts/gen-skill-commands.mjs` — do not edit by hand.
105 commands. Each is an MCP tool of the same name and `window.bimja.run(name, args)` in the browser.
Kinds: **read** (no change), **control** (session state), otherwise a **write** (logged, attributable, undoable; agents' writes become proposals unless applied).
"needs viewer" = only in attached mode (a browser tab), not headless.

Domains: [session](#session) · [author](#author) · [coord](#coord) · [view](#view) · [cost](#cost) · [site](#site) · [geo](#geo) · [twin](#twin) · [brief](#brief) · [handover](#handover) · [docs](#docs) · [time](#time)

## session

| Command | What it does | Args | Kind |
|---|---|---|---|
| `commands` | List every command with args, refusals and where it lives in the UI | — | read |
| `describe` | Model summary: counts, storeys, classes, issues, bbox, CRS | — | read |
| `load` | Open an IFC model from a URL or bytes *(needs viewer)* | `url`: string<br>e.g. `{"url":"models/AC20-FZK-Haus.ifc.txt"}` | write |
| `save` | The whole project (model, coordination, schedule, twin, log) as JSON | — | read |
| `load_project` | Open a saved .bimja.json project | `project`: object | write |
| `undo` | Undo the last change (an agent's whole run is one step) | — | control |
| `redo` | Redo | — | control |
| `pause_agents` | Pause or resume agents; their changes queue as proposals | `paused`: boolean? | control |
| `script` | Run many commands as one step; atomic by default. Tag a step {as: "x"} and use "$x" in later args for its id | `commands`: [{name, args, as?}]; `atomic`: boolean?<br>e.g. `{"commands":[{"name":"mass","as":"slab","args":{"outline":[[0,0],[6000,0],[6000,600],[0,600]],"height":5000}},{"name":"opening","args":{"target":"$slab","at":[3000,300,0],"width":2000,"height":3000,"depth":1000,"arch":"pointed"}}]}` | write |
| `log` | The command log: who did what, in order | `last`: number? | read |
| `proposals` | Pending agent proposals | — | read |
| `apply_proposal` | Apply an agent's proposal (people only) | `id`: string | control |
| `reject_proposal` | Reject an agent's proposal | `id`: string | control |

## author

| Command | What it does | Args | Kind |
|---|---|---|---|
| `level` | Add a level | `name`: string; `elevation`: mm<br>e.g. `{"name":"Level 3","elevation":6000}` | write |
| `wall` | Add a wall between two points | `start`: [x,y] mm; `end`: [x,y] mm; `level`: id?; `type`: string?; `height`: mm?<br>e.g. `{"start":[0,0],"end":[6000,0]}` | write |
| `walls` | Add a chain of walls (closed for a room outline) | `points`: [[x,y],...]; `closed`: boolean?; `type`: string?<br>e.g. `{"points":[[0,0],[8000,0],[8000,6000],[0,6000]],"closed":true}` | write |
| `door` | Add a door hosted in a wall | `wall`: id; `offset`: mm; `at`: [x,y]?; `type`: string?<br>e.g. `{"at":[2000,0]}` | write |
| `window` | Add a window hosted in a wall | `wall`: id; `offset`: mm; `at`: [x,y]?; `type`: string?; `sill`: mm?<br>e.g. `{"at":[5000,0]}` | write |
| `floor` | Add a floor from a boundary or the walls' outline | `boundary`: [[x,y],...]?; `from_walls`: boolean?; `level`: id?<br>e.g. `{"from_walls":true}` | write |
| `room` | Add a room at a point inside walls | `name`: string; `at`: [x,y]; `number`: string?<br>e.g. `{"name":"Office","at":[2000,2000]}` | write |
| `mass` | Free-form solid: extrude an outline with taper (top_scale), shift (setbacks, cantilevers), twist and lean. Towers, podiums, canopies, folded or angled volumes | `outline`: [[x,y],...] mm; `height`: mm; `level`: id?; `base`: mm?; `top_scale`: number?; `top_shift`: [dx,dy]?; `twist_deg`: deg?; `segments`: number?; `lean_deg`: deg?; `lean_dir_deg`: deg?; `pivot`: [x,y,z]?; `ifc_class`: IfcBuildingElementProxy\|IfcColumn\|IfcSlab\|IfcRoof\|IfcWall\|…?; `material`: string?; `color`: #rrggbb?; `name`: string?<br>e.g. `{"outline":[[0,0],[20000,0],[20000,20000],[0,20000]],"height":60000,"top_scale":0.6,"twist_deg":45,"material":"Glass"}` | write |
| `revolve` | Solid of revolution: a [r, z] profile swept around a centre. Domes, minarets, drums, round columns, cooling towers | `center`: [x,y] mm; `profile`: [[r,z],...] mm, closed; r=0 on the axis; `level`: id?; `base`: mm?; `segments`: number?; `lean_deg`: deg?; `lean_dir_deg`: deg?; `pivot`: [x,y,z]?; `ifc_class`: string?; `material`: string?; `color`: #rrggbb?; `name`: string?<br>e.g. `{"center":[0,0],"profile":[[0,0],[6000,0],[6000,2000],[4200,6500],[0,9000]],"material":"Marble"}` | write |
| `sweep` | Sweep a profile along a 3D path (mitred corners; closed paths make rings): cornices, mouldings, parapets, handrails, kerbs, pipes and ducts | `profile`: [[u,v],...] mm; `path`: [[x,y,z],...] mm; `closed`: boolean?; `level`: id?; `base`: mm?; `ifc_class`: string?; `material`: string?; `color`: #rrggbb?; `name`: string?<br>e.g. `{"profile":[[0,0],[300,0],[300,150],[150,300],[0,300]],"path":[[0,0,3000],[10000,0,3000],[10000,8000,3000],[0,8000,3000]],"closed":true,"material":"Stone"}` | write |
| `boolean` | Geometry kernel booleans (Manifold): base minus/plus/intersect tools (element ids or geometry specs); the base keeps its id and data | `base`: id; `tools`: [id \| spec]; `op`: difference\|union\|intersect; `keep_tools`: boolean?<br>e.g. `{"base":"M1","tools":["M2"],"op":"difference"}` | write |
| `opening` | Cut an arched or square opening through a solid: rect, semi, segmental, pointed or mughal arch | `target`: id; `at`: [x,y,z] mm; `dir_deg`: deg; `width`: mm; `height`: mm; `depth`: mm; `arch`: rect\|semi\|segmental\|pointed\|mughal<br>e.g. `{"target":"M1","at":[5000,0,0],"dir_deg":0,"width":1800,"height":3200,"depth":1000,"arch":"pointed"}` | write |
| `array` | Copy a solid in a line (step) or around a centre (polar); returns the new ids | `source`: id; `count`: number?; `step`: [dx,dy,dz] mm?; `polar`: {center:[x,y], count, angle_deg?}?<br>e.g. `{"source":"M1","polar":{"center":[0,0],"count":12}}` | write |
| `connect` | Connect two elements in a system (feeds the single-line diagram and schematics): power, chw, lthw, cw, gas, data, air… | `from`: id; `to`: id; `medium`: string; `rating`: string?; `label`: string?<br>e.g. `{"from":"TX-01","to":"MSB-01","medium":"power","rating":"2500 kVA"}` | write |
| `grid` | Add a structural grid line (1, 2… / A, B…); drafted plans draw it with bubbles and dimension chains | `name`: string; `start`: [x,y] mm; `end`: [x,y] mm; `zone`: string?<br>e.g. `{"name":"1","start":[0,-6000],"end":[0,54000]}` | write |
| `zone` | Name a zone such as a data hall: its code becomes the ISO 19650 volume code and drawing packs add sheets cropped to it | `name`: string?; `code`: string; `outline`: [[x,y],...] mm?; `parent`: zone code? (a part of that zone, for sheet splits); `delete`: boolean?<br>e.g. `{"name":"Hall A","code":"HA","outline":[[0,0],[84000,0],[84000,48000],[0,48000]]}` | write |
| `family` | Define a reusable family (assets like Revit families): IFC class, Uniclass code, parameters, property sets and geometry parts | `name`: string; `ifc_class`: string?; `uniclass`: {code, title}?; `parameters`: object?; `psets`: object?; `parts`: [geometry spec]<br>e.g. `{"name":"Bollard 900","ifc_class":"IfcBuildingElementProxy","uniclass":{"code":"Pr_30_59_08","title":"Bollards"},"parts":[{"shape":"revolve","center":[0,0],"profile":[[0,0],[110,0],[110,900],[0,960]]}]}` | write |
| `place` | Place a family instance at a point with a rotation | `family`: string; `at`: [x,y,z?] mm; `rotation_deg`: deg?; `level`: id?; `name`: string?; `mark`: string?<br>e.g. `{"family":"Bollard 900","at":[2000,-1500]}` | write |
| `roof` | Add a flat roof over the walls | `level`: id?; `overhang`: mm?<br>e.g. `{"level":"L2","overhang":300}` | write |
| `delete` | Delete elements (a wall takes its doors and windows) | `ids`: string[] | write |
| `move` | Move elements by a vector | `ids`: string[]; `by`: [dx,dy] mm | write |
| `set` | Change an element's fields (type, name, height, offset, sill, mark) | `id`: string | write |
| `type` | Add or edit a type (wall, door, window, floor, roof) | `kind`: string; `name`: string | write |
| `schedule` | Schedule of walls, doors, windows, rooms, floors or roofs | `kind`: wall\|door\|window\|room\|floor\|roof<br>e.g. `{"kind":"door"}` | read |
| `export_ifc` | Export the authored model as IFC4 (or re-save the open IFC); returns the file text. discipline: A\|S\|M\|E\|P\|C\|L\|F exports one discipline's model for federation | `discipline`: string? | read |
| `query` | Find authored elements by kind, level or type | `kind`: string?; `level`: string?; `type`: string? | read |

## coord

| Command | What it does | Args | Kind |
|---|---|---|---|
| `federation` | The discipline models this project splits into (one IFC container per task team, ISO 19650 names) with element counts | —<br>e.g. `{}` | read |
| `clash_model` | Clash the authored model headlessly with the geometry kernel: exact intersection volumes between solids, by discipline (A, S, M, E, P, C, L, F), IFC class or id | `a`: discipline\|class\|id\|'all'?; `b`: same?; `min_volume_m3`: number?; `ignore_same_discipline`: boolean?; `ignore_same_class`: boolean?; `limit`: number?<br>e.g. `{"a":"S","b":"A","min_volume_m3":0.01}` | read |
| `federate` | Add another IFC model to the scene (structure, MEP…) so it can be clashed and reviewed together *(needs viewer)* | `url`: string?; `bytes`: Uint8Array?; `name`: string? | view |
| `clash` | Find clashes between sets (model name, IFC class, or 'all'); hard clashes deeper than tolerance, soft within clearance *(needs viewer)* | `a`: string\|string[]?; `b`: string\|string[]?; `tolerance`: m (0.01); `clearance`: m (0); `ignore_same_class`: boolean?<br>e.g. `{"a":"all","tolerance":0.01}` | read |
| `issue` | Create an issue (from a clash, a viewpoint or elements), or update one (id + status/comment) *(needs viewer)* | `title`: string; `clash_index`: number?; `elements`: GlobalId[]?; `viewpoint`: guid?; `priority`: string?; `assigned`: string?; `id`: guid? (update); `status`: string?; `comment`: string?<br>e.g. `{"title":"Duct clashes with beam","clash_index":0}` | write |
| `viewpoint` | Save the current camera, selection and a snapshot as a BCF viewpoint *(needs viewer)* | — | write |
| `bcf_export` | All issues as a BCF 2.1 .bcfzip (base64) *(needs viewer)* | — | read |
| `bcf_import` | Import issues from a BCF 2.1 .bcfzip (base64) *(needs viewer)* | `base64`: string | view |
| `bcf_merge` | Merge parsed BCF topics into the project (the write half of bcf_import) *(needs viewer)* | `topics`: array | write |

## view

| Command | What it does | Args | Kind |
|---|---|---|---|
| `export_gltf` | Export the 3D view as binary glTF (GLB, base64) *(needs viewer)* | — | read |
| `layer_visibility` | Show or hide model layers (C-ROAD, P-SEWER, A-INFILL, …) in the 3D view *(needs viewer)* | `layers`: {name: boolean}<br>e.g. `{"layers":{"A-INFILL":false}}` | view |
| `select` | Select an element by express ID, GlobalId or authored id *(needs viewer)* | `id`: string\|number | view |
| `isolate` | Highlight and frame elements, ghost the rest *(needs viewer)* | `ids`: array | view |
| `section` | Horizontal section height 0..1 (1 = off) *(needs viewer)* | `height`: 0..1 | view |
| `camera` | Fit the view (to elements, or all) *(needs viewer)* | `fit`: ids? | view |
| `render` | PNG of the current view (data URL), max 1600 px *(needs viewer)* | `width`: number? | view |
| `walkthrough` | First-person walk: WASD/arrows to move, drag to look, Q/E up/down, Esc to leave; stops at walls *(needs viewer)* | `on`: boolean; `eye_height`: m?; `speed`: m/s? | view |

## cost

| Command | What it does | Args | Kind |
|---|---|---|---|
| `check_handover` | Run the handover data check on the open IFC, or on the authored model if no IFC is open | — | read |
| `export_issues` | Handover issues as CSV *(needs viewer)* | — | read |
| `export_report` | Handover report as JSON (HTML from the UI) *(needs viewer)* | — | read |
| `quantity` | Counts, areas, volumes, lengths per class *(needs viewer)* | — | read |
| `cost` | Set unit rates on quantities (sample:true loads labelled sample INR rates); first matching rate prices each element | `rates`: [{code, description, match:{ifc_class,type,name,storey}, basis: count\|NetVolume\|NetSideArea\|NetArea\|NetFloorArea\|Area\|Length, unit, rate, factor?}]?; `currency`: ISO?; `mode`: replace\|add?; `sample`: boolean?; `remove`: code[]?<br>e.g. `{"sample":true}` | write |
| `estimate` | Cost estimate: lines (qty × rate), total, unpriced classes; format csv for a spreadsheet | `format`: json\|csv? | read |
| `asset` | Register elements as operational assets (tag, manufacturer, model, serial, installed, warranty, maintenance interval) | `element`: id\|GlobalId?; `elements`: []?; `rule`: {ifc_class,type}?; `tag`: string?; `tag_prefix`: string?; `manufacturer`: string?; `model_number`: string?; `serial`: string?; `installed`: date?; `warranty_years`: number?; `maintenance_days`: number?; `delete`: boolean?<br>e.g. `{"rule":{"ifc_class":"IfcDoor"},"tag_prefix":"DR-","warranty_years":2,"maintenance_days":180}` | write |
| `cobie` | COBie 2.4 handover workbook (.xlsx as base64, or format json): Contact, Facility, Floor, Space, Type, Component, Job… | `format`: xlsx\|json?; `created_by`: email? | read |

## site

| Command | What it does | Args | Kind |
|---|---|---|---|
| `survey_import` | Import survey data as terrain: CSV/XYZ points (E,N,Z), DXF (spot levels, 3D polylines, contours with elevation, 3DFACE), LandXML (TIN or CgPoints), LAS point cloud (ground class), PLY. Map coordinates follow the georeference, or set the site origin | `format`: csv\|xyz\|dxf\|landxml\|las\|ply; `data`: text?; `base64`: binary (LAS/PLY)?; `name`: string?; `merge`: boolean?; `coords`: map\|local?<br>e.g. `{"format":"csv","data":"Easting,Northing,Level\n482150,2047320,512.4\n…"}` | write |
| `site_pin` | Pin the site from a map location (lat/lon, e.g. a Google Maps pin); suggests the UTM CRS | `lat`: deg; `lon`: deg; `label`: string?<br>e.g. `{"lat":18.5204,"lon":73.8567}` | write |
| `site_grade` | Grade a building platform: pad around the footprint (or pad:[[x,y]] mm) at FFL minus plinth, cut/fill batters (H:V) daylighting into the survey; returns cut, fill and net volumes | `pad`: [[x,y],...] mm?; `margin`: mm?; `ffl`: m?; `plinth`: mm?; `cut_slope`: H:V?; `fill_slope`: H:V?<br>e.g. `{"margin":2000,"cut_slope":1,"fill_slope":2}` | write |
| `site_report` | Survey and earthworks summary: sources, extent, levels, contour interval, FFL, cut/fill | —<br>e.g. `{}` | read |
| `site_clear` | Remove the survey and grading | —<br>e.g. `{}` | write |

## geo

| Command | What it does | Args | Kind |
|---|---|---|---|
| `geolocate` | Put the project on the earth from a map pin (Google Maps lat, lon): UTM CRS, IfcMapConversion with grid convergence, true north, time zone, site pin | `lat`: deg; `lon`: deg; `height_m`: m above sea level?; `orient_deg`: building turned anticlockwise from true north?; `timezone`: hours from UTC (standard time)?; `epsg`: EPSG:326xx\|327xx?; `label`: string?<br>e.g. `{"lat":27.175,"lon":78.0421,"height_m":170,"timezone":5.5,"label":"Taj Mahal"}` | write |
| `location` | Where the project is: lat/lon, CRS, anchor, time zone, Google Maps link | — | read |
| `map_context` | Show map context around the located project: OpenStreetMap ground imagery and neighbouring buildings (context only, never exported) *(needs viewer)* | `imagery`: boolean?; `buildings`: boolean?; `radius_m`: m?<br>e.g. `{"imagery":true,"buildings":true,"radius_m":500}` | view |
| `city_plan` | Turn OpenStreetMap data (XML or JSON) around the located project into layered BIMja commands: roads, kerbs, footways, water, landscape, buildings, trees, furniture, indicative utilities (water, sewer, storm, ducts, lighting) and infill. Run the returned layers with script | `osm`: OSM XML or JSON text; `radius_m`: m?; `exclude`: [x0,y0,x1,y1] m?; `infill`: boolean?; `services`: boolean?; `furniture`: boolean?<br>e.g. `{"osm":"<osm>…</osm>","radius_m":800}` | read |
| `crs` | Set the project CRS by EPSG code (proj4 definition optional for codes not built in) *(needs viewer)* | `epsg`: EPSG:xxxx; `proj4`: string?<br>e.g. `{"epsg":"EPSG:32643"}` | write |
| `anchor` | Place the local origin on the map (IfcMapConversion): easting/northing or lat/lon, height, rotation to grid north *(needs viewer)* | `easting`: number?; `northing`: number?; `lat`: number?; `lon`: number?; `height`: m?; `rotation_deg`: number?; `scale`: number?<br>e.g. `{"lat":18.5204,"lon":73.8567,"height":560,"rotation_deg":0}` | write |
| `basemap` | Basemap tiles from a URL you supply (https://…/{z}/{x}/{y}.png) *(needs viewer)* | `url`: string; `attribution`: string? | write |
| `overlay` | Overlay GeoJSON features from a URL or inline (ArcGIS REST: add f=geojson) *(needs viewer)* | `url`: string?; `geojson`: object? | view |
| `sensor` | Add or edit a twin sensor (temperature, humidity, co2, occupancy, energy) with thresholds *(needs viewer)* | `id`: string?; `name`: string?; `kind`: string; `min`: number?; `max`: number?; `element`: GlobalId\|id?<br>e.g. `{"kind":"temperature","name":"Living temp","max":26}` | write |
| `history` | Twin readings kept in this browser (IndexedDB) across reloads: newest N, per sensor, or clear *(needs viewer)* | `sensor`: string?; `last`: number?; `clear`: boolean? | view |
| `bind` | Bind a sensor to an element (GlobalId or authored id) *(needs viewer)* | `sensor`: string; `element`: string | write |
| `feed` | Start the twin feed: simulated (seeded), a WebSocket JSON feed, MQTT over WebSocket (topic bimja/#: JSON {sensor,value} or a number on bimja/<sensor>), or off *(needs viewer)* | `mode`: simulated\|ws\|mqtt\|off; `url`: ws(s)://?; `topic`: string? (mqtt); `username`: string? (mqtt); `password`: string? (mqtt, never logged); `interval_ms`: number?; `seed`: number?<br>e.g. `{"mode":"simulated"}` | view |

## twin

| Command | What it does | Args | Kind |
|---|---|---|---|
| `sun` | The sun at the project's real location for a date and local standard time: azimuth, elevation, direction in project axes, clear-sky DNI, sunrise/sunset | `date`: YYYY-MM-DD?; `time`: HH:MM?; `timezone`: hours?<br>e.g. `{"date":"2026-12-21","time":"09:00"}` | read |
| `solar_study` | Simulate a day of sun on the model at its real location: shadows from its own geometry, sun hours and kWh/m² per facade and element, ground in shadow | `date`: YYYY-MM-DD?; `from`: HH:MM?; `to`: HH:MM?; `step_min`: 5-240?; `res`: 128-1024?; `cloud_cover`: [24 hourly %] from the live forecast?; `full`: boolean?<br>e.g. `{"date":"2026-12-21","step_min":30}` | read |
| `live_data` | Live data at the located site, polled from public keyless sources: weather and wind (Open-Meteo), air quality (Open-Meteo CAMS), earthquakes (USGS); returns the latest readings *(needs viewer)* | `weather`: boolean?; `air`: boolean?; `quakes`: boolean?<br>e.g. `{"weather":true,"air":true,"quakes":true}` | view |

## brief

| Command | What it does | Args | Kind |
|---|---|---|---|
| `project_brief` | Set the project brief: name, client, project type (building, data_centre, excavation, airport, process_plant, institute, infrastructure, heritage), LOD target | `name`: string?; `client`: string?; `type`: string?; `description`: string?; `lod_target`: 100\|200\|300\|350\|400\|500?<br>e.g. `{"name":"Hyderabad DC1","client":"Example Co","type":"data_centre","lod_target":350}` | write |
| `team_assemble` | Assemble the agent team from the project type: one lead per delivery stage (Planner, Surveyor, Architect, Coordinator, Draftsman, Estimator, Asset Manager), the Architect's design team, and the specialists the type needs; add or remove roles | `type`: string?; `add`: [role id]?; `remove`: [role id]?<br>e.g. `{"type":"data_centre","add":["acoustic_consultant"]}` | write |
| `team` | The team: members, their stage, discipline, colour and actor id; with library: all roles, stages and project types | `library`: boolean? | read |
| `responsibility_matrix` | Responsibility matrix (RACI) for the deliverables, from the assembled team | — | read |
| `delivery_status` | Where the delivery stands: each stage not started, in progress or done | — | read |

## handover

| Command | What it does | Args | Kind |
|---|---|---|---|
| `handover_mark` | Record that the asset information has been handed over | `date`: YYYY-MM-DD?; `note`: string?<br>e.g. `{"note":"COBie and O&M issued"}` | write |

## docs

| Command | What it does | Args | Kind |
|---|---|---|---|
| `drawing_setup` | Drawing standard and ISO 19650 fields: standard iso19650-uk \| us-ncs \| is-nbc, project_code, originator, volume, role, project_name, client, address, author/checker/approver, paper (blank = automatic) | `standard`: string?; `project_code`: string?; `originator`: string?; `project_name`: string?; `client`: string?; `paper`: A3\|A2\|A1\|A0\|ARCH D\|ANSI D?; `notes`: {GA\|E\|M\|R: [note...]}? project notes on drafted plans; `sld`: {title, sources, mv, tx, msb, gen, ups, ob, busway, load, note}? typical power block drawn on electrical plans<br>e.g. `{"standard":"iso19650-uk","project_code":"TAJ","originator":"BJA","client":"Demo client"}` | write |
| `sheets_auto` | Create the standard sheet set from the model: register, plans (per level or the model's plan cuts), elevations, sections, schedules | `keep`: boolean?<br>e.g. `{}` | write |
| `sheet` | Add, edit or delete a sheet: {kind: ga\|elec\|mech\|roof\|fire_plan (drafted plans at 1:100)\|block_sld (with block)\|hall_section (with cut {axis,at,look,depth,from,to,name})\|site_plan\|site\|site_section\|plan\|elevations\|sections\|isometric\|schedule\|register\|service\|coordinated\|piping_iso\|spool\|bwic\|plant\|containment\|sld\|whitespace\|equipment\|fire, discipline?, medium?, system?, page?, zone?, level?, cut_z? (mm, plan cut height), scale?, paper?, title?} | `id`: string?; `kind`: string?; `level`: id?; `cut_z`: mm?; `scale`: number?; `paper`: string?; `title`: string?; `delete`: boolean?<br>e.g. `{"kind":"plan","level":"L1","cut_z":1200,"title":"Ground floor plan"}` | write |
| `drawing_pack` | Add a project-type drawing pack (reusable building blocks): independent and coordinated service drawings, piping isometrics, spools, builder's work, plant rooms, containment, single-line diagrams and schematics, whitespace, equipment schedule, fire strategy. pack: building\|data_centre\|process_plant\|airport\|institute\|infrastructure\|excavation\|heritage | `pack`: string; `replace`: boolean?<br>e.g. `{"pack":"data_centre"}` | write |
| `bwic` | Builder's work in connection: every service penetration through a wall or slab, with host, service, opening size and fire rating | —<br>e.g. `{}` | read |
| `spools` | Cut pipe runs into fabrication spools (max length, shop and field welds) with a bill of materials | `max_mm`: mm?; `system`: string?<br>e.g. `{}` | read |
| `drawing` | Render one sheet as SVG (preview), PDF (base64) or DXF (text) | `sheet`: id; `format`: svg\|pdf\|dxf<br>e.g. `{"sheet":"D2","format":"svg"}` | read |
| `publish` | Issue sheets with an ISO 19650 status (S0–S4, A1–A5, B1, CR): bumps revisions (P01… / C01…), updates the register, returns a zip of the PDF set, one PDF and DXF per container, and the XLSX register + schedules | `status`: S0\|S1\|S2\|S3\|S4\|A1…\|B1\|CR; `sheets`: id[]?; `date`: YYYY-MM-DD; `note`: string?; `formats`: pdf\|dxf\|xlsx[]?<br>e.g. `{"status":"S2","date":"2026-11-21"}` | write |
| `register` | The drawing register: sheets, container names and every issue (status, revision, date) | —<br>e.g. `{}` | read |

## time

| Command | What it does | Args | Kind |
|---|---|---|---|
| `activity` | Add or edit a schedule activity (dates YYYY-MM-DD; type construct\|demolish\|temporary; after = finish-to-start predecessor) | `id`: string?; `name`: string; `start`: date; `finish`: date?; `duration_days`: number?; `type`: string?; `after`: id\|id[]?; `link_type`: FS\|SS\|FF\|SF?; `delete`: boolean?<br>e.g. `{"name":"Ground floor walls","start":"2026-02-02","duration_days":15}` | write |
| `link` | Link elements to an activity by id/GlobalId or by rule {kind, level, ifc_class, storey} | `activity`: id; `elements`: string[]?; `rule`: object?; `mode`: add\|replace\|remove?<br>e.g. `{"activity":"A01","rule":{"kind":"wall","level":"L1"}}` | write |
| `schedule_import` | Import a Primavera P6 XML or MS Project XML (MSPDI) schedule | `xml`: string; `format`: p6\|mspdi\|auto?; `merge`: boolean?<br>e.g. `{"format":"auto","xml":"<APIBusinessObjects>…"}` | write |
| `auto_sequence` | Build a construction sequence from the authored model: per level slab → walls → openings → fit-out, then roof; free-form solids by site works and rise (structure, then envelope); a finish date scales the programme to fit | `start`: date?; `finish`: date?; `keep`: boolean?<br>e.g. `{"start":"2026-01-05"}` | write |
| `timeline` | Show the model at a date: built, active (orange), hidden, existing, removed; returns counts and a state hash | `date`: date?<br>e.g. `{"date":"2026-02-15"}` | view |
| `animate` | Step through the schedule (from, to, step_days) and return each frame's state hash; play:true animates the view | `from`: date?; `to`: date?; `step_days`: number?; `play`: boolean?<br>e.g. `{"step_days":7}` | view |
