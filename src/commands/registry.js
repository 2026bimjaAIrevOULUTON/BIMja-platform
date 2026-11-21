// The command registry: one entry per capability. It drives the parity test (every live command must be reachable
// from the UI, or say why not), window.bimja.commands(), and later the MCP tool list. Keep it complete and cheap.
//   status: "live"  implemented and reachable
//           "spec"  behaviour exists as a tested spec (src/author) but is not wired to UI/agents yet (M1)
//           "stub"  registered so agents can see the surface; returns {ok:false, refusals:["not_implemented"]}
//   ui_path: CSS selector of the control that emits this command (the parity test checks it exists in index.html)
//   headless_only: a written reason, when a command has no UI control on purpose

export const REGISTRY = [
  // session
  { name: "commands", domain: "session", status: "live", headless_only: "Lists the command surface for agents; people see it in the command palette (M1)", args: {} },
  { name: "describe", domain: "session", status: "live", ui_path: "#meta", args: {} },
  { name: "load", domain: "session", status: "live", ui_path: "#file", args: { url: "string?", bytes: "ArrayBuffer?", name: "string?" } },
  { name: "save", domain: "session", status: "stub", args: {} },
  { name: "undo", domain: "session", status: "spec", args: {} },
  { name: "redo", domain: "session", status: "spec", args: {} },
  { name: "pause_agents", domain: "session", status: "stub", args: {} },
  { name: "script", domain: "session", status: "spec", args: { commands: "Command[]", atomic: "boolean?", dry_run: "boolean?" } },

  // author (behaviour specified and tested in src/author/model.js; UI arrives in M1/M3)
  ...["level", "wall", "walls", "door", "window", "floor", "room", "roof", "delete", "move", "set", "type", "schedule"].map((name) => ({ name, domain: "author", status: "spec", args: {} })),

  // check / quantities (live today)
  { name: "check_handover", domain: "cost", status: "live", ui_path: "#runCheck", args: { rules: "RuleSet?" } },
  { name: "export_issues", domain: "cost", status: "live", ui_path: "#csvIssues", args: { format: "csv" } },
  { name: "export_report", domain: "cost", status: "live", ui_path: "#jsonReport", args: { format: "json|html" } },
  { name: "quantity", domain: "cost", status: "live", ui_path: "#csvQto", args: {} },
  { name: "cost", domain: "cost", status: "stub", args: {} },
  { name: "asset", domain: "cost", status: "stub", args: {} },
  { name: "cobie", domain: "cost", status: "stub", args: {} },

  // view
  { name: "select", domain: "view", status: "live", ui_path: "#tree", args: { id: "number|GlobalId" } },
  { name: "isolate", domain: "view", status: "live", ui_path: "#rules", args: { ids: "number[]" } },
  { name: "section", domain: "view", status: "live", ui_path: "#section", args: { height: "0..1" } },
  { name: "camera", domain: "view", status: "live", ui_path: "#fit", args: { fit: "ids?" } },
  { name: "render", domain: "view", status: "live", ui_path: "#shot", args: { width: "number?" } },

  // coordination (M4)
  ...["federate", "clash", "issue", "viewpoint", "bcf_import", "bcf_export"].map((name) => ({ name, domain: "coord", status: "stub", args: {} })),
  // time (M6)
  ...["activity", "link", "schedule_import", "timeline", "animate"].map((name) => ({ name, domain: "time", status: "stub", args: {} })),
  // geo + twin (M5)
  ...["crs", "anchor", "basemap", "sensor", "bind", "feed"].map((name) => ({ name, domain: "geo", status: "stub", args: {} })),
];

export const commandsSummary = () => REGISTRY.map(({ name, domain, status, ui_path, headless_only, args }) => ({ name, domain, status, ui_path: ui_path || null, headless_only: headless_only || null, args }));
