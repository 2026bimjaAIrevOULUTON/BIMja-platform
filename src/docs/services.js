// Services and delivery drawings, each a reusable building block, bundled into packs per project type:
// independent service plans (one discipline), coordinated services (all disciplines + clashes + levels),
// piping isometrics (single-line, line numbers, flow, dimensions, fittings, bill of materials), spool drawings
// (prefabrication cut lists, shop and field welds), builder's work (penetrations and sleeve/opening schedule),
// plant room layouts (maintenance clearances), containment and supports, single-line diagrams and schematics
// (from model connections), whitespace layouts (racks, cold and hot aisles), equipment schedules, fire strategy.
// Output: views {prims, box, title, kind, tables?, nts?} in model mm (same contract as views.js).
import { modelTriangles } from "./mesh.js";
import { projectHidden, PROJ } from "./views.js";
import { disciplineOf, DISCIPLINES } from "../coord/model-clash.js";
import { solidOf } from "../author/solids.js";

const SERVICE = ["M", "E", "P", "F"];
export const DISC_COLOUR = { M: "#0077cc", E: "#d97800", P: "#1d8a3a", F: "#d0021b", C: "#6b6b6b", L: "#4f7f3a", A: "#000000", S: "#000000" };
const PIPE = new Set(["IfcPipeSegment"]), DUCT = new Set(["IfcDuctSegment"]), TRAY = new Set(["IfcCableCarrierSegment"]);
const EQUIP = new Set(["IfcPump", "IfcFan", "IfcChiller", "IfcCoolingTower", "IfcUnitaryEquipment", "IfcElectricGenerator", "IfcTransformer", "IfcElectricDistributionBoard", "IfcElectricFlowStorageDevice", "IfcHeatExchanger", "IfcSwitchingDevice", "IfcTank"]);
const HOSTS = new Set(["IfcWall", "IfcSlab", "IfcRoof", "IfcCurtainWall"]);
const box0 = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const grow = (b, p) => { b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]); b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]); };
const boxOf = (P) => { const b = box0(); P.lines.forEach((l) => l.p.forEach((p) => grow(b, p))); P.polys.forEach((q) => q.pts.forEach((p) => grow(b, p))); P.texts.forEach((t) => grow(b, t.at)); return b.x0 === Infinity ? { x0: 0, y0: 0, x1: 1000, y1: 1000 } : b; };
const prims = () => ({ lines: [], polys: [], arcs: [], texts: [] });
const elevOf = (model, e) => model.data.levels.find((l) => l.id === e.level)?.elevation || 0;
const fmt = (mm) => `${mm >= 0 ? "+" : "−"}${(Math.abs(mm) / 1000).toFixed(2)}`;
/** DN from a circular-ish profile (mean radius ×2), width × height for ducts and trays */
export function sizeOf(e) {
  const P = e.profile || []; if (!P.length) return ""; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const [u, v] of P) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const w = u1 - u0, h = v1 - v0; if (PIPE.has(e.ifc_class)) { const od = (w + h) / 2; const dn = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600].find((d) => d >= od * 0.82) || Math.round(od); return `DN${dn}`; }
  return `${Math.round(w)}×${Math.round(h)}`;
}
/** absolute path (mm) of a sweep element */
const pathOf = (model, e) => { const z0 = (e.base || 0) + elevOf(model, e); return e.path.map((p) => [p[0], p[1], (p[2] || 0) + z0]); };
const runs = (model, pred) => model.elements.filter((e) => e.kind === "mass" && e.shape === "sweep" && pred(e));
const isService = (e) => SERVICE.includes(disciplineOf(e)) || PIPE.has(e.ifc_class) || DUCT.has(e.ifc_class) || TRAY.has(e.ifc_class);
const isEquip = (e) => EQUIP.has(e.ifc_class) || (e.family && /chiller|pump|generator|transformer|ups|switchboard|board|ahu|crah|cdu|tank|pdu/i.test(e.family));
const isRack = (e) => /rack/i.test(`${e.family || ""} ${e.name || ""}`);

