// The agent team: rosters by project type, persistence of edits, responsibility matrix, delivery status, ownership.
import assert from "node:assert/strict";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { PROJECT_TYPES, ROLES, STAGES, assembleTeam, ownerOf } from "../src/agents/team.js";
const bus = installCore(new Bus()); const ex = (n, a, actor = "agent:planner") => bus.execute({ name: n, args: a, actor, apply: true });
// every type: the seven stage leads, unique ids and colours, parents present
for (const t of Object.keys(PROJECT_TYPES)) { const T = assembleTeam(t); for (const s of STAGES) assert.ok(T.some((m) => m.id === s.lead), `${t}: ${s.lead}`);
  assert.equal(new Set(T.map((m) => m.id)).size, T.length); assert.equal(new Set(T.map((m) => m.colour)).size, T.length, `${t}: distinct colours`);
  for (const m of T) if (m.parent) assert.ok(T.some((x) => x.id === m.parent) || ROLES[m.parent], `${t}: ${m.id} parent known`); }
const dc = assembleTeam("data_centre").map((m) => m.id); for (const r of ["process_cooling_engineer", "power_distribution_engineer", "it_whitespace_designer", "fuel_generator_engineer", "hvac_consultant"]) assert.ok(dc.includes(r), `data centre has ${r}`);
const exc = assembleTeam("excavation").map((m) => m.id); for (const r of ["geotechnical_engineer", "slope_stability_engineer", "blasting_specialist"]) assert.ok(exc.includes(r)); assert.ok(!exc.includes("hvac_consultant"), "no HVAC on an excavation");
// commands
assert.equal(ex("project_brief", { type: "spaceship" }).ok, false); assert.ok(ex("project_brief", { name: "DC1", client: "Example", type: "data_centre", lod_target: 350 }).ok);
const t1 = ex("team_assemble", {}).data; assert.equal(t1.type, "data_centre");
ex("team_assemble", { add: ["acoustic_consultant"] }); ex("team_assemble", { remove: ["fire_engineer"] }); const t2 = bus.extra.team.members.map((m) => m.id);
assert.ok(t2.includes("acoustic_consultant") && !t2.includes("fire_engineer"), "edits persist"); assert.equal(ex("team_assemble", { remove: ["planner"] }).ok, false, "stage leads stay"); assert.equal(ex("team_assemble", { add: ["wizard"] }).ok, false);
const raci = bus.execute({ name: "responsibility_matrix", args: {}, actor: "human" }).data; for (const row of raci.rows) assert.equal(Object.values(row.raci).filter((v) => v === "R").length >= 1, true, `${row.deliverable} has a responsible role`);
const st = bus.execute({ name: "delivery_status", args: {}, actor: "human" }).data.stages; assert.equal(st.length, 7); assert.equal(st[0].status, "done"); assert.equal(st[2].status, "not_started");
ex("mass", { outline: [[0, 0], [1000, 0], [1000, 1000]], height: 1000 }, "agent:architect"); assert.equal(bus.execute({ name: "delivery_status", args: {}, actor: "human" }).data.stages[2].status, "done");
// ownership: each discipline goes to its engineer
const T = bus.extra.team.members; assert.equal(ownerOf(T, "S").id, "structural_engineer"); assert.equal(ownerOf(T, "M").id, "hvac_consultant"); assert.equal(ownerOf(T, "E").id, "electrical_engineer"); assert.equal(ownerOf(T, "A").id, "architect");
const replay = Bus.replay(bus.log, () => installCore(new Bus())); assert.deepEqual(replay.extra.team, bus.extra.team, "team replays");
console.log(`ok team: ${Object.keys(PROJECT_TYPES).length} project types, data centre ${dc.length} agents, excavation ${exc.length}, RACI ${raci.rows.length} deliverables, delivery status, ownership, replay`);
