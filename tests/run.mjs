// Regression tests on the open sample models. Run: npm test
import fs from "fs"; import assert from "assert/strict";
import { createApi, openModel } from "../src/ifc.js";
import { runCheck, quantities } from "../src/rules.js";
const api = await createApi(new URL("../node_modules/web-ifc/", import.meta.url).pathname);
const cases = [
  { file: "AC20-FZK-Haus.ifc.txt", elements: 90, storeys: 2, doors: 5, minScore: 80 },
  { file: "Ifc4_SampleHouse.ifc.txt", elements: 62, storeys: 2, doors: 3, minScore: 80 },
];
for (const c of cases) {
  const m = openModel(api, fs.readFileSync(new URL(`../public/models/${c.file}`, import.meta.url)));
  const els = [...m.index.elements.values()];
  assert.equal(m.schema, "IFC4"); assert.equal(els.length, c.elements, `${c.file} element count`);
  assert.equal(m.index.storeys.length, c.storeys);
  assert.equal(els.filter((e) => e.ifcClass === "IfcDoor").length, c.doors);
  assert.ok(els.every((e) => e.globalId.length === 22), "every element has a 22-char GlobalId");
  const chk = runCheck(m.index.elements); assert.ok(chk.score >= c.minScore && chk.score <= 100);
  assert.ok(chk.issues.every((i) => m.index.elements.has(i.expressID)), "issues point at real elements");
  assert.ok(quantities(m.index.elements).some((r) => r.area_m2 > 0), "quantities read from Qto sets");
  api.CloseModel(m.modelID);
  console.log(`ok ${c.file}: ${els.length} elements, score ${chk.score}%, ${chk.issues.length} issues`);
}
