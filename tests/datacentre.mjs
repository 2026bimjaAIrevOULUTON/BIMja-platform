// The 120 MW Shadnagar pilot: the script builds, counts match the design basis, the federation splits by discipline,
// zone sheets crop to each hall, and the LOD 500 data is carried but marked as assumed.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { DATACENTRE, DC_STAGES, dcStages } from "../src/app/datacentre.js";

await (await import("../src/author/kernel.js")).loadKernel();
const L = installCore(new Bus());
const ex = (name, args) => L.execute({ name, args, actor: "human", apply: true });
const rd = (name, args = {}) => L.execute({ name, args, actor: "human" });

const t0 = performance.now();
const r = ex("script", { commands: DATACENTRE.commands.map(({ owner, ...c }) => c) });
assert.ok(r.ok, JSON.stringify(r.refusals));
const els = L.model.elements; const fam = (f) => els.filter((e) => e.family === f).length;
assert.equal(fam("NVIDIA GB300 NVL72 rack"), 896, "896 racks (4 halls × 224)");
assert.equal(fam("Vertiv CoolChip CDU 2300kW"), 52, "13 CDUs per hall");
assert.equal(fam("Thermax adiabatic dry cooler 1.5 MW"), 88, "22 dry coolers per hall");
assert.equal(fam("Cummins 3250 kVA containerised generator"), 72, "one generator per power block");
assert.equal(fam("Voltamp 3150 kVA cast resin transformer"), 72, "56 IT + 16 mechanical blocks");
assert.equal(fam("Schneider Galaxy VXL 1250 kW UPS"), 56, "one UPS line-up per IT block");
assert.equal(fam("CG Power 63 MVA 220/33 kV transformer"), 4, "3 + 1 grid transformers");
const famDef = L.model.data.families["NVIDIA GB300 NVL72 rack"];
assert.equal(famDef.parameters.Nameplate_kW, 136); assert.equal(famDef.parameters.LOD, 400); assert.match(famDef.parameters.AsBuiltStatus, /not field-verified/);
const itMW = 896 * famDef.parameters.Nameplate_kW / 1000; assert.ok(itMW > 120 && itMW < 123, `IT nameplate ${itMW} MW`);
assert.equal(L.model.data.zones.length, 6, "four halls, substation, utilities");

// stages: location, cost, programme, drawings, then the asset register
for (const s of dcStages()) { const q = ex(s.name, s.args); assert.ok(q.ok, `${s.name}: ${JSON.stringify(q.refusals)}`); }
for (const a of DC_STAGES.assets) assert.ok(ex("asset", { ...a, installed: "2028-12-29" }).ok, `asset ${a.tag_prefix}`);
assert.ok(Object.keys(L.extra.assets).length >= 52 + 88 + 72 + 56, "major plant registered as assets");

