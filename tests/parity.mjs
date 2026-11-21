// Parity gate: every live command is reachable from the UI (its ui_path exists in index.html) and from window.bimja,
// or carries a written headless_only reason. Names are unique, snake_case and read like intent.
import fs from "fs"; import assert from "assert/strict";
import { REGISTRY } from "../src/commands/registry.js";
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const api = main.slice(main.indexOf("window.bimja = {"));
const names = REGISTRY.map((c) => c.name);
assert.equal(new Set(names).size, names.length, "command names are unique");
const problems = [];
for (const c of REGISTRY) {
  if (!/^[a-z][a-z0-9_]*$/.test(c.name)) problems.push(`${c.name}: not snake_case`);
  if (!["live", "spec", "stub"].includes(c.status)) problems.push(`${c.name}: bad status`);
  if (c.status !== "live") continue;
  if (c.headless_only) { if (String(c.headless_only).length < 20) problems.push(`${c.name}: headless_only needs a real reason`); }
  else if (!c.ui_path) problems.push(`${c.name}: no ui_path and no headless_only reason`);
  else { const id = c.ui_path.replace(/^#/, ""); if (!new RegExp(`id="${id}"`).test(html)) problems.push(`${c.name}: ui_path ${c.ui_path} not found in index.html`); }
  if (!new RegExp(`\\b${c.name}\\b\\s*[:,]`).test(api)) problems.push(`${c.name}: not exposed on window.bimja`);
}
const by = (s) => REGISTRY.filter((c) => c.status === s).length;
if (problems.length) { console.error("PARITY FAIL\n" + problems.join("\n")); process.exit(1); }
console.log(`ok parity: ${by("live")} live (all reachable from UI and window.bimja), ${by("spec")} spec, ${by("stub")} stub, ${REGISTRY.length} registered`);
