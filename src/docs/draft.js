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
export const DRAFT_KINDS = { ga: "GA", elec: "E", mech: "M", roof: "R", fire_plan: "F" };
const TITLES = { GA: "General arrangement plan", E: "Electrical layout", M: "Mechanical layout", R: "Roof plant and piping plan", F: "Fire compartmentation, escape and sprinkler plan" };

/** Draft one plan into `area` (paper mm). Returns paper items, the scale, and a QA report. */
export function draftPlan(model, sh, area, { scale = 100, layers } = {}) {
  const disc = DRAFT_KINDS[sh.kind] || "GA"; let s = scale; const items = []; const L = (n) => (layers?.[n] || `BJ-${n.toUpperCase()}`);
  const zones = model.data.zones || []; const zone = zones.find((z) => z.code === sh.zone) || null;
  const zb = zone ? bboxOfPts(zone.outline) : null; const roof = disc === "R";
  const parentZone = zone?.parent ? zones.find((z) => z.code === zone.parent) : null; // a sheet split: this zone is one part of a hall
  const level = sh.level || model.data.levels[0].id;
  const cut = 1500;
  // ---- what belongs to this drawing: the building in the zone (walls, rooms, grids, elements inside the zone box)
  const grids = (model.data.grids || []).filter((g) => (zone ? g.zone === (zone.parent || zone.code) : !g.zone)).map((g) => clipGrid(g, zb)).filter(Boolean);
  const within = (e) => { try { const b = solidOf(e); return !zb || (b.xmin >= zb.x0 && b.xmax <= zb.x1 && b.ymin >= zb.y0 && b.ymax <= zb.y1); } catch { return false; } };
  const wallsIn = model.elements.filter((e) => e.kind === "wall" && (!zb || [e.a, e.b].every((p) => inBox(p, zb))));
  const wallIds = new Set(wallsIn.map((w) => w.id));
  const ops = model.elements.filter((e) => (e.kind === "door" || e.kind === "window") && wallIds.has(e.wall || e.host));
  const rooms = roof ? [] : model.elements.filter((e) => e.kind === "room" && (!zb || overlapArea(bboxOfPts(e.boundary), zb) > 5e6));
  const overlaps = (e) => { try { const b = solidOf(e); return !zb || (b.xmax > zb.x0 && b.xmin < zb.x1 && b.ymax > zb.y0 && b.ymin < zb.y1); } catch { return false; } };
  const cin = (e, box = zb) => { try { const b = solidOf(e); const cx = (b.xmin + b.xmax) / 2, cy = (b.ymin + b.ymax) / 2; return !box || (cx >= box.x0 && cx < box.x1 && cy >= box.y0 && cy < box.y1); } catch { return false; } };
  const masses = model.elements.filter((e) => e.kind === "mass" && overlaps(e));
  const ROOF = Math.min(1e9, ...masses.filter((e) => e.ifc_class === "IfcSlab").map((e) => solidOf(e).zmin).filter((z) => z > 2400)); // services above the roof soffit belong on the roof plan
  // extents: grid ends (or the building) plus room for bubbles
  const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; const grow = (p) => { ext.x0 = Math.min(ext.x0, p[0]); ext.y0 = Math.min(ext.y0, p[1]); ext.x1 = Math.max(ext.x1, p[0]); ext.y1 = Math.max(ext.y1, p[1]); };
  for (const g of grids) { grow(g.a); grow(g.b); } for (const w of wallsIn) { grow(w.a); grow(w.b); }
  const bld = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; for (const w of wallsIn) for (const p of [w.a, w.b]) { bld.x0 = Math.min(bld.x0, p[0]); bld.y0 = Math.min(bld.y0, p[1]); bld.x1 = Math.max(bld.x1, p[0]); bld.y1 = Math.max(bld.y1, p[1]); }
  for (const e of masses) if (/BUILDING/.test(e.layer || "")) { const b = solidOf(e); grow([b.xmin, b.ymin]); grow([b.xmax, b.ymax]); }
  if (parentZone) Object.assign(ext, zb); // a sheet part shows exactly its zone
  if (zb) { ext.x0 = Math.max(ext.x0, zb.x0); ext.y0 = Math.max(ext.y0, zb.y0); ext.x1 = Math.min(ext.x1, zb.x1); ext.y1 = Math.min(ext.y1, zb.y1); }
  if (!Number.isFinite(ext.x0)) return { items, scale: s, qa: { overlaps: [], small: [], empty: true } };
  // the requested scale, or the next ISO 5455 step that fits above the legend band
  for (const t of [s, 200, 250, 500, 1000, 2000]) { s = t; if ((ext.x1 - ext.x0) / t + 20 <= area.x1 - area.x0 && (ext.y1 - ext.y0) / t + 20 <= area.y1 - area.y0 - 160) break; } // the band below needs ~160 mm for legend, notes, key plan and SLD
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
    for (const c of cands) { const r = rectOfText(c.at, txt, h, c.align, c.rot, bold); if (!others(r) && inRect(r, planBox)) { if (c.lead) leader(fp, r); if (o.mask !== false) mask(r); text(c.at, txt, h, { align: c.align, rot: c.rot, bold, layer: o.layer, col: o.col }); placed.push(Object.assign(r, { txt })); qa.tags++; return r; } }
    qa.missing.push(txt); return null; };
  const leader = (fp, r) => { const a = [(fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2]; const b = [Math.max(r.x0, Math.min(a[0], r.x1)), Math.max(r.y0, Math.min(a[1], r.y1))]; items.push({ t: "line", p: [nearestEdge(fp, b), b], w: 0.18, layer: L("leader") }); };
  const line = (a, b, w, o = {}) => items.push({ t: "line", p: [a, b], w, layer: o.layer || L("lines"), ...(o.col ? { col: o.col } : {}), ...(o.dash ? { dash: o.dash } : {}) });
  const poly = (pts, o = {}) => items.push({ t: "poly", pts, w: o.w ?? 0, fill: o.fill || null, layer: o.layer || L("lines"), ...(o.col ? { col: o.col } : {}) });
  const circle = (c, r, o = {}) => { const n = 28; poly(Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]), o); };

  // ---- 1. grids (behind everything): chain lines with bubbles at both ends
  for (const g of grids) { const a = P(g.a), b = P(g.b); line(a, b, 0.18, { layer: L("grid"), dash: "center", col: GREY });
    for (const [p, q] of [[a, b], [b, a]].filter((_, i) => (i ? g.bubB : g.bubA) !== false)) { const d = norm2(sub2(p, q)); const c = [p[0] + d[0] * 4, p[1] + d[1] * 4]; circle(c, 4, { w: 0.25, fill: WHITE, layer: L("grid") }); text([c[0], c[1] - 1.25], g.name, 3.5, { align: "middle", layer: L("grid") }); hard.push({ x0: c[0] - 4, y0: c[1] - 4, x1: c[0] + 4, y1: c[1] + 4 }); } }

  // ---- 2. architecture: walls cut with poché, doors with swings (from the plan engine), rooms named
  if (roof) for (const e of masses.filter((e) => e.ifc_class === "IfcSlab" && e.outline && solidOf(e).zmin >= ROOF - 100)) { const b = bboxOfPts(e.outline);
    const r = (o) => [[b.x0 + o, b.y0 + o], [b.x1 - o, b.y0 + o], [b.x1 - o, b.y1 - o], [b.x0 + o, b.y1 - o]].map((q) => [Math.max(ext.x0, Math.min(ext.x1, q[0])), Math.max(ext.y0, Math.min(ext.y1, q[1]))]).map(P);
    poly(r(0), { w: 0.5, layer: L("roof") }); poly(r(300), { w: 0.25, layer: L("roof") }); } // roof edge and parapet (300)
  const arch = roof ? { prims: { polys: [], lines: [] } } : planView(Object.create(model, { elements: { value: [...wallsIn, ...ops] } }), level, { cut, rooms: false, dims: false });
  const archCol = disc === "GA" ? BLACK : GREY;
  for (const q of arch.prims.polys) poly(q.pts.map(P), { fill: disc === "GA" ? POCHE : POCHE_BG, w: 0, layer: L("cut") });
  for (const l of arch.prims.lines) line(P(l.p[0]), P(l.p[1]), l.layer === "cutline" ? (disc === "GA" ? 0.5 : 0.35) : l.w || 0.18, { col: archCol, layer: L(l.layer === "cutline" ? "cut" : l.layer) });
  // buildings drawn as masses (MV rooms, plant buildings): outline + name
  // yards: fire walls cut (poché), roads as kerb lines; both clipped to the sheet
  const clipR = (b) => [[Math.max(b.xmin, ext.x0), Math.max(b.ymin, ext.y0)], [Math.min(b.xmax, ext.x1), Math.max(b.ymin, ext.y0)], [Math.min(b.xmax, ext.x1), Math.min(b.ymax, ext.y1)], [Math.max(b.xmin, ext.x0), Math.min(b.ymax, ext.y1)]];
  if (!roof) for (const e of masses.filter((e) => /FIREWALL/.test(e.layer || "") && overlaps(e))) { const b = solidOf(e); if (b.xmax <= ext.x0 || b.xmin >= ext.x1 || b.ymax <= ext.y0 || b.ymin >= ext.y1) continue; poly(clipR(b).map(P), { w: 0.25, fill: disc === "GA" ? POCHE : "#bdbdbd", layer: L("cut") }); }
  for (const e of masses.filter((e) => /C-ROAD/.test(e.layer || "") && overlaps(e))) { const b = solidOf(e); if (b.xmax <= ext.x0 || b.xmin >= ext.x1 || b.ymax <= ext.y0 || b.ymin >= ext.y1) continue; const q = clipR(b).map(P);
    line(q[0], q[1], 0.25, { col: GREY, layer: L("site") }); line(q[3], q[2], 0.25, { col: GREY, layer: L("site") }); }
  for (const e of masses.filter((e) => /BUILDING/.test(e.layer || "") && cin(e))) { const b = solidOf(e); const r = [[b.xmin, b.ymin], [b.xmax, b.ymin], [b.xmax, b.ymax], [b.xmin, b.ymax]].map(P); poly(r, { w: disc === "GA" ? 0.5 : 0.35, col: archCol, layer: L("cut") }); }
  // columns: solid at the cut
  if (!roof) for (const e of masses.filter((e) => e.ifc_class === "IfcColumn" && e.outline && cin(e))) poly(e.outline.map(P), { fill: disc === "GA" ? BLACK : GREY, w: 0.25, col: archCol, layer: L("column") });

  // ---- 3. equipment and racks: footprints (plan of the parts), primary discipline black and tagged, others grey
  const primary = (e) => disc === "GA" ? true : disc === "F" ? disciplineOf(e) === "F" : disc === "E" ? EQUIP_E.has(e.ifc_class) || isRack(e) : EQUIP_M.has(e.ifc_class);
  const floor = (e) => { const b = solidOf(e); return roof ? b.zmin >= ROOF - 100 : b.zmin < cut + 200 || (disc === "M" && EQUIP_M.has(e.ifc_class) && b.zmin < ROOF - 100); };
  const inExt = (e) => cin(e, ext) && cin(e); // parts of a split sheet: an item belongs to the part holding its centre
  const touchesExt = (e) => { try { const b = solidOf(e); return b.xmax > ext.x0 && b.xmin < ext.x1 && b.ymax > ext.y0 && b.ymin < ext.y1; } catch { return false; } };
  const equip = masses.filter((e) => e.family && !/Tree/.test(e.family) && floor(e) && inExt(e));
  const fpOf = (e) => { const b = solidOf(e); const a = P([b.xmin, b.ymin]), c = P([b.xmax, b.ymax]); return { x0: a[0], y0: a[1], x1: c[0], y1: c[1], e }; };
  const fps = equip.map(fpOf); for (const f of fps) if (!isRack(f.e)) hard.push(f);
  for (const f of fps) { const pr = primary(f.e); const col = pr ? BLACK : LIGHT; const w = isRack(f.e) ? 0.18 : pr ? 0.35 : 0.18;
    poly([[f.x0, f.y0], [f.x1, f.y0], [f.x1, f.y1], [f.x0, f.y1]], { w, col, layer: L(pr ? "equipment" : "equipment-bg") });
    if (isRack(f.e) && pr) { const front = (f.e.rot || 0) % 360 === 180 ? f.x1 : f.x0; line([front, f.y0], [front, f.y1], 0.35, { layer: L("equipment") }); } // rack front
    if (f.e.ifc_class === "IfcValve" && pr) { line([f.x0, f.y0], [f.x1, f.y1], 0.25); line([f.x0, f.y1], [f.x1, f.y0], 0.25); } }

  // hot-aisle containment: overhead, so a hidden (dashed) outline
  if (!roof) for (const e of masses.filter((e) => /CONTAINMENT/.test(e.layer || "") && e.ifc_class === "IfcCovering" && cin(e))) { const b = solidOf(e); const a = P([b.xmin, b.ymin]), c = P([b.xmax, b.ymax]);
    const q = [[a[0], a[1]], [c[0], a[1]], [c[0], c[1]], [a[0], c[1]]]; for (let i = 0; i < 4; i++) line(q[i], q[(i + 1) % 4], 0.25, { col: disc === "GA" ? BLACK : GREY, dash: "hidden", layer: L("containment") }); }
  // ---- 4. services: single lines with flow, risers, size and level
  const svc = masses.filter((e) => e.shape === "sweep" && touchesExt(e) && (disc === "E" ? TRAY.has(e.ifc_class) : disc === "M" || roof ? PIPE.has(e.ifc_class) && disciplineOf(e) === "M" : disc === "F" ? PIPE.has(e.ifc_class) && disciplineOf(e) === "F" : false));
  const runLabels = []; const soft = [];
  for (const e of svc) { const z0 = e.base || 0; const path = e.path.map((p) => [p[0], p[1], (p[2] || 0) + z0]); const ret = /return|-R-|R-0|FW-R/i.test(`${e.name} ${e.system}`);
    const isTray = TRAY.has(e.ifc_class); const wTray = isTray ? Math.abs(e.profile[1][0] - e.profile[0][0]) : 0; const busway = /busway/i.test(e.name);
    let longest = null;
    for (let i = 0; i < path.length - 1; i++) { const cs = clipSeg3(path[i], path[i + 1], ext); if (!cs) continue; const [a, b] = cs;
      if (roof ? Math.max(a[2], b[2]) < ROOF - 100 : Math.min(a[2], b[2]) >= ROOF) continue; const pa = P(a), pb = P(b); const L2 = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (L2 < 0.3) { // vertical: a riser symbol (circle; filled for up, open with cross for down)
        const up = roof ? true : b[2] > a[2]; circle(pa, 1.6, { w: 0.25, fill: up ? BLACK : WHITE, layer: L("riser") }); if (!up) { line([pa[0] - 1.1, pa[1] - 1.1], [pa[0] + 1.1, pa[1] + 1.1], 0.18); line([pa[0] - 1.1, pa[1] + 1.1], [pa[0] + 1.1, pa[1] - 1.1], 0.18); } continue; }
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

  // ---- matchlines where this part meets its neighbour (sheet splits of one building)
  if (parentZone) { const pz = bboxOfPts(parentZone.outline); const pw = model.elements.filter((e) => e.kind === "wall" && [e.a, e.b].every((p) => inBox(p, pz))); const pb = pw.length ? bboxOfPts(pw.flatMap((w) => [w.a, w.b])) : pz; const sib = zones.filter((z) => z.parent === zone.parent && z.code !== zone.code);
    for (const xm of [zb.x0, zb.x1]) { if (xm <= pb.x0 + 1 || xm >= pb.x1 - 1) continue; const other = sib.find((z) => { const b = bboxOfPts(z.outline); return Math.abs(b.x0 - xm) < 2 || Math.abs(b.x1 - xm) < 2; });
      const ya = Number.isFinite(bld.y0) ? bld.y0 - 1500 : ext.y0, yb = Number.isFinite(bld.y1) ? bld.y1 + 1500 : ext.y1; const a = P([xm, ya]), b = P([xm, yb]); line(a, b, 0.7, { dash: "center", layer: L("matchline") });
      const t = `MATCHLINE — SEE ${other ? other.name.toUpperCase() : "ADJOINING PART"}`; const right = xm === zb.x0;
      for (const f of [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6]) { const at = [a[0] + (right ? 2.8 : -1.2), a[1] + (b[1] - a[1]) * f]; const r = rectOfText(at, t, 2.5, "middle", 90, true);
        if (!hit(r, hard, 0.2) && !hit(r, placed) && inRect(r, planBox)) { mask(r); text(at, t, 2.5, { align: "middle", rot: 90, bold: true, layer: L("matchline") }); placed.push(Object.assign(r, { txt: t })); break; } } } }
  // ---- 6. labels, most important first: rooms, rack rows, equipment, runs, doors
  const labOf = (r) => { const e = r.e; const nBw = r.busway ? runLabels.filter((q) => q.busway && q.e.system === e.system).length : 0; const amps = (/(\d{3,4}) ?A\b/.exec(e.name) || [])[1];
    return r.busway ? `${e.system || ""} ${nBw > 1 ? `${nBw}×` : ""}${amps ? `${amps}A` : ""} BUSWAY`.trim() : r.isTray ? `${e.system || ""} ${Math.round(Math.abs(e.profile[1][0] - e.profile[0][0]))} ${/ladder/i.test(e.name) ? "LADDER" : "TRAY"} BOT +${(r.z / 1000).toFixed(2)}`.trim() : `${e.system || ""} ${sizeOf(e)}  CL +${(r.z / 1000).toFixed(2)}`; };
  const seenLab = new Set(), failedLab = new Set();
  const seenRun = new Set(); const labelRuns = (pick) => { for (const r of runLabels.filter(pick)) { const e = r.e; if (r.busway && e.system) { if (seenRun.has(e.system)) continue; seenRun.add(e.system); } const d = norm2(sub2(r.pb, r.pa)); const vertical = Math.abs(d[1]) > Math.abs(d[0]);
    const base = labOf(r); if (seenLab.has(base)) continue; let lab = base; if (new Set(runLabels.filter((q) => !q.busway && labOf(q) === base).map((q) => q.e.id)).size > 1 && new Set(runLabels.filter((q) => !q.busway && labOf(q) === base).map((q) => q.e.system)).size > 1 || /branch/i.test(r.e.name) && runLabels.filter((q) => labOf(q) === base).length > 1) lab += " TYP.";
        const m = [(r.pa[0] + r.pb[0]) / 2, (r.pa[1] + r.pb[1]) / 2]; let ok = null;
    const beyond = (tw(lab, 2.2) / 2 + 2) / r.L; // past either end of the run, in line with it
    for (const t of [0, 0.25, -0.25, 0.4, -0.4, 0.15, -0.15, 0.32, -0.32, 0.45, -0.45, 0.48, -0.48, 0.5 + beyond, -0.5 - beyond]) { const q = [m[0] + (r.pb[0] - r.pa[0]) * t, m[1] + (r.pb[1] - r.pa[1]) * t];
      for (const side of [1, -1]) { const at = Math.abs(t) > 0.5 ? (vertical ? [q[0] + 0.8, q[1]] : [q[0], q[1] - 0.8]) : vertical ? [q[0] - side * 1.6 - (side > 0 ? 0 : 2.5), q[1]] : [q[0], q[1] + side * 1.4 + (side > 0 ? 0 : -2.5)];
        const rr = rectOfText(at, lab, 2.2, "middle", vertical ? 90 : 0); if (!hit(rr, placed) && !hit(rr, r.busway || r.isTray ? hard : hard.filter((h) => !h.rack), 0.2) && inRect(rr, planBox)) { ok = { at, rr }; break; } } if (ok) break; }
    if (ok) { mask(ok.rr); text(ok.at, lab, 2.2, { align: "middle", rot: vertical ? 90 : 0, layer: L("tag") }); placed.push(Object.assign(ok.rr, { txt: lab })); qa.tags++; seenLab.add(base); failedLab.delete(base); } else failedLab.add(base); } };
  labelRuns((r) => r.isTray && !r.busway); // ladders and trays first: their labels have the fewest places to go
  // rack rows are obstacles for room names too
  for (const f of fps.filter((f) => isRack(f.e))) hard.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, rack: true });
  for (const r of rooms) { const rb = bboxOfPts(r.boundary); const vis = zb ? { x0: Math.max(rb.x0, ext.x0), y0: Math.max(rb.y0, ext.y0), x1: Math.min(rb.x1, ext.x1), y1: Math.min(rb.y1, ext.y1) } : rb;
    const pv = { x0: P([vis.x0, 0])[0], y0: P([0, vis.y0])[1], x1: P([vis.x1, 0])[0], y1: P([0, vis.y1])[1] }; const c = [(pv.x0 + pv.x1) / 2, (pv.y0 + pv.y1) / 2]; const A = Math.abs(area2(r.boundary)) / 1e6;
    const sub = `${r.number}  ${A.toFixed(0)} m²`; const obst = [...placed, ...hard, ...soft]; let best = null;
    // the name and area stay inside the room: search outward from its centre, then try a smaller name
    for (const [name, h, sb] of [[r.name.toUpperCase(), 3.5, sub], [r.name.toUpperCase(), 2.5, sub], [r.name.toUpperCase(), 2.5, String(r.number)]]) { const offs = []; for (const dx of [0, 4, -4, 8, -8, 12, -12, 16, -16]) for (let k = 0; k <= 30; k++) for (const sg of k ? [1, -1] : [1]) offs.push([dx, sg * k * 3]);
      offs.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
      for (const [dx, dy] of offs) { const at = [c[0] + dx, c[1] + dy]; const r1 = rectOfText(at, name, h, "middle", 0, true), r2 = rectOfText([at[0], at[1] - h - 1], sb, 2.5, "middle");
        if (inRect(r1, pv) && inRect(r2, pv) && !hit(r1, obst) && !hit(r2, obst)) { best = { at, name, h, sb }; break; } } if (best) break; }
    if (!best) { qa.missing.push(r.name); continue; }
    tag(null, best.name, { at: best.at, h: best.h, bold: true, layer: L("room") }); tag(null, best.sb, { at: [best.at[0], best.at[1] - best.h - 1], h: 2.5, layer: L("room") }); }
  // rack rows: one label per row at its south end, along the row
  const rows = new Map(); for (const f of fps.filter((f) => isRack(f.e))) { const k = (f.e.mark || "").replace(/-\d+$/, ""); (rows.get(k) || rows.set(k, []).get(k)).push(f); }
  for (const [k, list] of rows) { const x0 = Math.min(...list.map((f) => f.x0)), x1 = Math.max(...list.map((f) => f.x1)), y0 = Math.min(...list.map((f) => f.y0)), y1 = Math.max(...list.map((f) => f.y1)); hard.push({ x0, y0, x1, y1, rack: true });
    const fam = (f) => model.data.families?.[f.e.family]?.parameters || {}; const kw = list.reduce((a, f) => a + (+fam(f).Nameplate_kW || 0), 0); const gpu = list.filter((f) => /NVL72/.test(f.e.family || "")).length;
    const name = `ROW ${k.replace(/^R-/, "")}`; const label = disc === "M" ? name : `${name} · ${gpu} × NVL72${kw ? ` · ${Math.round(kw)} kW` : ""}`;
    const vertical = y1 - y0 > x1 - x0; const cands = vertical ? [{ at: [(x0 + x1) / 2 + 0.9, y0 - 1.5], rot: 90, align: "end" }, { at: [(x0 + x1) / 2 + 0.9, y1 + 1.5], rot: 90, align: "start" }] : [{ at: [x0 - 1.5, (y0 + y1) / 2 - 0.9], rot: 0, align: "end" }, { at: [x1 + 1.5, (y0 + y1) / 2 - 0.9], rot: 0, align: "start" }];
    let done = false; for (const c of cands) { const r = rectOfText(c.at, label, 2.5, c.align, c.rot); if (!hit(r, placed) && !hit(r, hard, 0.2) && inRect(r, planBox)) { mask(r); text(c.at, label, 2.5, { align: c.align, rot: c.rot, layer: L("tag") }); placed.push(Object.assign(r, { txt: label })); qa.tags++; done = true; break; } }
    if (!done) qa.missing.push(label); }
  // equipment tags (primary discipline only; GA tags the major plant)
  for (const f of fps.filter((f) => !isRack(f.e) && primary(f.e))) { if (f.e.ifc_class === "IfcValve" && disc !== "F") continue; /* valves read from the symbol and the legend */ const t = f.e.mark || f.e.name; if (!t) continue; tag(f, t, { h: f.e.ifc_class === "IfcValve" ? 2 : 2.5, layer: L("tag") }); }
  // service runs: system, size, level
  labelRuns((r) => !r.isTray || r.busway); for (const f of failedLab) qa.missing.push(f);
  // fire plan: rated walls overlaid in red; fire doors marked with their rating; exits flagged
  const RED = "#c8102e";
  if (disc === "F") { for (const w of wallsIn) { const t = model.data.types.wall?.[w.type]; if (!t || !t.fireRating || /none/i.test(t.fireRating)) continue; line(P(w.a), P(w.b), 1.0, { col: RED, layer: L("fire-wall") }); }
    for (const o of ops) { const w = model.data.elements[o.wall || o.host]; const dt = model.data.types.door?.[o.type]; if (!w || !dt) continue; const sp = model.openingSpan(o); const dir = norm2(sub2(w.b, w.a)); const mid = [w.a[0] + dir[0] * (sp.from + sp.to) / 2, w.a[1] + dir[1] * (sp.from + sp.to) / 2]; const pm = P(mid);
      const ext_ = model.data.types.wall?.[w.type]?.isExternal; const lab = ext_ ? "EXIT" : /\d+ ?min/i.test(dt.fireRating || "") ? `FD${parseInt(dt.fireRating)}` : null; if (!lab) continue;
      if (ext_) poly([[pm[0] - 1.6, pm[1] - 1.2], [pm[0] + 1.6, pm[1] - 1.2], [pm[0], pm[1] + 1.6]], { fill: "#1a7f37", w: 0, layer: L("exit") });
      tag({ x0: pm[0] - 1.6, y0: pm[1] - 1.6, x1: pm[0] + 1.6, y1: pm[1] + 1.6 }, lab, { h: 2.2, inside: false, layer: L("tag"), ...(ext_ ? { col: "#1a7f37", bold: true } : {}) }); } }
  if (disc === "GA") for (const o of ops) { const w = model.data.elements[o.wall || o.host]; if (!w) continue; const sp = model.openingSpan(o); const dir = norm2(sub2(w.b, w.a)); const mid = [w.a[0] + dir[0] * (sp.from + sp.to) / 2, w.a[1] + dir[1] * (sp.from + sp.to) / 2]; const pm = P(mid);
    tag({ x0: pm[0] - 1, y0: pm[1] - 1, x1: pm[0] + 1, y1: pm[1] + 1 }, o.mark, { h: 2.2, inside: false, layer: L("tag") }); }

  // ---- 7. QA: labels must not overlap each other or equipment they do not belong to
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (hit(placed[i], [placed[j]], -0.05)) qa.overlaps.push([placed[i].txt || i, placed[j].txt || j]);
  // ---- 8. title under the plan, north point, scale bar
  const ty = planBox.y0 - 8; circle([area.x0 + 6, ty + 1.2], 5, { w: 0.35 }); text([area.x0 + 6, ty - 0.6], "1", 4, { align: "middle", bold: true });
  const zn = zone ? zone.name.toUpperCase() : "PLAN";
  const ttl = `${zn} — ${TITLES[disc].toUpperCase()}${roof ? "" : ", GROUND FLOOR"}`; text([area.x0 + 14, ty + 0.5], ttl, 5, { bold: true }); line([area.x0 + 14, ty - 1.5], [area.x0 + 14 + tw(ttl, 5, true), ty - 1.5], 0.5);
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
const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** Liang–Barsky clip of a 3D segment to a plan box (z interpolated); null when outside. */
function clipSeg3(a, b, box) { if (!box) return [a, b]; let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - box.x0], [dx, box.x1 - a[0]], [-dy, a[1] - box.y0], [dy, box.y1 - a[1]]]) { if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; } const t = q / p; if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; } }
  const at = (t) => [a[0] + dx * t, a[1] + dy * t, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t]; if (dx === 0 && dy === 0) return inBox(a, box) ? [a, b] : null; return [at(t0), at(t1)]; }
