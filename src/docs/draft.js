// Drafted plans: real 2D construction drawings, not projections. A plan is composed on paper (mm) at a fixed scale
// from the model's semantics: walls cut with poché and door swings, columns, the structural grid with bubbles and
// dimension chains, equipment drawn as footprints and tagged, services drawn as single lines with size, level and
// flow, and a legend, notes, key plan, north point and scale bar. Every label is placed by a collision-avoiding
// placer and the sheet carries a QA report (overlapping labels, tiny text) that tests hold at zero.
//
// Disciplines: "GA" (general arrangement), "E" (electrical layout), "M" (mechanical layout). Line weights follow
// ISO 128-2 (0.7 cut, 0.5 outlines, 0.35 primary, 0.25 secondary, 0.18 thin), text ISO 3098 (2.5 notes/tags, 3.5 room
// names and grid labels, 5 titles).
import { planView } from "./views.js";
import { solidOf } from "../author/solids.js";
import { disciplineOf } from "../coord/model-clash.js";
import { sizeOf } from "./services.js";

const GREY = "#8a8a8a", LIGHT = "#bdbdbd", POCHE = "#4d4d4d", POCHE_BG = "#d4d4d4", BLACK = "#000000", WHITE = "#ffffff";
const tw = (s, h, bold) => String(s).length * h * (bold ? 0.6 : 0.55); // conservative Helvetica advance, matches render.js
const PIPE = new Set(["IfcPipeSegment"]), TRAY = new Set(["IfcCableCarrierSegment"]);
const EQUIP_E = new Set(["IfcTransformer", "IfcElectricDistributionBoard", "IfcElectricFlowStorageDevice", "IfcElectricGenerator", "IfcSwitchingDevice"]);
const EQUIP_M = new Set(["IfcHeatExchanger", "IfcUnitaryEquipment", "IfcChiller", "IfcCoolingTower", "IfcPump", "IfcValve"]);
const isRack = (e) => /rack/i.test(`${e.family || ""}`);
export const DRAFT_KINDS = { ga: "GA", elec: "E", mech: "M" };
const TITLES = { GA: "General arrangement plan", E: "Electrical layout", M: "Mechanical layout" };

