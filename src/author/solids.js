// Free-form solids for the "mass" and "revolve" commands: towers, setbacks, tapers, twists, cantilevers, domes,
// minarets, columns, leaning structures. One polyhedral representation feeds the 3D view, the IFC export
// (IfcFacetedBrep) and the quantities (exact volume and area), so all three always agree.
// Units: mm. Coordinates: plan x, y and z up, relative to the element's level.

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const signedArea2 = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

/** Rotate all vertices to lean by deg toward dir_deg (0 = +x, 90 = +y) about pivot [x, y, z]. */
function lean(verts, deg, dirDeg, pivot) {
  if (!deg) return verts;
  const a = (deg * Math.PI) / 180, d = (dirDeg * Math.PI) / 180; const ux = Math.cos(d), uy = Math.sin(d);
  return verts.map(([x, y, z]) => {
    const px = x - pivot[0], py = y - pivot[1], pz = z - pivot[2];
    const along = px * ux + py * uy, across = -px * uy + py * ux; // rotate in the (along, z) plane
    const al = along * Math.cos(a) + pz * Math.sin(a), zz = -along * Math.sin(a) + pz * Math.cos(a);
    return [pivot[0] + al * ux - across * uy, pivot[1] + al * uy + across * ux, pivot[2] + zz];
  });
}

/** Prism through rings: outline at the base, scaled/shifted/twisted at the top, `segments` rings in between. */
export function massSolid(e) {
  let out = e.outline.map((p) => [p[0], p[1]]); if (signedArea2(out) < 0) out = out.reverse();
  const n = out.length, segs = Math.max(1, Math.min(64, e.segments || (e.twist_deg ? 8 : 1)));
  const cx = out.reduce((s, p) => s + p[0], 0) / n, cy = out.reduce((s, p) => s + p[1], 0) / n;
  const verts = []; const z0 = e.base || 0;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs, sc = 1 + ((e.top_scale ?? 1) - 1) * t, tw = ((e.twist_deg || 0) * Math.PI * t) / 180;
    const sh = e.top_shift || [0, 0]; const c = Math.cos(tw), s = Math.sin(tw);
    for (const [x, y] of out) {
      const dx = (x - cx) * sc, dy = (y - cy) * sc;
      verts.push([cx + dx * c - dy * s + sh[0] * t, cy + dx * s + dy * c + sh[1] * t, z0 + e.height * t]);
    }
  }
  const faces = [];
  faces.push([...Array(n).keys()].reverse()); // bottom, facing down
  faces.push([...Array(n).keys()].map((i) => segs * n + i)); // top, facing up
  for (let k = 0; k < segs; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + ((i + 1) % n), c2 = (k + 1) * n + ((i + 1) % n), d = (k + 1) * n + i;
    if (segs > 1 || e.twist_deg) { faces.push([a, b, c2]); faces.push([a, c2, d]); } else faces.push([a, b, c2, d]); // twisted sides are not planar: triangles
  }
  return finish(lean(verts, e.lean_deg, e.lean_dir_deg || 0, e.pivot || [cx, cy, z0]), faces);
}

/** Surface of revolution: profile [[r, z], ...] closed back to its first point, swept around center. r = 0 points sit on the axis. */
export function revolveSolid(e) {
  const seg = Math.max(6, Math.min(96, e.segments || 32)); const [cx, cy] = e.center; const z0 = e.base || 0;
  const prof = e.profile.map(([r, z]) => [Math.max(0, r), z]);
  const verts = [], ring = [];
  for (const [r, z] of prof) {
    if (r < 0.5) { ring.push([verts.length]); verts.push([cx, cy, z0 + z]); continue; }
    const idx = []; for (let k = 0; k < seg; k++) { const a = (2 * Math.PI * k) / seg; idx.push(verts.length); verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + z]); }
    ring.push(idx);
  }
  const faces = []; const P = prof.length;
  for (let i = 0; i < P; i++) {
    const A = ring[i], Bv = ring[(i + 1) % P];
    if (A.length === 1 && Bv.length === 1) continue;
    for (let k = 0; k < seg; k++) {
      const k2 = (k + 1) % seg;
      if (A.length === 1) faces.push([A[0], Bv[k], Bv[k2]]);
      else if (Bv.length === 1) faces.push([A[k], Bv[0], A[k2]]);
      else faces.push([A[k], Bv[k], Bv[k2], A[k2]]);
    }
  }
  return finish(lean(verts, e.lean_deg, e.lean_dir_deg || 0, e.pivot || [cx, cy, z0]), faces);
}