/** A grid line cut to a sheet part; bubbles stay only at its true ends. */
function clipGrid(g, box) { if (!box) return g; const c = clipSeg3([...g.a, 0], [...g.b, 0], box); if (!c) return null; const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1;
  return { ...g, a: c[0].slice(0, 2), b: c[1].slice(0, 2), bubA: same(c[0], g.a), bubB: same(c[1], g.b) }; }
const nearestEdge = (r, p) => [Math.max(r.x0, Math.min(p[0], r.x1)), Math.max(r.y0, Math.min(p[1], r.y1))];
function arrow(items, m, d, layer) { const n = [-d[1], d[0]]; const tip = [m[0] + d[0] * 1.6, m[1] + d[1] * 1.6], b1 = [m[0] - d[0] * 1.2 + n[0], m[1] - d[1] * 1.2 + n[1]], b2 = [m[0] - d[0] * 1.2 - n[0], m[1] - d[1] * 1.2 - n[1]]; items.push({ t: "poly", pts: [tip, b1, b2], fill: "#000000", w: 0, layer }); }
export function north(items, c, layer) { items.push({ t: "poly", pts: [[c[0], c[1] + 9], [c[0] + 3.5, c[1] - 4], [c[0], c[1] - 1.5]], fill: "#000000", w: 0.25, layer }, { t: "poly", pts: [[c[0], c[1] + 9], [c[0] - 3.5, c[1] - 4], [c[0], c[1] - 1.5]], w: 0.25, layer }); items.push({ t: "text", at: [c[0], c[1] + 11], text: "N", h: 3.5, align: "middle", bold: true, layer }); }
export function scaleBar(items, at, s, layer) { const seg = 5000 / s; for (let i = 0; i < 4; i++) items.push({ t: "poly", pts: [[at[0] + i * seg, at[1]], [at[0] + (i + 1) * seg, at[1]], [at[0] + (i + 1) * seg, at[1] + 1.5], [at[0] + i * seg, at[1] + 1.5]], fill: i % 2 ? "#ffffff" : "#000000", w: 0.18, layer });
  for (let i = 0; i <= 4; i++) items.push({ t: "text", at: [at[0] + i * seg, at[1] + 2.5], text: `${i * 5}`, h: 2, align: "middle", layer }); items.push({ t: "text", at: [at[0] + 4 * seg + 3, at[1] + 0.2], text: "m", h: 2, layer }); }

