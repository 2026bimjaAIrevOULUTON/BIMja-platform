// Clash detection: AABB sweep broad phase, triangle SAT narrow phase, point-in-mesh containment, clearance.
// Pure and deterministic (no DOM): runs in a Worker in the app and in Node for tests. Units: metres, world frame.
//   element: { key, globalId, ifcClass, name, model, tris: Float64Array (9 numbers per triangle) }
//   options: { tolerance (m, hard clashes must penetrate deeper than this), clearance (m, soft), ignore(a,b) -> bool }

export function bbox(tris) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) { for (let k = 0; k < 3; k++) { const v = tris[i + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; } }
  return b;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tri = (t, i) => [[t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]]];

/** Separating-axis test for two triangles (handles coplanar triangles). eps > 0 treats touching as not intersecting. */
export function triTri(A, B, eps = 1e-9) {
  const ea = [sub(A[1], A[0]), sub(A[2], A[1]), sub(A[0], A[2])], eb = [sub(B[1], B[0]), sub(B[2], B[1]), sub(B[0], B[2])];
  const na = crs(ea[0], ea[1]), nb = crs(eb[0], eb[1]);
  const axes = [na, nb]; for (const a of ea) for (const b of eb) axes.push(crs(a, b));
  for (const a of ea) axes.push(crs(na, a)); for (const b of eb) axes.push(crs(nb, b));
  for (const ax of axes) {
    const L = Math.hypot(ax[0], ax[1], ax[2]); if (L < 1e-12) continue;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const d = dot(p, ax) / L; if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const p of B) { const d = dot(p, ax) / L; if (d < b0) b0 = d; if (d > b1) b1 = d; }
    if (a1 < b0 + eps || b1 < a0 + eps) return false;
  }
  return true;
}
const boxHit = (t, i, b) => {
  for (let k = 0; k < 3; k++) { const v0 = t[i + k], v1 = t[i + 3 + k], v2 = t[i + 6 + k]; if (Math.max(v0, v1, v2) < b[k] || Math.min(v0, v1, v2) > b[k + 3]) return false; }
  return true;
};
function rayHits(t, p) { // +X ray parity for point-in-closed-mesh
  let n = 0; const d = [1, 0.000123, 0.000317];
  for (let i = 0; i < t.length; i += 9) {
    const [v0, v1, v2] = tri(t, i), e1 = sub(v1, v0), e2 = sub(v2, v0), h = crs(d, e2), a = dot(e1, h); if (Math.abs(a) < 1e-14) continue;
    const f = 1 / a, s = sub(p, v0), u = f * dot(s, h); if (u < 0 || u > 1) continue; const q = crs(s, e1), v = f * dot(d, q); if (v < 0 || u + v > 1) continue;
    if (f * dot(e2, q) > 1e-9) n++;
  }
  return n % 2 === 1;
}
const severity = (pen, tol) => (pen >= 0.15 ? "critical" : pen >= 0.05 ? "high" : pen > tol ? "medium" : "low");

