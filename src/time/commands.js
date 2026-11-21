// 4D commands on the bus. Headless-safe: the browser adds visuals on top (src/app/time-ui.js).
// State lives in bus.extra.time, so it is saved with the project, undone and replayed like the model.
import { parseSchedule, stateAt, frames, span, linkViolations, toMs, isoDate, emptySchedule, LINK_TYPES, ACTIVITY_TYPES, autoSequence } from "./schedule.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };

export function installTime(bus) {
  const T = () => (bus.extra.time ||= emptySchedule());
  // Element lookup; the app widens these to IFC GlobalIds and classes when a model is open.
  bus.time ||= {};
  bus.time.has ||= (id) => !!bus.model.data.elements[id];
  bus.time.resolveRule ||= (rule) => {
    const lv = rule.level && bus.model.data.levels.find((l) => l.id === rule.level || l.name === rule.level);
    if (rule.level && !lv) fail(`no level ${rule.level}`, "no_such_element");
    return Object.values(bus.model.data.elements).filter((e) => (!rule.kind || [].concat(rule.kind).includes(e.kind)) && (!lv || e.level === lv.id)).map((e) => e.id).sort();
  };

  bus.register("activity", (a) => {
    const t = T(); const id = String(a.id || `A${String(Object.keys(t.activities).length + 1).padStart(2, "0")}`);
    const cur = t.activities[id];
    if (a.delete) { if (!cur) fail(`no activity ${id}`, "no_such_element"); delete t.activities[id]; t.links = t.links.filter((l) => l.from !== id && l.to !== id); return { deleted: id }; }
    const next = { id, code: id, name: "", type: "construct", elements: [], ...(cur || {}) };
    for (const k of ["name", "start", "finish", "code", "wbs"]) if (a[k] != null) next[k] = String(a[k]);
    if (a.type != null) { if (!ACTIVITY_TYPES.includes(a.type)) fail(`type must be one of ${ACTIVITY_TYPES.join(", ")}`); next.type = a.type; }
    if (a.duration_days != null && next.start) next.finish = isoDate(toMs(next.start) + +a.duration_days * 86400000);
    if (!Number.isFinite(toMs(next.start)) || !Number.isFinite(toMs(next.finish))) fail("give start and finish as dates (YYYY-MM-DD), or start and duration_days");
    if (toMs(next.finish) < toMs(next.start)) fail("finish is before start");
    if (!cur && !next.name) fail("a new activity needs a name");
    t.activities[id] = next;
    if (a.after != null) { // a finish-to-start link from a predecessor
      for (const p of [].concat(a.after)) { if (!t.activities[p]) fail(`no activity ${p}`, "no_such_element");
        const type = a.link_type || "FS"; if (!LINK_TYPES.includes(type)) fail(`link_type must be one of ${LINK_TYPES.join(", ")}`);
        if (!t.links.some((l) => l.from === p && l.to === id)) t.links.push({ id: `${p}-${id}`, from: p, to: id, type, lag_hours: +(a.lag_hours || 0) }); }
    }
    return { id, start: next.start, finish: next.finish, elements: next.elements.length };
  });

  bus.register("link", (a) => {
    const act = T().activities[a.activity]; if (!act) fail(`no activity ${a.activity}`, "no_such_element");
    let ids = a.elements; if (!ids && a.rule) { ids = bus.time.resolveRule(a.rule); a.elements = ids; } // resolved once and recorded: replays are exact
    if (!Array.isArray(ids)) fail("give elements (ids or GlobalIds) or a rule {kind?, level?, ifc_class?, storey?}");
    for (const e of ids) if (!bus.time.has(e)) fail(`no element ${e}`, "no_such_element");
    const mode = a.mode || "add"; const set = new Set(mode === "replace" ? [] : act.elements);
    if (mode === "remove") ids.forEach((e) => set.delete(e)); else ids.forEach((e) => set.add(String(e)));
    act.elements = [...set].sort(); return { activity: act.id, elements: act.elements.length };
  });

  bus.register("schedule_import", (a) => {
    const r = parseSchedule(a.xml ?? "", a.format || "auto"); if (!r.ok) fail(r.error);
    const t = T(); const s = r.schedule;
    if (a.merge) { Object.assign(t.wbs, s.wbs); for (const [k, v] of Object.entries(s.activities)) t.activities[k] = { ...v, elements: t.activities[k]?.elements || [] }; t.links.push(...s.links.filter((l) => !t.links.some((x) => x.id === l.id))); }
    else bus.extra.time = { ...s, links: s.links };
    return { name: s.name, source: s.source, activities: Object.keys(s.activities).length, wbs: Object.keys(s.wbs).length, links: s.links.length, span: span(s) };
  });

  bus.register("timeline", (a) => {
    const t = T(); if (!Object.keys(t.activities).length) fail("no schedule yet: add activities or schedule_import");
    const s = stateAt(t, a.date ?? span(t).start);
    return { date: s.date, counts: s.counts, active: s.active.map((id) => ({ id, name: t.activities[id].name })), hash: s.hash, span: span(t),
      unlinked_activities: Object.values(t.activities).filter((x) => !x.elements.length).length, link_warnings: linkViolations(t) };
  }, { kind: "view" });

  bus.register("animate", (a) => ({ frames: frames(T(), { from: a.from, to: a.to, step_days: a.step_days ?? 7 }) }), { kind: "view" });

  bus.register("auto_sequence", (a) => {
    const steps = autoSequence(bus.model, { start: a.start || "2026-01-05", finish: a.finish || null }); if (a.finish && !(toMs(a.finish) > toMs(a.start || "2026-01-05"))) fail("finish must be after start"); if (!steps.length) fail("nothing to sequence: the authored model is empty");
    if (!a.keep) bus.extra.time = emptySchedule();
    for (const st of steps) bus.handlers.get(st.name).run(st.args, { ...st }, bus);
    return { activities: Object.keys(T().activities).length, span: span(T()) };
  });
  return bus;
}
