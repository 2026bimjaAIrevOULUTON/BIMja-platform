// M1 gates: replay gives identical bytes, stale_rev returns a diff, locks hold, proposals/pause, idempotency, atomic scripts, session undo.
import assert from "assert/strict";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { REGISTRY } from "../src/commands/registry.js";
let t = 1_000_000; const clock = () => t;
const mk = () => installCore(new Bus({ now: clock }));
const b = mk();
const ok = (r) => { assert.ok(r.ok, JSON.stringify(r)); return r; };
ok(b.execute({ name: "walls", args: { points: [[0,0],[10000,0],[10000,8000],[0,8000]], closed: true }, session: "h1" }));
ok(b.execute({ name: "wall", args: { start: [6000,0], end: [6000,8000], type: "Interior 115" }, session: "h2" }));
ok(b.execute({ name: "door", args: { at: [2000,0] }, session: "h3" }));
assert.equal(b.rev, 3);
// agents propose by default
const p = b.execute({ name: "room", args: { name: "Living", at: [3000,4000] }, actor: "agent:test", session: "a1" });
assert.ok(p.proposal && b.rev === 3, "agent write is a proposal");
ok(b.execute({ name: "apply_proposal", args: { id: p.proposal } }));
assert.equal(b.rev, 4); assert.equal(b.log.at(-1).actor, "agent:test"); assert.equal(b.log.at(-1).approvedBy, "human");
// headless apply
ok(b.execute({ name: "room", args: { name: "Bed", at: [8000,4000] }, actor: "agent:test", apply: true, session: "a2" }));
// typed refusals write nothing
const r1 = b.execute({ name: "door", args: { wall: "W1", offset: 2000 } }); assert.equal(r1.refusals[0].code, "would_overlap"); assert.equal(b.rev, 5);
const r2 = b.execute({ name: "door", args: { wall: "nope", offset: 10 } }); assert.equal(r2.refusals[0].code, "no_such_element");
const r3 = b.execute({ name: "flyaway" }); assert.equal(r3.refusals[0].code, "unknown_command");
assert.equal(b.execute({ name: "activity" }).refusals[0].code, "not_implemented");
// stale rev
const st = b.execute({ name: "wall", args: { start: [0,9000], end: [5000,9000] }, rev: 2 }); assert.equal(st.refusals[0].code, "stale_rev"); assert.ok(st.diff.added.length > 0);
// locks: a person holds W1; the agent is refused, the person is not
b.lock(["W1"], "human");
const lk = b.execute({ name: "set", args: { id: "W1", name: "North wall" }, actor: "agent:test", apply: true }); assert.equal(lk.refusals[0].code, "locked"); assert.equal(lk.holder, "human");
ok(b.execute({ name: "set", args: { id: "W1", name: "North wall" } }));
t += 3100; ok(b.execute({ name: "set", args: { id: "W1", name: "N wall" }, actor: "agent:test", apply: true })); // lock expired
// pause queues
b.execute({ name: "pause_agents", args: { paused: true } });
const pz = b.execute({ name: "set", args: { id: "W2", name: "East" }, actor: "agent:test", apply: true }); assert.equal(pz.refusals[0].code, "paused"); assert.ok(pz.proposal);
assert.equal(b.execute({ name: "pause_agents", args: { paused: false }, actor: "agent:test" }).refusals[0].code, "bad_arg");
b.execute({ name: "pause_agents", args: { paused: false } });
// idempotent ids
const before = b.rev; ok(b.execute({ id: "fixed-1", name: "level", args: { name: "Roof", elevation: 6000 } })); b.execute({ id: "fixed-1", name: "level", args: { name: "Roof", elevation: 6000 } }); assert.equal(b.rev, before + 1);
// atomic script: all or nothing, one rev
const revS = b.rev; const sc = b.execute({ name: "script", args: { commands: [{ name: "wall", args: { start: [0,-3000], end: [4000,-3000] } }, { name: "door", args: { wall: "ZZ", offset: 1 } }] } });
assert.equal(sc.ok, false); assert.equal(b.rev, revS);
ok(b.execute({ name: "script", args: { commands: [{ name: "wall", args: { start: [0,-3000], end: [4000,-3000] } }, { name: "wall", args: { start: [4000,-3000], end: [4000,-6000] } }] }, actor: "agent:bulk", apply: true, session: "bulk" }));
assert.equal(b.rev, revS + 1);
// session undo/redo
const n0 = Object.keys(b.model.data.elements).length; b.undo(); assert.equal(Object.keys(b.model.data.elements).length, n0 - 2); b.redo(); assert.equal(Object.keys(b.model.data.elements).length, n0);
// replay: same commands, same bytes
const re = Bus.replay(b.log, mk);
assert.equal(JSON.stringify(re.model.data), JSON.stringify(b.model.data), "replay reproduces the model byte for byte");
// every live non-viewer command has a handler; stubs refuse
for (const r of REGISTRY) if (!r.needs) assert.ok(b.has(r.name), `handler for ${r.name}`);
// commands is cheap
const t0 = performance.now(); for (let i = 0; i < 100; i++) b.execute({ name: "commands" }); const per = (performance.now() - t0) / 100; assert.ok(per < 50, `commands ${per}ms`);
console.log(`ok bus: rev ${b.rev}, ${b.log.length} log entries, replay identical, commands ${per.toFixed(2)} ms`);