/** Top-down drawing of everything below cut_z; elements matching `focus` drawn bold in their discipline colour, the rest as a light background. */
function topDown(model, { focus, cut_z, title, kind, around = null, tag = null }) {
  const els = model.data.elements; let tris = modelTriangles(model);
  if (around) tris = tris.filter((t) => { const e = els[t.id]; if (!e) return false; try { const s = solidOf(e); return !(s.xmax < around.x0 || s.xmin > around.x1 || s.ymax < around.y0 || s.ymin > around.y1); } catch { return true; } });
  const r = projectHidden(tris, { proj: PROJ.plan, near: -cut_z }); const P = prims();
  for (const l of r.prims.lines) { const e = els[l.id]; const f = e && focus(e); const d = e ? disciplineOf(e) : "A";
    P.lines.push(f ? { p: l.p, w: 0.35, layer: `${d}-SERVICES`, col: DISC_COLOUR[d] } : { p: l.p, w: 0.13, layer: "background", col: "#9a9a9a" }); }
  if (tag) for (const e of model.elements) if (focus(e)) tag(e, P);
  if (around) { // crop to the area shown: lines clipped at the edge (Liang–Barsky), nothing drawn past it
    const clip = ([a, b]) => { let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
      for (const [p, q] of [[-dx, a[0] - around.x0], [dx, around.x1 - a[0]], [-dy, a[1] - around.y0], [dy, around.y1 - a[1]]]) { if (p === 0) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
      return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]]; };
    P.lines = P.lines.flatMap((l) => { const c = clip(l.p); return c ? [{ ...l, p: c }] : []; });
    P.lines.push(...[[[around.x0, around.y0], [around.x1, around.y0]], [[around.x1, around.y0], [around.x1, around.y1]], [[around.x1, around.y1], [around.x0, around.y1]], [[around.x0, around.y1], [around.x0, around.y0]]].map((p) => ({ p, w: 0.18, layer: "background", col: "#9a9a9a", dash: true })));
    P.texts = P.texts.filter((t) => t.at[0] >= around.x0 && t.at[0] <= around.x1 && t.at[1] >= around.y0 && t.at[1] <= around.y1); }
  const box = around ? { ...around } : boxOf(P); return { prims: P, box, title, kind };
}

// ---------- independent and coordinated service plans ----------
export function servicePlan(model, { discipline, cut_z = null, title = null }) {
  const cz = cut_z ?? serviceCut(model); const focus = (e) => disciplineOf(e) === discipline && (isService(e) || isEquip(e) || e.kind === "mass");
  return topDown(model, { focus, cut_z: cz, kind: "service", title: title || `${DISCIPLINES[discipline] || discipline} services`, tag: (e, P) => serviceTag(model, e, P, false) });
}
/** Plan cut for services: just above the highest service, but below the soffit of the slab or roof over it (else it hides them). */
function serviceCut(model) { // the services under the first roof or upper slab: plant on top of it belongs on the roof plan
  let soffit = Infinity; for (const e of model.elements) if (e.ifc_class === "IfcSlab" || e.ifc_class === "IfcRoof") { try { const s = solidOf(e); const z = s.zmin + elevOf(model, e); if (z > 2400) soffit = Math.min(soffit, z); } catch {} }
  const top = maxServiceZ(model, soffit); return Math.min(top + 300, soffit - 1); }
function maxServiceZ(model, below = Infinity) { let z = -Infinity; for (const e of model.elements) if (isService(e) || isEquip(e)) { try { const s = solidOf(e); const t = s.zmax + elevOf(model, e); if (s.zmin + elevOf(model, e) < below) z = Math.max(z, Math.min(t, below)); } catch {} } return Number.isFinite(z) ? z : 4000; }
function serviceTag(model, e, P, levels) {
  if (e.shape !== "sweep") { if (isEquip(e)) { try { const s = solidOf(e); P.texts.push({ at: [(s.xmin + s.xmax) / 2, s.ymax + 300], text: e.mark || e.name || e.id, h: 2.2, align: "middle", layer: "tag" }); } catch {} } return; }
  const p = pathOf(model, e); let best = 0, bi = 0; for (let i = 0; i < p.length - 1; i++) { const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); if (L > best) { best = L; bi = i; } } if (best < 1) return;
  const a = p[bi], b = p[bi + 1]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; let rot = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; if (rot > 90) rot -= 180; if (rot < -90) rot += 180;
  let zlo = Infinity, zhi = -Infinity; try { const s = solidOf(e); zlo = s.zmin + elevOf(model, e); zhi = s.zmax + elevOf(model, e); } catch {}
  const label = `${e.system || e.name || e.id} ${sizeOf(e)}${levels && Number.isFinite(zlo) ? `  TOP ${fmt(zhi)} BOT ${fmt(zlo)}` : ""}`;
  P.texts.push({ at: [m[0], m[1]], dy: 1.2, text: label, h: 1.8, align: "middle", layer: "tag", rot, col: DISC_COLOUR[disciplineOf(e)] });
}
export function coordinatedPlan(model, { cut_z = null, clashes = [] } = {}) {
  const v = topDown(model, { focus: (e) => isService(e) || isEquip(e), cut_z: cut_z ?? serviceCut(model), kind: "coordinated", title: "Coordinated services (all disciplines)", tag: (e, P) => serviceTag(model, e, P, true) });
  clashes.forEach((c, i) => { const r = 450; const pts = []; for (let k = 0; k < 16; k++) pts.push([c.at[0] + r * Math.cos((k * Math.PI) / 8), c.at[1] + r * Math.sin((k * Math.PI) / 8)]);
    v.prims.polys.push({ pts, w: 0.5, layer: "clash", col: "#d0021b" }); v.prims.texts.push({ at: [c.at[0] + r + 120, c.at[1]], text: `C${i + 1}`, h: 2.2, layer: "clash", col: "#d0021b", bold: true }); });
  const used = [...new Set(model.elements.filter((e) => isService(e)).map((e) => disciplineOf(e)))].sort();
  v.tables = [{ title: "Legend", head: ["Colour", "Discipline"], rows: used.map((d) => [d, DISCIPLINES[d] || d]) }];
  if (clashes.length) v.tables.push({ title: "Unresolved clashes", head: ["Ref", "Between", "Volume m³", "At (x, y, z)"], rows: clashes.slice(0, 30).map((c, i) => [`C${i + 1}`, `${c.a_name} × ${c.b_name}`.slice(0, 60), c.volume_m3, c.at.map((n) => Math.round(n)).join(", ")]) });
  return v;
}

