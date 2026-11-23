// The bimja skill's command catalogue must match the registry, and its runner must work headlessly.
import assert from "node:assert/strict"; import { readFileSync, mkdtempSync, writeFileSync, existsSync } from "node:fs"; import { execFileSync } from "node:child_process"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { REGISTRY } from "../src/commands/registry.js";
const md = readFileSync(new URL("../skills/bimja/references/commands.md", import.meta.url), "utf8");
for (const r of REGISTRY) assert.ok(md.includes(`| \`${r.name}\` |`), `skills/bimja/references/commands.md is missing ${r.name}: run node scripts/gen-skill-commands.mjs`);
assert.ok(md.includes(`${REGISTRY.length} commands.`), "command count changed: run node scripts/gen-skill-commands.mjs");
const dir = mkdtempSync(join(tmpdir(), "bimja-skill-")); const plan = join(dir, "plan.json");
writeFileSync(plan, JSON.stringify([{ name: "walls", args: { points: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], closed: true } }, { name: "door", args: { at: [1500, 0] } },
  { name: "room", args: { name: "Cabin", at: [3000, 2000] } }, { name: "zone", args: { code: "CB", outline: [[-4000, -4000], [10000, -4000], [10000, 8000], [-4000, 8000]] } },
  { name: "grid", args: { name: "1", zone: "CB", start: [0, -3000], end: [0, 7000] } }, { name: "grid", args: { name: "A", zone: "CB", start: [-3000, 0], end: [9000, 0] } },
  { name: "drawing_setup", args: { project_code: "CAB" } }, { name: "sheet", args: { kind: "ga", zone: "CB" } }, { name: "@drawings", args: { formats: ["pdf"] } }, { name: "export_ifc", args: {} }]));
execFileSync(process.execPath, [new URL("../skills/bimja/scripts/bimja.mjs", import.meta.url).pathname, plan, "--out", join(dir, "out")], { stdio: "pipe" });
const res = JSON.parse(readFileSync(join(dir, "out", "results.json"), "utf8"));
assert.ok(res.steps.every((s) => s.ok), JSON.stringify(res.steps.filter((s) => !s.ok)));
const ga = res.steps.find((s) => s.name === "drawing"); assert.equal(ga.qa.overlaps, 0); assert.deepEqual(ga.qa.missing, []); assert.equal(ga.scale, 100);
assert.ok(res.files.some((f) => f.endsWith(".pdf")) && res.files.some((f) => f.endsWith(".ifc")) && res.files.every((f) => existsSync(f)));
console.log(`ok skill: catalogue matches ${REGISTRY.length} commands; runner built a cabin, GA at 1:100 with clean QA, IFC`);
