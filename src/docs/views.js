// Drawing views from the model: floor plans (semantic walls/doors/windows/rooms + any mass sliced at the cut),
// elevations and sections (hidden lines removed with a software depth buffer, cut faces filled).
// Output is 2D in model millimetres: { prims: {lines, polys, arcs, texts}, box } with u to the right and v up.
// Text heights are in paper millimetres (they stay readable at any scale).
import { modelTriangles, featureEdges } from "./mesh.js";
import { dist, norm, sub, add, mul, perp, polygonArea, pointInPolygon } from "../author/geom.js";
import { centroid } from "../author/model.js";

const emptyPrims = () => ({ lines: [], polys: [], arcs: [], texts: [] });
const bboxOf = (P) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pt = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  P.lines.forEach((l) => l.p.forEach(pt)); P.polys.forEach((q) => q.pts.forEach(pt)); P.arcs.forEach((a) => { pt([a.c[0] - a.r, a.c[1] - a.r]); pt([a.c[0] + a.r, a.c[1] + a.r]); });
  return x0 === Infinity ? { x0: 0, y0: 0, x1: 1000, y1: 1000 } : { x0, y0, x1, y1 }; };

// ---------- projections: world [x,y,z] -> [u, v, depth] (smaller depth = nearer the viewer) ----------
export const PROJ = {
  plan: (p) => [p[0], p[1], -p[2]],
  south: (p) => [p[0], p[2], p[1]], north: (p) => [-p[0], p[2], -p[1]],
  east: (p) => [p[1], p[2], -p[0]], west: (p) => [-p[1], p[2], p[0]],
};

/** Clip a polygon of projected points [u,v,d] to d >= d0. */
function clipFar(poly, d0) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[2] >= d0, inb = b[2] >= d0;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (d0 - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, d0]); }
  }
  return out;
}

/**
 * Hidden-line projection of elements. opts: { proj, near (depth: drop what is nearer, e.g. the section plane),
 * cut (true: also return the cut through the near plane as filled polygons), filter(el) }.
 */
export function projectHidden(elements, { proj, near = -Infinity, cut = false, filter = () => true, cellMax = 1800 } = {}) {
  const P = emptyPrims();
  const items = elements.filter(filter).map((el) => {
    const T = el.tris, tri = [];
    for (let i = 0; i < T.length; i += 9) {
      let poly = [proj([T[i], T[i + 1], T[i + 2]]), proj([T[i + 3], T[i + 4], T[i + 5]]), proj([T[i + 6], T[i + 7], T[i + 8]])];
      if (near > -Infinity) { if (poly.every((q) => q[2] < near)) continue; poly = clipFar(poly, near); }
      for (let k = 1; k < poly.length - 1; k++) tri.push([poly[0], poly[k], poly[k + 1]]);
    }
    return { el, tri };
  });
  // depth buffer
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const it of items) for (const t of it.tri) for (const q of t) { u0 = Math.min(u0, q[0]); v0 = Math.min(v0, q[1]); u1 = Math.max(u1, q[0]); v1 = Math.max(v1, q[1]); }
  if (u0 === Infinity) return { prims: P, box: bboxOf(P) };
  const cell = Math.max(5, Math.max(u1 - u0, v1 - v0) / cellMax); const W = Math.ceil((u1 - u0) / cell) + 2, H = Math.ceil((v1 - v0) / cell) + 2;
  const Z = new Float32Array(W * H).fill(Infinity);
  for (const it of items) for (const [a, b, c] of it.tri) {
    const ax = (a[0] - u0) / cell, ay = (a[1] - v0) / cell, bx = (b[0] - u0) / cell, by = (b[1] - v0) / cell, cx = (c[0] - u0) / cell, cy = (c[1] - v0) / cell;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const xa = Math.max(0, Math.floor(Math.min(ax, bx, cx))), xb = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), ya = Math.max(0, Math.floor(Math.min(ay, by, cy))), yb = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, py = y + 0.5; const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const d = l1 * a[2] + l2 * b[2] + l3 * c[2]; const k = y * W + x; if (d < Z[k]) Z[k] = d;
    }
  }
  // the cell under the sample (a neighbourhood minimum would hide silhouettes of curved surfaces behind their own front)
  const zAt = (u, v) => { const x = Math.floor((u - u0) / cell), y = Math.floor((v - v0) / cell); return x >= 0 && y >= 0 && x < W && y < H ? Z[y * W + x] : Infinity; };
  const eps = cell * 3;
  // visible feature edges, sampled along their length
  for (const it of items) {
    for (const [A, B] of featureEdges(it.el.tris, 20, proj)) {
      let a = proj(A), b = proj(B);
      if (near > -Infinity) { if (a[2] < near && b[2] < near) continue; if (a[2] < near || b[2] < near) { const t = (near - a[2]) / (b[2] - a[2]); const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]; if (a[2] < near) a = m; else b = m; } }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
      const n = Math.max(2, Math.ceil(L / (cell * 0.75)));
      const vis = []; for (let i = 0; i <= n; i++) { const t = i / n; vis.push(a[2] + (b[2] - a[2]) * t <= zAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) + eps); }
      for (let i = 1; i < n; i++) if (!vis[i] && vis[i - 1] && (vis[i + 1] || (i + 2 <= n && !vis[i + 1] && vis[i + 2] && (vis[i + 1] = true)))) vis[i] = true; // close 1–2 sample gaps (raster noise)
      let start = -1; const at = (i) => [a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n)];
      for (let i = 0; i <= n + 1; i++) { const v = i <= n && vis[i]; if (v && start < 0) start = i; if (!v && start >= 0) { if (i - 1 > start) P.lines.push({ p: [at(start), at(i - 1)], layer: "beyond", w: 0.25 }); start = -1; } }
    }
  }
  if (cut && near > -Infinity) for (const it of items) for (const loop of sliceLoops(it.el.tris, proj, near)) P.polys.push({ pts: loop, layer: it.el.kind === "mass" ? "cutmass" : "cut", fill: true, w: 0.5, id: it.el.id });
  return { prims: P, box: bboxOf(P) };
}