// ---------- piping: lines, isometrics, spools ----------
/** Pipe lines: each pipe sweep is a line; line number = system or name. */
export function pipeLines(model, { system = null } = {}) {
  return runs(model, (e) => PIPE.has(e.ifc_class) && (!system || e.system === system || e.layer === system)).map((e, i) => {
    const p = pathOf(model, e); const segs = []; for (let k = 0; k < p.length - 1; k++) segs.push(Math.hypot(p[k + 1][0] - p[k][0], p[k + 1][1] - p[k][1], p[k + 1][2] - p[k][2]));
    const bends = []; for (let k = 1; k < p.length - 1; k++) { const u = p[k].map((v, j) => v - p[k - 1][j]), w = p[k + 1].map((v, j) => w0(v, j, p[k])); const ang = angle(u, w); if (ang > 1) bends.push({ at: k, deg: ang <= 60 ? 45 : 90 }); }
    return { id: e.id, line: e.system || e.name || `L${i + 1}`, size: sizeOf(e), dn: +sizeOf(e).replace(/\D/g, "") || 0, path: p, segs, bends, length_mm: segs.reduce((a, b) => a + b, 0), discipline: disciplineOf(e), material: e.material || "" };
  });
  function w0(v, j, q) { return v - q[j]; }
}
const angle = (u, w) => { const d = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / ((Math.hypot(...u) * Math.hypot(...w)) || 1); return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI; };
function isoLines(P, path, { col = "#000", w = 0.5, dims = true, arrows = true, fittings = true }) {
  const Q = path.map((p) => PROJ.iso_sw(p)); for (let i = 0; i < Q.length - 1; i++) P.lines.push({ p: [Q[i], Q[i + 1]], w, layer: "pipe", col });
  for (let i = 0; i < Q.length - 1 && dims; i++) { const L = Math.hypot(...path[i + 1].map((v, j) => v - path[i][j])); if (L < 150) continue; const m = [(Q[i][0] + Q[i + 1][0]) / 2, (Q[i][1] + Q[i + 1][1]) / 2]; let rot = (Math.atan2(Q[i + 1][1] - Q[i][1], Q[i + 1][0] - Q[i][0]) * 180) / Math.PI; if (rot > 90) rot -= 180; if (rot < -90) rot += 180; P.texts.push({ at: m, dy: 1.4, text: `${Math.round(L)}`, h: 1.8, align: "middle", layer: "dims", rot }); }
  if (fittings) for (let i = 1; i < Q.length - 1; i++) { const r = 60, c = Q[i]; const pts = []; for (let k = 0; k < 10; k++) pts.push([c[0] + r * Math.cos((k * Math.PI) / 5), c[1] + r * Math.sin((k * Math.PI) / 5)]); P.polys.push({ pts, w: 0.3, layer: "fitting", fill: true, col }); }
  if (arrows && Q.length > 1) { const a = Q[0], b = Q[1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L; const m = [a[0] + ux * Math.min(L / 2, 900), a[1] + uy * Math.min(L / 2, 900)]; const s = 220;
    P.polys.push({ pts: [[m[0] + ux * s, m[1] + uy * s], [m[0] - uy * s * 0.45, m[1] + ux * s * 0.45], [m[0] + uy * s * 0.45, m[1] - ux * s * 0.45]], w: 0.2, layer: "flow", fill: true, col }); }
  return Q;
}
export function pipingIso(model, { system = null } = {}) {
  const L = pipeLines(model, { system }); const P = prims(); const bom = new Map();
  for (const l of L) { const Q = isoLines(P, l.path, { col: DISC_COLOUR[l.discipline] || "#000" }); P.texts.push({ at: Q[0], dy: 3, text: `${l.line}  ${l.size}`, h: 2.4, layer: "tag", bold: true });
    const k = (d, u) => `${d}|${u}|${l.size}`; bom.set(k("Pipe", "m"), (bom.get(k("Pipe", "m")) || 0) + l.length_mm / 1000);
    for (const b of l.bends) bom.set(k(`Elbow ${b.deg}°`, "no."), (bom.get(k(`Elbow ${b.deg}°`, "no.")) || 0) + 1); bom.set(k("Flange (line ends)", "no."), (bom.get(k("Flange (line ends)", "no.")) || 0) + 2); }
  const rows = [...bom].sort().map(([key, q], i) => { const [item, unit, size] = key.split("|"); return [String(i + 1), item, size, unit === "m" ? q.toFixed(2) : String(q), unit]; });
  return { prims: P, box: boxOf(P), title: system ? `Piping isometric: ${system}` : "Piping isometric (all lines)", kind: "isometric", nts: true, tables: [{ title: "Bill of materials", head: ["Item", "Description", "Size", "Qty", "Unit"], rows }, { title: "Lines", head: ["Line", "Size", "Length m", "Bends"], rows: L.map((l) => [l.line, l.size, (l.length_mm / 1000).toFixed(2), String(l.bends.length)]) }] };
}
/** Split every line into prefabrication spools no longer than max_mm (transport), cutting on straights. */
export function spools(model, { max_mm = 6000, system = null } = {}) {
  const out = [];
  for (const l of pipeLines(model, { system })) {
    let cur = [l.path[0]], len = 0, shop = 0, n = 1; const pieces = []; let piece = 0;
    for (let i = 0; i < l.path.length - 1; i++) { let a = l.path[i]; const b = l.path[i + 1]; let segL = Math.hypot(...b.map((v, j) => v - a[j]));
      while (len + segL > max_mm) { const t = (max_mm - len) / segL; const c = a.map((v, j) => v + (b[j] - v) * t); cur.push(c); pieces.push(Math.round(piece + max_mm - len)); out.push({ id: `${l.line}-S${String(n).padStart(2, "0")}`, line: l.line, size: l.size, path: cur, cuts: pieces.slice(), shop_welds: shop, field_welds: 1 }); n++; cur = [c]; segL -= max_mm - len; a = c; len = 0; piece = 0; shop = 0; pieces.length = 0; }
      len += segL; piece += segL; cur.push(b); if (i < l.path.length - 2) { pieces.push(Math.round(piece)); piece = 0; shop += 2; } }
    if (cur.length > 1) { pieces.push(Math.round(piece)); out.push({ id: `${l.line}-S${String(n).padStart(2, "0")}`, line: l.line, size: l.size, path: cur, cuts: pieces.filter((x) => x > 0), shop_welds: shop, field_welds: n > 1 ? 1 : 0 }); }
  }
  return out;
}
export function spoolSheet(model, { page = 1, per = 6, max_mm = 6000 } = {}) {
  const S = spools(model, { max_mm }); const list = S.slice((page - 1) * per, page * per); const views = list.map((s) => { const P = prims(); const Q = isoLines(P, s.path, { col: "#000", arrows: false });
    P.texts.push({ at: Q[0], dy: 3, text: `${s.id}  ${s.size}`, h: 2.6, layer: "tag", bold: true }); return { prims: P, box: boxOf(P), title: `Spool ${s.id}`, kind: "isometric", nts: true }; });
  if (views.length) views[views.length - 1].tables = [{ title: `Spool cut list (sheet ${page} of ${Math.max(1, Math.ceil(S.length / per))})`, head: ["Spool", "Size", "Cut lengths mm", "Shop welds", "Field welds"], rows: list.map((s) => [s.id, s.size, s.cuts.join(" + "), String(s.shop_welds), String(s.field_welds)]) }];
  return { views, total: S.length, pages: Math.max(1, Math.ceil(S.length / per)) };
}

// ---------- builder's work: penetrations ----------
export function penetrations(model, kernel) {
  const { toManifold, triangulate } = kernel; const out = []; const svc = model.elements.filter((e) => e.kind === "mass" && isService(e) && e.shape === "sweep"); const hosts = model.elements.filter((e) => e.kind === "mass" && HOSTS.has(e.ifc_class));
  const bb = (e) => { const s = solidOf(e), z = elevOf(model, e); return { s, x0: s.xmin, x1: s.xmax, y0: s.ymin, y1: s.ymax, z0: s.zmin + z, z1: s.zmax + z, z }; };
  const H = hosts.map((h) => ({ h, b: bb(h) })); let n = 1;
  for (const e of svc) { const b = bb(e); let M = null;
    for (const { h, b: c } of H) { if (b.x1 < c.x0 || b.x0 > c.x1 || b.y1 < c.y0 || b.y0 > c.y1 || b.z1 < c.z0 || b.z0 > c.z1) continue;
      M ||= toManifold(b.s, triangulate).translate([0, 0, b.z]); const N = toManifold(c.s, triangulate).translate([0, 0, c.z]); const I = M.intersect(N); const v = I.volume();
      if (v > 1e3) { const bx = I.boundingBox(); const lo = bx.min, hi = bx.max; const clear = 50; const r25 = (x) => Math.ceil(x / 25) * 25;
        const dims = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]; const thick = h.ifc_class === "IfcSlab" || h.ifc_class === "IfcRoof" ? 2 : dims[0] < dims[1] ? 0 : 1; // the thin axis crosses the host
        const across = [0, 1, 2].filter((k) => k !== thick); const round = PIPE.has(e.ifc_class);
        out.push({ ref: `BW-${String(n++).padStart(3, "0")}`, host: h.name || h.id, host_id: h.id, host_class: h.ifc_class, service: e.name || e.id, service_id: e.id, discipline: disciplineOf(e), shape: round ? "round sleeve" : "rectangular opening",
          size: round ? `Ø${r25(Math.max(dims[across[0]], dims[across[1]]) + 2 * clear)}` : `${r25(dims[across[0]] + 2 * clear)}×${r25(dims[across[1]] + 2 * clear)}`, at: [0, 1, 2].map((k) => Math.round((lo[k] + hi[k]) / 2)) }); }
      I.delete(); N.delete(); }
    M?.delete(); }
  return out;
}
export function bwicPlan(model, list) {
  const around = (() => { const b = box0(); for (const o of list) grow(b, o.at); return b.x0 === Infinity ? null : { x0: b.x0 - 4000, y0: b.y0 - 4000, x1: b.x1 + 4000, y1: b.y1 + 4000 }; })();
  const v = topDown(model, { focus: (e) => HOSTS.has(e.ifc_class), cut_z: serviceCut(model), kind: "bwic", title: "Builder's work in connection: penetrations", around });
  for (const L of v.prims.lines) if (L.layer !== "background") { L.col = "#000"; L.layer = "A-HOSTS"; }
  for (const o of list) { const s = 350; v.prims.polys.push({ pts: [[o.at[0] - s, o.at[1] - s], [o.at[0] + s, o.at[1] - s], [o.at[0] + s, o.at[1] + s], [o.at[0] - s, o.at[1] + s]], w: 0.45, layer: "bwic", col: "#d0021b" }); v.prims.texts.push({ at: [o.at[0] + s + 100, o.at[1] + s], text: `${o.ref} ${o.size}`, h: 2, layer: "bwic", col: "#d0021b" }); }
  v.tables = [{ title: "Opening and sleeve schedule (sizes include 50 mm clearance, rounded up to 25 mm)", head: ["Ref", "Host", "Service", "Type", "Size mm", "Centre x, y, z"], rows: list.map((o) => [o.ref, o.host.slice(0, 26), o.service.slice(0, 30), o.shape, o.size, o.at.join(", ")]) }];
  return v;
}

