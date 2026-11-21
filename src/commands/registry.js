// The command registry: one entry per capability, the same for people (UI), agents (window.bimja, MCP) and replays.
// It drives the parity test, `commands`, the command palette and the MCP tool list. Keep it complete, accurate, cheap.
//   status:  "live" implemented · "stub" registered so agents see the surface; refuses with not_implemented
//   ui_path: selector of the control that emits it ("#palette" = the command palette, reachable by keyboard: Ctrl/⌘+K)
//   needs:   "viewer" when it needs the browser 3D view (not available headless)
const W = ["bad_arg", "stale_rev", "locked", "paused"]; // refusals every write can return

const c = (name, domain, help, o = {}) => ({ name, domain, help, status: "live", args: {}, refusals: o.kind === "read" ? ["bad_arg"] : W, ui_path: "#palette", ...o });
const stub = (name, domain, help, milestone) => ({ name, domain, help: `${help} (arrives in ${milestone})`, status: "stub", args: {}, refusals: ["not_implemented"], milestone });

export const REGISTRY = [
  // session
  c("commands", "session", "List every command with args, refusals and where it lives in the UI", { kind: "read", ui_path: "#paletteBtn" }),
  c("describe", "session", "Model summary: counts, storeys, classes, issues, bbox, CRS", { kind: "read", ui_path: "#meta" }),
  c("load", "session", "Open an IFC model from a URL or bytes", { args: { url: "string" }, example: { url: "models/AC20-FZK-Haus.ifc.txt" }, ui_path: "#file", needs: "viewer" }),
  c("save", "session", "The whole project (model, coordination, schedule, twin, log) as JSON", { kind: "read", ui_path: "#saveProject" }),
  c("load_project", "session", "Open a saved .bimja.json project", { args: { project: "object" }, ui_path: "#openProject" }),
  c("undo", "session", "Undo the last change (an agent's whole run is one step)", { kind: "control", ui_path: "#undo" }),
  c("redo", "session", "Redo", { kind: "control", ui_path: "#redo" }),
  c("pause_agents", "session", "Pause or resume agents; their changes queue as proposals", { kind: "control", args: { paused: "boolean?" }, ui_path: "#pauseAgents" }),
  c("script", "session", "Run many commands as one step; atomic by default", { args: { commands: "[{name,args}]", atomic: "boolean?" }, example: { commands: [{ name: "wall", args: { start: [0, 0], end: [5000, 0] } }] } }),
  c("log", "session", "The command log: who did what, in order", { kind: "read", args: { last: "number?" }, ui_path: "#logTab" }),
  c("proposals", "session", "Pending agent proposals", { kind: "read", ui_path: "#logTab" }),
  c("apply_proposal", "session", "Apply an agent's proposal (people only)", { kind: "control", args: { id: "string" }, ui_path: "#logTab" }),
  c("reject_proposal", "session", "Reject an agent's proposal", { kind: "control", args: { id: "string" }, ui_path: "#logTab" }),

  // author (millimetres)
  c("level", "author", "Add a level", { args: { name: "string", elevation: "mm" }, example: { name: "Level 3", elevation: 6000 } }),
  c("wall", "author", "Add a wall between two points", { args: { start: "[x,y] mm", end: "[x,y] mm", level: "id?", type: "string?", height: "mm?" }, example: { start: [0, 0], end: [6000, 0] }, refusals: [...W], ui_path: "#toolWall" }),
  c("walls", "author", "Add a chain of walls (closed for a room outline)", { args: { points: "[[x,y],...]", closed: "boolean?", type: "string?" }, example: { points: [[0, 0], [8000, 0], [8000, 6000], [0, 6000]], closed: true }, ui_path: "#toolWall" }),
  c("door", "author", "Add a door hosted in a wall", { args: { wall: "id", offset: "mm", at: "[x,y]?", type: "string?" }, example: { at: [2000, 0] }, refusals: [...W, "out_of_bounds", "would_overlap", "no_such_element"], ui_path: "#toolDoor" }),
  c("window", "author", "Add a window hosted in a wall", { args: { wall: "id", offset: "mm", at: "[x,y]?", type: "string?", sill: "mm?" }, example: { at: [5000, 0] }, refusals: [...W, "out_of_bounds", "would_overlap", "no_such_element"], ui_path: "#toolWindow" }),
  c("floor", "author", "Add a floor from a boundary or the walls' outline", { args: { boundary: "[[x,y],...]?", from_walls: "boolean?", level: "id?" }, example: { from_walls: true }, ui_path: "#toolFloor" }),
  c("room", "author", "Add a room at a point inside walls", { args: { name: "string", at: "[x,y]", number: "string?" }, example: { name: "Office", at: [2000, 2000] }, refusals: [...W, "would_overlap"], ui_path: "#toolRoom" }),
  c("roof", "author", "Add a flat roof over the walls", { args: { level: "id?", overhang: "mm?" }, example: { level: "L2", overhang: 300 }, ui_path: "#toolRoof" }),
  c("delete", "author", "Delete elements (a wall takes its doors and windows)", { args: { ids: "string[]" }, refusals: [...W, "no_such_element"], ui_path: "#deleteSel" }),
  c("move", "author", "Move elements by a vector", { args: { ids: "string[]", by: "[dx,dy] mm" }, refusals: [...W, "no_such_element", "out_of_bounds", "would_overlap"] }),
  c("set", "author", "Change an element's fields (type, name, height, offset, sill, mark)", { args: { id: "string" }, refusals: [...W, "no_such_element"], ui_path: "#props" }),
  c("type", "author", "Add or edit a type (wall, door, window, floor, roof)", { args: { kind: "string", name: "string" } }),
  c("schedule", "author", "Schedule of walls, doors, windows, rooms, floors or roofs", { kind: "read", args: { kind: "wall|door|window|room|floor|roof" }, example: { kind: "door" }, ui_path: "#scheduleKind" }),
  c("export_ifc", "author", "Export the authored model as IFC4 (or re-save the open IFC); returns the file text", { kind: "read", ui_path: "#exportIfc" }),
  c("export_gltf", "view", "Export the 3D view as binary glTF (GLB, base64)", { kind: "read", ui_path: "#exportGlb", needs: "viewer" }),
  c("query", "author", "Find authored elements by kind, level or type", { kind: "read", args: { kind: "string?", level: "string?", type: "string?" } }),

  // checks & quantities on the open IFC
  c("check_handover", "cost", "Run the handover data check on the open IFC, or on the authored model if no IFC is open", { kind: "read", ui_path: "#runCheck" }),
  c("export_issues", "cost", "Handover issues as CSV", { kind: "read", ui_path: "#csvIssues", needs: "viewer" }),
  c("export_report", "cost", "Handover report as JSON (HTML from the UI)", { kind: "read", ui_path: "#jsonReport", needs: "viewer" }),
  c("quantity", "cost", "Counts, areas, volumes, lengths per class", { kind: "read", ui_path: "#csvQto", needs: "viewer" }),
  stub("cost", "cost", "Apply unit rates to quantities", "M7"), stub("asset", "cost", "Register assets for operations", "M7"), stub("cobie", "cost", "Export COBie", "M7"),

  // view
  c("select", "view", "Select an element by express ID, GlobalId or authored id", { kind: "view", args: { id: "string|number" }, ui_path: "#tree", needs: "viewer" }),
  c("isolate", "view", "Highlight and frame elements, ghost the rest", { kind: "view", args: { ids: "array" }, ui_path: "#rules", needs: "viewer" }),
  c("section", "view", "Horizontal section height 0..1 (1 = off)", { kind: "view", args: { height: "0..1" }, ui_path: "#section", needs: "viewer" }),
  c("camera", "view", "Fit the view (to elements, or all)", { kind: "view", args: { fit: "ids?" }, ui_path: "#fit", needs: "viewer" }),
  c("render", "view", "PNG of the current view (data URL), max 1600 px", { kind: "view", args: { width: "number?" }, ui_path: "#shot", needs: "viewer" }),

  // coordination
  c("federate", "coord", "Add another IFC model to the scene (structure, MEP…) so it can be clashed and reviewed together", { kind: "view", args: { url: "string?", bytes: "Uint8Array?", name: "string?" }, ui_path: "#fedFile", needs: "viewer" }),
  c("clash", "coord", "Find clashes between sets (model name, IFC class, or 'all'); hard clashes deeper than tolerance, soft within clearance", { kind: "read", args: { a: "string|string[]?", b: "string|string[]?", tolerance: "m (0.01)", clearance: "m (0)", ignore_same_class: "boolean?" }, example: { a: "all", tolerance: 0.01 }, ui_path: "#runClash", needs: "viewer" }),
  c("issue", "coord", "Create an issue (from a clash, a viewpoint or elements), or update one (id + status/comment)", { args: { title: "string", clash_index: "number?", elements: "GlobalId[]?", viewpoint: "guid?", priority: "string?", assigned: "string?", id: "guid? (update)", status: "string?", comment: "string?" }, example: { title: "Duct clashes with beam", clash_index: 0 }, refusals: [...W, "no_such_element"], ui_path: "#issueList", needs: "viewer" }),
  c("viewpoint", "coord", "Save the current camera, selection and a snapshot as a BCF viewpoint", { ui_path: "#saveViewpoint", needs: "viewer" }),
  c("bcf_export", "coord", "All issues as a BCF 2.1 .bcfzip (base64)", { kind: "read", ui_path: "#bcfExport", needs: "viewer" }),
  c("bcf_import", "coord", "Import issues from a BCF 2.1 .bcfzip (base64)", { kind: "view", args: { base64: "string" }, ui_path: "#bcfFile", needs: "viewer" }),
  c("bcf_merge", "coord", "Merge parsed BCF topics into the project (the write half of bcf_import)", { args: { topics: "array" }, headless_only: "Internal write step of bcf_import, which is the UI control; kept separate so imports are logged, attributed and undoable", needs: "viewer" }),
  // time (M6)
  c("activity", "time", "Add or edit a schedule activity (dates YYYY-MM-DD; type construct|demolish|temporary; after = finish-to-start predecessor)", { args: { id: "string?", name: "string", start: "date", finish: "date?", duration_days: "number?", type: "string?", after: "id|id[]?", link_type: "FS|SS|FF|SF?", delete: "boolean?" }, example: { name: "Ground floor walls", start: "2026-02-02", duration_days: 15 }, refusals: [...W, "no_such_element"], ui_path: "#actAdd" }),
  c("link", "time", "Link elements to an activity by id/GlobalId or by rule {kind, level, ifc_class, storey}", { args: { activity: "id", elements: "string[]?", rule: "object?", mode: "add|replace|remove?" }, example: { activity: "A01", rule: { kind: "wall", level: "L1" } }, refusals: [...W, "no_such_element"], ui_path: "#linkSel" }),
  c("schedule_import", "time", "Import a Primavera P6 XML or MS Project XML (MSPDI) schedule", { args: { xml: "string", format: "p6|mspdi|auto?", merge: "boolean?" }, example: { format: "auto", xml: "<APIBusinessObjects>…" }, ui_path: "#schedFile" }),
  c("auto_sequence", "time", "Build a construction sequence from the authored model: per level slab → walls → openings → fit-out, then roof", { args: { start: "date?", keep: "boolean?" }, example: { start: "2026-01-05" }, ui_path: "#auto4d" }),
  c("timeline", "time", "Show the model at a date: built, active (orange), hidden, existing, removed; returns counts and a state hash", { kind: "view", args: { date: "date?" }, example: { date: "2026-02-15" }, ui_path: "#timeSlider" }),
  c("animate", "time", "Step through the schedule (from, to, step_days) and return each frame's state hash; play:true animates the view", { kind: "view", args: { from: "date?", to: "date?", step_days: "number?", play: "boolean?" }, example: { step_days: 7 }, ui_path: "#playTime" }),
  // geo + twin
  c("crs", "geo", "Set the project CRS by EPSG code (proj4 definition optional for codes not built in)", { args: { epsg: "EPSG:xxxx", proj4: "string?" }, example: { epsg: "EPSG:32643" }, ui_path: "#setCrs", needs: "viewer" }),
  c("anchor", "geo", "Place the local origin on the map (IfcMapConversion): easting/northing or lat/lon, height, rotation to grid north", { args: { easting: "number?", northing: "number?", lat: "number?", lon: "number?", height: "m?", rotation_deg: "number?", scale: "number?" }, example: { lat: 18.5204, lon: 73.8567, height: 560, rotation_deg: 0 }, ui_path: "#setAnchor", needs: "viewer" }),
  c("basemap", "geo", "Basemap tiles from a URL you supply (https://…/{z}/{x}/{y}.png)", { args: { url: "string", attribution: "string?" }, ui_path: "#setBasemap", needs: "viewer" }),
  c("overlay", "geo", "Overlay GeoJSON features from a URL or inline (ArcGIS REST: add f=geojson)", { kind: "view", args: { url: "string?", geojson: "object?" }, ui_path: "#addOverlay", needs: "viewer" }),
  c("sensor", "geo", "Add or edit a twin sensor (temperature, humidity, co2, occupancy, energy) with thresholds", { args: { id: "string?", name: "string?", kind: "string", min: "number?", max: "number?", element: "GlobalId|id?" }, example: { kind: "temperature", name: "Living temp", max: 26 }, ui_path: "#addSensor", needs: "viewer" }),
  c("bind", "geo", "Bind a sensor to an element (GlobalId or authored id)", { args: { sensor: "string", element: "string" }, refusals: [...W, "no_such_element"], ui_path: "#sensorList", needs: "viewer" }),
  c("feed", "geo", "Start the twin feed: simulated (seeded), a WebSocket JSON feed, or off", { kind: "view", args: { mode: "simulated|ws|off", url: "ws(s)://?", interval_ms: "number?", seed: "number?" }, example: { mode: "simulated" }, ui_path: "#feedSim", needs: "viewer" }),
];

export const byName = Object.fromEntries(REGISTRY.map((r) => [r.name, r]));
export const commandsSummary = () => REGISTRY.map(({ name, domain, status, help, args, example, refusals, ui_path, headless_only }) => ({ name, domain, status, help, args, example, refusals, ui_path: ui_path || null, headless_only: headless_only || null }));