/** Section through triangles at depth d0 -> closed loops in (u, v). */
function sliceLoops(T, proj, d0) {
  const segs = [];
  for (let i = 0; i < T.length; i += 9) {
    const p = [proj([T[i], T[i + 1], T[i + 2]]), proj([T[i + 3], T[i + 4], T[i + 5]]), proj([T[i + 6], T[i + 7], T[i + 8]])];
    const pts = [];
    for (let k = 0; k < 3; k++) { const a = p[k], b = p[(k + 1) % 3]; const da = a[2] - d0, db = b[2] - d0;
      if ((da < 0) !== (db < 0)) { const t = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
    if (pts.length === 2 && Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) > 0.5) segs.push(pts);
  }
  const key = (q) => `${Math.round(q[0])},${Math.round(q[1])}`; const adj = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); (adj.get(k) || adj.set(k, []).get(k)).push([i, e]); } });
  const used = new Set(), loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue; used.add(i); const loop = [segs[i][0], segs[i][1]]; let end = segs[i][1];
    for (let guard = 0; guard < segs.length; guard++) {
      const nxt = (adj.get(key(end)) || []).find(([j]) => !used.has(j)); if (!nxt) break;
      const [j, e] = nxt; used.add(j); end = segs[j][1 - e]; loop.push(end);
    }
    if (loop.length > 3 && key(loop[0]) === key(loop[loop.length - 1])) loop.pop();
    if (loop.length >= 3 && Math.abs(polygonArea(loop)) > 100) loops.push(loop);
  }
  return loops;
}

