// Round-trip gate: authored model -> IFC4 -> reopen with web-ifc -> the handover check scores identically,
// classes and counts match, GlobalIds survive, and the export is byte-identical when repeated (determinism).
import assert from "assert/strict"; import fs from "fs";
import { Bus } from "../src/core/bus.js"; import { installCore } from "../src/core/handlers.js";
import { SAMPLE_HOUSE } from "../src/app/sample-house.js";
import { exportIFC } from "../src/author/ifc-export.js"; import { authoredRecords } from "../src/author/records.js";
import { createApi, openModel } from "../src/ifc.js"; import { runCheck } from "../src/rules.js";
const b = installCore(new Bus()); const r = b.execute({ name: "script", args: { commands: SAMPLE_HOUSE } }); assert.ok(r.ok, JSON.stringify(r));
const ifc = exportIFC(b.model); assert.equal(ifc, exportIFC(b.model), "export is deterministic");
fs.mkdirSync(new URL("../dist-test/", import.meta.url), { recursive: true }); fs.writeFileSync(new URL("../dist-test/sample-house.ifc", import.meta.url), ifc);
const api = await createApi(new URL("../node_modules/web-ifc/", import.meta.url).pathname);
const m = openModel(api, new TextEncoder().encode(ifc));
const before = runCheck(authoredRecords(b.model)), after = runCheck(m.index.elements);
const count = (map) => { const c = {}; for (const e of map.values()) c[e.ifcClass] = (c[e.ifcClass] || 0) + 1; return c; };
assert.deepEqual(count(m.index.elements), count(authoredRecords(b.model)), "same classes and counts after reopening");
assert.equal(after.score, before.score, `handover score ${before.score}% before export, ${after.score}% after`);
assert.equal(after.issues.length, before.issues.length);
const g1 = new Set([...authoredRecords(b.model).values()].map((e) => e.globalId)), g2 = new Set([...m.index.elements.values()].map((e) => e.globalId));
assert.deepEqual([...g1].sort(), [...g2].sort(), "GlobalIds survive");
assert.equal(m.index.storeys.length, b.model.data.levels.length);
// second case: deliberately incomplete data must fail the same checks before and after export
const b2 = installCore(new Bus());
b2.execute({ name: "type", args: { kind: "door", name: "Bare door", width: 800, height: 2000 } });
b2.execute({ name: "type", args: { kind: "wall", name: "Bare wall", thickness: 150 } });
assert.ok(b2.execute({ name: "script", args: { commands: [
  { name: "walls", args: { points: [[0,0],[6000,0],[6000,4000],[0,4000]], closed: true, type: "Bare wall" } },
  { name: "door", args: { at: [3000, 0], type: "Bare door" } }, { name: "room", args: { name: "Store", at: [3000, 2000] } }] } }).ok);
const ifc2 = exportIFC(b2.model); const m2 = openModel(api, new TextEncoder().encode(ifc2));
const c1 = runCheck(authoredRecords(b2.model)), c2 = runCheck(m2.index.elements);
console.log(JSON.stringify(Object.fromEntries(Object.entries(c1.byRule).map(([k,v])=>[k,[v.failed,c2.byRule[k].failed]]))));assert.ok(c1.score < 100, "incomplete model has issues"); assert.equal(c2.score, c1.score, `incomplete: ${c1.score}% vs ${c2.score}%`);
assert.deepEqual(Object.fromEntries(Object.entries(c2.byRule).map(([k, v]) => [k, v.failed])), Object.fromEntries(Object.entries(c1.byRule).map(([k, v]) => [k, v.failed])), "same rules fail");
fs.writeFileSync(new URL("../dist-test/incomplete.ifc", import.meta.url), ifc2);
console.log(`ok roundtrip (incomplete case): ${c1.score}% = ${c2.score}%, failures per rule identical`);
console.log(`ok roundtrip: ${m.index.elements.size} elements, score ${before.score}% = ${after.score}%, ${ifc.length} bytes, deterministic`);