/** Draft one plan into `area` (paper mm). Returns paper items, the scale, and a QA report. */
export function draftPlan(model, sh, area, { scale = 100, layers } = {}) {
  const disc = DRAFT_KINDS[sh.kind] || "GA"; let s = scale; const items = []; const L = (n) => (layers?.[n] || `BJ-${n.toUpperCase()}`);
  const zone = (model.data.zones || []).find((z) => z.code === sh.zone) || null;
  const zb = zone ? bboxOfPts(zone.outline) : null;
  const level = sh.level || model.data.levels[0].id;
  const cut = 1500;
  // ---- what belongs to this drawing: the building in the zone (walls, rooms, grids, elements inside the zone box)
  const grids = (model.data.grids || []).filter((g) => (zone ? g.zone === zone.code : !g.zone));
  const within = (e) => { try { const b = solidOf(e); return !zb || (b.xmin >= zb.x0 && b.xmax <= zb.x1 && b.ymin >= zb.y0 && b.ymax <= zb.y1); } catch { return false; } };
  const wallsIn = model.elements.filter((e) => e.kind === "wall" && (!zb || [e.a, e.b].every((p) => inBox(p, zb))));
  const wallIds = new Set(wallsIn.map((w) => w.id));
  const ops = model.elements.filter((e) => (e.kind === "door" || e.kind === "window") && wallIds.has(e.wall || e.host));
  const rooms = model.elements.filter((e) => e.kind === "room" && (!zb || e.boundary.every((p) => inBox(p, zb))));
  const masses = model.elements.filter((e) => e.kind === "mass" && within(e));
  const ROOF = Math.min(1e9, ...masses.filter((e) => e.ifc_class === "IfcSlab").map((e) => solidOf(e).zmin).filter((z) => z > 2400)); // services above the roof soffit belong on the roof plan
  // extents: grid ends (or the building) plus room for bubbles
  const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; const grow = (p) => { ext.x0 = Math.min(ext.x0, p[0]); ext.y0 = Math.min(ext.y0, p[1]); ext.x1 = Math.max(ext.x1, p[0]); ext.y1 = Math.max(ext.y1, p[1]); };
  for (const g of grids) { grow(g.a); grow(g.b); } for (const w of wallsIn) { grow(w.a); grow(w.b); }
  const bld = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; for (const w of wallsIn) for (const p of [w.a, w.b]) { bld.x0 = Math.min(bld.x0, p[0]); bld.y0 = Math.min(bld.y0, p[1]); bld.x1 = Math.max(bld.x1, p[0]); bld.y1 = Math.max(bld.y1, p[1]); }
  for (const e of masses) if (/BUILDING/.test(e.layer || "")) { const b = solidOf(e); grow([b.xmin, b.ymin]); grow([b.xmax, b.ymax]); }
  if (!Number.isFinite(ext.x0)) return { items, scale: s, qa: { overlaps: [], small: [], empty: true } };
  // the requested scale, or the next ISO 5455 step that fits above the legend band
  for (const t of [s, 200, 250, 500, 1000, 2000]) { s = t; if ((ext.x1 - ext.x0) / t + 20 <= area.x1 - area.x0 && (ext.y1 - ext.y0) / t + 20 <= area.y1 - area.y0 - 170) break; } // the band below needs ~170 mm for legend, notes, key plan and SLD
  const W = (ext.x1 - ext.x0) / s + 20, H = (ext.y1 - ext.y0) / s + 20;
  // plan at the top of the drawing area, centred; the band below holds title, legend, notes, key plan (and the SLD)
  const ox = area.x0 + Math.max(0, (area.x1 - area.x0 - W) / 2) + 10, oy = area.y1 - H + 10;
  const P = (p) => [ox + (p[0] - ext.x0) / s, oy + (p[1] - ext.y0) / s];
  const planBox = { x0: ox - 10, y0: oy - 10, x1: ox - 10 + W, y1: oy - 10 + H };

  // ---- placer: every label is a rectangle on paper; nothing may overlap another label or a protected footprint
  const placed = []; const hard = []; const qa = { overlaps: [], small: [], tags: 0, missing: [] };
  const rectOfText = (at, txt, h, align = "start", rot = 0, bold = false) => { const w = tw(txt, h, bold); let x0 = align === "middle" ? at[0] - w / 2 : align === "end" ? at[0] - w : at[0]; const r = { x0, y0: at[1] - h * 0.25, x1: x0 + w, y1: at[1] + h * 0.95 };
    if (!rot) return r; const c = at; const rotp = (p) => [c[0] - (p[1] - c[1]), c[1] + (p[0] - c[0])]; const a = rotp([r.x0, r.y0]), b = rotp([r.x1, r.y1]); return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }; };
  const hit = (r, list, gap = 0.4) => list.some((q) => r.x0 < q.x1 + gap && r.x1 > q.x0 - gap && r.y0 < q.y1 + gap && r.y1 > q.y0 - gap);
  const text = (at, txt, h, o = {}) => { if (h < 1.8) qa.small.push(txt); items.push({ t: "text", at, text: String(txt), h, align: o.align || "start", layer: o.layer || L("text"), bold: !!o.bold, ...(o.col ? { col: o.col } : {}), ...(o.rot ? { rot: o.rot } : {}) }); };
  const mask = (r) => items.push({ t: "poly", pts: [[r.x0 - 0.5, r.y0 - 0.4], [r.x1 + 0.5, r.y0 - 0.4], [r.x1 + 0.5, r.y1 + 0.3], [r.x0 - 0.5, r.y1 + 0.3]], fill: WHITE, w: 0, layer: L("mask") });
  /** Place a tag for footprint fp (paper rect) choosing inside, then around, then with a leader; registers the label. */
  const tag = (fp, txt, o = {}) => { const h = o.h || 2.5, bold = !!o.bold; const own = fp ? [fp] : []; const others = (r) => hit(r, placed) || hit(r, hard.filter((q) => !own.includes(q)), 0.2);
    const cands = []; const cx = fp ? (fp.x0 + fp.x1) / 2 : o.at[0], cy = fp ? (fp.y0 + fp.y1) / 2 : o.at[1];
    const fitsInside = fp && tw(txt, h, bold) + 1.5 < fp.x1 - fp.x0 && h * 1.3 < fp.y1 - fp.y0; const fitsRot = fp && tw(txt, h, bold) + 1.5 < fp.y1 - fp.y0 && h * 1.3 < fp.x1 - fp.x0;
    if (o.inside !== false && fitsInside) cands.push({ at: [cx, cy - h * 0.35], align: "middle", rot: 0 });
    if (o.inside !== false && fitsRot) cands.push({ at: [cx + h * 0.35, cy], align: "middle", rot: 90 });
    if (fp) for (const d of [1.2, 4, 8, 13, 19]) { cands.push({ at: [cx, fp.y1 + d], align: "middle", rot: 0, lead: d > 3 }, { at: [cx, fp.y0 - d - h], align: "middle", rot: 0, lead: d > 3 }, { at: [fp.x1 + d, cy - h * 0.35], align: "start", rot: 0, lead: d > 3 }, { at: [fp.x0 - d, cy - h * 0.35], align: "end", rot: 0, lead: d > 3 }); }
    else cands.push({ at: o.at, align: o.align || "middle", rot: o.rot || 0 });
    for (const c of cands) { const r = rectOfText(c.at, txt, h, c.align, c.rot, bold); if (!others(r) && inRect(r, planBox)) { if (c.lead) leader(fp, r); if (o.mask !== false) mask(r); text(c.at, txt, h, { align: c.align, rot: c.rot, bold, layer: o.layer, col: o.col }); placed.push(r); qa.tags++; return r; } }
    qa.missing.push(txt); return null; };
  const leader = (fp, r) => { const a = [(fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2]; const b = [Math.max(r.x0, Math.min(a[0], r.x1)), Math.max(r.y0, Math.min(a[1], r.y1))]; items.push({ t: "line", p: [nearestEdge(fp, b), b], w: 0.18, layer: L("leader") }); };
  const line = (a, b, w, o = {}) => items.push({ t: "line", p: [a, b], w, layer: o.layer || L("lines"), ...(o.col ? { col: o.col } : {}), ...(o.dash ? { dash: o.dash } : {}) });
  const poly = (pts, o = {}) => items.push({ t: "poly", pts, w: o.w ?? 0, fill: o.fill || null, layer: o.layer || L("lines"), ...(o.col ? { col: o.col } : {}) });
  const circle = (c, r, o = {}) => { const n = 28; poly(Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]), o); };

  // ---- 1. grids (behind everything): chain lines with bubbles at both ends
  for (const g of grids) { const a = P(g.a), b = P(g.b); line(a, b, 0.18, { layer: L("grid"), dash: "center", col: GREY });
    for (const [p, q] of [[a, b], [b, a]]) { const d = norm2(sub2(p, q)); const c = [p[0] + d[0] * 4, p[1] + d[1] * 4]; circle(c, 4, { w: 0.25, fill: WHITE, layer: L("grid") }); text([c[0], c[1] - 1.25], g.name, 3.5, { align: "middle", layer: L("grid") }); hard.push({ x0: c[0] - 4, y0: c[1] - 4, x1: c[0] + 4, y1: c[1] + 4 }); } }

  // ---- 2. architecture: walls cut with poché, doors with swings (from the plan engine), rooms named
  const arch = planView(Object.create(model, { elements: { value: [...wallsIn, ...ops] } }), level, { cut, rooms: false, dims: false });
  const archCol = disc === "GA" ? BLACK : GREY;
  for (const q of arch.prims.polys) poly(q.pts.map(P), { fill: disc === "GA" ? POCHE : POCHE_BG, w: 0, layer: L("cut") });
  for (const l of arch.prims.lines) line(P(l.p[0]), P(l.p[1]), l.layer === "cutline" ? (disc === "GA" ? 0.5 : 0.35) : l.w || 0.18, { col: archCol, layer: L(l.layer === "cutline" ? "cut" : l.layer) });
  // buildings drawn as masses (MV rooms, plant buildings): outline + name
  for (const e of masses.filter((e) => /BUILDING/.test(e.layer || ""))) { const b = solidOf(e); const r = [[b.xmin, b.ymin], [b.xmax, b.ymin], [b.xmax, b.ymax], [b.xmin, b.ymax]].map(P); poly(r, { w: disc === "GA" ? 0.5 : 0.35, col: archCol, layer: L("cut") }); }
  // columns: solid at the cut
  for (const e of masses.filter((e) => e.ifc_class === "IfcColumn" && e.outline)) poly(e.outline.map(P), { fill: disc === "GA" ? BLACK : GREY, w: 0.25, col: archCol, layer: L("column") });

  // ---- 3. equipment and racks: footprints (plan of the parts), primary discipline black and tagged, others grey
  const primary = (e) => disc === "GA" ? true : disc === "E" ? EQUIP_E.has(e.ifc_class) || isRack(e) : EQUIP_M.has(e.ifc_class);
  const floor = (e) => { const b = solidOf(e); return b.zmin < cut + 200 || (disc === "M" && EQUIP_M.has(e.ifc_class) && b.zmin < 9000); };
  const inExt = (e) => { const b = solidOf(e); return b.xmin >= ext.x0 && b.xmax <= ext.x1 && b.ymin >= ext.y0 && b.ymax <= ext.y1; };
  const equip = masses.filter((e) => e.family && !/Tree/.test(e.family) && floor(e) && inExt(e));
  const fpOf = (e) => { const b = solidOf(e); const a = P([b.xmin, b.ymin]), c = P([b.xmax, b.ymax]); return { x0: a[0], y0: a[1], x1: c[0], y1: c[1], e }; };
  const fps = equip.map(fpOf); for (const f of fps) if (!isRack(f.e)) hard.push(f);
  for (const f of fps) { const pr = primary(f.e); const col = pr ? BLACK : LIGHT; const w = isRack(f.e) ? 0.18 : pr ? 0.35 : 0.18;
    poly([[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]], { w, col, layer: L(pr ? "equipment" : "equipment-bg") });
    if (isRack(f.e) && pr) { const front = (f.e.rot || 0) % 360 === 180 ? f.x1 : f.x0; line([front, f.y0], [front, f.y1], 0.35, { layer: L("equipment") }); } // rack front
    if (f.e.ifc_class === "IfcValve" && pr) { line([f.x0, f.y0], [f.x1, f.y1], 0.25); line([f.x0, f.y1], [f.x1, f.y0], 0.25); } }

  // ---- 4. services: single lines with flow, risers, size and level
  const svc = masses.filter((e) => e.shape === "sweep" && inExt(e) && (disc === "E" ? TRAY.has(e.ifc_class) : disc === "M" ? PIPE.has(e.ifc_class) && disciplineOf(e) === "M" : false));
  const runLabels = []; const soft = [];
  for (const e of svc) { const z0 = e.base || 0; const path = e.path.map((p) => [p[0], p[1], (p[2] || 0) + z0]); const ret = /return|-R-|R-0|FW-R/i.test(`${e.name} ${e.system}`);
    const isTray = TRAY.has(e.ifc_class); const wTray = isTray ? Math.abs(e.profile[1][0] - e.profile[0][0]) : 0; const busway = /busway/i.test(e.name);
    let longest = null;
    for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1]; if (Math.min(a[2], b[2]) >= ROOF) continue; const pa = P(a), pb = P(b); const L2 = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (L2 < 0.3) { // vertical: a riser symbol (circle; filled for up, open with cross for down)
        const up = b[2] > a[2]; circle(pa, 1.6, { w: 0.25, fill: up ? BLACK : WHITE, layer: L("riser") }); if (!up) { line([pa[0] - 1.1, pa[1] - 1.1], [pa[0] + 1.1, pa[1] + 1.1], 0.18); line([pa[0] - 1.1, pa[1] + 1.1], [pa[0] + 1.1, pa[1] - 1.1], 0.18); } continue; }
      if (isTray) { const d = norm2(sub2(pb, pa)), n = [-d[1], d[0]]; const hw = wTray / s / 2; const o1 = [n[0] * hw, n[1] * hw];
        line(add2(pa, o1), add2(pb, o1), busway ? 0.35 : 0.25, { layer: L(busway ? "busway" : "tray") }); line(sub2(pa, o1), sub2(pb, o1), busway ? 0.35 : 0.25, { layer: L(busway ? "busway" : "tray") });
        if (!busway) for (let t = 15; t < L2 - 3; t += 15) { const q = add2(pa, [d[0] * t, d[1] * t]); line(add2(q, o1), sub2(q, o1), 0.13, { layer: L("tray") }); } // tray rungs
      } else { soft.push({ x0: Math.min(pa[0], pb[0]) - 0.5, y0: Math.min(pa[1], pb[1]) - 0.5, x1: Math.max(pa[0], pb[0]) + 0.5, y1: Math.max(pa[1], pb[1]) + 0.5 }); line(pa, pb, ret ? 0.35 : 0.5, { dash: ret ? "dash" : false, layer: L(ret ? "pipe-return" : "pipe-supply") });
        if (L2 > 14) { const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]; const d = norm2(sub2(pb, pa)); arrow(items, m, d, L("flow")); } }
      if (!longest || L2 > longest.L) longest = { L: L2, pa, pb, z: a[2] }; }
    if (longest && longest.L > 25) runLabels.push({ e, ...longest, isTray, busway });
  }

  // ---- 5. dimensions: grid chains and overall, outside the building, between it and the bubbles
  const xs = grids.filter((g) => Math.abs(g.a[0] - g.b[0]) < 1).map((g) => g.a[0]).sort((a, b) => a - b);
  const ys = grids.filter((g) => Math.abs(g.a[1] - g.b[1]) < 1).map((g) => g.a[1]).sort((a, b) => a - b);
  const dimRow = (vals, axis, off) => { if (vals.length < 2) return; const yb = axis === "x" ? (off > 0 ? P([0, bld.y1])[1] + off : P([0, bld.y0])[1] + off) : null, xb = axis === "y" ? P([bld.x0, 0])[0] - off : null;
    const at = (v) => (axis === "x" ? [P([v, 0])[0], yb] : [xb, P([0, v])[1]]);
    line(at(vals[0]), at(vals.at(-1)), 0.18, { layer: L("dims") });
    for (const v of vals) { const p = at(v); const sg = off > 0 ? 1 : -1; const ext0 = axis === "x" ? [p[0], P([0, sg > 0 ? bld.y1 : bld.y0])[1] + 2 * sg] : [P([bld.x0, 0])[0] - 2, p[1]]; line(ext0, axis === "x" ? [p[0], p[1] + 2 * sg] : [p[0] - 2, p[1]], 0.13, { layer: L("dims") }); line([p[0] - 1, p[1] - 1], [p[0] + 1, p[1] + 1], 0.35, { layer: L("dims") }); }
    for (let i = 0; i < vals.length - 1; i++) { const a = at(vals[i]), b = at(vals[i + 1]); const v = Math.round(vals[i + 1] - vals[i]); const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const r = axis === "x" ? rectOfText([m[0], m[1] + 0.8], String(v), 2.5, "middle") : rectOfText([m[0] - 0.8, m[1]], String(v), 2.5, "middle", 90);
      if (axis === "x") text([m[0], m[1] + 0.8], v, 2.5, { align: "middle", layer: L("dims") }); else text([m[0] - 0.8, m[1]], v, 2.5, { align: "middle", rot: 90, layer: L("dims") }); placed.push(r); } };
  const northBlocked = masses.some((e) => /BUILDING/.test(e.layer || "") && solidOf(e).ymin >= bld.y1 - 1); const sx = northBlocked ? -1 : 1; // x-chains go on the open side
  dimRow(xs, "x", 10 * sx); dimRow([xs[0], xs.at(-1)], "x", 18 * sx); dimRow(ys, "y", 10); dimRow([ys[0], ys.at(-1)], "y", 18);

  // ---- 6. labels, most important first: rooms, rack rows, equipment, runs, doors
  for (const r of rooms) { const c = P(centroidOf(r.boundary)); const A = Math.abs(area2(r.boundary)) / 1e6; const name = r.name.toUpperCase();
    const at = disc === "GA" ? c : [c[0], c[1]]; const free = (y) => !hit(rectOfText([c[0], y], name, 3.5, "middle", 0, true), [...placed, ...hard, ...soft]);
    let y = at[1]; for (const dy of [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36]) if (free(at[1] + dy) && !hit(rectOfText([c[0], at[1] + dy - 4.5], `${r.number}  ${A.toFixed(0)} m²`, 2.5, "middle"), [...placed, ...hard, ...soft])) { y = at[1] + dy; break; }
    tag(null, name, { at: [c[0], y], h: 3.5, bold: true, layer: L("room") }); tag(null, `${r.number}  ${A.toFixed(0)} m²`, { at: [c[0], y - 4.5], h: 2.5, layer: L("room") }); }
  // rack rows: one label per row at its south end, along the row
  const rows = new Map(); for (const f of fps.filter((f) => isRack(f.e))) { const k = (f.e.mark || "").replace(/-\d+$/, ""); (rows.get(k) || rows.set(k, []).get(k)).push(f); }
  for (const [k, list] of rows) { const x0 = Math.min(...list.map((f) => f.x0)), x1 = Math.max(...list.map((f) => f.x1)), y0 = Math.min(...list.map((f) => f.y0)), y1 = Math.max(...list.map((f) => f.y1)); hard.push({ x0, y0, x1, y1, rack: true });
    const kw = list.length * (+(model.data.families?.[list[0].e.family]?.parameters?.Nameplate_kW) || 0);
    const label = disc === "M" ? `${k.replace("R-", "ROW ")}` : `${k.replace("R-", "ROW ")} · ${list.length} × NVL72${kw ? ` · ${Math.round(kw)} kW` : ""}`;
    tag(null, label, { at: [(x0 + x1) / 2 + 0.9, y0 - 1.5], h: 2.5, rot: 90, align: "end", layer: L("tag") }); }
  // equipment tags (primary discipline only; GA tags the major plant)
  for (const f of fps.filter((f) => !isRack(f.e) && primary(f.e))) { if (disc === "GA" && f.e.ifc_class === "IfcValve") continue; const t = f.e.mark || f.e.name; if (!t) continue; tag(f, t, { h: f.e.ifc_class === "IfcValve" ? 2 : 2.5, layer: L("tag") }); }
  // service runs: system, size, level
  for (const r of runLabels) { const e = r.e; const d = norm2(sub2(r.pb, r.pa)); const vertical = Math.abs(d[1]) > Math.abs(d[0]);
    const lab = r.busway ? `${e.system || ""} BW 5000A`.trim() : r.isTray ? `${e.system || "TRAY"} ${sizeOf(e)} TRAY  BOT +${(r.z / 1000).toFixed(2)}` : `${e.system || ""} ${sizeOf(e)}  CL +${(r.z / 1000).toFixed(2)}`;
    const m = [(r.pa[0] + r.pb[0]) / 2, (r.pa[1] + r.pb[1]) / 2]; let ok = null;
    const beyond = (tw(lab, 2.2) / 2 + 2) / r.L; // past either end of the run, in line with it
    for (const t of [0, 0.25, -0.25, 0.4, -0.4, 0.15, -0.15, 0.32, -0.32, 0.45, -0.45, 0.48, -0.48, 0.5 + beyond, -0.5 - beyond]) { const q = [m[0] + (r.pb[0] - r.pa[0]) * t, m[1] + (r.pb[1] - r.pa[1]) * t];
      for (const side of [1, -1]) { const at = Math.abs(t) > 0.5 ? (vertical ? [q[0] + 0.8, q[1]] : [q[0], q[1] - 0.8]) : vertical ? [q[0] - side * 1.6 - (side > 0 ? 0 : 2.5), q[1]] : [q[0], q[1] + side * 1.4 + (side > 0 ? 0 : -2.5)];
        const rr = rectOfText(at, lab, 2.2, "middle", vertical ? 90 : 0); if (!hit(rr, placed) && !hit(rr, r.busway || r.isTray ? hard : hard.filter((h) => !h.rack), 0.2) && inRect(rr, planBox)) { ok = { at, rr }; break; } } if (ok) break; }
    if (ok) { mask(ok.rr); text(ok.at, lab, 2.2, { align: "middle", rot: vertical ? 90 : 0, layer: L("tag") }); placed.push(ok.rr); qa.tags++; } else qa.missing.push(lab); }
  if (disc === "GA") for (const o of ops) { const w = model.data.elements[o.wall || o.host]; if (!w) continue; const sp = model.openingSpan(o); const dir = norm2(sub2(w.b, w.a)); const mid = [w.a[0] + dir[0] * (sp.from + sp.to) / 2, w.a[1] + dir[1] * (sp.from + sp.to) / 2]; const pm = P(mid);
    tag({ x0: pm[0] - 1, y0: pm[1] - 1, x1: pm[0] + 1, y1: pm[1] + 1 }, o.mark, { h: 2.2, inside: false, layer: L("tag") }); }

  // ---- 7. QA: labels must not overlap each other or equipment they do not belong to
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (hit(placed[i], [placed[j]], -0.05)) qa.overlaps.push([i, j]);
  // ---- 8. title under the plan, north point, scale bar
  const ty = planBox.y0 - 8; circle([area.x0 + 6, ty + 1.2], 5, { w: 0.35 }); text([area.x0 + 6, ty - 0.6], "1", 4, { align: "middle", bold: true });
  const zn = zone ? zone.name.toUpperCase() : "PLAN";
  text([area.x0 + 14, ty + 0.5], `${zn} — ${TITLES[disc].toUpperCase()}, GROUND FLOOR`, 5, { bold: true }); line([area.x0 + 14, ty - 1.5], [area.x0 + 14 + tw(`${zn} — ${TITLES[disc].toUpperCase()}, GROUND FLOOR`, 5, true), ty - 1.5], 0.5);
  text([area.x0 + 14, ty - 6.5], `Scale 1:${s} at the sheet size shown`, 2.5);
  north(items, [planBox.x1 - 12, planBox.y1 - 16], L("north"));
  scaleBar(items, [area.x0 + 160, ty - 6], s, L("scalebar"));
  const band = { x0: area.x0, x1: area.x1, y0: area.y0, y1: ty - 14 };
  return { items, scale: s, qa, band, disc, zone, ext, planBox, legendFor: disc };
}

