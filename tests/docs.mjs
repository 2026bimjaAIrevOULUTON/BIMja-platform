// D1 gates: drawings come from the model (plans, elevations, sections, schedules) in three standards; ISO 19650
// naming, status codes and revisions; publish is deterministic; every PDF, DXF and XLSX opens in an independent reader.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { SAMPLE_HOUSE } from "../src/app/sample-house.js";
import { landmarkProject } from "../src/app/landmarks.js";
import { unzip } from "../src/coord/zip.js";

mkdirSync("dist-test", { recursive: true });
const house = (standard = "iso19650-uk") => { const b = installCore(new Bus()); const run = (n, a, actor = "human") => b.execute({ name: n, args: a, actor });
  assert.ok(run("script", { commands: SAMPLE_HOUSE }).ok); assert.ok(run("drawing_setup", { standard, project_code: "HSE", originator: "BJA", project_name: "Sample house", client: "Demo client" }).ok); return { b, run }; };
const py = (args) => { try { return JSON.parse(execFileSync("python3", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }).trim().split("\n").pop()); } catch (e) { if (process.env.CI) throw new Error(e.stderr || e.message); return null; } };

// sheet set and naming
const { b, run } = house();
assert.equal(run("sheet", { kind: "plan", level: "nope" }).refusals[0].code, "bad_arg");
assert.equal(run("drawing_setup", { standard: "din" }).refusals[0].code, "bad_arg");
assert.equal(run("publish", { status: "S2" }).refusals[0].code, "bad_arg", "nothing to publish before sheets exist");
const auto = run("sheets_auto", {}); assert.ok(auto.ok); assert.equal(auto.data.sheets, 5, "register, L1 plan, elevations, sections, schedules");
const reg = run("register", {}).data; const plan = reg.sheets.find((s) => s.kind === "plan");
assert.equal(plan.container, "HSE-BJA-ZZ-00-DR-A-1001", "ISO 19650 container name: project-originator-volume-level-type-role-number");
// the plan drawing really is the model: cut walls, doors with swings, rooms with areas, overall dimension
const svg = run("drawing", { sheet: plan.id, format: "svg" }).data.svg;
assert.ok(svg.includes(">Living<") && svg.includes("48.0 m²") && svg.includes(">10230<"), "room name, area and the 10 230 mm overall dimension are on the plan");
assert.ok((svg.match(/fill="#3a3a3a"/g) || []).length >= 10, "cut walls are filled"); assert.ok(svg.includes(">D01<") && svg.includes(">W01<"), "door and window marks");
// revisions follow the status family
const p1 = run("publish", { status: "S2", date: "2026-11-21" }); assert.ok(p1.ok, JSON.stringify(p1.refusals));
assert.ok(p1.data.register.every((r) => r.rev === "P01" && r.status === "S2"));
const p2 = run("publish", { status: "S3", date: "2026-11-22", sheets: [plan.id] }); assert.equal(p2.data.register[0].rev, "P02");
const p3 = run("publish", { status: "A2", date: "2026-11-23", sheets: [plan.id] }); assert.equal(p3.data.register[0].rev, "C01", "authorised issues start the C series");
assert.equal(run("publish", { status: "S9" }).refusals[0].code, "bad_arg");
// agents propose, people apply
assert.ok(b.execute({ name: "publish", args: { status: "S2", date: "2026-11-24" }, actor: "agent:x" }).proposal, "an agent's publish is a proposal");
// deterministic: same model, same args, same bytes
const again = house(); again.run("sheets_auto", {}); const q1 = again.run("publish", { status: "S2", date: "2026-11-21" });
const fresh = house(); fresh.run("sheets_auto", {}); const q2 = fresh.run("publish", { status: "S2", date: "2026-11-21" });
assert.equal(q1.data.base64, q2.data.base64, "publish is deterministic");
const zipPath = "dist-test/house-S2.zip"; writeFileSync(zipPath, Buffer.from(q1.data.base64, "base64"));
const uz = await unzip(Buffer.from(q1.data.base64, "base64")); const names = uz instanceof Map ? [...uz.keys()] : Array.isArray(uz) ? uz.map((f) => f.name) : Object.keys(uz);
assert.ok(names.some((n) => n.endsWith("SET_S2.pdf")) && names.filter((n) => n.startsWith("dxf/")).length === 3 && names.some((n) => n.endsWith(".xlsx")), names.join(", "));
const chk = py(["ci/check_deliverables.py", zipPath]);
if (chk) {
  assert.deepEqual(chk.errors, [], chk.errors.join("; "));
  const set = Object.entries(chk.pdf).find(([n]) => n.endsWith("SET_S2.pdf"))[1]; assert.equal(set.pages, 5);
  for (const [n, d] of Object.entries(chk.dxf)) { assert.equal(d.audit_errors, 0, n); assert.ok(d.entities > 50 && d.types.includes("LINE") && d.types.includes("TEXT"), n); }
  const planDxf = Object.entries(chk.dxf).find(([n]) => n.includes("-00-DR-"))[1]; assert.ok(planDxf.layers.includes("A-Ss_25_10-M_Walls-Cut") && planDxf.types.includes("SOLID"), "Uniclass-style layers and filled cut walls");
  const xl = Object.values(chk.xlsx)[0]; assert.ok(xl["Register (MIDP)"] >= 6 && xl["Door schedule"] >= 4 && xl["Room schedule"] >= 4, JSON.stringify(xl));
  console.log(`ok docs deliverables: ${Object.keys(chk.pdf).length} PDFs, ${Object.keys(chk.dxf).length} DXFs (0 audit errors), xlsx ${Object.keys(xl).join(", ")}`);
} else console.log("ok docs deliverables: python readers not installed, skipped");

// other standards
const us = house("us-ncs"); us.run("sheets_auto", {}); const usPlan = us.run("register", {}).data.sheets.find((s) => s.kind === "plan");
assert.equal(usPlan.shown, "A-101"); assert.ok(us.run("drawing", { sheet: usPlan.id, format: "svg" }).data.svg.includes(">A-101<"));
const ind = house("is-nbc"); ind.run("sheets_auto", {}); const inPlan = ind.run("register", {}).data.sheets.find((s) => s.kind === "plan");
assert.ok(ind.run("drawing", { sheet: inPlan.id, format: "svg" }).data.svg.includes("Area statement"), "IS/NBC plans carry an area statement");

// landmarks get drawings too (masses: cut + hidden lines)
const L = installCore(new Bus()); const lp = landmarkProject("taj");
L.execute({ name: "load_project", args: { project: lp.project }, actor: "human" }); L.execute({ name: "script", args: { commands: lp.landmark.commands }, actor: "human" });
L.execute({ name: "drawing_setup", args: { project_code: "TAJ" }, actor: "human" }); assert.equal(L.execute({ name: "sheets_auto", args: {}, actor: "human" }).data.sheets, 6);
const t0 = performance.now(); const el = L.execute({ name: "drawing", args: { sheet: L.extra.docs.sheets.find((s) => s.kind === "elevations").id, format: "svg" }, actor: "human" }).data;
assert.ok((el.svg.match(/<line /g) || []).length > 800, "Taj elevations have the dome, chhatris and minarets"); assert.ok(el.svg.includes("Credit: Taj Mahal"));
console.log(`ok docs: ISO 19650 naming + S/A revisions, US NCS A-101, IS/NBC area statement, deterministic publish, Taj elevations ${Math.round(performance.now() - t0)} ms`);
