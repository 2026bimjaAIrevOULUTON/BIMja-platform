// M7 gates: quantities within 0.5% of IfcOpenShell ifc5d (computed from the exported geometry);
// COBie 2.4 workbook validates (independent Python checker reading the .xlsx with openpyxl); estimate is exact and replayable.
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { SAMPLE_HOUSE } from "../src/app/sample-house.js";
import { authoredRecords } from "../src/author/records.js";
import { COBIE_SHEETS } from "../src/cost/cost.js";

const dir = mkdtempSync(join(tmpdir(), "bimja-5d-"));
const py = (args) => { try { return JSON.parse(execFileSync("python3", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).trim().split("\n").pop()); }
  catch (e) { if (process.env.CI) throw new Error(`reference failed in CI: ${e.stderr || e.message}`); return null; } };
const make = () => installCore(new Bus());
const bus = make(); const run = (name, args, actor = "human") => bus.execute({ name, args, actor });
assert.ok(run("script", { commands: SAMPLE_HOUSE }).ok);

// 1. quantities vs ifc5d
const ifcPath = join(dir, "house.ifc"); writeFileSync(ifcPath, run("export_ifc", {}).data);
const ref = py(["ci/ifc5d_ref.py", ifcPath]);
const recs = authoredRecords(bus.model);
// Compared: lengths, areas, volumes ifc5d derives from geometry. Not compared: Width/Depth of slabs (ifc5d's net_get_y is the
// plan width; our Width is the slab thickness), NetPerimeter of spaces and door quantities (ifc5d leaves them unset).
const KEYS = { IfcWall: ["Length", "Height", "Width", "GrossSideArea", "NetSideArea", "NetVolume"], IfcSlab: ["NetArea", "NetVolume", "Perimeter"], IfcSpace: ["Height", "NetFloorArea", "GrossFloorArea", "NetVolume"], IfcWindow: ["Width", "Height", "Area"] };
if (ref) {
  let n = 0, worst = 0, worstAt = "";
  for (const e of recs.values()) {
    for (const k of KEYS[e.ifcClass] || []) {
      const ours = Object.values(e.quantities).map((q) => q[k]).find((v) => v != null), theirs = ref[e.globalId]?.[k];
      assert.ok(ours != null && theirs != null, `${e.id} ${k}: ours ${ours}, ifc5d ${theirs}`);
      const rel = Math.abs(ours - theirs) / Math.max(1e-9, Math.abs(theirs)); n++; if (rel > worst) { worst = rel; worstAt = `${e.id}.${k}`; }
      assert.ok(rel <= 0.005, `${e.id} ${k}: ours ${ours} vs ifc5d ${theirs} (${(rel * 100).toFixed(3)}%)`);
    }
  }
  console.log(`ok cost quantities: ${n} values within 0.5% of ifc5d (worst ${(worst * 100).toFixed(4)}% at ${worstAt})`);
} else console.log("ok cost quantities: ifc5d not installed, reference skipped");

// no double counting at wall joins: the walls' plan footprint equals centre-line length × thickness
const ext = [...recs.values()].filter((e) => e.ifcClass === "IfcWall" && /230/.test(e.type)).reduce((s, e) => s + e.quantities.Qto_WallBaseQuantities.Length, 0);
assert.ok(Math.abs(ext - 36) < 1e-9, `exterior wall lengths add up to the 36 m centre-line perimeter (got ${ext})`);

// 2. estimate
assert.equal(run("estimate", {}).refusals[0].code, "bad_arg", "no rates yet");
const c = run("cost", { sample: true }); assert.ok(c.ok, JSON.stringify(c));
const est = run("estimate", {}).data;
const byCode = Object.fromEntries(est.lines.map((l) => [l.code, l]));
assert.equal(byCode["C-05"].qty, 3); assert.equal(byCode["C-05"].amount, 42000);
assert.equal(byCode["C-04"].qty, 80); assert.equal(byCode["C-03"].qty, 24);
for (const l of est.lines) assert.equal(l.amount, Math.round(l.qty * l.rate * 100) / 100);
assert.equal(est.total, Math.round(est.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100);
assert.ok(est.label?.startsWith("SAMPLE"), "sample rates are labelled");
assert.ok(run("estimate", { format: "csv" }).data.csv.split("\n").length === est.lines.length + 2);
assert.equal(run("cost", { rates: [{ code: "X", match: {}, basis: "count", rate: -1 }] }).refusals[0].code, "bad_arg");
// change a quantity -> estimate follows (5D is live on the model)
run("delete", { ids: ["D7"] }); assert.equal(run("estimate", {}).data.lines.find((l) => l.code === "C-05").qty, 2); bus.undo();

// 3. assets + COBie
assert.ok(run("asset", { rule: { ifc_class: "IfcDoor" }, tag_prefix: "DR-", manufacturer: "Acme Doors", warranty_years: 2, maintenance_days: 180, installed: "2026-04-10" }).ok);
assert.equal(run("asset", { element: "NOPE" }).refusals[0].code, "no_such_element");
const agent = run("asset", { element: "W1", tag: "X" }, "agent:t"); assert.ok(agent.proposal, "agents propose");
const cob = run("cobie", {}).data; const xl = join(dir, "cobie.xlsx"); writeFileSync(xl, Buffer.from(cob.base64, "base64"));
assert.ok(cob.summary.Component === 8 && cob.summary.Space === 3 && cob.summary.Floor === 2, JSON.stringify(cob.summary));
assert.equal(cob.summary.Job, 2, "door types with a maintenance interval get a PM job");
assert.equal(run("cobie", {}).data.base64, cob.base64, "COBie is deterministic");
const json = run("cobie", { format: "json" }).data.sheets; const d01 = json.Component.find((r) => r[0] === "DR-001"); assert.ok(d01, "asset tag becomes the component name");
assert.ok(json.Component.every((r) => r[4] !== "n/a"), "every door and window is in a space");
const chk = py(["ci/cobie_check.py", xl, JSON.stringify(COBIE_SHEETS)]);
if (chk) { assert.ok(chk.ok, JSON.stringify(chk.errors)); console.log(`ok cobie: ${JSON.stringify(chk.counts)} validated (openpyxl + COBie 2.4 rules)`); }
else console.log("ok cobie: python checker not available, skipped");

// replay gives the same estimate and workbook
const rb = Bus.replay(bus.log, make);
assert.deepEqual(rb.execute({ name: "estimate", args: {}, actor: "human" }).data, run("estimate", {}).data);
assert.equal(rb.execute({ name: "cobie", args: {}, actor: "human" }).data.base64, cob.base64);
console.log(`ok cost: estimate ${est.currency} ${est.total.toLocaleString("en-IN")} over ${est.lines.length} lines, live on model edits, replay identical`);
