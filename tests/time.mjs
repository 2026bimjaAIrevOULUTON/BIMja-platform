// M6 gates: imported task counts match IfcOpenShell's ifc4d readers; the timeline gives identical frames on repeat
// (and after a log replay); bad input returns an error object, never a crash.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { SAMPLE_HOUSE } from "../src/app/sample-house.js";
import { parseP6, parseMSPDI, parseSchedule, stateAt } from "../src/time/schedule.js";

const files = { p6: "public/schedules/sample-house.p6.xml", mspdi: "public/schedules/sample-house.mspdi.xml" };
const counts = (s) => ({ activities: Object.keys(s.activities).length, wbs: Object.keys(s.wbs).length, links: s.links.length });

// 1. counts vs ifc4d (when it is installed: CI always, locally optional)
for (const [fmt, f] of Object.entries(files)) {
  const r = (fmt === "p6" ? parseP6 : parseMSPDI)(readFileSync(f, "utf8")); assert.ok(r.ok, r.error);
  const ours = counts(r.schedule);
  let ref = null;
  try { ref = JSON.parse(execFileSync("python3", ["ci/ifc4d_ref.py", fmt, f], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").pop()); }
  catch (e) { if (process.env.CI) throw new Error(`ifc4d reference failed in CI: ${e.message}`); }
  if (ref) assert.deepEqual(ours, ref, `${fmt}: ours ${JSON.stringify(ours)} vs ifc4d ${JSON.stringify(ref)}`);
  console.log(`ok time ${fmt}: ${JSON.stringify(ours)}${ref ? " = ifc4d" : " (ifc4d not installed, reference skipped)"}`);
}
const p6 = parseP6(readFileSync(files.p6, "utf8")).schedule, ms = parseMSPDI(readFileSync(files.mspdi, "utf8")).schedule;
assert.deepEqual(Object.values(p6.activities).map((a) => [a.name, a.start, a.finish]).sort(), Object.values(ms.activities).map((a) => [a.name, a.start, a.finish]).sort(), "P6 and MSPDI of the same programme agree");

// 2. the bus: import, link by rule, timeline, animate, deterministic and replayable
const make = () => installCore(new Bus());
const bus = make(); const run = (name, args) => bus.execute({ name, args, actor: "human" });
assert.ok(run("script", { commands: SAMPLE_HOUSE }).ok);
const imp = run("schedule_import", { xml: readFileSync(files.p6, "utf8") }); assert.ok(imp.ok, JSON.stringify(imp)); assert.equal(imp.data.activities, 14);
assert.ok(run("link", { activity: "1003", rule: { kind: "floor" } }).ok);
assert.ok(run("link", { activity: "1004", rule: { kind: "wall", level: "Level 1" } }).ok);
assert.ok(run("link", { activity: "1005", rule: { kind: "door" } }).ok);
assert.ok(run("link", { activity: "1006", rule: { kind: "window" } }).ok);
assert.ok(run("link", { activity: "1007", rule: { kind: "roof" } }).ok);
assert.equal(run("link", { activity: "nope", elements: ["W1"] }).refusals[0].code, "no_such_element");
assert.equal(run("link", { activity: "1004", elements: ["W999"] }).refusals[0].code, "no_such_element");
assert.equal(run("activity", { name: "Bad", start: "2026-02-10", finish: "2026-02-01" }).refusals[0].code, "bad_arg");

const tl = (date) => run("timeline", { date }).data;
const before = tl("2026-01-01"), walls = tl("2026-02-10"), done = tl("2026-05-01");
assert.equal(before.counts.built + before.counts.active, 0, "nothing built before the start");
assert.equal(walls.counts.active, 6, "6 walls active on 10 Feb"); assert.ok(walls.counts.built >= 1, "slab built by 10 Feb"); assert.ok(walls.active.some((a) => a.name === "Ground floor walls"));
assert.equal(done.counts.hidden + done.counts.active, 0, "everything built at the end");
assert.equal(tl("2026-02-10").hash, walls.hash, "same date, same frame");

const anim = run("animate", { step_days: 7 }).data.frames; const anim2 = run("animate", { step_days: 7 }).data.frames;
assert.ok(anim.length >= 14); assert.deepEqual(anim, anim2, "animation frames identical on repeat");
const replayed = Bus.replay(bus.log, make);
assert.deepEqual(replayed.execute({ name: "animate", args: { step_days: 7 }, actor: "human" }).data.frames, anim, "replayed log gives the same frames");

// auto sequence from the authored model
const b2 = make(); b2.execute({ name: "script", args: { commands: SAMPLE_HOUSE }, actor: "human" });
const auto = b2.execute({ name: "auto_sequence", args: { start: "2026-01-05" }, actor: "human" }); assert.ok(auto.ok, JSON.stringify(auto));
const frames = b2.execute({ name: "animate", args: { step_days: 5 }, actor: "human" }).data.frames;
const last = frames[frames.length - 1]; assert.equal(last.counts.hidden + last.counts.active, 0);
assert.ok(b2.extra.time.links.length >= 3, "auto sequence chains activities");
// agents propose by default; undo removes the schedule
const b3 = make(); const p = b3.execute({ name: "activity", args: { name: "Agent task", start: "2026-01-01", duration_days: 3 }, actor: "agent:t" });
assert.ok(p.proposal && !b3.extra.time?.activities?.A01, "agent activity is a proposal");
b3.execute({ name: "activity", args: { name: "Mine", start: "2026-01-01", duration_days: 3 }, actor: "human" }); assert.ok(b3.extra.time.activities.A01); b3.undo(); assert.ok(!b3.extra.time?.activities?.A01);

// 3. fuzz: never throws, always an error object
const seeds = [readFileSync(files.p6, "utf8"), readFileSync(files.mspdi, "utf8")]; let rnd = 1; const R = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < 300; i++) {
  const s = seeds[i % 2]; const a = Math.floor(R() * s.length), b = Math.min(s.length, a + Math.floor(R() * 200));
  const mut = i % 3 === 0 ? s.slice(0, a) : i % 3 === 1 ? s.slice(0, a) + s.slice(b) : s.slice(0, a) + "<x>&#xZZ;" + s.slice(a);
  const r = parseSchedule(mut); assert.equal(typeof r.ok, "boolean");
  const br = bus.execute({ name: "schedule_import", args: { xml: mut, merge: true }, actor: "human", dry_run: true }); assert.equal(typeof br.ok, "boolean");
}
for (const junk of [null, 42, "", "<a/>", "<APIBusinessObjects/>", "<Project/>"]) assert.equal(typeof parseSchedule(junk).ok, "boolean");
assert.throws(() => stateAt(p6, "not a date"));
console.log(`ok time: timeline + ${anim.length} animation frames deterministic, replay identical, auto sequence ${auto.data.activities} activities, 300 fuzz inputs handled`);
