// Model -> triangles in world mm (x, y plan, z up, level elevations applied), per element, without three.js,
// so drawings can be made headless (MCP, CI) as well as in the browser. Also: ear-clipping triangulation and
// feature-edge extraction for hidden-line drawings.
import { solidOf } from "../author/solids.js";
import { dist, norm, sub, add, mul, perp, polygonArea } from "../author/geom.js";

/** Ear clipping for a simple polygon [[x,y],...] -> index triples. */
export function triangulate(poly) {
  const n = poly.length; if (n < 3) return [];
  const idx = [...Array(n).keys()]; if (polygonArea(poly) < 0) idx.reverse();
  const out = []; const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cr(a, b, p) >= -1e-9 && cr(b, c, p) >= -1e-9 && cr(c, a, p) >= -1e-9;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = poly[i0], b = poly[i1], c = poly[i2]; if (cr(a, b, c) <= 1e-9) continue;
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inside(poly[j], a, b, c))) continue;
      out.push([i0, i1, i2]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break; // degenerate: fall back to a fan for the rest
  }
  for (let k = 1; k < idx.length - 1; k++) out.push([idx[0], idx[k], idx[k + 1]]);
  return out;
}

function pushBox(T, a, b, t, z0, z1) { // a wall-like box along a-b, thickness t
  if (dist(a, b) < 1 || z1 - z0 < 1) return;
  const d = norm(sub(b, a)), n = mul(perp(d), t / 2);
  const q = [add(a, n), add(b, n), sub(b, n), sub(a, n)];
  pushPrism(T, q, z0, z1);
}
function pushPrism(T, poly, z0, z1) {
  const tri = triangulate(poly);
  for (const [i, j, k] of tri) { T.push(poly[i][0], poly[i][1], z1, poly[j][0], poly[j][1], z1, poly[k][0], poly[k][1], z1); T.push(poly[i][0], poly[i][1], z0, poly[k][0], poly[k][1], z0, poly[j][0], poly[j][1], z0); }
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length];
    T.push(p[0], p[1], z0, q[0], q[1], z0, q[0], q[1], z1, p[0], p[1], z0, q[0], q[1], z1, p[0], p[1], z1); }
}

/** [{id, kind, cls, tris: number[] (x,y,z * 3 per triangle)}] */
export function modelTriangles(model) {
  const out = []; const elev = (lv) => model.level(lv).elevation;
  for (const w of model.elements.filter((e) => e.kind === "wall")) {
    const t = model.type("wall", w.type), H = model.wallHeight(w), z = elev(w.level);
    const { ea, eb } = model.wallExtents(w); const dir = norm(sub(w.b, w.a)); const L = dist(w.a, w.b); const at = (d) => add(w.a, mul(dir, d));
    const T = []; const spans = model.hosted(w.id).map((o) => model.openingSpan(o)).sort((p, q) => p.from - q.from); let s = -ea;
    for (const sp of spans) {
      pushBox(T, at(s), at(sp.from), t.thickness, z, z + H);
      if (sp.sill > 0) pushBox(T, at(sp.from), at(sp.to), t.thickness, z, z + sp.sill);
      if (sp.sill + sp.height < H) pushBox(T, at(sp.from), at(sp.to), t.thickness, z + sp.sill + sp.height, z + H);
      s = sp.to;
    }
    pushBox(T, at(s), at(L + eb), t.thickness, z, z + H);
    out.push({ id: w.id, kind: "wall", cls: "IfcWall", tris: T });
    for (const o of model.hosted(w.id)) { const sp = model.openingSpan(o); const P = [];
      pushBox(P, at(sp.from), at(sp.to), o.kind === "door" ? 50 : 30, z + sp.sill, z + sp.sill + sp.height); out.push({ id: o.id, kind: o.kind, cls: o.kind === "door" ? "IfcDoor" : "IfcWindow", tris: P }); }
  }
  for (const f of model.elements.filter((e) => e.kind === "floor" || e.kind === "roof")) {
    const th = model.type(f.kind, f.type).thickness, z = elev(f.level), T = [];
    if (f.kind === "floor") pushPrism(T, f.boundary, z + (f.offset || 0) - th, z + (f.offset || 0)); else pushPrism(T, f.boundary, z, z + th);
    out.push({ id: f.id, kind: f.kind, cls: "IfcSlab", tris: T });
  }
  for (const e of model.elements.filter((x) => x.kind === "mass")) {
    const s = solidOf(e), z = elev(e.level), T = [];
    for (const f of s.faces) {
      const V = f.map((i) => s.verts[i]);
      let tris;
      if (V.length === 3) tris = [[0, 1, 2]];
      else { // project the face to its dominant plane and ear-clip (caps can be concave)
        let nx = 0, ny = 0, nz = 0; for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
        const ax = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
        const P = V.map((v) => (ax === 0 ? [v[1], v[2]] : ax === 1 ? [v[2], v[0]] : [v[0], v[1]]));
        tris = triangulate(P); const sgn = (ax === 0 ? nx : ax === 1 ? ny : nz) >= 0;
        // keep the face's winding (triangulate returns CCW in the projection)
        if (!sgn) tris = tris.map(([a, b, c]) => [a, c, b]);
      }
      for (const [a, b, c] of tris) for (const k of [a, b, c]) T.push(V[k][0], V[k][1], V[k][2] + z);
    }
    out.push({ id: e.id, kind: "mass", cls: e.ifc_class || "IfcBuildingElementProxy", tris: T, name: e.name });
  }
  return out;
}

/** Edges worth drawing: boundary edges and creases sharper than `angle` degrees (smooth curved surfaces stay clean). */
export function featureEdges(tris, angle = 20, proj = null) {
  const key = (x, y, z) => `${Math.round(x * 2)},${Math.round(y * 2)},${Math.round(z * 2)}`;
  const E = new Map(); const cosT = Math.cos((angle * Math.PI) / 180);
  for (let i = 0; i < tris.length; i += 9) {
    const p = [[tris[i], tris[i + 1], tris[i + 2]], [tris[i + 3], tris[i + 4], tris[i + 5]], [tris[i + 6], tris[i + 7], tris[i + 8]]];
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n); if (l < 1e-9) continue; n = n.map((x) => x / l);
    for (let k = 0; k < 3; k++) {
      const a = p[k], b = p[(k + 1) % 3]; const ka = key(...a), kb = key(...b); if (ka === kb) continue;
      const kk = ka < kb ? ka + "|" + kb : kb + "|" + ka; const e = E.get(kk);
      const c = p[(k + 2) % 3]; // the triangle's third vertex: tells which side of the edge the face lies on
      if (e) { e.n.push(n); e.c.push(c); } else E.set(kk, { a, b, n: [n], c: [c] });
    }
  }
  const out = [];
  for (const e of E.values()) {
    if (e.n.length !== 2) { out.push([e.a, e.b]); continue; }
    const [n1, n2] = e.n; if (Math.abs(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) < cosT) { out.push([e.a, e.b]); continue; } // abs: winding may differ between generators
    if (proj) { // silhouette: both faces project to the same side of the edge (the surface turns away), winding-independent
      const A = proj(e.a), B = proj(e.b), side = (q) => { const Q = proj(q); return (B[0] - A[0]) * (Q[1] - A[1]) - (B[1] - A[1]) * (Q[0] - A[0]); };
      const s1 = side(e.c[0]), s2 = side(e.c[1]); if (s1 * s2 > 0) out.push([e.a, e.b]);
    }
  }
  return out;
}