// ---------- plant rooms, containment, whitespace, fire ----------
export function plantRoom(model, { clearance_mm = 1000 } = {}) {
  const eq = model.elements.filter(isEquip); const b = box0(); const fp = eq.map((e) => { const s = solidOf(e); const c = e.params?.Clearance_mm ?? clearance_mm; grow(b, [s.xmin - c, s.ymin - c]); grow(b, [s.xmax + c, s.ymax + c]); return { e, s, c }; });
  const around = b.x0 === Infinity ? null : { x0: b.x0 - 1500, y0: b.y0 - 1500, x1: b.x1 + 1500, y1: b.y1 + 1500 };
  const v = topDown(model, { focus: (e) => isEquip(e), cut_z: serviceCut(model), kind: "plant", title: "Plant room layout and maintenance clearances", around, tag: (e, P) => serviceTag(model, e, P, false) });
  const issues = [];
  fp.forEach(({ e, s, c }, i) => { v.prims.polys.push({ pts: [[s.xmin - c, s.ymin - c], [s.xmax + c, s.ymin - c], [s.xmax + c, s.ymax + c], [s.xmin - c, s.ymax + c]], w: 0.25, layer: "clearance", col: "#0077cc", dash: true });
    fp.forEach((o, j) => { if (j <= i) return; if (s.xmin - c < o.s.xmax && s.xmax + c > o.s.xmin && s.ymin - c < o.s.ymax && s.ymax + c > o.s.ymin) issues.push(`${e.mark || e.name} clearance overlaps ${o.e.mark || o.e.name}`); }); });
  v.tables = [{ title: "Equipment in this plant area", head: ["Mark", "Equipment", "Footprint m", "Clearance mm"], rows: fp.map(({ e, s, c }) => [e.mark || e.id, (e.family || e.name || "").slice(0, 30), `${((s.xmax - s.xmin) / 1000).toFixed(1)} × ${((s.ymax - s.ymin) / 1000).toFixed(1)}`, String(c)]) },
    { title: "Clearance check", head: ["Result"], rows: (issues.length ? issues : ["All maintenance zones clear"]).map((x) => [x]) }];
  return v;
}
export function containment(model, { spacing_mm = 1500 } = {}) {
  const T = runs(model, (e) => TRAY.has(e.ifc_class)); const v = topDown(model, { focus: (e) => TRAY.has(e.ifc_class), cut_z: serviceCut(model), kind: "containment", title: "Containment and supports", tag: (e, P) => serviceTag(model, e, P, true) });
  const rows = []; for (const e of T) { const p = pathOf(model, e); let n = 0; for (let i = 0; i < p.length - 1; i++) { const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); const k = Math.max(1, Math.ceil(L / spacing_mm));
      for (let j = 0; j <= k; j++) { if (i > 0 && j === 0) continue; const q = [p[i][0] + ((p[i + 1][0] - p[i][0]) * j) / k, p[i][1] + ((p[i + 1][1] - p[i][1]) * j) / k]; const s = 120; v.prims.lines.push({ p: [[q[0] - s, q[1] - s], [q[0] + s, q[1] + s]], w: 0.3, layer: "support", col: "#d97800" }, { p: [[q[0] - s, q[1] + s], [q[0] + s, q[1] - s]], w: 0.3, layer: "support", col: "#d97800" }); n++; } }
    let z = 0; try { z = solidOf(e).zmin + elevOf(model, e); } catch {} rows.push([e.system || e.name || e.id, sizeOf(e), String(n), `M10 drop rods, unistrut at ≤ ${spacing_mm} mm`, fmt(z)]); }
  v.tables = [{ title: "Support schedule", head: ["Run", "Size", "Supports", "Support type", "Underside"], rows }]; return v;
}
export function whitespace(model) {
  const R = model.elements.filter(isRack).map((e) => ({ e, s: solidOf(e) })); const b = box0(); R.forEach(({ s }) => { grow(b, [s.xmin, s.ymin]); grow(b, [s.xmax, s.ymax]); });
  const around = b.x0 === Infinity ? null : { x0: b.x0 - 3000, y0: b.y0 - 3000, x1: b.x1 + 3000, y1: b.y1 + 3000 };
  const top = R.reduce((z, r) => Math.max(z, r.s.zmax + elevOf(model, r.e)), 0);
  const v = topDown(model, { focus: isRack, cut_z: top + 1200, kind: "whitespace", title: "Whitespace layout: racks, cold and hot aisles", around });
  // rows run along whichever axis gives fewer, longer lines of racks
  const group = (key) => { const rows = []; for (const r of R) { const c = key(r); let row = rows.find((x) => Math.abs(x.c - c) < 300); if (!row) rows.push((row = { c, racks: [] })); row.racks.push(r); } return rows.sort((p, q) => p.c - q.c); };
  const byY = group((r) => (r.s.ymin + r.s.ymax) / 2), byX = group((r) => (r.s.xmin + r.s.xmax) / 2); const alongX = byY.length <= byX.length; const rows = alongX ? byY : byX;
  const lo = (r) => (alongX ? r.s.ymin : r.s.xmin), hi = (r) => (alongX ? r.s.ymax : r.s.xmax), a0 = (r) => (alongX ? r.s.xmin : r.s.ymin), a1 = (r) => (alongX ? r.s.xmax : r.s.ymax);
  const name = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);
  rows.forEach((row, i) => { row.name = name(i); row.racks.sort((p, q) => a0(p) - a0(q)); row.racks.forEach((r, k) => v.prims.texts.push({ at: [(r.s.xmin + r.s.xmax) / 2, (r.s.ymin + r.s.ymax) / 2], dy: -0.8, text: `${row.name}${String(k + 1).padStart(2, "0")}`, h: 1.4, align: "middle", layer: "tag" })); });
  // aisles: the gap between neighbouring rows whose extents overlap; racks back to back share a hot aisle, front to front a cold one
  let n = 0; for (let i = 0; i < rows.length - 1; i++) { const a = rows[i], c = rows[i + 1]; const g0 = Math.max(...a.racks.map(hi)), g1 = Math.min(...c.racks.map(lo)); if (!(g1 > g0) || g1 - g0 > 3000) { n = 0; continue; } // a new pod starts its own hot/cold sequence
    const s0 = Math.max(Math.min(...a.racks.map(a0)), Math.min(...c.racks.map(a0))), s1 = Math.min(Math.max(...a.racks.map(a1)), Math.max(...c.racks.map(a1))); if (!(s1 > s0)) continue;
    const hot = n++ % 2 === 0; const pts = alongX ? [[s0, g0], [s1, g0], [s1, g1], [s0, g1]] : [[g0, s0], [g1, s0], [g1, s1], [g0, s1]];
    v.prims.polys.push({ pts, w: 0, layer: hot ? "hot-aisle" : "cold-aisle", fill: true, col: hot ? "#ffe1d6" : "#dceeff" });
    v.prims.texts.push({ at: [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2], dy: -0.8, text: hot ? "HOT AISLE (contained)" : "COLD AISLE", h: 2, align: "middle", layer: "tag", col: hot ? "#c0392b" : "#0077cc", ...(alongX ? {} : { rot: 90 }) }); }
  const kw = (r) => +(r.e.params?.Power_kW ?? r.e.params?.power_kw ?? model.data.families?.[r.e.family]?.parameters?.Nameplate_kW ?? model.data.families?.[r.e.family]?.parameters?.Power_kW ?? 0);
  v.tables = [{ title: "Rack rows", head: ["Row", "Racks", "Design IT load kW"], rows: [...rows.map((r) => [r.name, String(r.racks.length), r.racks.reduce((t, x) => t + kw(x), 0).toFixed(0)]), ["Total", String(R.length), R.reduce((t, x) => t + kw(x), 0).toFixed(0)]] }];
  return v;
}
export function fireStrategy(model) {
  const rated = (e) => e.params?.FireRating || e.params?.fire_rating; const v = topDown(model, { focus: (e) => disciplineOf(e) === "F" || !!rated(e), cut_z: 1500, kind: "fire", title: "Fire strategy: compartments and fire systems" });
  for (const L of v.prims.lines) if (L.layer !== "background") L.col = "#d0021b";
  for (const e of model.elements.filter(rated)) { try { const s = solidOf(e); v.prims.texts.push({ at: [(s.xmin + s.xmax) / 2, (s.ymin + s.ymax) / 2], text: `${rated(e)} min`, h: 2, align: "middle", layer: "tag", col: "#d0021b", bold: true }); } catch {} }
  v.tables = [{ title: "Fire legend", head: ["Mark", "Meaning"], rows: [["Red bold", "Fire-rated construction (rating in minutes) and fire systems (sprinklers, detection, fire mains)"], ["Grey", "Other elements"]] }];
  return v;
}

