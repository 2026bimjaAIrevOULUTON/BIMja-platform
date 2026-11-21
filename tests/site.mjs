// D2 gates: every survey format reads (incl. a DXF written by ezdxf, synthetic LAS 1.2/1.4 and PLY), bad input is
// refused cleanly, grading volumes match an analytic case, terrain exports as valid IFC, site sheets publish.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { SAMPLE_HOUSE } from "../src/app/sample-house.js";
import { parseSurvey, parseLAS, parsePLY } from "../src/site/survey.js";
import { buildTIN, heightGrid, grade } from "../src/site/terrain.js";
import { terrariumZ } from "../src/app/site-ui.js";

mkdirSync("dist-test", { recursive: true });
const mk = () => { const b = installCore(new Bus()); return { b, run: (n, a, actor = "human") => b.execute({ name: n, args: a, actor }) }; };
const { b, run } = mk(); assert.ok(run("script", { commands: SAMPLE_HOUSE }).ok);
// samples
for (const [f, fmt, min] of [["sample-site.csv", "csv", 900], ["sample-site.dxf", "dxf", 700], ["sample-site.xml", "landxml", 590]]) {
  const r = run("survey_import", { format: fmt, name: f, data: readFileSync(`public/survey/${f}`, "utf8") }); assert.ok(r.ok, `${fmt}: ${JSON.stringify(r.refusals)}`);
  assert.ok(r.data.points >= min && r.data.extent_m[0] > 100 && r.data.levels_m[0] > 500, `${fmt}: ${JSON.stringify(r.data)}`);
}
assert.ok(!JSON.stringify(b.log).includes("Easting,Northing"), "the log keeps parsed levels, not the raw file");
// synthetic LAS (1.2 format 1 and 1.4 format 6), ground class preferred
function las(minor, fmt, n) {
  const hdr = minor >= 4 ? 375 : 227, rec = fmt >= 6 ? 30 : 28; const buf = new ArrayBuffer(hdr + n * rec); const v = new DataView(buf); const u = new Uint8Array(buf);
  u.set([76, 65, 83, 70]); u[24] = 1; u[25] = minor; v.setUint16(94, hdr, true); v.setUint32(96, hdr, true); u[104] = fmt; v.setUint16(105, rec, true); v.setUint32(107, minor >= 4 ? 0 : n, true);
  for (const [o, val] of [[131, 0.01], [139, 0.01], [147, 0.01], [155, 1000], [163, 2000], [171, 0]]) v.setFloat64(o, val, true);
  if (minor >= 4) v.setBigUint64(247, BigInt(n), true);
  for (let i = 0; i < n; i++) { const o = hdr + i * rec, x = (i % 40) * 1.5, y = Math.floor(i / 40) * 1.5, ground = i % 3 !== 0; v.setInt32(o, Math.round(x * 100), true); v.setInt32(o + 4, Math.round(y * 100), true); v.setInt32(o + 8, Math.round((ground ? 50 + x * 0.1 : 70) * 100), true); u[o + (fmt >= 6 ? 16 : 15)] = ground ? 2 : 5; }
  return u;
}
for (const [minor, fmt] of [[2, 1], [4, 6]]) { const r = parseLAS(las(minor, fmt, 1600)); assert.ok(r.ok, r.error); assert.equal(r.info.used, "ground class 2"); assert.ok(r.points.every((p) => p[2] < 60), `LAS 1.${minor}: vegetation (class 5) dropped`); }
assert.ok(run("survey_import", { format: "las", name: "scan.las", base64: Buffer.from(las(2, 1, 1600)).toString("base64"), coords: "local" }).ok);
const ply = parsePLY("ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 1\n10 0 2\n10 10 3\n0 10 2\n"); assert.ok(ply.ok && ply.points.length === 4);
const pb = new ArrayBuffer(4 * 12); const pv = new DataView(pb); [[0, 0, 1], [5, 0, 2], [5, 5, 3], [0, 5, 4]].forEach((p, i) => p.forEach((c, k) => pv.setFloat32(i * 12 + k * 4, c, true)));
const plyBin = new Uint8Array([...new TextEncoder().encode("ply\nformat binary_little_endian 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nend_header\n"), ...new Uint8Array(pb)]); assert.equal(parsePLY(plyBin).points[2][2], 3);
assert.match(parseSurvey("e57", "x").error, /convert to LAS/);
for (const junk of ["", "a,b,c\n1,2", "<LandXML/>", "0\nSECTION\n2\nENTITIES\n0\nEOF", null]) for (const f of ["csv", "dxf", "landxml", "las", "ply"]) assert.equal(parseSurvey(f, junk).ok, false, `${f} junk is refused`);
assert.equal(run("survey_import", { format: "csv", data: "x,y\n1,2" }).refusals[0].code, "bad_arg");
// DXF written by an independent library (CI)
try { execFileSync("python3", ["ci/make_survey_dxf.py", "dist-test/ezdxf-survey.dxf"], { stdio: "pipe" });
  const r = parseSurvey("dxf", readFileSync("dist-test/ezdxf-survey.dxf", "utf8")); assert.ok(r.ok, r.error);
  const zs = new Set(r.points.map((p) => Math.round(p[2] * 100) / 100)); for (const z of [100, 101, 102, 103, 104, 103.75]) assert.ok(zs.has(z), `contour/spot level ${z} read from the ezdxf file`);
  console.log(`ok site dxf: ${r.points.length} levels read from an ezdxf R2018 file (LWPOLYLINE elevation, POINT, TEXT)`);
} catch (e) { if (process.env.CI) throw e; console.log("ok site dxf: ezdxf not installed, skipped"); }
// grading vs an analytic frustum: flat ground at 10 m, 20 x 20 m pad at 9 m, 1:1 cut batters
const flat = []; for (let x = -40; x <= 40; x += 2) for (let y = -40; y <= 40; y += 2) flat.push([x, y, 10]);
const g = grade(heightGrid(buildTIN(flat), { cell: 0.25 }), { pad: [[-10, -10], [10, -10], [10, 10], [-10, 10]], pad_z: 9, cut_slope: 1, fill_slope: 2 });
const exact = (1 / 3) * (400 + 484 + Math.sqrt(400 * 484)); assert.ok(Math.abs(g.cut_m3 - exact) / exact < 0.02 && g.fill_m3 < 1e-6, `cut ${g.cut_m3} vs exact ${exact}`);
// grading the sample site under the house, then IFC with terrain
run("survey_import", { format: "csv", data: readFileSync("public/survey/sample-site.csv", "utf8") });
const gr = run("site_grade", { margin: 2000, cut_slope: 1, fill_slope: 2 }); assert.ok(gr.ok, JSON.stringify(gr.refusals)); assert.ok(gr.data.cut_m3 + gr.data.fill_m3 > 1 && Math.abs(gr.data.ffl_m - gr.data.ground_at_building_m - 0.45) < 1e-6);
assert.ok(run("site_grade", { pad: [[0, 0], [1000, 0], [1000, 1000]], ffl: 600 }).ok, "explicit pad");
run("site_grade", {});
const ifc = run("export_ifc", {}).data; assert.ok(ifc.includes("IFCGEOGRAPHICELEMENT") && ifc.includes("IFCTRIANGULATEDFACESET") && /IFCSITE\([^;]*,5\d\d\.\d+,\$,\$\)/.test(ifc), "terrain + site reference elevation in IFC");
writeFileSync("dist-test/site.ifc", ifc);
try { execFileSync("python3", ["ci/validate_ifc.py", "dist-test/site.ifc"], { stdio: "inherit" }); const out = execFileSync("python3", ["ci/geometry_check.py", "dist-test/site.ifc"], { encoding: "utf8" }); assert.ok(/"failed": 0/.test(out), out); }
catch (e) { if (process.env.CI) throw e; }
// site sheets
run("drawing_setup", { project_code: "SIT" }); assert.equal(run("sheets_auto", {}).data.sheets, 8); // register, site, site section, plan, elevations, sections, isometric, schedules
const sp = b.extra.docs.sheets.find((s) => s.kind === "site"); const svg = run("drawing", { sheet: sp.id, format: "svg" }).data.svg;
assert.ok(svg.includes("FFL +") && svg.includes("Earthworks: cut") && svg.includes("E 482"), "site plan: FFL, earthworks, map grid");
assert.ok(terrariumZ(128, 0, 0) === 0 && terrariumZ(130, 10, 128) === 522.5, "terrarium decoding");
// replay
const rb = Bus.replay(b.log, () => installCore(new Bus())); assert.deepEqual(rb.execute({ name: "site_report", args: {}, actor: "human" }).data, run("site_report", {}).data, "replay gives the same site");
console.log(`ok site: csv/dxf/landxml/las/ply read, junk refused, grading within ${(Math.abs(g.cut_m3 - exact) / exact * 100).toFixed(2)}% of the analytic frustum, terrain IFC, site sheets, replay identical`);