// ---------- floor plan ----------
export function planView(model, levelId, { cut = 1200, cut_z = null, rooms = true, dims = true, title = null } = {}) {
  const P = emptyPrims(); const lv = model.level(levelId), z0 = lv.elevation; if (cut_z != null) cut = cut_z - z0; const zc = z0 + cut;
  const walls = model.wallsOn(levelId);
  const ctr = walls.length ? mul(walls.reduce((acc, w) => add(acc, add(w.a, w.b)), [0, 0]), 1 / (2 * walls.length)) : [0, 0];
  // wall pieces cut by the plan plane (solid where no opening crosses the cut height)
  const pieces = [];
  for (const w of walls) {
    const t = model.type("wall", w.type), H = model.wallHeight(w); if (cut > H) continue;
    const { ea, eb } = model.wallExtents(w); const dir = norm(sub(w.b, w.a)), L = dist(w.a, w.b), n = perp(dir), half = t.thickness / 2;
    const ops = model.hosted(w.id).map((o) => ({ o, s: model.openingSpan(o) })).filter((x) => x.s.sill <= cut && x.s.sill + x.s.height >= cut).sort((a, b) => a.s.from - b.s.from);
    let s = -ea; const at = (d) => add(w.a, mul(dir, d));
    const piece = (d0, d1) => { if (d1 - d0 > 1) pieces.push({ w, a: at(d0), b: at(d1), dir, n, half, poly: [add(at(d0), mul(n, half)), add(at(d1), mul(n, half)), add(at(d1), mul(n, -half)), add(at(d0), mul(n, -half))] }); };
    for (const { o, s: sp } of ops) {
      piece(s, sp.from); s = sp.to;
      const A = at(sp.from), B = at(sp.to);
      if (o.kind === "window") { // sill lines at both faces and the glass line
        for (const k of [half, -half]) P.lines.push({ p: [add(A, mul(n, k)), add(B, mul(n, k))], layer: "window", w: 0.25 });
        P.lines.push({ p: [A, B], layer: "window", w: 0.18 });
      } else { // door leaf (open 90°) and swing
        const leaf = add(A, mul(n, sp.width)); P.lines.push({ p: [A, leaf], layer: "door", w: 0.35 });
        let prev = B; for (let k = 1; k <= 12; k++) { const t = (k / 12) * (Math.PI / 2); const q = add(A, add(mul(dir, sp.width * Math.cos(t)), mul(n, sp.width * Math.sin(t)))); P.lines.push({ p: [prev, q], layer: "door", w: 0.18 }); prev = q; } // swing
      }
      const mid = mul(add(A, B), 0.5); const inward = (ctr[0] - mid[0]) * n[0] + (ctr[1] - mid[1]) * n[1] > 0 ? n : mul(n, -1);
      P.texts.push({ at: add(mid, mul(inward, half + 420)), text: o.mark || "", h: 2.2, layer: "tag", align: "middle" });
    }
    piece(s, L + eb);
  }
  const insideOther = (p, self) => pieces.some((q) => q !== self && pointInPolygon(p, q.poly));
  for (const pc of pieces) {
    P.polys.push({ pts: pc.poly, layer: "cut", fill: true, w: 0 });
    for (let e = 0; e < 4; e++) { // outline: only where the edge is not shared with another wall (clean wall joins)
      const a = pc.poly[e], b = pc.poly[(e + 1) % 4]; const L = dist(a, b); const d = norm(sub(b, a)); const out = mul(perp(d), -1); // outward for CCW? test both sides
      const ctr = centroid(pc.poly); const mid = mul(add(a, b), 0.5); const o2 = (mid[0] - ctr[0]) * out[0] + (mid[1] - ctr[1]) * out[1] > 0 ? out : mul(out, -1);
      const steps = Math.max(1, Math.ceil(L / 20)); let run = null;
      for (let i = 0; i <= steps; i++) { const p = add(a, mul(d, (L * i) / steps)); const hidden = insideOther(add(p, mul(o2, 2)), pc) && insideOther(add(p, mul(o2, -2)), null) ;
        const vis = !hidden;
        if (vis && !run) run = p; if ((!vis || i === steps) && run) { const end = vis ? p : add(a, mul(d, (L * (i - 1)) / steps)); if (dist(run, end) > 1) P.lines.push({ p: [run, end], layer: "cutline", w: 0.5 }); run = null; } }
    }
  }
  // slabs on this level (outline below), roofs above are not drawn on plans
  for (const f of model.elements.filter((e) => e.kind === "floor" && e.level === levelId)) P.polys.push({ pts: f.boundary, layer: "slab", fill: false, w: 0.18 });
  // masses: cut at the plan height and visible edges below it
  const masses = modelTriangles(model).filter((e) => e.kind === "mass");
  if (masses.length) {
    const hl = projectHidden(masses, { proj: PROJ.plan, near: -zc, cut: true, filter: (e) => { for (let i = 2; i < e.tris.length; i += 3) if (e.tris[i] <= zc + 1) return true; return false; } });
    P.lines.push(...hl.prims.lines); P.polys.push(...hl.prims.polys);
  }
  if (rooms) for (const r of model.elements.filter((e) => e.kind === "room" && e.level === levelId)) {
    const c = centroid(r.boundary), A = Math.abs(polygonArea(r.boundary)) / 1e6;
    P.texts.push({ at: c, text: r.name, h: 3.5, layer: "room", align: "middle", dy: 1.2 }, { at: c, text: `${r.number} · ${A.toFixed(1)} m²`, h: 2.2, layer: "room", align: "middle", dy: -3 });
  }
  const box = bboxOf(P);
  if (dims && pieces.length) addPlanDims(P, pieces, box);
  return { prims: P, box: bboxOf(P), title: title || (cut_z != null ? `Plan at +${(zc / 1000).toFixed(2)} m` : `${lv.name} plan`), kind: "plan", level: levelId };
}