// ---------- schematics from connections ----------
export function schematic(model, { medium = "power", title = null } = {}) {
  const K = (model.data.connections || []).filter((k) => k.medium === medium && model.data.elements[k.from] && model.data.elements[k.to]); const P = prims();
  const ids = [...new Set(K.flatMap((k) => [k.from, k.to]))]; const inc = Object.fromEntries(ids.map((i) => [i, K.filter((k) => k.to === i).length]));
  const depth = {}; const q = ids.filter((i) => !inc[i]).sort(); q.forEach((i) => (depth[i] = 0)); for (let n = 0; n < q.length; n++) for (const k of K.filter((x) => x.from === q[n]).sort((a, b) => (a.to < b.to ? -1 : 1))) if (depth[k.to] == null || depth[k.to] < depth[q[n]] + 1) { if ((depth[k.to] = depth[q[n]] + 1) < 50) q.push(k.to); }
  const cols = {}; for (const i of ids) (cols[depth[i] ?? 0] ||= []).push(i); const W = 9000, H = 5200, at = {};
  for (const [d, list] of Object.entries(cols)) list.sort().forEach((i, r) => (at[i] = [r * W - ((list.length - 1) * W) / 2, -d * H * 1.6]));
  for (const k of K) { const a = at[k.from], b = at[k.to]; const ym = (a[1] - H / 2 + b[1] + H / 2) / 2; P.lines.push({ p: [[a[0], a[1] - H / 2], [a[0], ym]], w: 0.5, layer: "schematic" }, { p: [[a[0], ym], [b[0], ym]], w: 0.5, layer: "schematic" }, { p: [[b[0], ym], [b[0], b[1] + H / 2]], w: 0.5, layer: "schematic" });
    if (k.rating || k.label) P.texts.push({ at: [b[0] + 250, (ym + b[1] + H / 2) / 2], text: k.rating || k.label, h: 2, layer: "tag" }); }
  for (const i of ids) { const e = model.data.elements[i]; const [x, y] = at[i]; P.polys.push({ pts: [[x - W * 0.38, y - H / 2], [x + W * 0.38, y - H / 2], [x + W * 0.38, y + H / 2], [x - W * 0.38, y + H / 2]], w: 0.5, layer: "schematic" });
    P.texts.push({ at: [x, y + 600], text: e.mark || e.id, h: 2.8, align: "middle", layer: "tag", bold: true }, { at: [x, y - 900], text: String(e.family || e.name || "").slice(0, 26), h: 2, align: "middle", layer: "tag" }); }
  const name = { power: "Single-line diagram: power distribution", chw: "Schematic: chilled water", fire: "Schematic: fire protection", data: "Schematic: data network", cw: "Schematic: cold water", hhw: "Schematic: heating water", fuel: "Schematic: fuel", air: "Schematic: air", drain: "Schematic: drainage", process: "Schematic: process" }[medium];
  return { prims: P, box: boxOf(P), title: title || name, kind: "schematic", nts: true, empty: !K.length };
}

