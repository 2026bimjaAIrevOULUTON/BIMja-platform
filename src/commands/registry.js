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
  c("query", "author", "Find authored elements by kind, level or type", { kind: "read", args: { kind: "string?", level: "string?", type: "string?" } }),

  // checks & quantities on the open IFC
  c("check_handover", "cost", "Run the handover data check on the open IFC", { kind: "read", ui_path: "#runCheck", needs: "viewer" }),
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

  // coordination (M4)
  ...["federate", "clash", "issue", "viewpoint", "bcf_import", "bcf_export"].map((n) => stub(n, "coord", `Coordination: ${n.replace("_", " ")}`, "M4")),
  // time (M6)
  ...["activity", "link", "schedule_import", "timeline", "animate"].map((n) => stub(n, "time", `4D: ${n.replace("_", " ")}`, "M6")),
  // geo + twin (M5)
  ...["crs", "anchor", "basemap", "sensor", "bind", "feed"].map((n) => stub(n, "geo", `Geo/twin: ${n}`, "M5")),
];

export const byName = Object.fromEntries(REGISTRY.map((r) => [r.name, r]));
export const commandsSummary = () => REGISTRY.map(({ name, domain, status, help, args, example, refusals, ui_path, headless_only }) => ({ name, domain, status, help, args, example, refusals, ui_path: ui_path || null, headless_only: headless_only || null }));
