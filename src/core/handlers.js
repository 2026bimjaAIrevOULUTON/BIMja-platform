// Core handlers: authoring (the Model), session control. Viewer/IFC handlers are added by the app (src/main.js),
// coordination/time/geo/cost by their modules. Everything here also runs headless in Node for the MCP server.
import { REGISTRY } from "../commands/registry.js";
import { COMMANDS as MODEL_COMMANDS } from "../author/model.js";
import { exportIFC } from "../author/ifc-export.js";
import { authoredRecords } from "../author/records.js";
import { runCheck } from "../rules.js";
import { installTime } from "../time/commands.js";
import { installCost } from "../cost/commands.js";
import { installDocs } from "../docs/commands.js";
import { installGeo } from "../geo/commands.js";
import { installSimTwin } from "../twin/commands.js";
import { clashModel } from "../coord/model-clash.js";
import { installSite, siteForIfc } from "../site/commands.js";

const AUTHOR = ["level", "wall", "walls", "door", "window", "floor", "room", "roof", "mass", "revolve", "sweep", "boolean", "opening", "array", "family", "place", "delete", "move", "set", "type"];

export function installCore(bus) {
  const m = () => bus.model;
  for (const r of REGISTRY.filter((x) => x.status === "stub")) bus.register(r.name, () => { throw Object.assign(new Error(`${r.name} is not implemented yet (${r.milestone})`), { code: "not_implemented" }); }, { kind: "read" });
  for (const name of AUTHOR) bus.register(name, (args) => { const r = m().execute({ cmd: name, ...args }, { record: false }); delete r.ok; return r; });
  bus.register("schedule", (args) => MODEL_COMMANDS.schedule.run(m(), { kind: args.kind || "wall" }).rows, { kind: "read" });
  bus.register("query", (args) => MODEL_COMMANDS.query.run(m(), args).elements, { kind: "read" });

  // one undo step, all or nothing (atomic) — an agent's batch
  bus.register("script", (args) => {
    const results = []; const list = args.commands || []; const refs = {}; // a step tagged {as:"arcade"} is referred to later as "$arcade" (its id)
    const resolve = (v) => typeof v === "string" && /^\$[A-Za-z_][\w-]*$/.test(v) ? (refs[v.slice(1)] ?? (() => { const e = new Error(`unknown reference ${v}`); e.code = "bad_arg"; throw e; })()) : Array.isArray(v) ? v.map(resolve) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])) : v;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]; const h = bus.handlers.get(c.name);
      if (!h || h.kind !== "write" || c.name === "script") { const e = new Error(`step ${i}: "${c.name}" cannot run in a script`); e.code = "bad_arg"; throw e; }
      try { const data = h.run(resolve(c.args || {}), c, bus); results.push({ name: c.name, ok: true, data }); if (c.as) refs[c.as] = data?.id ?? data?.family ?? null; }
      catch (e) { if (args.atomic !== false) { e.message = `step ${i} (${c.name}): ${e.message}`; throw e; } results.push({ name: c.name, ok: false, error: e.message, code: e.code }); }
    }
    return { steps: results.length, results };
  });

  bus.register("commands", () => REGISTRY.map(({ name, domain, status, ui_path, headless_only, args, example, refusals, help }) => ({ name, domain, status, help, args, example, refusals, ui_path: ui_path || null, headless_only: headless_only || null })), { kind: "read" });
  bus.register("describe", () => describeModel(bus), { kind: "read" });
  bus.register("export_ifc", () => exportIFC(bus.model, { geo: bus.extra.geo, site: siteForIfc(bus) }), { kind: "read" });
  bus.register("check_handover", (args) => runCheck(authoredRecords(bus.model), args.rules), { kind: "read" }); // the app overrides this when an IFC is open
  bus.register("save", () => bus.saveProject(), { kind: "read" });
  bus.register("log", (args) => bus.log.slice(-(args.last || 200)), { kind: "read" });
  bus.register("proposals", () => [...bus.proposals.values()].map(({ id, cmd, diff, expires }) => ({ id, name: cmd.name, args: cmd.args, actor: cmd.actor, diff, expires })), { kind: "read" });
  bus.register("apply_proposal", (args, cmd) => { if (cmd.actor.startsWith("agent")) throw Object.assign(new Error("only a person applies proposals"), { code: "bad_arg" }); return bus.applyProposal(args.id, cmd.actor); }, { kind: "control" });
  bus.register("reject_proposal", (args) => ({ rejected: bus.rejectProposal(args.id) }), { kind: "control" });
  bus.register("undo", () => ({ undone: bus.undo() }), { kind: "control" });
  bus.register("redo", () => ({ redone: bus.redo() }), { kind: "control" });
  bus.register("pause_agents", (args, cmd) => { if (cmd.actor.startsWith("agent")) throw Object.assign(new Error("agents cannot pause or resume themselves"), { code: "bad_arg" }); return { paused: bus.pause(args.paused) }; }, { kind: "control" });
  bus.register("load_project", (args) => {
    const p = args.project; if (p?.format !== "bimja-project") throw Object.assign(new Error("not a BIMja project (.bimja.json)"), { code: "bad_arg" });
    bus.model.data = JSON.parse(JSON.stringify(p.model)); bus.extra = JSON.parse(JSON.stringify(p.extra || {})); return { loaded: true, elements: Object.keys(p.model.elements).length };
  });
  installTime(bus);
  installCost(bus);
  installDocs(bus);
  installGeo(bus);
  installSimTwin(bus);
  bus.register("clash_model", (a) => { const r = clashModel(bus.model, { a: a.a ?? "all", b: a.b ?? "all", min_volume_m3: a.min_volume_m3 ?? 0.001, ignore_same_discipline: !!a.ignore_same_discipline, ignore_same_class: !!a.ignore_same_class, limit: Math.min(2000, +a.limit || 200) }); bus.lastModelClash = r; return r; }, { kind: "read" });
  installSite(bus);
  return bus;
}

export function describeModel(bus) {
  const md = bus.model.data; const counts = {};
  for (const e of Object.values(md.elements)) counts[e.kind] = (counts[e.kind] || 0) + 1;
  let min = [Infinity, Infinity], max = [-Infinity, -Infinity];
  for (const e of Object.values(md.elements)) for (const p of e.boundary || (e.a ? [e.a, e.b] : [])) { min = [Math.min(min[0], p[0]), Math.min(min[1], p[1])]; max = [Math.max(max[0], p[0]), Math.max(max[1], p[1])]; }
  return { rev: bus.rev, authored: { name: md.name, units: md.units, levels: md.levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation })), counts, bbox_mm: Number.isFinite(min[0]) ? { min, max } : null },
    paused: bus.paused, proposals: bus.proposals.size, crs: bus.extra.geo?.crs || null,
    schedule: bus.extra.time ? { activities: Object.keys(bus.extra.time.activities).length, links: bus.extra.time.links.length } : null };
}
