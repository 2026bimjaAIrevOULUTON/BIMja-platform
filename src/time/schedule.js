import { solidOf } from "../author/solids.js";
// 4D: schedules (activities, WBS, links), P6 XML and MS Project XML (MSPDI) import, and the state of every linked
// element at a date. Pure and headless: the same functions drive the browser timeline, MCP and the tests.
// Parsing follows IfcOpenShell's ifc4d readers (p62ifc, msp2ifc) so task counts match them; see ci/ifc4d_ref.py.
import { parseXML } from "../coord/bcf.js";

const kid = (n, name) => n?.children.find((c) => c.name === name);
const kids = (n, name) => (n?.children || []).filter((c) => c.name === name);
const txt = (n, name) => { const c = kid(n, name); const t = c?.text.trim(); return t === "" ? undefined : t; };
const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };

/** "2026-03-02" or "2026-03-02T08:00:00" (no zone = schedule-local, treated as UTC so results never depend on the machine). */
export function toMs(s) {
  if (s == null || s === "" || s === "NA") return NaN;
  const t = String(s).trim(); const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00Z` : /(Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : `${t}Z`;
  return Date.parse(iso);
}
export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 19);
const DAY = 86400000;

export const LINK_TYPES = ["FS", "SS", "FF", "SF"];
const P6_LINK = { "Finish to Start": "FS", "Start to Start": "SS", "Finish to Finish": "FF", "Start to Finish": "SF" };
const MSP_LINK = { 0: "FF", 1: "FS", 2: "SF", 3: "SS" };
export const ACTIVITY_TYPES = ["construct", "demolish", "temporary"];

export const emptySchedule = () => ({ name: "", source: null, wbs: {}, activities: {}, links: [] });

/** Oracle Primavera P6 XML (APIBusinessObjects). Returns { ok:false, error } for anything it cannot read. */
export function parseP6(xml) {
  let root; try { root = parseXML(String(xml)); } catch (e) { return { ok: false, error: `not XML: ${e.message}` }; }
  if (!root || root.name !== "APIBusinessObjects") return { ok: false, error: "not a P6 XML export (no APIBusinessObjects root)" };
  const project = kid(root, "Project"); if (!project) return { ok: false, error: "P6 XML has no Project" };
  const s = emptySchedule(); s.name = txt(project, "Name") || "Unnamed"; s.source = "p6";
  for (const w of kids(project, "WBS")) { const id = txt(w, "ObjectId"); if (id) s.wbs[id] = { id, name: txt(w, "Name") || "", code: txt(w, "Code") || id, parent: txt(w, "ParentObjectId") || null, seq: +(txt(w, "SequenceNumber") || 0) }; }
  for (const a of kids(project, "Activity")) {
    const id = txt(a, "ObjectId"); if (!id) return { ok: false, error: "activity without ObjectId" };
    const start = txt(a, "StartDate"), finish = txt(a, "FinishDate");
    if (!Number.isFinite(toMs(start)) || !Number.isFinite(toMs(finish))) return { ok: false, error: `activity ${id} has no valid StartDate/FinishDate` };
    s.activities[id] = { id, code: txt(a, "Id") || id, name: txt(a, "Name") || "", start, finish, wbs: txt(a, "WBSObjectId") || null, status: txt(a, "Status") || null,
      percent: txt(a, "PercentComplete") != null ? +txt(a, "PercentComplete") : null, type: "construct", elements: [] };
  }
  for (const r of kids(project, "Relationship")) {
    const from = txt(r, "PredecessorActivityObjectId"), to = txt(r, "SuccessorActivityObjectId");
    if (!s.activities[from] || !s.activities[to]) continue; // same rule as ifc4d: links to activities outside the file are dropped
    s.links.push({ id: txt(r, "ObjectId") || `${from}-${to}`, from, to, type: P6_LINK[txt(r, "Type")] || "FS", lag_hours: +(txt(r, "Lag") || 0) });
  }
  return { ok: true, schedule: s };
}

/** Microsoft Project XML (MSPDI). Summary tasks become WBS, the rest activities (ifc4d's rule: OutlineLevel builds the tree). */
export function parseMSPDI(xml) {
  let root; try { root = parseXML(String(xml)); } catch (e) { return { ok: false, error: `not XML: ${e.message}` }; }
  if (!root || root.name !== "Project") return { ok: false, error: "not an MS Project XML file (no Project root)" };
  const s = emptySchedule(); s.name = txt(root, "Title") || txt(root, "Name") || "Unnamed"; s.source = "mspdi";
  const minPerDay = +(txt(root, "MinutesPerDay") || 480);
  const tasks = kids(kid(root, "Tasks"), "Task").filter((t) => txt(t, "IsNull") !== "1");
  const parents = {}, children = {}; const anc = [];
  for (const t of tasks) {
    const uid = txt(t, "UID"); if (uid == null) return { ok: false, error: "task without UID" };
    const lvl = +(txt(t, "OutlineLevel") || 0);
    while (anc.length && anc[anc.length - 1][1] >= lvl) anc.pop();
    const p = anc.length ? anc[anc.length - 1][0] : null; parents[uid] = p; (children[p] ||= []).push(uid); anc.push([uid, lvl]);
  }
  for (const t of tasks) {
    const uid = txt(t, "UID");
    if (children[uid]?.length) { s.wbs[uid] = { id: uid, name: txt(t, "Name") || "", code: txt(t, "OutlineNumber") || uid, parent: parents[uid], seq: 0 }; continue; }
    const start = txt(t, "Start"), finish = txt(t, "Finish");
    if (!Number.isFinite(toMs(start)) || !Number.isFinite(toMs(finish))) return { ok: false, error: `task ${uid} has no valid Start/Finish` };
    s.activities[uid] = { id: uid, code: txt(t, "OutlineNumber") || uid, name: txt(t, "Name") || "", start, finish, wbs: parents[uid], status: null,
      percent: txt(t, "PercentComplete") != null ? +txt(t, "PercentComplete") / 100 : null, milestone: txt(t, "Milestone") === "1" || start === finish, type: "construct", elements: [] };
  }
  for (const t of tasks) {
    const to = txt(t, "UID");
    kids(t, "PredecessorLink").forEach((l, i) => {
      const from = txt(l, "PredecessorUID"); if (from == null) return;
      const lag = +(txt(l, "LinkLag") || 0) / 600; // tenths of a minute -> hours
      s.links.push({ id: `${to}-${i}`, from, to, type: MSP_LINK[txt(l, "Type")] || "FS", lag_hours: Number.isFinite(lag) ? lag : 0 });
    });
  }
  s.minutes_per_day = minPerDay;
  return { ok: true, schedule: s };
}

export function parseSchedule(xml, format = "auto") {
  const head = String(xml).slice(0, 2000);
  const f = format === "auto" ? (/APIBusinessObjects/.test(head) ? "p6" : /schemas\.microsoft\.com\/project|<Project[\s>]/.test(head) ? "mspdi" : null) : format;
  if (f === "p6") return parseP6(xml); if (f === "mspdi") return parseMSPDI(xml);
  return { ok: false, error: "unknown schedule format: give format p6 or mspdi (P6 XML or MS Project XML)" };
}

/** Status of one activity at time t: planned (not started), active, done. */
export function activityStatus(a, t) { const s = toMs(a.start), f = toMs(a.finish); return t < s ? "planned" : t < f || (s === f && t === s) ? "active" : "done"; }

/**
 * State of every linked element at a date. An element follows its activities:
 * construct: hidden before, highlighted while active, built after. demolish: existing before, highlighted while active, gone after.
 * temporary (scaffold, formwork): shown only while active.
 * Returns { elements: Map(id -> status), activities: [...active ids], counts } where status is
 * hidden | active | built | existing | removed.
 */
export function stateAt(schedule, date) {
  const t = typeof date === "number" ? date : toMs(date); if (!Number.isFinite(t)) fail(`bad date ${date}`);
  const per = new Map(); const active = [];
  for (const a of Object.values(schedule.activities).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const st = activityStatus(a, t); if (st === "active") active.push(a.id);
    const type = a.type || "construct";
    const s = type === "demolish" ? { planned: "existing", active: "active", done: "removed" }[st]
      : type === "temporary" ? { planned: "hidden", active: "active", done: "hidden" }[st]
      : { planned: "hidden", active: "active", done: "built" }[st];
    for (const e of a.elements || []) (per.get(e) || per.set(e, []).get(e)).push(s);
  }
  const RANK = { active: 4, removed: 3, built: 2, existing: 1, hidden: 0 };
  const elements = new Map(); const counts = { hidden: 0, active: 0, built: 0, existing: 0, removed: 0 };
  for (const [e, list] of [...per].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    // a slab poured in one activity and finished in another is built once any construct activity is done, active while any runs
    const s = list.reduce((m, x) => (RANK[x] > RANK[m] ? x : m), "hidden"); elements.set(e, s); counts[s]++;
  }
  return { date: isoDate(t), elements, active, counts, hash: fnv(JSON.stringify([...elements])) };
}

export function span(schedule) {
  const a = Object.values(schedule.activities); if (!a.length) return null;
  return { start: isoDate(Math.min(...a.map((x) => toMs(x.start)))), finish: isoDate(Math.max(...a.map((x) => toMs(x.finish)))) };
}

/** Frames from..to every step_days; each frame carries the state hash, so a replay can be checked frame by frame. */
export function frames(schedule, { from, to, step_days = 7, max = 500 } = {}) {
  const sp = span(schedule); if (!sp) fail("the schedule has no activities");
  const a = toMs(from ?? sp.start), b = toMs(to ?? sp.finish), step = +step_days * DAY;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) fail("give from <= to as dates"); if (!(step > 0)) fail("step_days must be > 0");
  const out = []; const push = (t) => { const s = stateAt(schedule, t); out.push({ date: s.date, hash: s.hash, counts: s.counts, active: s.active }); };
  let t = a; for (; t <= b && out.length < max; t += step) push(t);
  if (out.length < max && t - step < b) push(b); // always end on the finish date
  return out;
}

/** Forward pass check: links whose successor starts before the predecessor allows (a planner's warning, not an error). */
export function linkViolations(schedule) {
  const out = [];
  for (const l of schedule.links) {
    const p = schedule.activities[l.from], s = schedule.activities[l.to]; if (!p || !s) continue;
    const lag = (l.lag_hours || 0) * 3600000;
    const need = { FS: [toMs(p.finish), toMs(s.start)], SS: [toMs(p.start), toMs(s.start)], FF: [toMs(p.finish), toMs(s.finish)], SF: [toMs(p.start), toMs(s.finish)] }[l.type || "FS"];
    if (need[1] + 1 < need[0] + lag) out.push({ link: l.id, from: l.from, to: l.to, type: l.type, short_by_days: +((need[0] + lag - need[1]) / DAY).toFixed(2) });
  }
  return out;
}

function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); }
export { fnv, DAY };

/**
 * A construction sequence for an authored model: per level, floor → walls → openings → rooms (fit-out), then the roof.
 * Returns script steps (activity + link commands), so it runs through the bus like anything else.
 */
export function autoSequence(model, { start = "2026-01-05", finish = null, days = { floor: 10, wall: 15, door: 5, window: 5, room: 10, roof: 10 } } = {}) {
  const els = Object.values(model.data.elements); const levels = [...model.data.levels].sort((a, b) => a.elevation - b.elevation);
  const plan = []; const add = (name, ids, d) => { if (ids.length) plan.push({ name, ids, d }); };
  for (const L of levels) {
    const on = (k) => els.filter((e) => e.kind === k && e.level === L.id).map((e) => e.id).sort();
    add(`${L.name}: slab`, on("floor"), days.floor); add(`${L.name}: walls`, on("wall"), days.wall);
    add(`${L.name}: doors & windows`, [...on("door"), ...on("window")].sort(), days.door + days.window);
    add(`${L.name}: rooms fit-out`, on("room"), days.room); add(`${L.name}: roof`, on("roof"), days.roof);
  }
  // free-form solids (landmarks, infrastructure): site works, then rise by rise from the ground up, structure before
  // envelope in each rise; durations follow volume. Heights include the level elevation.
  const masses = els.filter((e) => e.kind === "mass").map((e) => { const s = solidOf(e); const z = model.data.levels.find((l) => l.id === e.level)?.elevation || 0; return { e, z0: s.zmin + z, z1: s.zmax + z, v: s.volume / 1e9 }; });
  if (masses.length) {
    const dur = (list) => Math.max(5, Math.round(6 * Math.sqrt(list.reduce((t, m) => t + m.v, 0) + 1)));
    const site = masses.filter((m) => m.e.ifc_class === "IfcGeographicElement"); add("Site works and landscape", site.map((m) => m.e.id).sort(), dur(site));
    const rest = masses.filter((m) => m.e.ifc_class !== "IfcGeographicElement"); const zlo = Math.min(...rest.map((m) => m.z0)), zhi = Math.max(...rest.map((m) => m.z0));
    const n = Math.max(1, Math.min(10, Math.ceil((zhi - zlo) / 6000))); const band = (zhi - zlo) / n || 1;
    const structural = (m) => ["IfcColumn", "IfcBeam", "IfcSlab", "IfcFooting", "IfcMember", "IfcPile"].includes(m.e.ifc_class);
    for (let k = 0; k < n; k++) {
      const inBand = rest.filter((m) => { const b = Math.min(n - 1, Math.floor((m.z0 - zlo) / band)); return b === k; }); const lo = ((zlo + k * band) / 1000).toFixed(0), hi = ((zlo + (k + 1) * band) / 1000).toFixed(0);
      const S = inBand.filter(structural), A = inBand.filter((m) => !structural(m)); const label = n > 1 ? `Rise ${k + 1} (+${lo} to +${hi} m)` : "Main works";
      add(`${label}: structure`, S.map((m) => m.e.id).sort(), dur(S)); add(`${label}: envelope and ornament`, A.map((m) => m.e.id).sort(), dur(A));
    }
  }
  // dates: back to back from start; with a finish date every duration is scaled to fit the programme
  const total = plan.reduce((t, p) => t + p.d, 0); const scale = finish && total ? (toMs(finish) - toMs(start)) / (total * DAY) : 1;
  const steps = []; let t = toMs(start); let prev = null;
  plan.forEach((p, i) => { const id = `A${String(i + 1).padStart(2, "0")}`; const d = p.d * scale * DAY; const s = isoDate(t), f = isoDate(t + d);
    steps.push({ name: "activity", args: { id, name: p.name, start: s, finish: f } }, { name: "link", args: { activity: id, elements: p.ids } });
    if (prev) steps.push({ name: "activity", args: { id, after: prev } }); prev = id; t += d; });
  return steps;
}
