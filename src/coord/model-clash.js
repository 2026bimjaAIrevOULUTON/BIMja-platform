// Headless clash detection on the authored model with the geometry kernel: exact intersection volumes between
// solids, grouped by discipline (the federation split) or IFC class. Bounding boxes prune pairs first.
import { solidOf } from "../author/solids.js";
import { triangulate } from "../author/geom.js";
import { toManifold, fromManifold, needKernel } from "../author/kernel.js";

/** ISO 19650 / UK role codes used as the federation split: A architecture, S structure, M mechanical, E electrical, P public health, C civil, L landscape/site. */
export const DISCIPLINES = { A: "Architecture", S: "Structure", M: "Mechanical", E: "Electrical", P: "Public health", C: "Civil", L: "Landscape and site", F: "Fire" };
const BY_CLASS = { IfcColumn: "S", IfcBeam: "S", IfcSlab: "S", IfcFooting: "S", IfcMember: "S", IfcPile: "S",
  IfcWall: "A", IfcCurtainWall: "A", IfcCovering: "A", IfcRoof: "A", IfcRailing: "A", IfcStair: "A", IfcRamp: "A", IfcPlate: "A", IfcDoor: "A", IfcWindow: "A", IfcFurniture: "A", IfcBuildingElementProxy: "A", IfcSpace: "A",
  IfcPipeSegment: "P", IfcDuctSegment: "M", IfcPump: "M", IfcFan: "M", IfcChiller: "M", IfcCoolingTower: "M", IfcUnitaryEquipment: "M", IfcTank: "M",
  IfcCableCarrierSegment: "E", IfcElectricGenerator: "E", IfcTransformer: "E", IfcElectricDistributionBoard: "E", IfcGeographicElement: "L" };
export const disciplineOf = (e) => e.discipline || BY_CLASS[e.ifc_class || (e.kind === "wall" ? "IfcWall" : e.kind === "floor" ? "IfcSlab" : "IfcBuildingElementProxy")] || "A";

const inSet = (e, sel) => sel === "all" || [].concat(sel).some((s) => s === disciplineOf(e) || s === e.ifc_class || s === e.id);

export function clashModel(model, { a = "all", b = "all", min_volume_m3 = 0.001, ignore_same_discipline = false, ignore_same_class = false, limit = 500 } = {}) {
  needKernel();
  const elev = (lv) => model.level(lv).elevation;
  const els = model.elements.filter((e) => e.kind === "mass").map((e) => { const s = solidOf(e); const z = elev(e.level);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const v of s.verts) for (let k = 0; k < 3; k++) { const q = v[k] + (k === 2 ? z : 0); lo[k] = Math.min(lo[k], q); hi[k] = Math.max(hi[k], q); }
    const parts = e.shape === "group" ? e.parts : [null]; return { e, s, z, lo, hi, parts }; });
  const man = new Map(); let unchecked = 0;
  const pieces = (x) => { if (man.has(x.e.id)) return man.get(x.e.id); let list = [];
    try { list = x.parts[0] === null ? [toManifold(x.s, triangulate)] : x.parts.map((p) => toManifold(solidOf({ kind: "mass", ...p }), triangulate)); } catch { list = null; unchecked++; }
    if (list) list = list.map((m) => (x.z ? m.translate([0, 0, x.z]) : m)); man.set(x.e.id, list); return list; };
  const A = els.filter((x) => inSet(x.e, a)), B = els.filter((x) => inSet(x.e, b)); const out = []; let tested = 0;
  for (const p of A) for (const q of B) {
    if (p.e.id >= q.e.id && B.includes(p) && A.includes(q)) continue; if (p === q) continue;
    if (ignore_same_discipline && disciplineOf(p.e) === disciplineOf(q.e)) continue; if (ignore_same_class && p.e.ifc_class === q.e.ifc_class) continue;
    if (p.hi[0] <= q.lo[0] || q.hi[0] <= p.lo[0] || p.hi[1] <= q.lo[1] || q.hi[1] <= p.lo[1] || p.hi[2] <= q.lo[2] || q.hi[2] <= p.lo[2]) continue;
    const ma = pieces(p), mb = pieces(q); if (!ma || !mb) continue; tested++;
    let vol = 0, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const x of ma) for (const y of mb) { const i = x.intersect(y); const v = i.volume(); if (v > 0) { vol += v; const r = fromManifold(i); for (const w of r.verts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); } } i.delete(); }
    const m3 = vol / 1e9; if (m3 >= min_volume_m3) out.push({ a: p.e.id, b: q.e.id, a_name: p.e.name, b_name: q.e.name, a_discipline: disciplineOf(p.e), b_discipline: disciplineOf(q.e), a_class: p.e.ifc_class, b_class: q.e.ifc_class, volume_m3: +m3.toFixed(4), at: lo.map((v, k) => Math.round((v + hi[k]) / 2)) });
  }
  for (const list of man.values()) for (const m of list || []) m.delete();
  out.sort((x, y) => y.volume_m3 - x.volume_m3 || (x.a < y.a ? -1 : 1));
  const byPair = {}; for (const c of out) { const k = [c.a_discipline, c.b_discipline].sort().join("–"); byPair[k] = (byPair[k] || 0) + 1; }
  return { clashes: out.slice(0, limit), total: out.length, by_discipline_pair: byPair, pairs_tested: tested, unchecked_elements: unchecked, disciplines: DISCIPLINES };
}
