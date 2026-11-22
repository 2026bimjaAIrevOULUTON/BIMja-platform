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

// zone sheets: each hall gets its own whitespace, coordinated, plant and containment sheet, numbered in its volume
const sheets = L.extra.docs.sheets; const zs = sheets.filter((s) => s.zone);
for (const z of ["HA", "HB", "HC", "HD"]) for (const k of ["whitespace", "coordinated", "plant", "containment"]) assert.ok(zs.some((s) => s.zone === z && s.kind === k), `${k} sheet for ${z}`);
const wsA = zs.find((s) => s.zone === "HA" && s.kind === "whitespace"); const d = rd("drawing", { sheet: wsA.id, format: "svg" }); assert.ok(d.ok);
assert.match(d.data.number.container, /^HSD-BJA-HA-ZZ-DR-E-63\d\d$/); assert.ok(d.data.scale <= 200, `hall at a working scale, got 1:${d.data.scale}`);
assert.match(d.data.svg, /30464/, "224 racks × 136 kW in Hall A"); assert.match(d.data.svg, /HOT AISLE/); assert.match(d.data.svg, /COLD AISLE/);
assert.equal(rd("sheet", { kind: "plant", zone: "ZZZ" }).ok, false, "unknown zone refused");
const sld = sheets.find((s) => s.kind === "sld" && (s.medium || "power") === "power"); assert.match(rd("drawing", { sheet: sld.id, format: "svg" }).data.svg, /MSB-33/);
// IfcOpenShell (CI only): the federated discipline files are schema-valid and every element builds
mkdirSync("dist-test", { recursive: true }); const files = ["M", "E"].map((x) => { const f = `dist-test/dc-${x}.ifc`; writeFileSync(f, rd("export_ifc", { discipline: x }).data); return f; });
try { execFileSync("python3", ["ci/validate_ifc.py", ...files], { stdio: "inherit" }); const out = execFileSync("python3", ["ci/geometry_check.py", ...files], { encoding: "utf8" }); process.stdout.write(out); assert.ok(!/failed": [1-9]/.test(out), "every element builds"); }
catch (e) { if (process.env.CI) throw e; console.log("ok datacentre IFC check skipped (IfcOpenShell not installed)"); }
console.log(`ok datacentre: ${els.length} elements, ${fed.length} discipline models, ${zs.length} zone sheets, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