export function clash(setA, setB, { tolerance = 0.01, clearance = 0, ignore = () => false, maxResults = 5000 } = {}) {
  const t0 = Date.now();
  const prep = (e) => (e.box ||= bbox(e.tris), e);
  const A = setA.map(prep).filter((e) => e.tris.length), B = setB === setA ? A : setB.map(prep).filter((e) => e.tris.length);
  const same = setB === setA;
  // sweep along x
  const evs = [...A.map((e, i) => ({ x: e.box[0] - clearance, e, s: 0, i })), ...(same ? [] : B.map((e, i) => ({ x: e.box[0] - clearance, e, s: 1, i })))].sort((p, q) => p.x - q.x || p.s - q.s || p.i - q.i);
  const activeA = [], activeB = []; const pairs = [];
  for (const ev of evs) {
    const prune = (arr) => { for (let k = arr.length - 1; k >= 0; k--) if (arr[k].box[3] + clearance < ev.x) arr.splice(k, 1); };
    prune(activeA); prune(activeB);
    const others = same ? activeA : ev.s === 0 ? activeB : activeA;
    for (const o of others) pairs.push(same || ev.s === 1 ? [o, ev.e] : [ev.e, o]);
    (same || ev.s === 0 ? activeA : activeB).push(ev.e);
  }
  const out = []; let tested = 0;
  for (const [a, b] of pairs) {
    if (a.key === b.key || ignore(a, b)) continue;
    const ov = [Math.max(a.box[0], b.box[0]), Math.max(a.box[1], b.box[1]), Math.max(a.box[2], b.box[2]), Math.min(a.box[3], b.box[3]), Math.min(a.box[4], b.box[4]), Math.min(a.box[5], b.box[5])];
    const gap = Math.max(ov[0] - ov[3], ov[1] - ov[4], ov[2] - ov[5]);
    if (gap > clearance) continue;
    tested++;
    let hit = false;
    if (gap < 0) {
      const pen = Math.min(ov[3] - ov[0], ov[4] - ov[1], ov[5] - ov[2]);
      if (pen > tolerance) {
        const bb = [ov[0] - 1e-6, ov[1] - 1e-6, ov[2] - 1e-6, ov[3] + 1e-6, ov[4] + 1e-6, ov[5] + 1e-6];
        const ta = [], tb = []; for (let i = 0; i < a.tris.length; i += 9) if (boxHit(a.tris, i, bb)) ta.push(i); for (let i = 0; i < b.tris.length; i += 9) if (boxHit(b.tris, i, bb)) tb.push(i);
        outer: for (const i of ta) { const T = tri(a.tris, i); for (const j of tb) if (triTri(T, tri(b.tris, j), 1e-7)) { hit = true; break outer; } }
        if (!hit) { // one fully inside the other?
          const small = (a.box[3] - a.box[0]) * (a.box[4] - a.box[1]) * (a.box[5] - a.box[2]) < (b.box[3] - b.box[0]) * (b.box[4] - b.box[1]) * (b.box[5] - b.box[2]) ? a : b, big = small === a ? b : a;
          const p = [small.tris[0], small.tris[1], small.tris[2]]; if (rayHits(big.tris, p)) hit = true;
        }
        if (hit) { out.push(rec(a, b, "hard", pen, ov, severity(pen, tolerance))); if (out.length >= maxResults) break; continue; }
      }
    }
    if (clearance > 0 && !hit && gap <= clearance) out.push(rec(a, b, "clearance", 0, ov, "low", Math.max(0, gap)));
  }
  out.sort((p, q) => q.penetration - p.penetration || (p.a.key < q.a.key ? -1 : p.a.key > q.a.key ? 1 : 0) || (p.b.key < q.b.key ? -1 : 1));
  return { clashes: out, stats: { a: A.length, b: B.length, candidates: pairs.length, narrow: tested, ms: Date.now() - t0 } };
}
function rec(a, b, type, pen, ov, sev, gap) {
  const r = (v) => Math.round(v * 1000) / 1000;
  const point = [r((ov[0] + ov[3]) / 2), r((ov[1] + ov[4]) / 2), r((ov[2] + ov[5]) / 2)];
  const s = (e) => ({ key: e.key, globalId: e.globalId, ifcClass: e.ifcClass, name: e.name, model: e.model });
  return { a: s(a), b: s(b), type, severity: sev, penetration: r(pen), ...(gap !== undefined ? { gap: r(gap) } : {}), point };
}

/** World-space triangles for every element of an opened model (src/ifc.js openModel output). Y-up as web-ifc gives it. */
export function trianglesFromModel(model, { offset = [0, 0, 0] } = {}) {
  const out = new Map();
  for (const m of model.meshes) {
    const list = [];
    for (const g of m.geometries) {
      const M = g.matrix; const P = g.positions, I = g.index; const arr = new Float64Array(I.length * 3);
      for (let k = 0; k < I.length; k++) { const j = I[k] * 3, x = P[j], y = P[j + 1], z = P[j + 2];
        arr[k * 3] = M[0] * x + M[4] * y + M[8] * z + M[12] - offset[0]; arr[k * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13] - offset[1]; arr[k * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14] - offset[2]; }
      list.push(arr);
    }
    const total = list.reduce((s, a) => s + a.length, 0), t = new Float64Array(total); let p = 0; for (const a of list) { t.set(a, p); p += a.length; }
    out.set(m.expressID, t);
  }
  return out;
}
