import assert from "assert/strict";
import { Model } from "../src/author/model.js";
const m = new Model();
const r = m.script([
  { cmd: "walls", points: [[0,0],[10000,0],[10000,8000],[0,8000]], closed: true, type: "Exterior 230" },
  { cmd: "wall", start: [6000,0], end: [6000,8000], type: "Interior 115" },
  { cmd: "door", at: [2000,0], type: "Single 900x2100" },
  { cmd: "door", at: [6000,4000], type: "Single 900x2100" },
  { cmd: "window", at: [8000,8000] },
  { cmd: "window", at: [0,4000] },
  { cmd: "floor", from_walls: true },
  { cmd: "room", name: "Living", at: [3000,4000] },
  { cmd: "room", name: "Bedroom", at: [8000,4000] },
  { cmd: "roof", level: "L2" },
]);
assert.ok(r.ok, JSON.stringify(r));
const rooms = m.execute({ cmd: "schedule", kind: "room" }).rows;
assert.deepEqual(rooms.map(x=>x.area_m2), [48, 32]);
const floor = m.execute({ cmd: "schedule", kind: "floor" }).rows[0]; assert.equal(floor.area_m2, 80);
assert.deepEqual(m.execute({ cmd: "schedule", kind: "door" }).rows.map(d=>d.mark), ["D01","D02"]);
// refusals change nothing
const n = Object.keys(m.data.elements).length;
assert.throws(() => m.execute({ cmd: "door", wall: "W1", offset: 2000 }), /overlaps/);
assert.throws(() => m.execute({ cmd: "window", wall: "W1", offset: 50 }), /does not fit/);
assert.throws(() => m.execute({ cmd: "room", name: "Dup", at: [3000,3000] }), /already has room/);
assert.equal(Object.keys(m.data.elements).length, n);
// atomic script rolls back
const bad = m.script([{ cmd: "wall", start: [0,0], end: [0,-5000] }, { cmd: "door", wall: "nope", offset: 1 }]);
assert.equal(bad.ok, false); assert.equal(Object.keys(m.data.elements).length, n);
// dry run
const dr = m.execute({ cmd: "wall", start: [0,0], end: [0,-5000] }, { dry_run: true }); assert.ok(dr.dry_run); assert.equal(Object.keys(m.data.elements).length, n);
// undo/redo
m.execute({ cmd: "delete", ids: ["W1"] }); assert.equal(m.elements.filter(e=>e.host==="W1").length, 0);
m.undo(); assert.ok(m.data.elements.W1); assert.equal(m.elements.filter(e=>e.host==="W1").length, 1);
m.redo(); assert.ok(!m.data.elements.W1); m.undo();
// move wall carries doors
const d1 = m.elements.find(e=>e.mark==="D01"); const o0=d1.offset; m.execute({ cmd: "move", ids: [d1.id], by: [500, 0] }); assert.equal(m.el(d1.id).offset, o0+500);
console.log("ok author:", JSON.stringify(m.execute({cmd:"inspect"}).counts), "rooms", JSON.stringify(rooms));
export { m };
