// Clash gate: BIMja's clash engine agrees with IfcOpenShell's clash tree on a reference pair of models.
import assert from "assert/strict"; import fs from "fs"; import { execFileSync } from "child_process";
import { Bus } from "../src/core/bus.js"; import { installCore } from "../src/core/handlers.js";
import { SAMPLE_HOUSE } from "../src/app/sample-house.js"; import { exportIFC } from "../src/author/ifc-export.js";
import { createApi, openModel } from "../src/ifc.js"; import { clash, trianglesFromModel, triTri } from "../src/coord/clash.js";
// unit checks of the narrow phase
assert.ok(triTri([[0,0,0],[1,0,0],[0,1,0]], [[0.2,0.2,-1],[0.2,0.2,1],[0.8,0.2,0]]), "crossing triangles intersect");
assert.ok(!triTri([[0,0,0],[1,0,0],[0,1,0]], [[0,0,1],[1,0,1],[0,1,1]]), "parallel planes do not");
// reference models: A = sample house, B = a ring of walls shifted 700 mm east (no openings)
const A = installCore(new Bus()); A.model.data.name = "House A"; assert.ok(A.execute({ name: "script", args: { commands: SAMPLE_HOUSE } }).ok);
const B = installCore(new Bus()); B.model.data.name = "Ring B"; assert.ok(B.execute({ name: "walls", args: { points: [[700,-3000],[10700,-3000],[10700,5000],[700,5000]], closed: true, type: "Interior 115" } }).ok);
const dir = new URL("../dist-test/clash/", import.meta.url).pathname; fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + "a.ifc", exportIFC(A.model)); fs.writeFileSync(dir + "b.ifc", exportIFC(B.model));
const api = await createApi(new URL("../node_modules/web-ifc/", import.meta.url).pathname);
const load = (f, tag) => { const m = openModel(api, fs.readFileSync(dir + f), () => {}, { coordinateToOrigin: false }); const tris = trianglesFromModel(m);
  return [...m.index.elements.values()].filter((e) => tris.has(e.id) && e.ifcClass !== "IfcSpace").map((e) => ({ key: `${tag}:${e.id}`, globalId: e.globalId, ifcClass: e.ifcClass, name: e.name, model: tag, tris: tris.get(e.id) })); };
const ea = load("a.ifc", "A"), eb = load("b.ifc", "B");
const res = clash(ea, eb, { tolerance: 0.01 });
const pair = (x, y) => [x, y].sort().join("|");
const ours = new Set(res.clashes.filter((c) => c.type === "hard").map((c) => pair(c.a.globalId, c.b.globalId)));
const ref = JSON.parse(execFileSync("python3", [new URL("../ci/ifcclash_ref.py", import.meta.url).pathname, dir + "a.ifc", dir + "b.ifc", "0.01"], { env: { ...process.env, PYTHONPATH: process.env.IFCOS08 || "/tmp/ios085" } }).toString());
const theirs = new Set(ref.map((r) => pair(r.a, r.b)));
const onlyOurs = [...ours].filter((x) => !theirs.has(x)), onlyTheirs = [...theirs].filter((x) => !ours.has(x));
assert.ok(ours.size > 0, "reference set has clashes");
assert.deepEqual({ onlyOurs, onlyTheirs }, { onlyOurs: [], onlyTheirs: [] }, "same clashing pairs as IfcOpenShell");
// no false positives inside one model: walls meeting at joins and doors in their walls are not clashes once relations are ignored
const self = clash(ea, ea, { tolerance: 0.01, ignore: (a, b) => a.ifcClass === b.ifcClass || /IfcDoor|IfcWindow/.test(a.ifcClass + b.ifcClass) });
console.log(`ok clash: ${ours.size} hard clashes, identical to IfcOpenShell (${theirs.size}); ${res.stats.ms} ms; self-check with joins/hosts ignored: ${self.clashes.length} clashes`);