// ---------- equipment schedule (table only) ----------
export function equipmentRows(model) {
  return model.elements.filter((e) => isEquip(e) || isRack(e)).map((e) => { let c = ""; try { const s = solidOf(e); c = `${Math.round((s.xmin + s.xmax) / 2)}, ${Math.round((s.ymin + s.ymax) / 2)}`; } catch {}
    const prm = { ...(model.data.families?.[e.family]?.parameters || {}), ...(e.params || {}) }; return [e.mark || e.id, String(e.family || e.name || "").slice(0, 32), e.ifc_class, disciplineOf(e), e.system || "", c, Object.entries(prm).slice(0, 4).map(([k, v]) => `${k} ${v}`).join("; ").slice(0, 70)]; });
}

// ---------- packs ----------
export const SHEET_KINDS = { service: "Independent service drawing", coordinated: "Coordinated services drawing", piping_iso: "Piping isometric", spool: "Spool drawings", bwic: "Builder's work (penetrations)", plant: "Plant room layout", containment: "Containment and supports", sld: "Single-line diagram / schematic", whitespace: "Whitespace layout", equipment: "Equipment schedule", fire: "Fire strategy", as_built: "As-constructed record (re-issue, status CR)" };
export const PACKS = {
  building: ["service", "coordinated", "bwic", "equipment", "fire"],
  data_centre: ["service", "coordinated", "piping_iso", "spool", "bwic", "plant", "containment", "sld", "whitespace", "equipment", "fire"],
  process_plant: ["service", "coordinated", "piping_iso", "spool", "bwic", "plant", "sld", "equipment", "fire"],
  airport: ["service", "coordinated", "bwic", "plant", "containment", "sld", "equipment", "fire"],
  institute: ["service", "coordinated", "bwic", "plant", "equipment", "fire"],
  infrastructure: ["service", "coordinated", "bwic"],
  excavation: ["service"],
  heritage: ["equipment"],
};
/** Which sheets a pack yields for this model (skips building blocks with nothing to draw). */
export function packSheets(model, kinds, zoneOf = null) {
  const els = model.elements; const out = []; const has = (pred) => els.some(pred);
  // zone-cropped sheets (one per data hall, plant yard...) for the blocks that read best at a larger scale
  if (zoneOf) for (const z of model.data.zones || []) { const zm = zoneOf(model, z.code); const zh = (pred) => zm.elements.some(pred); const nm = (t) => `${t}, ${z.name}`;
    if (kinds.includes("whitespace") && zh(isRack)) out.push({ kind: "whitespace", zone: z.code, role: "E", title: nm("Whitespace layout") });
    if (kinds.includes("coordinated") && zh(isService)) out.push({ kind: "coordinated", zone: z.code, role: "M", title: nm("Coordinated services") });
    if (kinds.includes("plant") && zh(isEquip)) out.push({ kind: "plant", zone: z.code, role: "M", title: nm("Plant layout") });
    if (kinds.includes("containment") && zh((e) => TRAY.has(e.ifc_class) && e.shape === "sweep")) out.push({ kind: "containment", zone: z.code, role: "E", title: nm("Containment and supports") }); }
  for (const k of kinds) {
    if (k === "service") for (const d of SERVICE) { if (has((e) => disciplineOf(e) === d && (isService(e) || isEquip(e)))) out.push({ kind: "service", discipline: d, role: d, title: `${DISCIPLINES[d]} services` }); }
    if (k === "coordinated" && has(isService)) out.push({ kind: "coordinated", role: "M", title: "Coordinated services" });
    if (k === "piping_iso" && has((e) => PIPE.has(e.ifc_class) && e.shape === "sweep")) out.push({ kind: "piping_iso", role: "M", title: "Piping isometrics" });
    if (k === "spool" && has((e) => PIPE.has(e.ifc_class) && e.shape === "sweep")) { const n = spoolSheet(model, { page: 1 }).pages; for (let p = 1; p <= Math.min(n, 20); p++) out.push({ kind: "spool", page: p, role: "M", title: `Spool drawings ${p} of ${n}` }); }
    if (k === "bwic" && has(isService) && has((e) => HOSTS.has(e.ifc_class))) out.push({ kind: "bwic", role: "A", title: "Builder's work in connection" });
    if (k === "plant" && has(isEquip)) out.push({ kind: "plant", role: "M", title: "Plant room layout" });
    if (k === "containment" && has((e) => TRAY.has(e.ifc_class) && e.shape === "sweep")) out.push({ kind: "containment", role: "E", title: "Containment and supports" });
    if (k === "sld") for (const m of ["power", "chw", "fire"]) if ((model.data.connections || []).some((c) => c.medium === m)) out.push({ kind: "sld", medium: m, role: m === "power" ? "E" : m === "fire" ? "F" : "M", title: m === "power" ? "Single-line diagram" : `${m === "chw" ? "Chilled water" : "Fire"} schematic` });
    if (k === "whitespace" && has(isRack)) out.push({ kind: "whitespace", role: "E", title: "Whitespace layout" });
    if (k === "equipment" && has((e) => isEquip(e) || isRack(e))) out.push({ kind: "equipment", role: "M", title: "Equipment schedule" });
    if (k === "fire" && has((e) => disciplineOf(e) === "F" || e.params?.FireRating)) out.push({ kind: "fire", role: "F", title: "Fire strategy" });
  }
  return out;
}