/** Make faces point outward (positive volume), drop degenerate faces, and compute volume (mm³) and area (mm²). */
function finish(verts, faces) {
  let vol = 0; const fv = (f) => { let s = 0; for (let i = 1; i < f.length - 1; i++) s += dot(verts[f[0]], cross(verts[f[i]], verts[f[i + 1]])); return s / 6; };
  faces = faces.filter((f) => new Set(f.map((i) => verts[i].join())).size >= 3);
  for (const f of faces) vol += fv(f);
  if (vol < 0) { faces = faces.map((f) => f.slice().reverse()); vol = -vol; }
  let area = 0; for (const f of faces) { let n = [0, 0, 0]; for (let i = 1; i < f.length - 1; i++) { const c = cross(sub3(verts[f[i]], verts[f[0]]), sub3(verts[f[i + 1]], verts[f[0]])); n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]]; } area += Math.hypot(...n) / 2; }
  let zmin = Infinity, zmax = -Infinity; for (const v of verts) { zmin = Math.min(zmin, v[2]); zmax = Math.max(zmax, v[2]); }
  return { verts, faces, volume: vol, area, zmin, zmax };
}

export const solidOf = (e) => (e.kind === "mass" ? specSolid(e) : null);

// ---------- more solids: box, sweep, opening (arched), csg (kernel booleans), group (families) ----------
import { triangulate } from "./geom.js";
import { needKernel, toManifold, fromManifold } from "./kernel.js";

export function specSolid(sp) {
  switch (sp.shape || "extrude") {
    case "extrude": return massSolid(sp);
    case "revolve": return revolveSolid(sp);
    case "box": return massSolid({ outline: [[sp.min[0], sp.min[1]], [sp.max[0], sp.min[1]], [sp.max[0], sp.max[1]], [sp.min[0], sp.max[1]]], base: sp.min[2], height: sp.max[2] - sp.min[2] });
    case "sweep": return sweepSolid(sp);
    case "opening": return openingSolid(sp);
    case "csg": return csgSolid(sp);
    case "group": return groupSolid(sp);
    default: throw Object.assign(new Error(`unknown shape ${sp.shape}`), { code: "bad_arg" });
  }
}

/** Profile [[u, v], ...] (mm, CCW) swept along path [[x, y, z], ...] with mitred corners; closed paths make rings. */
export function sweepSolid(sp) {
  const path = sp.path.map((p) => [p[0], p[1], (p[2] || 0) + (sp.base || 0)]); const closed = !!sp.closed; const prof = sp.profile; const n = path.length, m = prof.length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const nrm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const seg = (i) => nrm(sub(path[(i + 1) % n], path[i]));
  const frame = (t) => { const up = Math.abs(t[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]; const side = nrm(crs(t, up)); return { side, up: crs(side, t) }; };
  const rings = [];
  for (let i = 0; i < n; i++) {
    const tin = i > 0 || closed ? seg((i - 1 + n) % n) : seg(0), tout = i < n - 1 || closed ? seg(i) : seg(n - 2);
    const f = frame(tin); const nb = nrm(add(tin, tout)); const ring = [];
    for (const [u, v] of prof) { const Q = add(path[i], add(mul(f.side, u), mul(f.up, v))); const den = dt(tin, nb) || 1; const s0 = -dt(sub(Q, path[i]), nb) / den; ring.push(add(Q, mul(tin, s0))); }
    rings.push(ring);
  }
  const verts = rings.flat(), faces = []; const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) for (let k = 0; k < m; k++) { const a = i * m + k, b = i * m + ((k + 1) % m), c = ((i + 1) % n) * m + ((k + 1) % m), d = ((i + 1) % n) * m + k; faces.push([a, b, c], [a, c, d]); }
  if (!closed) { faces.push([...Array(m).keys()].reverse()); faces.push([...Array(m).keys()].map((k) => (n - 1) * m + k)); }
  return finish(verts, faces);
}

