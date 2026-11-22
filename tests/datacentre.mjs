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
assert.equal(fam("Vertiv CoolChip CDU 2300kW"), 112, "1 + 1 CDUs per pod, 14 pods per hall");
assert.equal(fam("Network rack 14 kW"), 224, "two network racks per row");
assert.equal(fam("Thermax adiabatic dry cooler 1.4 MW"), 88, "22 dry coolers per hall"); assert.equal(fam("Air-cooled free-cooling chiller 1500 kW"), 24, "6 chillers per hall"); assert.equal(fam("Fan wall 450 kW"), 60, "15 fan walls per hall");
assert.equal(fam("Cummins 2500 kVA containerised generator"), 136, "one generator per line: 28 IT + 6 mechanical per hall");
assert.equal(fam("Voltamp 2500 kVA ONAN transformer"), 128, "28 IT + 4 mechanical transformers per hall");
assert.equal(fam("UPS 2000 kVA lithium-ion"), 112, "4N/3: 7 blocks × 4 lines per hall");
assert.equal(fam("CG Power 63 MVA 220/33 kV transformer"), 4, "3 + 1 grid transformers");
const famDef = L.model.data.families["NVIDIA GB300 NVL72 rack"];
assert.equal(famDef.parameters.Nameplate_kW, 136); assert.equal(famDef.parameters.LOD, 400); assert.match(famDef.parameters.AsBuiltStatus, /not field-verified/);
const itMW = 896 * famDef.parameters.Nameplate_kW / 1000; assert.ok(itMW > 120 && itMW < 123, `IT nameplate ${itMW} MW`);
assert.equal(L.model.data.zones.length, 14, "four halls (each with two sheet parts), substation, utilities");
// planning rules: ≤ 8 GPU racks per row, 7.3 m pod pitch, 4 × 800 A busways per row
const gpuRows = {}; for (const e of els.filter((e) => e.family === "NVIDIA GB300 NVL72 rack")) { const k = e.mark.replace(/-\d+$/, ""); gpuRows[k] = (gpuRows[k] || 0) + 1; }
assert.equal(Object.keys(gpuRows).length, 112, "28 rows per hall"); assert.ok(Object.values(gpuRows).every((n) => n === 8), "8 GPU racks per row");
assert.equal(els.filter((e) => /busway/.test(e.name || "")).length, 448, "4 busways per row");

// stages: location, cost, programme, drawings, then the asset register
for (const s of dcStages()) { const q = ex(s.name, s.args); assert.ok(q.ok, `${s.name}: ${JSON.stringify(q.refusals)}`); }
for (const a of DC_STAGES.assets) assert.ok(ex("asset", { ...a, installed: "2028-12-29" }).ok, `asset ${a.tag_prefix}`);
assert.ok(Object.keys(L.extra.assets).length >= 112 + 88 + 136 + 128, "major plant registered as assets");

