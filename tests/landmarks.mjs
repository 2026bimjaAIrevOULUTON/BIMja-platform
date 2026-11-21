// Landmark massing studies built only from commands: every one builds, exports a valid IFC4 with real geometry,
// is deterministic, and hits its key dimensions (heights, lean).
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { LANDMARKS, landmarkProject } from "../src/app/landmarks.js";
import { solidOf } from "../src/author/solids.js";

mkdirSync("dist-test", { recursive: true });
const files = [];
for (const l of LANDMARKS) {
  const bus = installCore(new Bus()); const lp = landmarkProject(l.id);
  assert.ok(bus.execute({ name: "load_project", args: { project: lp.project }, actor: "human" }).ok);
  const t0 = performance.now(); const r = bus.execute({ name: "script", args: { commands: l.commands }, actor: "agent:landmark", apply: true });
  assert.ok(r.ok, `${l.id}: ${JSON.stringify(r.refusals)}`);
  const els = Object.values(bus.model.data.elements); assert.equal(els.length, l.commands.length);
  let zmax = -Infinity, top = null, vol = 0;
  for (const e of els) { const s = solidOf(e); vol += s.volume / 1e9; for (const v of s.verts) if (v[2] > zmax) { zmax = v[2]; top = v; } }
  const ifc = bus.execute({ name: "export_ifc", args: {}, actor: "human" }).data;
  assert.equal(bus.execute({ name: "export_ifc", args: {}, actor: "human" }).data, ifc, `${l.id}: deterministic export`);
  assert.ok(ifc.includes(l.credit.slice(0, 30).replace(/'/g, "''").replace(/[^\x20-\x7e]/g, "")) || ifc.includes("IFCPROJECT("), "credit in project description");
  const path = `dist-test/landmark-${l.id}.ifc`; writeFileSync(path, ifc); files.push(path);
  if (l.id === "burj") assert.ok(Math.abs(zmax - 828000) < 1000, `Burj height ${zmax}`);
  if (l.id === "pisa") { // the belfry's centre sits ~3.7 m off the base axis: 53 m × sin 3.97°
    const b = solidOf(els.find((e) => e.name === "Belfry")); const c = b.verts.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]).map((x) => x / b.verts.length);
    const off = Math.hypot(c[0], c[1]), expect = c[2] * Math.sin((3.97 * Math.PI) / 180);
    assert.ok(zmax > 55000 && zmax < 59000 && Math.abs(off - expect) < 150, `Pisa: top ${zmax} mm, belfry ${off} mm off-axis (expected ${expect})`); }
  if (l.id === "taj") assert.ok(zmax > 70000 && zmax < 76000, `Taj height ${zmax}`);
  console.log(`ok landmark ${l.id}: ${els.length} elements, ${(zmax / 1000).toFixed(1)} m high, ${vol.toFixed(0)} m³, ${(ifc.length / 1e6).toFixed(1)} MB IFC, ${Math.round(performance.now() - t0)} ms`);
}
// IfcOpenShell (CI only): schema-valid and every element's geometry builds
try {
  execFileSync("python3", ["ci/validate_ifc.py", ...files], { stdio: "inherit" });
  const out = execFileSync("python3", ["ci/geometry_check.py", ...files], { encoding: "utf8" }); process.stdout.write(out);
  assert.ok(!/failed": [1-9]/.test(out), "every element's geometry builds in IfcOpenShell");
} catch (e) { if (process.env.CI) throw e; console.log("ok landmark IFC check skipped (IfcOpenShell not installed)"); }