// ---------- legend, notes, key plan and the typical single-line diagram (the band under the plan) ----------
/** Project notes per discipline and the typical power block come from drawing_setup (docs.notes, docs.sld). */
export function draftBand(model, d, items, docs = {}) {
  const { band } = d; const disc = d.disc; const z = d.zone; const K = ((z?.parent || z?.code || "HA").match(/[A-Z]$/) || ["A"])[0]; let x = band.x0; const top = band.y1;
  const head = (x0, t) => { items.push({ t: "text", at: [x0, top - 4], text: t, h: 3.5, bold: true, layer: "BJ-TEXT" }); items.push({ t: "line", p: [[x0, top - 5.5], [x0 + 150, top - 5.5]], w: 0.35, layer: "BJ-TEXT" }); };
  // legend
  head(x, "LEGEND"); let y = top - 12; const row = (draw, label) => { draw(x, y); items.push({ t: "text", at: [x + 22, y - 0.8], text: label, h: 2.5, layer: "BJ-TEXT" }); y -= 6.2; };
  const ln = (w, dash, col) => (x0, y0) => items.push({ t: "line", p: [[x0, y0], [x0 + 16, y0]], w, layer: "BJ-LEGEND", ...(dash ? { dash } : {}), ...(col ? { col } : {}) });
  const box = (fill, w = 0.35) => (x0, y0) => items.push({ t: "poly", pts: [[x0 + 3, y0 - 2], [x0 + 13, y0 - 2], [x0 + 13, y0 + 2], [x0 + 3, y0 + 2]], fill, w, layer: "BJ-LEGEND" });
  const dot = (fill) => (x0, y0) => items.push({ t: "poly", pts: circ([x0 + 8, y0], 1.6), fill, w: 0.25, layer: "BJ-LEGEND" });
  if (disc === "R") row((x0, y0) => { ln(0.5)(x0, y0 + 1); ln(0.25)(x0, y0 - 1); }, "Roof edge and parapet");
  else row(box(disc === "GA" ? "#4d4d4d" : "#d4d4d4", 0), disc === "GA" ? "Wall cut (2 h fire-rated where shown on the schedule)" : "Walls (architecture, for reference)");
  row(ln(0.18, "center", "#8a8a8a"), "Structural grid");
  if (disc !== "R") row(ln(0.25, "hidden"), "Hot-aisle containment (overhead)");
  if (disc === "E") { row((x0, y0) => { ln(0.35)(x0, y0 + 1); ln(0.35)(x0, y0 - 1); }, "Busway over rack row (double line), A–D sources"); row((x0, y0) => { ln(0.25)(x0, y0 + 1); ln(0.25)(x0, y0 - 1); }, "Cable ladder (rungs at 1.5 m)"); row(box(null), "Electrical equipment, tagged"); row(box(null, 0.18), "Rack (thick edge = front)"); }
  if (disc === "M" || disc === "R") { row(ln(0.5), "Supply (FWS / TCS / CHW), flow arrow"); row(ln(0.35, "dash"), "Return"); row(dot("#000000"), "Riser"); if (disc === "M") row((x0, y0) => { box(null, 0.25)(x0, y0); items.push({ t: "line", p: [[x0 + 3, y0 - 2], [x0 + 13, y0 + 2]], w: 0.25, layer: "BJ-LEGEND" }); }, "Isolating valve"); row(box(null), disc === "R" ? "Roof plant, tagged" : "Mechanical equipment, tagged"); }
  if (disc === "F") { row(ln(1.0, null, "#c8102e"), "Fire-rated wall (EI 120 unless noted)"); row((x0, y0) => items.push({ t: "text", at: [x0 + 8, y0 - 0.8], text: "FD120", h: 2.2, align: "middle", layer: "BJ-LEGEND" }), "Fire door, rating in minutes");
    row((x0, y0) => items.push({ t: "poly", pts: [[x0 + 6.4, y0 - 1.2], [x0 + 9.6, y0 - 1.2], [x0 + 8, y0 + 1.6]], fill: "#1a7f37", w: 0, layer: "BJ-LEGEND" }), "Final exit to open air"); row(ln(0.5), "Pre-action sprinkler main / branch"); }
  if (disc === "GA") { row(box(null, 0.18), "Equipment and racks (outline)"); row((x0, y0) => { items.push({ t: "text", at: [x0 + 8, y0 - 0.8], text: `${K}-D01`, h: 2.2, align: "middle", layer: "BJ-LEGEND" }); }, "Door mark (see door schedule)"); }
  if (z?.parent) row(ln(0.7, "center"), "Matchline to the adjoining part");
  // general notes: three standard ones, then the project's notes for this discipline
  x = band.x0 + 175; head(x, "GENERAL NOTES"); y = top - 12;
  const own = (docs.notes?.[disc] || []).map((t, i) => `${i + 4}. ${t}`);
  const notes = ["1. Dimensions in millimetres; levels in metres above finished floor level (FFL ±0.00).", "2. Do not scale. Work to figured dimensions; report discrepancies to the designer.", "3. Concept design for a pilot (BIMja). Not for construction.", ...own,
    "LOD 400 geometry; as-built (LOD 500) fields assumed, not field-verified."];
  for (const n of notes) for (const part of wrap(n, 96)) { items.push({ t: "text", at: [x, y], text: part, h: 2.5, layer: "BJ-TEXT" }); y -= 4.2; }
  // key plan: the site at a small scale, this building shaded and this part outlined
  x = band.x0 + 395; head(x, "KEY PLAN"); { const site = model.elements.find((e) => e.kind === "mass" && /EARTHWORKS|SITE/.test(e.layer || "") && e.outline); const zs = (model.data.zones || []).filter((q) => !q.parent);
    const pts = site ? site.outline : zs.flatMap((q) => q.outline); if (pts.length) { const b = bboxOfPts(pts); const bw = 140, bh = Math.min(80, top - band.y0 - 22); const sc = Math.max((b.x1 - b.x0) / bw, (b.y1 - b.y0) / bh); const KP = (p) => [x + (p[0] - b.x0) / sc, top - 14 - bh + (p[1] - b.y0) / sc];
      if (site) items.push({ t: "poly", pts: site.outline.map(KP), w: 0.5, layer: "BJ-KEYPLAN" });
      const onCode = z?.parent || z?.code;
      for (const q of zs) { const on = q.code === onCode; items.push({ t: "poly", pts: q.outline.map(KP), w: 0.18, fill: on ? "#4d4d4d" : null, layer: "BJ-KEYPLAN" }); const c = KP(centroidOf(q.outline)); items.push({ t: "text", at: [c[0], c[1] - 0.8], text: q.code, h: 2.2, align: "middle", bold: on, layer: "BJ-KEYPLAN", ...(on ? { col: "#ffffff" } : {}) }); }
      if (z?.parent) items.push({ t: "poly", pts: z.outline.map(KP), w: 0.7, layer: "BJ-KEYPLAN", col: "#000000" });
      const sb = site ? bboxOfPts(site.outline) : b; items.push({ t: "text", at: [x, top - 18 - bh], text: `${z?.name || "Zone"} shown. Site boundary ${Math.round((sb.x1 - sb.x0) / 1000)} × ${Math.round((sb.y1 - sb.y0) / 1000)} m.`, h: 2.2, layer: "BJ-KEYPLAN" }); } }
  if (disc === "E" && docs.sld) sldBlock(items, { x0: band.x0 + 560, x1: band.x1, y0: band.y0, y1: top }, docs.sld);
}
const circ = (c, r) => Array.from({ length: 20 }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / 20), c[1] + r * Math.sin((2 * Math.PI * i) / 20)]);
const wrap = (t, n) => { const out = []; let cur = ""; for (const w of String(t).split(" ")) { if ((cur + " " + w).trim().length > n && cur) { out.push(cur); cur = "   " + w; } else cur = (cur + " " + w).trim() === "" ? w : cur ? `${cur} ${w}` : w; } if (cur) out.push(cur); return out; };

