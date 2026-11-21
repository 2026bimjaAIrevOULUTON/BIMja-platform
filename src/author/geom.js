// 2D geometry helpers (mm). No DOM, no three.js: shared by the model, the plan view, the 3D builder and the IFC writer.
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => len(sub(a, b));
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const perp = (a) => [-a[1], a[0]];
export const near = (a, b, tol = 1) => dist(a, b) <= tol;

export function polygonArea(poly) { // signed, CCW positive
  let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2;
}
export function polygonPerimeter(poly) { let s = 0; for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]); return s; }
export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Closest point on segment ab to p, with its parameter t in [0,1] and distance. */
export function projectToSegment(p, a, b) {
  const ab = sub(b, a), L2 = dot(ab, ab) || 1; const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2));
  const q = add(a, mul(ab, t)); return { t, point: q, d: dist(p, q) };
}
function segIntersect(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), rxs = cross(r, s); if (Math.abs(rxs) < 1e-9) return null;
  const t = cross(sub(c, a), s) / rxs, u = cross(sub(c, a), r) / rxs;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u, p: add(a, mul(r, t)) };
}

/**
 * Faces of the planar graph made by segments (wall centre lines), splitting at crossings and T-junctions.
 * Returns bounded faces as CCW polygons. Used to find the room around a point and the outline of the walls.
 */
export function planarFaces(segments, tol = 1, { outer = false } = {}) {
  const pts = []; const key = (p) => { let i = pts.findIndex((q) => near(p, q, tol)); if (i < 0) { pts.push(p); i = pts.length - 1; } return i; };
  const cuts = segments.map(([a, b]) => [0, 1].map((t) => ({ t, p: t ? b : a })));
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const x = segIntersect(...segments[i], ...segments[j]); if (!x) continue;
    cuts[i].push({ t: x.t, p: x.p }); cuts[j].push({ t: x.u, p: x.p });
  }
  const edges = new Set(); const adj = new Map();
  for (const cs of cuts) {
    cs.sort((m, n) => m.t - n.t);
    for (let k = 0; k + 1 < cs.length; k++) {
      const u = key(cs[k].p), v = key(cs[k + 1].p); if (u === v || edges.has(`${u},${v}`)) continue;
      edges.add(`${u},${v}`); edges.add(`${v},${u}`);
      (adj.get(u) || adj.set(u, []).get(u)).push(v); (adj.get(v) || adj.set(v, []).get(v)).push(u);
    }
  }
  const ang = (u, v) => Math.atan2(pts[v][1] - pts[u][1], pts[v][0] - pts[u][0]);
  for (const [u, list] of adj) list.sort((a, b) => ang(u, a) - ang(u, b));
  const used = new Set(); const faces = [];
  for (const e of edges) {
    if (used.has(e)) continue;
    let [u, v] = e.split(",").map(Number); const start = e; const cyc = [];
    for (let guard = 0; guard < 10000; guard++) {
      used.add(`${u},${v}`); cyc.push(pts[u]);
      const list = adj.get(v); const i = list.indexOf(u);
      const w = list[(i - 1 + list.length) % list.length]; // next edge turning most to the left keeps the face on the left
      u = v; v = w; if (`${u},${v}` === start) break;
    }
    if (cyc.length < 3) continue;
    const A = polygonArea(cyc);
    if (outer ? A < -tol : A > tol) faces.push(outer ? cyc.slice().reverse() : cyc);
  }
  return faces;
}

/** Offset a simple polygon outward (d>0) or inward (d<0) by mitred edges. Works for CCW polygons. */
export function offsetPolygon(poly, d) {
  const n = poly.length; const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i - 1 + n) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const n1 = perp(norm(sub(p1, p0))).map((x) => -x), n2 = perp(norm(sub(p2, p1))).map((x) => -x); // outward normals for CCW
    const bis = norm(add(n1, n2)); const c = dot(bis, n1) || 1;
    out.push(add(p1, mul(bis, d / Math.max(c, 0.2))));
  }
  return out;
}