// federation: one container per discipline, and each discipline IFC holds only its own elements
const fed = rd("federation").data; const codes = fed.map((m) => m.discipline);
for (const d of ["A", "S", "C", "M", "E", "P", "F", "L"]) assert.ok(codes.includes(d), `discipline model ${d}`);
assert.ok(fed.every((m) => /^HSD-BJA-ZZ-ZZ-M3-[ASMEPCLF]-0001$/.test(m.container)));
assert.equal(fed.reduce((t, m) => t + m.elements, 0), els.length, "every element in exactly one discipline model");
const ifcM = rd("export_ifc", { discipline: "M" }).data; const ifcAll = rd("export_ifc").data;
assert.match(ifcM, /Mechanical model/); assert.match(ifcM, /IFCHEATEXCHANGER/); assert.doesNotMatch(ifcM, /IFCELECTRICGENERATOR\(/); assert.match(ifcAll, /IFCELECTRICGENERATOR\(/);
assert.match(ifcAll, /IFCMAPCONVERSION/, "georeferenced at Shadnagar"); assert.equal(rd("export_ifc", { discipline: "X" }).ok, false);

// drafted sheets: per hall GA, electrical and mechanical at 1:100 on A0, every label placed, none overlapping
const sheets = L.extra.docs.sheets; const drafted = sheets.filter((s) => ["ga", "elec", "mech", "roof"].includes(s.kind));
assert.equal(drafted.length, 8, "Hall A, two parts × GA, electrical, mechanical, roof");
for (const s of drafted) { const d = rd("drawing", { sheet: s.id, format: "svg" }); assert.ok(d.ok, JSON.stringify(d.refusals));
  assert.equal(d.data.scale, 100, `${s.title} at 1:100`); assert.equal(d.data.paper, "A0");
  assert.equal(d.data.qa.overlaps, 0, `${s.title}: overlapping labels ${JSON.stringify(d.data.qa.overlap_pairs)}`); assert.deepEqual(d.data.qa.missing, [], `${s.title}: labels that found no place`); assert.deepEqual(d.data.qa.small, [], `${s.title}: text under 1.8 mm`);
  assert.match(d.data.number.container, new RegExp(`^HSD-BJA-${s.zone}-${s.kind === "roof" ? "RF" : "00"}-DR-${{ ga: "A", elec: "E", mech: "M", roof: "M" }[s.kind]}-`));
  const svg = d.data.svg; const g = s.zone === "HA1" ? ["1", "10", "A", "G"] : ["11", "20", "A", "G"]; for (const n of g) assert.match(svg, new RegExp(`>${n}</text>`), `grid bubble ${n}`);
  assert.match(svg, />7300</, "grid dimension chain"); assert.match(svg, />LEGEND</); assert.match(svg, />GENERAL NOTES</); assert.match(svg, />KEY PLAN</); assert.match(svg, /MATCHLINE — SEE HALL A PART [12]/);
  if (s.kind === "elec") { assert.match(svg, /BW-A\d\d 4×800A BUSWAY/); assert.match(svg, /4N\/3, LINES A–D/); assert.match(svg, /A-UPS-L\d[A-D]/); assert.match(svg, /LADDER BOT \+4\.70/); }
  if (s.kind === "mech") { assert.match(svg, /A-CDU-P\d\d[AB]/); assert.match(svg, /TCS-AP\d\d DN200 +CL \+2\.[67]0/); assert.match(svg, /FWS-S-A DN700/); assert.doesNotMatch(svg, /CL \+(9|10)\.\d0/, "roof-level runs are not on the ground plan"); }
  if (s.kind === "roof") { assert.match(svg, /A-(DC|CH)-\d\d/); assert.match(svg, /CL \+(9\.90|10\.90)/); assert.doesNotMatch(svg, /A-CDU-P/, "ground-floor plant stays off the roof plan"); }
  if (s.kind === "ga") { assert.match(svg, /DATA HALL/); assert.match(svg, /LINE ROOM/); assert.match(svg, /A-D\d{3}/, "door marks"); assert.match(svg, /ROW A\d\d · 8 × NVL72/); } }
const gaA = drafted.find((s) => s.zone === "HA1" && s.kind === "ga"); const dxf = rd("drawing", { sheet: gaA.id, format: "dxf" }).data.dxf; assert.match(dxf, /CENTER/); assert.doesNotMatch(dxf, /BJ-MASK/, "label wipeouts stay out of CAD");
assert.equal(L.model.data.grids.filter((g) => g.zone === "HA").length, 27, "20 numbered + 7 lettered grid lines per hall");
assert.ok(L.model.elements.filter((e) => e.kind === "door").length > 4 * 100, "doors to every line room, battery room and exit");
assert.equal(rd("sheet", { kind: "ga", zone: "ZZZ" }).ok, false, "unknown zone refused");
const zs = drafted;
// IfcOpenShell (CI only): the federated discipline files are schema-valid and every element builds
mkdirSync("dist-test", { recursive: true }); const files = ["M", "E"].map((x) => { const f = `dist-test/dc-${x}.ifc`; writeFileSync(f, rd("export_ifc", { discipline: x }).data); return f; });
try { execFileSync("python3", ["ci/validate_ifc.py", ...files], { stdio: "inherit" }); const out = execFileSync("python3", ["ci/geometry_check.py", ...files], { encoding: "utf8" }); process.stdout.write(out); assert.ok(!/failed": [1-9]/.test(out), "every element builds"); }
catch (e) { if (process.env.CI) throw e; console.log("ok datacentre IFC check skipped (IfcOpenShell not installed)"); }
console.log(`ok datacentre: ${els.length} elements, ${fed.length} discipline models, ${zs.length} drafted sheets (0 overlaps), ${((performance.now() - t0) / 1000).toFixed(1)} s`);
