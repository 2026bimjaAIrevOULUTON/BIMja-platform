// BIMja authoring model: levels, types, walls (chains, joins), hosted doors/windows, floors, roofs, rooms, and
// free-form solids (mass: extrude with taper/shift/twist/lean; revolve: domes, minarets, columns).
// Every change is a JSON command, so people (UI) and agents (window.bimja / MCP) drive the same code.
// Units: millimetres in plan and height. Commands refuse invalid input and change nothing.
import { solidOf, MASS_CLASSES } from "./solids.js";
import { add, dist, mul, norm, perp, sub, near, polygonArea, polygonPerimeter, pointInPolygon, projectToSegment, planarFaces } from "./geom.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
export class CommandError extends Error { constructor(msg, code = "bad_arg") { super(msg); this.code = code; } }
const fail = (msg, code) => { throw new CommandError(msg, code); };
const num = (v, name, { min = -Infinity, max = Infinity } = {}) => {
  const n = Number(v); if (!Number.isFinite(n)) fail(`${name} must be a number`); if (n < min || n > max) fail(`${name} must be between ${min} and ${max}`); return n;
};
const pt = (v, name) => { if (!Array.isArray(v) || v.length !== 2) fail(`${name} must be [x, y] in mm`); return [num(v[0], name), num(v[1], name)]; };
const poly = (v, name) => { if (!Array.isArray(v) || v.length < 3) fail(`${name} needs at least 3 points`); return v.map((p, i) => pt(p, `${name}[${i}]`)); };

export function newProject(name = "BIMja project") {
  return {
    format: "bimja-model", version: 1, name, units: "mm", nextId: 1,
    levels: [{ id: "L1", name: "Level 1", elevation: 0 }, { id: "L2", name: "Level 2", elevation: 3000 }],
    types: {
      wall: {
        "Exterior 230": { thickness: 230, isExternal: true, loadBearing: true, layers: [{ material: "Plaster", thickness: 15 }, { material: "Brick", thickness: 200 }, { material: "Plaster", thickness: 15 }] },
        "Interior 115": { thickness: 115, isExternal: false, loadBearing: false, layers: [{ material: "Plaster", thickness: 12.5 }, { material: "Brick", thickness: 90 }, { material: "Plaster", thickness: 12.5 }] },
      },
      door: {
        "Single 900x2100": { width: 900, height: 2100, fireRating: "None", operation: "SINGLE_SWING_LEFT", material: "Timber" },
        "Double 1500x2100": { width: 1500, height: 2100, fireRating: "None", operation: "DOUBLE_DOOR_SINGLE_SWING", material: "Timber" },
        "Fire door 1000x2100": { width: 1000, height: 2100, fireRating: "60 min", operation: "SINGLE_SWING_LEFT", material: "Steel" },
      },
      window: {
        "Window 1200x1200": { width: 1200, height: 1200, sill: 900, material: "Aluminium" },
        "Window 600x600": { width: 600, height: 600, sill: 1500, material: "Aluminium" },
      },
      floor: { "RCC slab 150": { thickness: 150, material: "Concrete" } },
      roof: { "RCC roof 150": { thickness: 150, material: "Concrete" } },
    },
    elements: {},
  };
}