/** Arch outline in (u, v): width w, total height h, kinds rect | semi | segmental | pointed | mughal. */
export function archOutline(w, h, kind = "semi", seg = 10) {
  const half = w / 2; let rise = kind === "rect" ? 0 : kind === "semi" ? half : kind === "segmental" ? w * 0.2 : kind === "pointed" ? w * 0.866 : w * 0.62;
  rise = Math.min(rise, h * 0.9); const s = h - rise; const pts = [[-half, 0], [half, 0], [half, s]];
  if (kind === "rect" || rise <= 0) pts.push([-half, h]);
  if (kind === "semi" || kind === "segmental") { const r = kind === "semi" ? half : (rise * rise + half * half) / (2 * rise), cy = s + rise - r; const a0 = Math.atan2(s - cy, half), a1 = Math.PI - a0;
    for (let i = 1; i < seg * 2; i++) { const a = a0 + ((a1 - a0) * i) / (seg * 2); pts.push([r * Math.cos(a), cy + r * Math.sin(a)]); } }
  if (kind === "pointed" || kind === "mughal") { const r = (rise * rise + half * half) / (2 * half); // two arcs, centres on the springing line
    const cR = [half - r, s], cL = [-half + r, s]; const aR0 = 0, aR1 = Math.acos(Math.min(1, (0 - cR[0]) / r));
    for (let i = 1; i <= seg; i++) { const a = aR0 + ((aR1 - aR0) * i) / seg; pts.push([cR[0] + r * Math.cos(a), s + r * Math.sin(a)]); }
    for (let i = seg - 1; i >= 1; i--) { const a = aR0 + ((aR1 - aR0) * i) / seg; pts.push([cL[0] - r * Math.cos(a), s + r * Math.sin(a)]); } }
  pts.push([-half, s]);
  return pts;
}
/** A prism with an arch outline, standing at `at` (x, y, z) along a wall direction, `depth` thick (centred). */
export function openingSolid(sp) {
  const o = archOutline(sp.width, sp.height, sp.arch || "semi"); const a = ((sp.dir_deg || 0) * Math.PI) / 180; const d = [Math.cos(a), Math.sin(a)], nrm = [-d[1], d[0]]; const [x, y, z] = sp.at; const t = sp.depth / 2;
  const ring = (k) => o.map(([u, v]) => [x + u * d[0] + nrm[0] * k, y + u * d[1] + nrm[1] * k, z + v + (sp.base || 0)]);
  const verts = [...ring(-t), ...ring(t)], m = o.length, faces = [[...Array(m).keys()], [...Array(m).keys()].map((k) => m + k).reverse()];
  for (let k = 0; k < m; k++) { const k2 = (k + 1) % m; faces.push([k, m + k, m + k2, k2]); }
  return finish(verts, faces);
}
const CSG = new Map();
export function csgSolid(sp) {
  const key = JSON.stringify([sp.op, sp.a, sp.tools]); if (CSG.has(key)) return CSG.get(key);
  const K = needKernel(); let m = toManifold(specSolid(sp.a), triangulate);
  for (const t of sp.tools || []) { const tm = toManifold(specSolid(t), triangulate); m = sp.op === "union" ? m.add(tm) : sp.op === "intersect" ? m.intersect(tm) : m.subtract(tm); }
  const r = fromManifold(m); void K; const out = finish(r.verts, r.faces); if (CSG.size > 500) CSG.clear(); CSG.set(key, out); return out;
}
export function groupSolid(sp) {
  const verts = [], faces = [];
  for (const part of sp.parts || []) { const s = specSolid(part); const o = verts.length; verts.push(...s.verts); for (const f of s.faces) faces.push(f.map((i) => i + o)); }
  return finish(verts, faces);
}

/** Move/rotate a geometry spec (for arrays, family placement). rot_deg turns about [cx, cy] in plan. */
export function transformSpec(sp, { dx = 0, dy = 0, dz = 0, rot_deg = 0, cx = 0, cy = 0 } = {}) {
  const a = (rot_deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const P = (p) => { const x = p[0] - cx, y = p[1] - cy; return [Math.round((cx + x * c - y * s + dx) * 1000) / 1000, Math.round((cy + x * s + y * c + dy) * 1000) / 1000, ...(p.length > 2 ? [p[2] + dz] : [])]; };
  const V = (v) => [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  const o = { ...sp };
  if (o.shape === "box") { if (rot_deg) { o.shape = "extrude"; o.outline = [[o.min[0], o.min[1]], [o.max[0], o.min[1]], [o.max[0], o.max[1]], [o.min[0], o.max[1]]].map(P); o.base = o.min[2] + dz; o.height = o.max[2] - o.min[2]; delete o.min; delete o.max; return o; }
    o.min = [o.min[0] + dx, o.min[1] + dy, o.min[2] + dz]; o.max = [o.max[0] + dx, o.max[1] + dy, o.max[2] + dz]; return o; }
  if (o.outline) o.outline = o.outline.map(P); if (o.center) o.center = P(o.center); if (o.path) o.path = o.path.map((p) => P([p[0], p[1], p[2] || 0])); if (o.at) o.at = P(o.at);
  if (o.pivot) o.pivot = P(o.pivot); if (o.top_shift) o.top_shift = V(o.top_shift); if (o.dir_deg != null || o.shape === "opening") o.dir_deg = (o.dir_deg || 0) + rot_deg; if (o.lean_dir_deg != null) o.lean_dir_deg += rot_deg;
  if (["extrude", "revolve", "sweep"].includes(o.shape || "extrude") && !o.at) o.base = (o.base || 0) + (o.path ? 0 : dz);
  if (o.a) o.a = transformSpec(o.a, { dx, dy, dz, rot_deg, cx, cy }); if (o.tools) o.tools = o.tools.map((t) => transformSpec(t, { dx, dy, dz, rot_deg, cx, cy })); if (o.parts) o.parts = o.parts.map((t) => transformSpec(t, { dx, dy, dz, rot_deg, cx, cy }));
  return o;
}

export const MASS_CLASSES = ["IfcBuildingElementProxy", "IfcColumn", "IfcBeam", "IfcMember", "IfcSlab", "IfcRoof", "IfcWall", "IfcPlate", "IfcFooting", "IfcCovering", "IfcRailing", "IfcStair"];