/** Typical power block, single line, IEC 60617 style: one column per source (e.g. 4N/3: A–D), each
 *  MV → transformer → main switchboard (with generator incomer) → UPS → output board → busways, meeting at the racks. */
function sldBlock(items, b, sld) {
  const Ly = "BJ-SLD"; const ln = (p, w = 0.35) => items.push({ t: "line", p, w, layer: Ly }); const tx = (at, s, h = 2.2, o = {}) => items.push({ t: "text", at, text: String(s), h, layer: Ly, align: o.align || "start", bold: !!o.bold });
  const pc = (c, r, fill = null) => items.push({ t: "poly", pts: circ(c, r), w: 0.35, fill, layer: Ly }); const rc = (x0, y0, x1, y1, w = 0.35) => items.push({ t: "poly", pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], w, layer: Ly });
  const src = sld.sources || ["A", "B", "C", "D"]; tx([b.x0, b.y1 - 4], (sld.title || "TYPICAL POWER BLOCK — SINGLE LINE").toUpperCase(), 3.5, { bold: true }); ln([[b.x0, b.y1 - 5.5], [b.x1, b.y1 - 5.5]]);
  const colW = Math.min(88, (b.x1 - b.x0 - 6) / src.length); const top = b.y1 - 12;
  src.forEach((s, i) => { const cx = b.x0 + 14 + i * colW; let y = top; const lab = (dy, t, bold) => tx([cx + 5, y - dy], t.replace(/\{s\}/g, s), 2.2, { bold });
    tx([cx, y], `SOURCE ${s}`, 2.5, { align: "middle", bold: true }); y -= 3; ln([[cx, y], [cx, y - 5]]); lab(3, sld.mv || "33 kV"); y -= 5;
    rc(cx - 1.8, y, cx + 1.8, y - 3.6); lab(2.6, "VCB"); y -= 3.6; ln([[cx, y], [cx, y - 2]]); y -= 2;
    pc([cx, y - 3], 3); pc([cx, y - 7.5], 3); lab(5, sld.tx || "TX-{s}"); y -= 10.5; ln([[cx, y], [cx, y - 3]]); y -= 3;
    rc(cx - 1.8, y, cx + 1.8, y - 3); y -= 3; ln([[cx, y], [cx, y - 3]]); y -= 3; ln([[cx - 10, y], [cx + 10, y]], 1.0); lab(1.2, sld.msb || "MSB-{s}", true);
    const gx = cx - 7; pc([gx, y + 8], 2.6); tx([gx, y + 7.2], "G", 2.5, { align: "middle", bold: true }); ln([[gx, y + 5.4], [gx, y]]); tx([gx - 3.5, y + 11.5], (sld.gen || "GEN-{s}").replace(/\{s\}/g, s), 2.0, { align: "end" });
    ln([[cx, y], [cx, y - 4]]); y -= 4; rc(cx - 4, y, cx + 4, y - 7); ln([[cx - 4, y - 7], [cx + 4, y]], 0.25); tx([cx - 3.2, y - 2.8], "~", 2.4); tx([cx + 0.6, y - 6.4], "=", 2.4); lab(3.5, sld.ups || "UPS-{s}"); y -= 7;
    ln([[cx, y], [cx, y - 3]]); y -= 3; ln([[cx - 10, y], [cx + 10, y]], 0.7); lab(1.2, sld.ob || "OB-{s}", true);
    for (const k of [-7.5, -2.5, 2.5, 7.5]) ln([[cx + k, y], [cx + k, y - 6]], 0.25); y -= 6; lab(1.5, sld.busway || "busways to rows"); });
  // the racks: every rack takes feeds from all sources
  const yR = top - 64; ln([[b.x0 + 4, yR + 4], [b.x0 + 14 + (src.length - 1) * colW + 10, yR + 4]], 0.25);
  for (let k = 0; k < 4; k++) rc(b.x0 + 20 + k * 14, yR, b.x0 + 28 + k * 14, yR - 6, 0.25);
  tx([b.x0 + 80, yR - 4], sld.load || "Racks: one feed from every source", 2.2);
  if (sld.note) tx([b.x0 + 4, yR - 12], sld.note, 2.2);
}