function addPlanDims(P, pieces, box) {
  // overall dimensions and a chain of wall positions along the bottom and left sides
  const xs = new Set([box.x0, box.x1]), ys = new Set([box.y0, box.y1]);
  for (const pc of pieces) { if (Math.abs(pc.dir[1]) > 0.99) xs.add(Math.round(mul(add(pc.a, pc.b), 0.5)[0])); if (Math.abs(pc.dir[0]) > 0.99) ys.add(Math.round(mul(add(pc.a, pc.b), 0.5)[1])); }
  const X = [...xs].sort((a, b) => a - b).filter((x, i, a) => i === 0 || x - a[i - 1] > 50), Y = [...ys].sort((a, b) => a - b).filter((y, i, a) => i === 0 || y - a[i - 1] > 50);
  P.dims = [{ axis: "x", at: box.y0, values: X, row: 1 }, { axis: "x", at: box.y0, values: [box.x0, box.x1], row: 2 }, { axis: "y", at: box.x0, values: Y, row: 1 }, { axis: "y", at: box.x0, values: [box.y0, box.y1], row: 2 }];
}

// ---------- elevations and sections ----------
const DIRS = { north: "North", south: "South", east: "East", west: "West" };
function levelMarks(model, P, u0, u1) {
  for (const l of model.data.levels) { P.lines.push({ p: [[u0 - 1500, l.elevation], [u1 + 1500, l.elevation]], layer: "level", w: 0.18, dash: true });
    P.texts.push({ at: [u1 + 1700, l.elevation], text: `${l.name}  ${(l.elevation / 1000 >= 0 ? "+" : "")}${(l.elevation / 1000).toFixed(3)}`, h: 2.5, layer: "level", align: "start", dy: 1 }); }
}
export function elevationView(model, dir = "south") {
  const els = modelTriangles(model); const r = projectHidden(els, { proj: PROJ[dir] });
  const b = r.box; r.prims.lines.push({ p: [[b.x0 - 3000, 0], [b.x1 + 3000, 0]], layer: "ground", w: 0.7 });
  levelMarks(model, r.prims, b.x0, b.x1);
  return { prims: r.prims, box: bboxOf(r.prims), title: `${DIRS[dir]} elevation`, kind: "elevation", dir };
}
/** Section: axis "x" cuts at y = at looking north; axis "y" cuts at x = at looking east. */
export function sectionView(model, { axis = "x", at, label = "A" } = {}) {
  const els = modelTriangles(model); const proj = axis === "x" ? PROJ.south : PROJ.west;
  if (at == null) { let lo = Infinity, hi = -Infinity; for (const e of els) for (let i = 0; i < e.tris.length; i += 3) { const v = axis === "x" ? e.tris[i + 1] : e.tris[i]; lo = Math.min(lo, v); hi = Math.max(hi, v); } at = (lo + hi) / 2; }
  const near = at; // PROJ.south depth = y (look north); PROJ.west depth = x (look east)
  const r = projectHidden(els, { proj, near, cut: true });
  const b = r.box; r.prims.lines.push({ p: [[b.x0 - 3000, 0], [b.x1 + 3000, 0]], layer: "ground", w: 0.7 });
  levelMarks(model, r.prims, b.x0, b.x1);
  return { prims: r.prims, box: bboxOf(r.prims), title: `Section ${label}-${label}`, kind: "section", axis, at };
}
export { bboxOf };
