#!/usr/bin/env node
// Run BIMja commands headlessly (no browser, no MCP client needed) and write every file they produce.
// Usage:
//   node skills/bimja/scripts/bimja.mjs <plan.json> [--out <dir>] [--project <in.bimja.json>] [--save <out.bimja.json>]
// plan.json is either a list of commands or {"commands": [...]}; each command is {"name": "...", "args": {...}}.
// The runner macro {"name": "@drawings", "args": {"formats": ["pdf", "dxf"]}} renders every sheet in the register.
// Writes are applied directly (this is your own batch run, not a shared session), in order; the run stops at the first
// refusal unless that step has "continue": true. Results go to <out>/results.json; files the commands return
// (drawings as PDF/SVG/DXF, IFC, COBie, published zips, renders, CSV) are written next to it.
// The repo is found from this file's location, or from BIMJA_HOME.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const argv = process.argv.slice(2); const opt = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? null : argv[i + 1]; };
const planPath = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
if (!planPath) { console.error("usage: bimja.mjs <plan.json> [--out dir] [--project in.bimja.json] [--save out.bimja.json]"); process.exit(2); }
const HOME = resolve(process.env.BIMJA_HOME || join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const imp = (p) => import(pathToFileURL(join(HOME, p)).href);
const { Bus } = await imp("src/core/bus.js"); const { installCore } = await imp("src/core/handlers.js");
try { await (await imp("src/author/kernel.js")).loadKernel(); } catch (e) { console.error(`geometry kernel unavailable (${e.message}); booleans and clash_model will refuse`); }
const bus = installCore(new Bus());
const out = resolve(opt("out") || "bimja-out"); mkdirSync(out, { recursive: true });
const safe = (s) => String(s).replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
const run = (name, args = {}) => bus.execute({ name, args, actor: "agent:bimja-skill", apply: true });

if (opt("project")) { const r = run("load_project", { project: JSON.parse(readFileSync(opt("project"), "utf8")) }); if (!r.ok) { console.error(JSON.stringify(r.refusals)); process.exit(1); } }
const plan = JSON.parse(readFileSync(planPath, "utf8")); const cmds = Array.isArray(plan) ? plan : plan.commands || [];
const results = []; const files = [];
const write = (name, data, enc) => { const p = join(out, safe(name)); writeFileSync(p, enc === "base64" ? Buffer.from(data, "base64") : data); files.push(p); return p; };
// "@drawings" (runner macro, not a BIMja command): render every sheet in the register, {formats: ["pdf","svg","dxf"]}
const expand = (c) => { if (c.name !== "@drawings") return [c]; const reg = run("register", {}); if (!reg.ok) return [c];
  return reg.data.sheets.flatMap((s) => (c.args?.formats || ["pdf"]).map((format) => ({ name: "drawing", args: { sheet: s.id, format }, continue: true }))); };
const steps = [...cmds];
for (let i = 0; i < steps.length; i++) {
  if (steps[i].name === "@drawings") { steps.splice(i, 1, ...expand(steps[i])); if (i >= steps.length) break; } // expanded when reached, so it sees the sheets made so far
  const c = steps[i]; const r = run(c.name, c.args || {}); const d = r.data;
  const summary = { step: i, name: c.name, ok: r.ok, ...(r.ok ? {} : { refusals: r.refusals }) };
  if (r.ok && d && typeof d === "object") {
    const tag = d.number?.shown || d.filename || `${i}-${c.name}`;
    if (c.name === "drawing") { if (d.svg) write(`${tag}.svg`, d.svg); if (d.base64) write(`${tag}.pdf`, d.base64, "base64"); if (d.dxf) write(`${tag}.dxf`, d.dxf); summary.sheet = tag; if (d.qa) summary.qa = d.qa; if (d.scale) summary.scale = d.scale; summary.paper = d.paper; }
    else if (d.base64 && d.filename) write(d.filename, d.base64, "base64");
    else if (typeof d.csv === "string") write(`${tag}.csv`, d.csv);
    else if (typeof d.png === "string" || (typeof d.image === "string" && d.image.startsWith("data:image"))) write(`${tag}.png`, (d.png || d.image).split(",").pop(), "base64");
    const keys = Object.keys(d).filter((k) => !["svg", "base64", "dxf", "csv", "png", "image", "project", "model", "extra", "log"].includes(k));
    summary.data = JSON.parse(JSON.stringify(Object.fromEntries(keys.map((k) => [k, d[k]])), (k, v) => (typeof v === "string" && v.length > 400 ? v.slice(0, 400) + "…" : v)));
  } else if (r.ok && typeof d === "string") { const ext = c.name === "export_ifc" ? "ifc" : "txt"; write(`${i}-${c.name}${c.args?.discipline ? "-" + c.args.discipline : ""}.${ext}`, d); }
  results.push(summary);
  if (!r.ok && !c.continue) { console.error(`step ${i} (${c.name}) refused: ${JSON.stringify(r.refusals)}`); break; }
}
if (opt("save")) { const s = run("save", {}); writeFileSync(resolve(opt("save")), JSON.stringify(s.data)); files.push(resolve(opt("save"))); }
writeFileSync(join(out, "results.json"), JSON.stringify({ steps: results, files }, null, 1));
const bad = results.filter((r) => !r.ok); const qaBad = results.filter((r) => r.qa && (r.qa.overlaps || r.qa.missing?.length));
console.log(`${results.length} steps, ${bad.length} refused, ${files.length} files → ${out}${qaBad.length ? `; QA problems on ${qaBad.map((r) => r.sheet).join(", ")}` : ""}`);
process.exit(bad.length && !steps[results.length - 1]?.continue ? 1 : 0);