export class Model {
  constructor(data = newProject()) { this.data = data; this.undoStack = []; this.redoStack = []; this.listeners = new Set(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  get elements() { return Object.values(this.data.elements); }
  el(id) { return this.data.elements[id] || fail(`no element ${id}`, "no_such_element"); }
  level(idOrName) {
    const l = this.data.levels.find((x) => x.id === idOrName || x.name === idOrName); return l || fail(`no level ${idOrName}`);
  }
  defaultLevel() { return this.data.levels[0].id; }
  levelAbove(levelId) { const ls = [...this.data.levels].sort((a, b) => a.elevation - b.elevation); const i = ls.findIndex((l) => l.id === levelId); return ls[i + 1] || null; }
  type(kind, name) { const t = this.data.types[kind]?.[name]; return t || fail(`no ${kind} type "${name}". Types: ${Object.keys(this.data.types[kind] || {}).join(", ")}`); }
  newId(prefix) { return `${prefix}${this.data.nextId++}`; }

  /** Run one command. {dry_run} validates and reports without changing the model. */
  execute(cmd, { dry_run = false, record = true } = {}) {
    if (!cmd || typeof cmd !== "object" || !cmd.cmd) fail('a command is {"cmd": "<name>", ...args}');
    const fn = COMMANDS[cmd.cmd]; if (!fn) fail(`unknown command "${cmd.cmd}". Try list_commands`, "unknown_command");
    if (fn.read) return fn.run(this, cmd);
    const before = JSON.stringify(this.data);
    try {
      const result = fn.run(this, cmd);
      if (dry_run) { this.data = JSON.parse(before); return { dry_run: true, ok: true, would: result }; }
      if (record) { this.undoStack.push(before); this.redoStack = []; if (this.undoStack.length > 200) this.undoStack.shift(); }
      this.emit(); return { ok: true, ...result };
    } catch (e) { this.data = JSON.parse(before); throw e; }
  }
  /** Run many commands. atomic: all or nothing (one undo step). Returns per-command results. */
  script(cmds, { atomic = true, dry_run = false } = {}) {
    const before = JSON.stringify(this.data); const results = [];
    for (let i = 0; i < cmds.length; i++) {
      try { results.push(this.execute(cmds[i], { record: false })); }
      catch (e) {
        results.push({ ok: false, error: e.message, index: i });
        if (atomic) { this.data = JSON.parse(before); this.emit(); return { ok: false, atomic, failedAt: i, error: e.message, results }; }
      }
    }
    if (dry_run) { this.data = JSON.parse(before); this.emit(); return { ok: true, dry_run: true, results }; }
    this.undoStack.push(before); this.redoStack = []; this.emit();
    return { ok: results.every((r) => r.ok), results };
  }
  undo() { const s = this.undoStack.pop(); if (!s) return false; this.redoStack.push(JSON.stringify(this.data)); this.data = JSON.parse(s); this.emit(); return true; }
  redo() { const s = this.redoStack.pop(); if (!s) return false; this.undoStack.push(JSON.stringify(this.data)); this.data = JSON.parse(s); this.emit(); return true; }
  load(data) { if (data?.format !== "bimja-model") fail("not a BIMja model file"); this.undoStack.push(JSON.stringify(this.data)); this.data = clone(data); this.emit(); }
  toJSON() { return clone(this.data); }

  // ---------- derived geometry ----------
  wallsOn(levelId) { return this.elements.filter((e) => e.kind === "wall" && e.level === levelId); }
  hosted(wallId) { return this.elements.filter((e) => (e.kind === "door" || e.kind === "window") && e.host === wallId); }
  wallLength(w) { return dist(w.a, w.b); }
  wallHeight(w) {
    if (w.height) return w.height;
    const up = this.levelAbove(w.level); return up ? up.elevation - this.level(w.level).elevation : 3000;
  }
  /**
   * Wall end adjustments (mm) so walls meet without gaps or overlaps (butt joins, like a modeller's wall joins):
   * at a shared corner the "winning" wall extends by half the other's thickness and the other trims back by half the
   * winner's; a wall ending on another wall's body trims back to its face. So per-element volumes add up exactly and
   * IFC quantities match the geometry (checked against IfcOpenShell ifc5d).
   */
  wallExtents(w) {
    const T = (x) => this.type("wall", x.type);
    const rank = (x) => [T(x).isExternal ? 1 : 0, T(x).thickness, -parseInt(String(x.id).replace(/\D/g, "") || "0", 10)];
    const beats = (x, y) => { const a = rank(x), b = rank(y); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
    const end = (p) => {
      let ext = 0, trim = 0;
      for (const o of this.wallsOn(w.level)) {
        if (o.id === w.id) continue; const half = T(o).thickness / 2;
        if (near(p, o.a) || near(p, o.b)) { if (beats(w, o)) ext = Math.max(ext, half); else trim = Math.max(trim, half); }
        else { const q = projectToSegment(p, o.a, o.b); if (q.t > 0 && q.t < 1 && q.d < 1) trim = Math.max(trim, half); } // T-junction
      }
      return trim ? -trim : ext;
    };
    return { ea: end(w.a), eb: end(w.b) };
  }
  /** Length as built (after joins), mm. */
  wallBuiltLength(w) { const { ea, eb } = this.wallExtents(w); return dist(w.a, w.b) + ea + eb; }
  /** Opening interval along the wall (mm from its start) for a door/window. */
  openingSpan(o) { const t = this.type(o.kind, o.type); return { from: o.offset - t.width / 2, to: o.offset + t.width / 2, sill: o.kind === "window" ? (o.sill ?? t.sill) : 0, height: t.height, width: t.width }; }
  checkOpeningFits(host, o, ignoreId) {
    const L = this.wallLength(host), s = this.openingSpan(o), H = this.wallHeight(host);
    const { ea, eb } = this.wallExtents(host);
    if (s.from < Math.max(0, -ea) + 50 || s.to > L + Math.min(0, eb) - 50) fail(`${o.kind} (${s.width} mm wide) does not fit wall ${host.id} at offset ${Math.round(o.offset)} (wall is ${Math.round(L)} mm)`, "out_of_bounds");
    if (s.sill + s.height > H) fail(`${o.kind} is taller than wall ${host.id} (${H} mm)`, "out_of_bounds");
    for (const x of this.hosted(host.id)) {
      if (x.id === ignoreId) continue; const r = this.openingSpan(x);
      if (s.from < r.to + 50 && r.from < s.to + 50) fail(`${o.kind} overlaps ${x.id} (${x.mark}) on wall ${host.id}`, "would_overlap");
    }
  }
  /** Closed outlines formed by the walls on a level (centre lines). */
  wallFaces(levelId) { return planarFaces(this.wallsOn(levelId).map((w) => [w.a, w.b])); }
  /** Outline around all the walls on a level (centre lines), CCW, or null if they do not close. */
  outerOutline(levelId) {
    const outer = planarFaces(this.wallsOn(levelId).map((w) => [w.a, w.b]), 1, { outer: true });
    return outer.sort((x, y) => polygonArea(y) - polygonArea(x))[0] || null;
  }
  roomArea(r) { return Math.abs(polygonArea(r.boundary)) / 1e6; }
  nextMark(kind) {
    const prefix = kind === "door" ? "D" : "W"; let n = 0;
    for (const e of this.elements) if (e.kind === kind && e.mark?.startsWith(prefix)) n = Math.max(n, parseInt(e.mark.slice(prefix.length)) || 0);
    return `${prefix}${String(n + 1).padStart(2, "0")}`;
  }
}

// ---------- commands ----------
const C = {};
const def = (name, help, run, read = false) => (C[name] = { name, help, run, read });

def("level", "Add a level: {name, elevation(mm)}", (m, c) => {
  const elevation = num(c.elevation, "elevation"); const name = String(c.name || `Level ${m.data.levels.length + 1}`);
  if (m.data.levels.some((l) => l.name === name)) fail(`a level named "${name}" exists`);
  const id = m.newId("L"); m.data.levels.push({ id, name, elevation }); m.data.levels.sort((a, b) => a.elevation - b.elevation); return { id };
});
def("wall", "Add a wall: {start:[x,y], end:[x,y], level?, type?, height?}", (m, c) => {
  const a = pt(c.start, "start"), b = pt(c.end, "end"); if (dist(a, b) < 100) fail("a wall must be at least 100 mm long");
  const level = m.level(c.level || m.defaultLevel()).id; const type = c.type || "Exterior 230"; m.type("wall", type);
  const id = m.newId("W"); m.data.elements[id] = { id, kind: "wall", level, a, b, type, ...(c.height ? { height: num(c.height, "height", { min: 300 }) } : {}), name: c.name || `${type} ${id}` };
  return { id };
});
def("walls", "Add a chain of walls: {points:[[x,y],...], closed?, level?, type?, height?}", (m, c) => {
  const pts = (c.points || []).map((p, i) => pt(p, `points[${i}]`)); if (pts.length < 2) fail("points needs at least 2 points");
  const ids = []; const n = c.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) ids.push(C.wall.run(m, { start: pts[i], end: pts[(i + 1) % pts.length], level: c.level, type: c.type, height: c.height }).id);
  return { ids };
});
for (const kind of ["door", "window"]) {
  def(kind, `Add a ${kind} hosted in a wall: {wall, offset(mm from wall start to centre) | at:[x,y], type?${kind === "window" ? ", sill?" : ""}}`, (m, c) => {
    const host = m.el(c.wall || nearestWall(m, c.at, c.level)?.id); if (host.kind !== "wall") fail(`${host.id} is not a wall`);
    const type = c.type || Object.keys(m.data.types[kind])[0]; m.type(kind, type);
    const offset = c.at ? projectToSegment(pt(c.at, "at"), host.a, host.b).t * m.wallLength(host) : num(c.offset, "offset");
    const o = { kind, host: host.id, offset, type, ...(kind === "window" && c.sill != null ? { sill: num(c.sill, "sill", { min: 0 }) } : {}) };
    m.checkOpeningFits(host, o);
    const id = m.newId(kind === "door" ? "D" : "N"); const mark = c.mark || m.nextMark(kind);
    m.data.elements[id] = { id, ...o, level: host.level, mark, name: `${type} ${mark}` }; return { id, mark };
  });
}
function nearestWall(m, at, level) {
  if (!at) fail("give wall (an id) or at:[x,y]"); const p = pt(at, "at"); let best = null;
  for (const w of m.elements.filter((e) => e.kind === "wall" && (!level || e.level === m.level(level).id))) {
    const d = projectToSegment(p, w.a, w.b).d; if (d < m.type("wall", w.type).thickness / 2 + 300 && (!best || d < best.d)) best = { id: w.id, d };
  }
  return best || fail(`no wall near ${JSON.stringify(p)}`);
}
def("floor", "Add a floor: {boundary:[[x,y],...] | from_walls:true, level?, type?, offset?}", (m, c) => {
  const level = m.level(c.level || m.defaultLevel()).id; const type = c.type || "RCC slab 150"; m.type("floor", type);
  let boundary = c.boundary ? poly(c.boundary, "boundary") : c.from_walls ? m.outerOutline(level) : fail("give boundary or from_walls:true");
  if (!boundary) fail(`no closed outline of walls on ${level}`);
  if (polygonArea(boundary) < 0) boundary = boundary.slice().reverse();
  const id = m.newId("F"); m.data.elements[id] = { id, kind: "floor", level, boundary, type, offset: num(c.offset ?? 0, "offset"), name: `${type} ${id}` }; return { id, area_m2: +(polygonArea(boundary) / 1e6).toFixed(2) };
});
def("roof", "Add a flat roof over the walls or a boundary: {level?, boundary? | from_walls, type?, overhang?}", (m, c) => {
  const level = m.level(c.level || m.data.levels[m.data.levels.length - 1].id).id; const type = c.type || "RCC roof 150"; m.type("roof", type);
  const below = m.data.levels.filter((l) => l.elevation < m.level(level).elevation).pop();
  let boundary = c.boundary ? poly(c.boundary, "boundary") : m.outerOutline(c.walls_level || below?.id || level) || fail("no closed wall outline to roof over");
  if (polygonArea(boundary) < 0) boundary = boundary.slice().reverse();
  const id = m.newId("R"); m.data.elements[id] = { id, kind: "roof", level, boundary, type, overhang: num(c.overhang ?? 0, "overhang", { min: 0, max: 3000 }), name: `${type} ${id}` }; return { id };
});
def("room", "Add a room: {name, number?, at:[x,y] (inside walls) | boundary, level?}", (m, c) => {
  const level = m.level(c.level || m.defaultLevel()).id; let boundary;
  if (c.boundary) boundary = poly(c.boundary, "boundary");
  else {
    const p = pt(c.at, "at"); const faces = m.wallFaces(level).filter((f) => pointInPolygon(p, f)).sort((a, b) => polygonArea(a) - polygonArea(b));
    boundary = faces[0] || fail(`no closed walls around ${JSON.stringify(p)} on ${level}`);
  }
  if (polygonArea(boundary) < 0) boundary = boundary.slice().reverse();
  for (const r of m.elements.filter((e) => e.kind === "room" && e.level === level)) {
    const ctr = centroid(boundary); if (pointInPolygon(ctr, r.boundary)) fail(`that space already has room ${r.number} ${r.name}`, "would_overlap");
  }
  const n = m.elements.filter((e) => e.kind === "room").length + 1;
  const id = m.newId("S"); m.data.elements[id] = { id, kind: "room", level, boundary, name: String(c.name || `Room ${n}`), number: String(c.number || n), at: c.at || centroid(boundary) };
  return { id, area_m2: +(Math.abs(polygonArea(boundary)) / 1e6).toFixed(2) };
});
const massCommon = (m, c, e) => {
  e.level = m.level(c.level || m.defaultLevel()).id;
  e.base = num(c.base ?? 0, "base");
  e.ifc_class = c.ifc_class || "IfcBuildingElementProxy"; if (!MASS_CLASSES.includes(e.ifc_class)) fail(`ifc_class must be one of ${MASS_CLASSES.join(", ")}`);
  if (c.material != null) e.material = String(c.material).slice(0, 80);
  if (c.color != null) { if (!/^#[0-9a-f]{6}$/i.test(c.color)) fail("color must be #rrggbb"); e.color = c.color.toLowerCase(); }
  if (c.lean_deg) { e.lean_deg = num(c.lean_deg, "lean_deg", { min: -45, max: 45 }); e.lean_dir_deg = num(c.lean_dir_deg ?? 0, "lean_dir_deg"); }
  if (c.pivot) { if (!Array.isArray(c.pivot) || c.pivot.length !== 3) fail("pivot must be [x, y, z] in mm"); e.pivot = c.pivot.map((v, i) => num(v, `pivot[${i}]`)); }
  if (c.segments != null) e.segments = Math.round(num(c.segments, "segments", { min: 1, max: 96 }));
  const sol = solidOf(e); if (!(sol.volume > 1)) fail("the solid has no volume: check the outline/profile");
  const id = m.newId("M"); e.id = id; e.name = String(c.name || `${e.ifc_class.replace(/^Ifc/, "")} ${id}`); m.data.elements[id] = e;
  return { id, volume_m3: +(sol.volume / 1e9).toFixed(3), height_m: +((sol.zmax - sol.zmin) / 1000).toFixed(3) };
};
def("mass", "Add a free-form solid by extruding an outline: {outline:[[x,y],...], height, level?, base?, top_scale?, top_shift?:[dx,dy], twist_deg?, segments?, lean_deg?, lean_dir_deg?, pivot?:[x,y,z], ifc_class?, material?, color?:#rrggbb, name?}", (m, c) => {
  const e = { kind: "mass", shape: "extrude", outline: poly(c.outline, "outline"), height: num(c.height, "height", { min: 10, max: 1e6 }) };
  if (Math.abs(polygonArea(e.outline)) < 100) fail("outline area is too small");
  if (c.top_scale != null) e.top_scale = num(c.top_scale, "top_scale", { min: 0.01, max: 10 });
  if (c.top_shift) e.top_shift = pt(c.top_shift, "top_shift");
  if (c.twist_deg) e.twist_deg = num(c.twist_deg, "twist_deg", { min: -720, max: 720 });
  return massCommon(m, c, e);
});
def("revolve", "Add a solid of revolution (dome, minaret, column, drum): {center:[x,y], profile:[[r,z],...] (closed back to the first point; r=0 on the axis), level?, base?, segments?, lean_deg?, lean_dir_deg?, pivot?, ifc_class?, material?, color?, name?}", (m, c) => {
  const prof = c.profile; if (!Array.isArray(prof) || prof.length < 3) fail("profile needs at least 3 [r, z] points");
  const e = { kind: "mass", shape: "revolve", center: pt(c.center, "center"), profile: prof.map((q, i) => { const [r, z] = pt(q, `profile[${i}]`); if (r < 0) fail("profile radius must be ≥ 0"); return [r, z]; }) };
  return massCommon(m, c, e);
});
export function centroid(p) { let x = 0, y = 0; p.forEach((q) => { x += q[0]; y += q[1]; }); return [x / p.length, y / p.length]; }
def("delete", "Delete elements: {ids:[...]} (a wall takes its doors and windows)", (m, c) => {
  const ids = c.ids || [c.id]; const gone = [];
  for (const id of ids) { m.el(id); for (const h of m.hosted(id)) { delete m.data.elements[h.id]; gone.push(h.id); } delete m.data.elements[id]; gone.push(id); }
  return { deleted: gone };
});
def("move", "Move elements: {ids:[...], by:[dx,dy]} (doors and windows slide along their wall)", (m, c) => {
  const d = pt(c.by, "by"); const ids = c.ids || [c.id];
  for (const id of ids) {
    const e = m.el(id);
    if (e.kind === "wall") { e.a = add(e.a, d); e.b = add(e.b, d); for (const h of m.hosted(id)) m.checkOpeningFits(e, h, h.id); }
    else if (e.boundary) { e.boundary = e.boundary.map((p) => add(p, d)); if (e.at) e.at = add(e.at, d); }
    else if (e.kind === "mass") { if (e.outline) e.outline = e.outline.map((p) => add(p, d)); if (e.center) e.center = add(e.center, d); if (e.pivot) e.pivot = [e.pivot[0] + d[0], e.pivot[1] + d[1], e.pivot[2]]; }
    else if (e.host) { const w = m.el(e.host); const dir = norm(sub(w.b, w.a)); e.offset += d[0] * dir[0] + d[1] * dir[1]; m.checkOpeningFits(w, e, e.id); }
  }
  return { moved: ids };
});
def("set", "Change fields: {id, type?, name?, height?, offset?, sill?, mark?, level?}", (m, c) => {
  const e = m.el(c.id); const allowed = ["type", "name", "height", "offset", "sill", "mark", "number", "level", "material", "color"];
  for (const k of Object.keys(c)) if (!["cmd", "id"].includes(k) && !allowed.includes(k)) fail(`cannot set ${k}`);
  if (c.type) m.type(e.kind === "room" ? fail("rooms have no type") : e.kind, c.type);
  if (c.level) c.level = m.level(c.level).id;
  Object.assign(e, Object.fromEntries(allowed.filter((k) => c[k] !== undefined).map((k) => [k, ["height", "offset", "sill"].includes(k) ? num(c[k], k) : c[k]])));
  if (e.host) m.checkOpeningFits(m.el(e.host), e, e.id);
  if (e.kind === "wall") for (const h of m.hosted(e.id)) m.checkOpeningFits(e, h, h.id);
  return { id: e.id };
});
def("type", "Add or edit a type: {kind: wall|door|window|floor|roof, name, ...fields}", (m, c) => {
  const kinds = Object.keys(m.data.types); if (!kinds.includes(c.kind)) fail(`kind must be one of ${kinds.join(", ")}`);
  const { cmd, kind, name, ...fields } = c; if (!name) fail("name is required");
  const t = (m.data.types[kind][name] ||= {});
  for (const [k, v] of Object.entries(fields)) t[k] = typeof v === "number" ? num(v, k, { min: 0 }) : v;
  if (kind === "wall" && !(t.thickness > 0)) fail("a wall type needs a thickness");
  if ((kind === "door" || kind === "window") && !(t.width > 0 && t.height > 0)) fail("needs width and height");
  return { kind, name };
});

// read-only
def("list_commands", "List commands and their arguments", () => ({ commands: Object.values(C).map((x) => ({ name: x.name, help: x.help, writes: !x.read })) }), true);
def("inspect", "Summary of the model", (m) => {
  const count = {}; m.elements.forEach((e) => (count[e.kind] = (count[e.kind] || 0) + 1));
  return { name: m.data.name, levels: m.data.levels, counts: count, types: Object.fromEntries(Object.entries(m.data.types).map(([k, v]) => [k, Object.keys(v)])) };
}, true);
def("query", "Find elements: {kind?, level?, type?}", (m, c) => ({
  elements: m.elements.filter((e) => (!c.kind || e.kind === c.kind) && (!c.level || e.level === m.level(c.level).id) && (!c.type || e.type === c.type)),
}), true);
def("schedule", "A schedule: {kind: wall|door|window|room|floor}", (m, c) => ({ rows: schedule(m, c.kind || "wall") }), true);

export function schedule(m, kind) {
  const lv = (id) => m.level(id).name;
  if (kind === "wall") return m.elements.filter((e) => e.kind === "wall").map((w) => {
    const t = m.type("wall", w.type), L = m.wallLength(w), H = m.wallHeight(w);
    const openings = m.hosted(w.id).reduce((s, o) => { const sp = m.openingSpan(o); return s + (sp.width * sp.height) / 1e6; }, 0);
    return { id: w.id, type: w.type, level: lv(w.level), length_m: +(L / 1000).toFixed(3), height_m: +(H / 1000).toFixed(3), thickness_mm: t.thickness, net_area_m2: +((L * H) / 1e6 - openings).toFixed(2), volume_m3: +(((L * H) / 1e6 - openings) * t.thickness / 1000).toFixed(3) };
  });
  if (kind === "door" || kind === "window") return m.elements.filter((e) => e.kind === kind).sort((a, b) => a.mark.localeCompare(b.mark)).map((o) => {
    const s = m.openingSpan(o); const t = m.type(kind, o.type);
    return { mark: o.mark, type: o.type, level: lv(o.level), wall: o.host, width_mm: s.width, height_mm: s.height, ...(kind === "window" ? { sill_mm: s.sill } : { fire_rating: t.fireRating }) };
  });
  if (kind === "room") return m.elements.filter((e) => e.kind === "room").sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })).map((r) => ({ number: r.number, name: r.name, level: lv(r.level), area_m2: +m.roomArea(r).toFixed(2), perimeter_m: +(polygonPerimeter(r.boundary) / 1000).toFixed(2) }));
  if (kind === "floor" || kind === "roof") return m.elements.filter((e) => e.kind === kind).map((f) => ({ id: f.id, type: f.type, level: lv(f.level), area_m2: +(Math.abs(polygonArea(f.boundary)) / 1e6).toFixed(2), thickness_mm: m.type(kind, f.type).thickness }));
  fail(`no schedule for ${kind}`);
}

export const COMMANDS = C;
export { clone, mul, perp, norm, sub, add, dist };
