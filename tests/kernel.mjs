// Free-form modelling with the geometry kernel: sweeps, booleans, arched openings, arrays and families.
// Volumes are checked against closed-form answers, the IFC is validated by IfcOpenShell (schema + geometry),
// and every command replays to the identical model.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { loadKernel } from "../src/author/kernel.js";
import { solidOf } from "../src/author/solids.js";

await loadKernel();
mkdirSync("dist-test", { recursive: true });
const bus = installCore(new Bus());
const run = (name, args) => { const r = bus.execute({ name, args, actor: "agent:test", apply: true }); assert.ok(r.ok, `${name}: ${JSON.stringify(r.refusals || r.error)}`); return r.data; };
const vol = (id) => solidOf(bus.model.data.elements[id]).volume / 1e9;
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${what}: ${a} vs ${b}`);

// 1. sweep: a 200x200 square ring around a 10 x 8 m rectangle (centreline) = perimeter x section
const ring = run("sweep", { profile: [[-100, -100], [100, -100], [100, 100], [-100, 100]], path: [[0, 0, 3000], [10000, 0, 3000], [10000, 8000, 3000], [0, 8000, 3000]], closed: true, name: "Cornice", material: "Stone" }).id;
near(vol(ring), 36 * 0.04, 0.002, "closed sweep volume");

// 2. arched opening: 6 x 0.6 x 5 m wall slab minus a 2 m wide, 3 m high semicircular-headed arch
const wall = run("mass", { outline: [[0, 0], [6000, 0], [6000, 600], [0, 600]], height: 5000, name: "Arcade wall", material: "Sandstone" }).id;
run("opening", { target: wall, at: [3000, 300, 0], dir_deg: 0, width: 2000, height: 3000, depth: 1000, arch: "semi" });
const archArea = 2 * 2 + (Math.PI * 1 * 1) / 2; // 2 m legs + semicircle of r = 1 m
near(vol(wall), 6 * 0.6 * 5 - archArea * 0.6, 0.003, "wall minus semicircular arch");
for (const arch of ["pointed", "mughal", "segmental", "rect"]) run("opening", { target: wall, at: [arch === "rect" ? 800 : 5200, 300, 3600], dir_deg: 0, width: 600, height: 900, depth: 1000, arch });
assert.equal(bus.model.data.elements[wall].tools.length, 5, "openings accumulate on one difference");

// 3. boolean union + difference keeps the base id
const a = run("mass", { outline: [[20000, 0], [22000, 0], [22000, 2000], [20000, 2000]], height: 2000, name: "Cube" }).id;
const b = run("mass", { outline: [[21000, 1000], [23000, 1000], [23000, 3000], [21000, 3000]], height: 2000, name: "Tool" }).id;
const u = run("boolean", { base: a, tools: [b], op: "union" });
assert.equal(u.id, a); assert.ok(!bus.model.data.elements[b], "tool consumed");
near(vol(a), 8 + 8 - 2, 0.001, "union volume");

// 4. polar array: 12 columns round a dome drum
const col = run("revolve", { center: [40000, 6000], profile: [[0, 0], [300, 0], [300, 4000], [0, 4000]], segments: 32, name: "Column" }).id;
const arr = run("array", { source: col, polar: { center: [40000, 0], count: 12 } });
assert.equal(arr.count, 12); assert.equal(arr.ids.length, 11);
const p6 = solidOf(bus.model.data.elements[arr.ids[5]]); const cx = p6.verts.reduce((s, v) => s + v[0], 0) / p6.verts.length, cy = p6.verts.reduce((s, v) => s + v[1], 0) / p6.verts.length;
assert.ok(Math.hypot(cx - 40000, cy - -6000) < 60, `6th copy sits opposite (${cx}, ${cy})`);
run("array", { source: col, count: 4, step: [1500, 0, 0] });

// 5. family with IFC class, Uniclass, AIM parameters and psets; placed with rotation
run("family", { name: "Bollard 900", ifc_class: "IfcBuildingElementProxy", uniclass: { code: "Pr_30_59_08", title: "Bollards" }, parameters: { Height_mm: 900, Finish: "Galvanised" }, psets: { Pset_ManufacturerTypeInformation: { Manufacturer: "Generic", ModelLabel: "B900" } }, material: "Steel",
  parts: [{ shape: "revolve", center: [0, 0], profile: [[0, 0], [110, 0], [110, 900], [0, 960]], segments: 24 }, { shape: "box", min: [-200, -200, -300], max: [200, 200, 0] }] });
const bol = run("place", { family: "Bollard 900", at: [50000, 0], rotation_deg: 30, mark: "BL-01" }).id;
const be = bus.model.data.elements[bol]; assert.equal(be.family, "Bollard 900"); assert.equal(be.uniclass.code, "Pr_30_59_08");
assert.ok(vol(bol) > 0.04 && vol(bol) < 0.09, `bollard volume ${vol(bol)}`);
assert.equal(bus.execute({ name: "place", args: { family: "Nope", at: [0, 0] }, actor: "agent:test", apply: true }).ok, false, "unknown family refused");
assert.equal(bus.execute({ name: "opening", args: { target: wall, at: [0, 0, 0], width: 100, height: 100, depth: 100, arch: "gothic!" }, actor: "agent:test", apply: true }).ok, false, "bad arch refused");

// 6. IFC: deterministic, valid, geometry builds, Uniclass + family psets present
const ifc = bus.execute({ name: "export_ifc", args: {}, actor: "human" }).data;
assert.equal(bus.execute({ name: "export_ifc", args: {}, actor: "human" }).data, ifc, "deterministic export");
for (const s of ["IFCCLASSIFICATIONREFERENCE(", "'Pr_30_59_08'", "IFCRELASSOCIATESCLASSIFICATION(", "'BIMja_Family'", "'Pset_ManufacturerTypeInformation'", "'BL-01'"]) assert.ok(ifc.includes(s), `IFC has ${s}`);
writeFileSync("dist-test/kernel.ifc", ifc);
const py = (s) => execFileSync("python3", [s, "dist-test/kernel.ifc"], { encoding: "utf8" }).trim();
console.log(py("ci/validate_ifc.py")); const g = JSON.parse(py("ci/geometry_check.py").split("\n").pop()); assert.equal(g.failed, 0, "every shape builds in IfcOpenShell");

// 7. replay: the command log rebuilds the identical model
const replay = Bus.replay(bus.log, () => installCore(new Bus()));
assert.equal(JSON.stringify(replay.model.data), JSON.stringify(bus.model.data), "replay identical");
console.log(`ok kernel: sweep ${vol(ring).toFixed(3)} m³, arcade wall ${vol(wall).toFixed(3)} m³ (5 arches), union ${vol(a).toFixed(3)} m³, polar + linear arrays, family with Uniclass + psets, IFC ${g.shapes} shapes, replay identical`);
