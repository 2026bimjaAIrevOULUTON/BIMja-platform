// Drawing packs: every building block composes to SVG, PDF and DXF from the services sample; the engineering in each
// is checked against the model (penetrations, spool lengths, connections, clashes, aisles).
import assert from "node:assert/strict";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { SAMPLE_SERVICES } from "../src/app/sample-services.js";
import { pipeLines, spools, PACKS } from "../src/docs/services.js";

await (await import("../src/author/kernel.js")).loadKernel();
const L = installCore(new Bus());
const ex = (name, args, actor = "human") => L.execute({ name, args, actor, apply: true });
const rd = (name, args = {}) => L.execute({ name, args, actor: "human" });

let r = ex("script", { commands: SAMPLE_SERVICES });
assert.ok(r.ok, "sample builds: " + JSON.stringify(r.refusals));
const m = L.model.data;
assert.equal(m.connections.length, 11, "connections recorded");

// connect refuses unknown ends and media
assert.equal(ex("connect", { from: "nope", to: "MSB-01", medium: "power" }).ok, false);
assert.equal(ex("connect", { from: m.connections[0].from, to: m.connections[0].to, medium: "lava" }).ok, false);

// builder's work: the fire wall is crossed by both chilled water pipes and the cable tray, nothing else
const bw = rd("bwic"); assert.ok(bw.ok);
const holes = bw.data.openings; assert.equal(holes.length, 3, "three penetrations");
assert.ok(holes.every((o) => /Fire wall/.test(o.host)), "all through the fire wall");
assert.deepEqual(holes.map((o) => o.service).sort(), ["CHW flow", "CHW return", "Cable tray 600"]);

// spools: every piece within 6 m; pieces of a line sum to its length
const sp = spools(L.model);
for (const s of sp) assert.ok(s.cuts.reduce((a, b) => a + b, 0) <= 6001, `${s.id} longer than 6 m`);
for (const l of pipeLines(L.model)) {
  const sum = sp.filter((s) => s.line === l.line).reduce((t, s) => t + s.cuts.reduce((a, b) => a + b, 0), 0);
  assert.ok(Math.abs(sum - l.length_mm) <= 10, `${l.line}: spools ${sum} vs line ${Math.round(l.length_mm)}`);
}
assert.ok(rd("spools").ok);

// the data centre pack: one sheet per building block that has content, each renders in every format
ex("drawing_setup", { project_code: "DC1" });
r = ex("drawing_pack", { pack: "data_centre" }); assert.ok(r.ok);
const kinds = new Set(r.data.added.map((s) => s.kind));
for (const k of PACKS.data_centre) assert.ok(kinds.has(k), `pack has ${k}`);
assert.equal(ex("drawing_pack", { pack: "spaceport" }).ok, false, "unknown pack refused");
const before = L.extra.docs.sheets.length; ex("drawing_pack", { pack: "data_centre" }); assert.equal(L.extra.docs.sheets.length, before, "re-running a pack refreshes its sheets, no duplicates");
const kept = L.extra.docs.sheets.map((s) => s.id);

const svgOf = {};
for (const s of L.extra.docs.sheets.filter((x) => kinds.has(x.kind) && kept.includes(x.id))) {
  for (const format of ["svg", "pdf", "dxf"]) { const d = rd("drawing", { sheet: s.id, format }); assert.ok(d.ok, `${s.kind} ${format}: ${JSON.stringify(d.refusals)}`); if (format === "svg") svgOf[s.title] = d.data.svg; if (format === "dxf") assert.match(d.data.dxf, /EOF\s*$/); }
}
assert.match(svgOf["Coordinated services"], /C1/, "the duct/pipe clash is ringed");
assert.match(svgOf["Coordinated services"], /Supply air duct/, "clash table names the duct");
assert.match(svgOf["Single-line diagram"], /TX-01/); assert.match(svgOf["Single-line diagram"], /PDU-B/);
assert.match(svgOf["Chilled water schematic"], /CRAH-03/);
assert.match(svgOf["Whitespace layout"], /COLD AISLE/); assert.match(svgOf["Whitespace layout"], /HOT AISLE/); assert.match(svgOf["Whitespace layout"], /336/, "42 racks × 8 kW");
assert.match(svgOf["Builder's work in connection"], /BW-003/);
assert.match(svgOf["Fire strategy"], /120/, "fire wall rating shown");
assert.match(svgOf["Equipment schedule"], /UPS-01/);

// numbering follows the discipline of each sheet
const reg = rd("register").data.sheets; const num = (t) => reg.find((s) => s.title === t)?.container || "";
assert.match(num("Electrical services"), /-E-5202$/); assert.match(num("Fire strategy"), /-F-7001$/); assert.match(num("Single-line diagram"), /-E-6201$/);

// IFC carries system and parameters
const ifc = rd("export_ifc", {}); if (ifc.ok) { const t = ifc.data.text || ifc.data.ifc || ""; if (t) { assert.match(t, /'CHW-F-01'/); assert.match(t, /BIMja_Parameters/); } }

// as-built re-issue
const pub = ex("publish", { status: "CR", date: "2026-11-22", note: "As-built", formats: ["pdf"] }); assert.ok(pub.ok, JSON.stringify(pub.refusals));
console.log(`packs OK: ${r.data.added.length} sheets, ${holes.length} penetrations, ${sp.length} spools`);
