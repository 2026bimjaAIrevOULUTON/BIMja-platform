// Brief and team commands (headless): the project brief, the agent team assembled from the project type, the
// responsibility matrix, and where the delivery stands stage by stage.
import { STAGES, ROLES, PROJECT_TYPES, assembleTeam, responsibilityMatrix } from "./team.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };
const clean = (v, n = 200) => (v == null ? undefined : String(v).replace(/[\u0000-\u001f]/g, " ").slice(0, n));

export function installTeam(bus) {
  bus.register("project_brief", (a) => {
    if (a.type != null && !PROJECT_TYPES[a.type]) fail(`type must be one of ${Object.keys(PROJECT_TYPES).join(", ")}`);
    const b = (bus.extra.brief = { ...(bus.extra.brief || {}) });
    for (const k of ["name", "client", "description", "stage_gate"]) if (a[k] != null) b[k] = clean(a[k], k === "description" ? 600 : 120);
    if (a.type != null) b.type = a.type; if (a.lod_target != null) { const v = +a.lod_target; if (![100, 200, 300, 350, 400, 500].includes(v)) fail("lod_target: 100, 200, 300, 350, 400 or 500"); b.lod_target = v; }
    if (a.name != null && bus.model?.data) bus.model.data.name = b.name;
    return { brief: b };
  });
  bus.register("team_assemble", (a) => {
    const type = a.type || bus.extra.brief?.type || "building"; const prev = bus.extra.team?.type === type && a.reset !== true ? bus.extra.team : null; // adds and removals persist until the type changes or reset
    const add = [...new Set([...(prev?.add || []), ...(a.add || [])])].filter((r) => !(a.remove || []).includes(r)), remove = [...new Set([...(prev?.remove || []), ...(a.remove || [])])].filter((r) => !(a.add || []).includes(r));
    const members = assembleTeam(type, { add, remove });
    bus.extra.team = { type, members, add, remove };
    return { type, size: members.length, members: members.map((m) => ({ id: m.id, title: m.title, stage: m.stage, discipline: m.discipline, parent: m.parent || null })) };
  });
  bus.register("team", (a) => {
    const t = bus.extra.team; const out = { assembled: !!t, type: t?.type || null, members: t?.members || [] };
    if (a.library) Object.assign(out, { stages: STAGES, roles: ROLES, project_types: Object.fromEntries(Object.entries(PROJECT_TYPES).map(([k, v]) => [k, v.title])) });
    return out;
  }, { kind: "read" });
  bus.register("responsibility_matrix", () => { const t = bus.extra.team || fail("assemble the team first: team_assemble {type}", "no_team"); return responsibilityMatrix(t.members); }, { kind: "read" });
  bus.register("delivery_status", () => {
    const x = bus.extra, els = Object.values(bus.model?.data?.elements || {}); const acts = Object.keys(x.time?.activities || {}).length;
    const has = { brief: !!(x.brief?.type && x.team), site: !!(x.geo?.location || x.site?.points?.length), design: els.length > 0, coordinate: !!(bus.lastModelClash || x.issues?.length || x.federation),
      document: (x.docs?.sheets?.length || 0) > 0, construct: acts > 0 && !!x.cost?.rates?.length, handover: !!(x.handover || x.cobie || x.handover_done) };
    const started = { brief: !!(x.brief || x.team), site: has.site, design: els.length > 0, coordinate: has.coordinate, document: !!x.docs, construct: acts > 0 || !!x.cost, handover: !!x.handover };
    return { stages: STAGES.map((s) => ({ id: s.id, title: s.title, lead: ROLES[s.lead].title, status: has[s.id] ? "done" : started[s.id] ? "in_progress" : "not_started" })) };
  }, { kind: "read" });
  bus.register("handover_mark", (a) => { bus.extra.handover = { at: clean(a.date || new Date().toISOString().slice(0, 10), 30), note: clean(a.note, 200) }; return bus.extra.handover; });
  return bus;
}
