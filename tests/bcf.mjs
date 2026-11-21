// BCF gate: export -> import is identical; every XML validates against the official BCF 2.1 XSDs; bad input returns errors, never throws.
import assert from "assert/strict"; import fs from "fs"; import { execFileSync } from "child_process";
import { exportBCF, importBCF } from "../src/coord/bcf.js";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const topics = [
  { guid: "11111111-2222-4333-8444-555555555555", title: "Duct clashes with beam B12 <level 2>", type: "Clash", status: "Open", priority: "High", labels: ["MEP", "Structure"],
    created: "2026-11-21T06:00:00Z", author: "human", assigned: "mep@example.com", description: "Penetration 120 mm & needs reroute",
    files: [{ name: "structure.ifc", ifcProject: "0YvctVUKr0kugbFTf53O9L" }],
    comments: [{ guid: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", date: "2026-11-21T06:05:00Z", author: "agent:claude", text: "Suggest lowering the duct 150 mm", viewpoint: "99999999-8888-4777-8666-555555555555" }],
    viewpoints: [{ guid: "99999999-8888-4777-8666-555555555555", selection: ["2O2Fr$t4X7Zf8NOew3FLOH", "1Oms875aH3Wg$9l65H2ZGw"], camera: { position: [10, -12, 8], direction: [-0.5, 0.7, -0.4], up: [0, 0, 1], fov: 50 }, snapshot: png },
      { guid: "77777777-6666-4555-8444-333333333333", selection: [], camera: { position: [1, 2, 3], direction: [0, 1, 0], up: [0, 0, 1], fov: 60 } }] },
  { guid: "22222222-3333-4444-8555-666666666666", title: "Door D03 missing fire rating", type: "Issue", status: "Closed", created: "2026-11-21T06:10:00Z", author: "human", labels: [], comments: [], viewpoints: [] },
];
const bytes = exportBCF(topics); assert.deepEqual(bytes, exportBCF(topics), "deterministic");
const back = await importBCF(bytes); assert.ok(back.ok, back.errors?.join());
assert.deepEqual(back.topics.sort((a, b) => a.guid.localeCompare(b.guid)), JSON.parse(JSON.stringify(topics)), "export -> import is identical");
// XSD validation with xmllint against buildingSMART schemas
const xsd = execFileSync("bash", [new URL("../ci/fetch_bcf_xsd.sh", import.meta.url).pathname]).toString().trim();
const dir = new URL("../dist-test/bcf-out/", import.meta.url).pathname; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + "issues.bcfzip", bytes); execFileSync("python3", ["-c", `import zipfile;zipfile.ZipFile('${dir}issues.bcfzip').extractall('${dir}x')`]);
let n = 0; const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
for (const f of walk(dir + "x")) {
  const schema = f.endsWith(".bcf") ? "markup.xsd" : f.endsWith(".bcfv") ? "visinfo.xsd" : f.endsWith("bcf.version") ? "version.xsd" : null; if (!schema) continue;
  execFileSync("xmllint", ["--noout", "--schema", `${xsd}/${schema}`, f], { stdio: "pipe" }); n++;
}
// fuzz: never throw
for (let i = 0; i < 200; i++) { const junk = new Uint8Array(Math.floor(Math.random() * 400)).map(() => Math.random() * 256); const r = await importBCF(junk); assert.equal(typeof r.ok, "boolean"); }
const cut = await importBCF(bytes.slice(0, bytes.length - 40)); assert.equal(cut.ok, false);
console.log(`ok bcf: ${topics.length} topics round-trip identical, ${n} XML files valid against BCF 2.1 XSD, 200 fuzz inputs handled`);