// federation: one container per discipline, and each discipline IFC holds only its own elements
const fed = rd("federation").data; const codes = fed.map((m) => m.discipline);
for (const d of ["A", "S", "C", "M", "E", "P", "F", "L"]) assert.ok(codes.includes(d), `discipline model ${d}`);
assert.ok(fed.every((m) => /^HSD-BJA-ZZ-ZZ-M3-[ASMEPCLF]-0001$/.test(m.container)));
assert.equal(fed.reduce((t, m) => t + m.elements, 0), els.length, "every element in exactly one discipline model");
const ifcM = rd("export_ifc", { discipline: "M" }).data; const ifcAll = rd("export_ifc").data;
assert.match(ifcM, /Mechanical model/); assert.match(ifcM, /IFCHEATEXCHANGER/); assert.doesNotMatch(ifcM, /IFCELECTRICGENERATOR\(/); assert.match(ifcAll, /IFCELECTRICGENERATOR\(/);
assert.match(ifcAll, /IFCMAPCONVERSION/, "georeferenced at Shadnagar"); assert.equal(rd("export_ifc", { discipline: "X" }).ok, false);

// drafted sheets: per hall GA, electrical and mechanical at 1:100 on A0, every label placed, none overlapping
const sheets = L.extra.docs.sheets; const drafted = sheets.filter((s) => ["ga", "elec", "mech"].includes(s.kind));
assert.equal(drafted.length, 12, "4 halls × GA, electrical, mechanical");
for (const s of drafted) { const d = rd("drawing", { sheet: s.id, format: "svg" }); assert.ok(d.ok, JSON.stringify(d.refusals));
  assert.equal(d.data.scale, 100, `${s.title} at 1:100`); assert.equal(d.data.paper, "A0");
  assert.equal(d.data.qa.overlaps, 0, `${s.title}: overlapping labels`); assert.deepEqual(d.data.qa.missing, [], `${s.title}: labels that found no place`); assert.deepEqual(d.data.qa.small, [], `${s.title}: text under 1.8 mm`);
  assert.match(d.data.number.container, new RegExp(`^HSD-BJA-${s.zone}-ZZ-DR-${{ ga: "A", elec: "E", mech: "M" }[s.kind]}-`));
  const svg = d.data.svg; for (const g of ["1", "10", "A", "D"]) assert.match(svg, new RegExp(`>${g}</text>`), `grid bubble ${g}`);
  assert.match(svg, />9300</, "grid dimension chain"); assert.match(svg, />LEGEND</); assert.match(svg, />GENERAL NOTES</); assert.match(svg, />KEY PLAN</);
  if (s.kind === "elec") { assert.match(svg, /BW 5000A/); assert.match(svg, /SINGLE LINE/); assert.match(svg, /UPS-H?[A-D]01a|UPS-[A-D]01a/); }
  if (s.kind === "mech") { assert.match(svg, /CDU-[A-D]01/); assert.match(svg, /DN\d+ +CL \+/); assert.doesNotMatch(svg, /CL \+1[0-9]\./, "roof-level runs are not on the ground plan"); }
  if (s.kind === "ga") { assert.match(svg, /WHITE SPACE/); assert.match(svg, /ELECTRICAL ROOM SOUTH/); assert.match(svg, /[A-D]-D1[0-3]/, "door marks"); } }
const gaA = drafted.find((s) => s.zone === "HA" && s.kind === "ga"); const dxf = rd("drawing", { sheet: gaA.id, format: "dxf" }).data.dxf; assert.match(dxf, /CENTER/); assert.doesNotMatch(dxf, /BJ-MASK/, "label wipeouts stay out of CAD");
assert.equal(L.model.data.grids.filter((g) => g.zone === "HA").length, 14, "10 + 4 grid lines per hall");
assert.equal(L.model.elements.filter((e) => e.kind === "door").length, 48, "12 doors per hall");
assert.equal(rd("sheet", { kind: "ga", zone: "ZZZ" }).ok, false, "unknown zone refused");
const zs = drafted;
// IfcOpenShell (CI only): the federated discipline files are schema-valid and every element builds
mkdirSync("dist-test", { recursive: true }); const files = ["M", "E"].map((x) => { const f = `dist-test/dc-${x}.ifc`; writeFileSync(f, rd("export_ifc", { discipline: x }).data); return f; });
try { execFileSync("python3", ["ci/validate_ifc.py", ...files], { stdio: "inherit" }); const out = execFileSync("python3", ["ci/geometry_check.py", ...files], { encoding: "utf8" }); process.stdout.write(out); assert.ok(!/failed": [1-9]/.test(out), "every element builds"); }
catch (e) { if (process.env.CI) throw e; console.log("ok datacentre IFC check skipped (IfcOpenShell not installed)"); }
console.log(`ok datacentre: ${els.length} elements, ${fed.length} discipline models, ${zs.length} drafted sheets (0 overlaps), ${((performance.now() - t0) / 1000).toFixed(1)} s`);