// ---------- small geometry helpers ----------
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]], add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const norm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const inBox = (p, b) => p[0] >= b.x0 - 1 && p[0] <= b.x1 + 1 && p[1] >= b.y0 - 1 && p[1] <= b.y1 + 1;
const inRect = (r, b) => r.x0 >= b.x0 && r.x1 <= b.x1 && r.y0 >= b.y0 && r.y1 <= b.y1;
const bboxOfPts = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });
const area2 = (pts) => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const centroidOf = (pts) => { const b = bboxOfPts(pts); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
const nearestEdge = (r, p) => [Math.max(r.x0, Math.min(p[0], r.x1)), Math.max(r.y0, Math.min(p[1], r.y1))];
function arrow(items, m, d, layer) { const n = [-d[1], d[0]]; const tip = [m[0] + d[0] * 1.6, m[1] + d[1] * 1.6], b1 = [m[0] - d[0] * 1.2 + n[0], m[1] - d[1] * 1.2 + n[1]], b2 = [m[0] - d[0] * 1.2 - n[0], m[1] - d[1] * 1.2 - n[1]]; items.push({ t: "poly", pts: [tip, b1, b2], fill: "#000000", w: 0, layer }); }
function north(items, c, layer) { items.push({ t: "poly", pts: [[c[0], c[1] + 9], [c[0] + 3.5, c[1] - 4], [c[0], c[1] - 1.5]], fill: "#000000", w: 0.25, layer }, { t: "poly", pts: [[c[0], c[1] + 9], [c[0] - 3.5, c[1] - 4], [c[0], c[1] - 1.5]], w: 0.25, layer }); items.push({ t: "text", at: [c[0], c[1] + 11], text: "N", h: 3.5, align: "middle", bold: true, layer }); }
function scaleBar(items, at, s, layer) { const seg = 5000 / s; for (let i = 0; i < 4; i++) items.push({ t: "poly", pts: [[at[0] + i * seg, at[1]], [at[0] + (i + 1) * seg, at[1]], [at[0] + (i + 1) * seg, at[1] + 1.5], [at[0] + i * seg, at[1] + 1.5]], fill: i % 2 ? "#ffffff" : "#000000", w: 0.18, layer });
  for (let i = 0; i <= 4; i++) items.push({ t: "text", at: [at[0] + i * seg, at[1] + 2.5], text: `${i * 5}`, h: 2, align: "middle", layer }); items.push({ t: "text", at: [at[0] + 4 * seg + 3, at[1] + 0.2], text: "m", h: 2, layer }); }

// ---------- legend, notes, key plan and the typical single-line diagram (the band under the plan) ----------
export function draftBand(model, d, items, docs) {
  const { band } = d; const disc = d.disc; const K = (d.zone?.code || "HA").slice(-1); let x = band.x0; const top = band.y1;
  const head = (x0, t) => { items.push({ t: "text", at: [x0, top - 4], text: t, h: 3.5, bold: true, layer: "BJ-TEXT" }); items.push({ t: "line", p: [[x0, top - 5.5], [x0 + 150, top - 5.5]], w: 0.35, layer: "BJ-TEXT" }); };
  // legend
  head(x, "LEGEND"); let y = top - 12; const row = (draw, label) => { draw(x, y); items.push({ t: "text", at: [x + 22, y - 0.8], text: label, h: 2.5, layer: "BJ-TEXT" }); y -= 7; };
  const ln = (w, dash, col) => (x0, y0) => items.push({ t: "line", p: [[x0, y0], [x0 + 16, y0]], w, layer: "BJ-LEGEND", ...(dash ? { dash } : {}), ...(col ? { col } : {}) });
  const box = (fill, w = 0.35) => (x0, y0) => items.push({ t: "poly", pts: [[x0 + 3, y0 - 2], [x0 + 13, y0 - 2], [x0 + 13, y0 + 2], [x0 + 3, y0 + 2]], fill, w, layer: "BJ-LEGEND" });
  row(box(disc === "GA" ? "#4d4d4d" : "#d4d4d4", 0), disc === "GA" ? "Wall cut (precast 300; fire walls EI 120)" : "Walls (architecture, for reference)");
  row(ln(0.18, "center", "#8a8a8a"), "Structural grid");
  if (disc === "E") { row(ln(0.35), "Busway 5000 A over rack row (double line)"); row((x0, y0) => { ln(0.25)(x0, y0 + 1); ln(0.25)(x0, y0 - 1); }, "Cable tray (rungs at 1.5 m)"); row(box(null), "Electrical equipment, tagged"); row(box(null, 0.18), "IT rack (thick edge = front)"); }
  if (disc === "M") { row(ln(0.5), "Facility water / TCS supply, flow arrow"); row(ln(0.35, "dash"), "Facility water / TCS return"); row((x0, y0) => { items.push({ t: "poly", pts: circ([x0 + 8, y0], 1.6), fill: "#000000", w: 0.25, layer: "BJ-LEGEND" }); }, "Riser up (filled) / down (open, crossed)"); row((x0, y0) => { box(null, 0.25)(x0, y0); items.push({ t: "line", p: [[x0 + 3, y0 - 2], [x0 + 13, y0 + 2]], w: 0.25, layer: "BJ-LEGEND" }); }, "Isolating valve"); row(box(null), "Mechanical equipment, tagged"); }
  if (disc === "GA") { row(box(null, 0.18), "Equipment and racks (outline)"); row((x0, y0) => { items.push({ t: "text", at: [x0 + 8, y0 - 0.8], text: "A-D01", h: 2.2, align: "middle", layer: "BJ-LEGEND" }); }, "Door mark (see door schedule)"); }
  // general notes
  x = band.x0 + 175; head(x, "GENERAL NOTES"); y = top - 12;
  const notes = [
    "1. Dimensions in millimetres; levels in metres above finished floor level (FFL ±0.00).",
    "2. Do not scale. Work to figured dimensions; report discrepancies to the designer.",
    "3. Concept design for a pilot (BIMja). Not for construction.",
    ...(disc === "E" ? ["4. Each IT power block: 33/0.415 kV 3150 kVA cast resin transformer,", "   4000 A LV board, 1250 kW lithium-ion UPS, 3250 kVA generator.", `5. Blocks ${K}01–${K}13 duty, ${K}14 catcher (block redundant). ${K}M1–${K}M4 mechanical.`, "6. Busway levels: underside +3.20. Tray levels as tagged."] : []),
    ...(disc === "M" ? ["4. Facility water ASHRAE W45: 40 °C supply / 50 °C return.", "5. CDUs 12 duty + 1 standby; secondary loop (TCS) per rack row.", "6. Pipe levels are centreline (CL) above FFL. Valves lugged, PN16.", "7. Headers rise at grid 10 to the roof dry coolers (see roof plan)."] : []),
    ...(disc === "GA" ? ["4. Fire walls EI 120 separate the electrical rooms from the white space.", "5. Door marks refer to the door schedule; fire doors 120 min.", "6. Racks: 2 pods × 4 rows × 28 NVIDIA GB300 NVL72, hot aisle contained."] : []),
    "LOD 400 geometry; as-built (LOD 500) fields assumed, not field-verified."];
  for (const n of notes) { items.push({ t: "text", at: [x, y], text: n, h: 2.5, layer: "BJ-TEXT" }); y -= 4.5; }
  // key plan: the site at a small scale with this zone hatched
  x = band.x0 + 395; head(x, "KEY PLAN"); { const site = model.elements.find((e) => e.kind === "mass" && /EARTHWORKS|SITE/.test(e.layer || "") && e.outline); const zs = model.data.zones || [];
    const pts = site ? site.outline : zs.flatMap((z) => z.outline); if (pts.length) { const b = bboxOfPts(pts); const bw = 140, bh = Math.min(80, top - band.y0 - 22); const sc = Math.max((b.x1 - b.x0) / bw, (b.y1 - b.y0) / bh); const K = (p) => [x + (p[0] - b.x0) / sc, top - 14 - bh + (p[1] - b.y0) / sc];
      if (site) items.push({ t: "poly", pts: site.outline.map(K), w: 0.5, layer: "BJ-KEYPLAN" });
      for (const z of zs) { const on = z.code === d.zone?.code; items.push({ t: "poly", pts: z.outline.map(K), w: 0.18, fill: on ? "#4d4d4d" : null, layer: "BJ-KEYPLAN" }); const c = K(centroidOf(z.outline)); items.push({ t: "text", at: [c[0], c[1] - 0.8], text: z.code, h: 2.2, align: "middle", bold: on, layer: "BJ-KEYPLAN", ...(on ? { col: "#ffffff" } : {}) }); }
      items.push({ t: "text", at: [x, top - 18 - bh], text: `${d.zone?.name || "Zone"} shaded. Site boundary 500 × 330 m.`, h: 2.2, layer: "BJ-KEYPLAN" }); } }
  if (disc === "E") sldTypical(items, { x0: band.x0 + 560, x1: band.x1, y0: band.y0, y1: top }, K);
}
const circ = (c, r) => Array.from({ length: 20 }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / 20), c[1] + r * Math.sin((2 * Math.PI * i) / 20)]);

/** Typical IT power block, single line, IEC 60617 style symbols. */
function sldTypical(items, b, K = "A") {
  const L = "BJ-SLD"; const ln = (p, w = 0.35) => items.push({ t: "line", p, w, layer: L }); const tx = (at, s, h = 2.5, o = {}) => items.push({ t: "text", at, text: s, h, layer: L, align: o.align || "start", bold: !!o.bold });
  const pc = (c, r, fill = null) => items.push({ t: "poly", pts: circ(c, r), w: 0.35, fill, layer: L });
  tx([b.x0, b.y1 - 4], `TYPICAL IT POWER BLOCK — SINGLE LINE (${K}01 SHOWN)`, 3.5, { bold: true }); ln([[b.x0, b.y1 - 5.5], [b.x1, b.y1 - 5.5]]);
  const first = items.length, O = [b.x0 + 6, b.y1 - 10], F = 1.7; // drawn compact, then enlarged to fill the panel
  const cx = b.x0 + 45; let y = b.y1 - 12;
  tx([cx + 4, y - 1], `33 kV ring from MV-${K} (Schneider SF6-free)`, 2.5); ln([[cx, y], [cx, y - 8]]);
  // breaker (square), transformer (two circles)
  items.push({ t: "poly", pts: [[cx - 2, y - 8], [cx + 2, y - 8], [cx + 2, y - 12], [cx - 2, y - 12]], w: 0.35, layer: L }); tx([cx + 4, y - 11], "VCB", 2.2); ln([[cx, y - 12], [cx, y - 15]]);
  pc([cx, y - 18.5], 3.5); pc([cx, y - 23.5], 3.5); tx([cx + 6, y - 20], `T-${K}01  3150 kVA 33/0.415 kV Dyn11`, 2.5); tx([cx + 6, y - 24], "Voltamp cast resin", 2.2);
  ln([[cx, y - 27], [cx, y - 31]]);
  // LV busbar
  const by = y - 33; ln([[cx - 30, by], [cx + 60, by]], 1.0); tx([cx + 62, by - 1], `LV-${K}01  4000 A`, 2.5, { bold: true });
  // generator with its incomer
  const gx = cx - 22; pc([gx, by + 14], 4); tx([gx, by + 12.8], "G", 3.5, { align: "middle", bold: true }); tx([gx - 6, by + 20], `G-${K}01 3250 kVA`, 2.2, { align: "end" });
  ln([[gx, by + 10], [gx, by]]); items.push({ t: "poly", pts: [[gx - 2, by + 6], [gx + 2, by + 6], [gx + 2, by + 3], [gx - 2, by + 3]], w: 0.35, layer: L }); tx([gx - 3, by + 4], "ACB", 2.2, { align: "end" });
  // UPS and outgoing
  const ux = cx + 25; ln([[ux, by], [ux, by - 6]]); items.push({ t: "poly", pts: [[ux - 6, by - 6], [ux + 6, by - 6], [ux + 6, by - 16], [ux - 6, by - 16]], w: 0.35, layer: L }); ln([[ux - 6, by - 16], [ux + 6, by - 6]], 0.25);
  tx([ux - 4, by - 9.5], "~", 3); tx([ux + 1, by - 15], "=", 3); tx([ux + 8, by - 10], `UPS-${K}01a  Galaxy VXL 1250 kW, Li-ion`, 2.5);
  ln([[ux, by - 16], [ux, by - 22]]); ln([[ux - 20, by - 22], [ux + 20, by - 22]], 0.7); tx([ux + 22, by - 23], "Busway BW 5000 A to racks", 2.5);
  for (const k of [-15, -5, 5, 15]) { ln([[ux + k, by - 22], [ux + k, by - 27]], 0.25); items.push({ t: "poly", pts: [[ux + k - 2, by - 27], [ux + k + 2, by - 27], [ux + k + 2, by - 31], [ux + k - 2, by - 31]], w: 0.25, layer: L }); }
  tx([ux - 20, by - 35], "GB300 NVL72 racks, 136 kW nameplate each", 2.2);
  // catcher
  const kx = cx + 60; ln([[kx, by], [kx, by - 8]], 0.25); tx([kx + 2, by - 6], `to catcher block ${K}14 (via static transfer)`, 2.2);
  const T = (p) => [O[0] + (p[0] - O[0]) * F, O[1] + (p[1] - O[1]) * F];
  for (const it of items.slice(first)) { if (it.p) it.p = it.p.map(T); if (it.pts) it.pts = it.pts.map(T); if (it.at) { it.at = T(it.at); it.h = Math.min(4.2, it.h * 1.3); } }
}
