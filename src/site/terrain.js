// Terrain from survey points: Delaunay TIN, a regular height grid, contours (marching squares), and grading
// (a building platform with cut and fill batters that daylight into the existing ground) with volumes.
// Units here: metres. Plan coordinates are local (site origin or the georeference anchor), Z is the survey datum.
import Delaunator from "delaunator";

export function buildTIN(points) {
  const d = Delaunator.from(points, (p) => p[0], (p) => p[1]); const T = d.triangles;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  // bucket triangles for point location
  const nb = Math.max(1, Math.min(200, Math.ceil(Math.sqrt(T.length / 3 / 4)))); const bw = (x1 - x0) / nb || 1, bh = (y1 - y0) / nb || 1; const buckets = Array.from({ length: nb * nb }, () => []);
  for (let t = 0; t < T.length; t += 3) {
    const a = points[T[t]], b = points[T[t + 1]], c = points[T[t + 2]];
    const ia = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / bw)), ib = Math.min(nb - 1, Math.floor((Math.max(a[0], b[0], c[0]) - x0) / bw));
    const ja = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - y0) / bh)), jb = Math.min(nb - 1, Math.floor((Math.max(a[1], b[1], c[1]) - y0) / bh));
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) buckets[j * nb + i].push(t);
  }
  const at = (x, y) => {
    const i = Math.floor((x - x0) / bw), j = Math.floor((y - y0) / bh); if (i < 0 || j < 0 || i >= nb || j >= nb) { if (x === x1 || y === y1) return at(Math.min(x, x1 - 1e-9), Math.min(y, y1 - 1e-9)); return NaN; }
    for (const t of buckets[j * nb + i]) {
      const a = points[T[t]], b = points[T[t + 1]], c = points[T[t + 2]];
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-12) continue;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den, l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a[2] + l2 * b[2] + l3 * c[2];
    }
    return NaN;
  };
  return { points, triangles: T, box: { x0, y0, x1, y1, z0, z1 }, at };
}

/** Regular grid over the TIN (NaN outside the surveyed area). */
export function heightGrid(tin, { cell = null, max = 250 } = {}) {
  const b = tin.box; const c = cell || Math.max(0.25, Math.max(b.x1 - b.x0, b.y1 - b.y0) / max);
  const nx = Math.floor((b.x1 - b.x0) / c) + 1, ny = Math.floor((b.y1 - b.y0) / c) + 1; const z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = tin.at(b.x0 + i * c, b.y0 + j * c);
  return { x0: b.x0, y0: b.y0, cell: c, nx, ny, z };
}

/** Marching squares: contour polylines [{z, pts:[[x,y],...]}]. */
export function contours(grid, interval) {
  const { x0, y0, cell: c, nx, ny, z } = grid; let lo = Infinity, hi = -Infinity; for (const v of z) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) return [];
  const out = [];
  for (let L = Math.ceil(lo / interval) * interval; L <= hi; L = +(L + interval).toFixed(6)) {
    const segs = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const q = [z[j * nx + i], z[j * nx + i + 1], z[(j + 1) * nx + i + 1], z[(j + 1) * nx + i]]; if (q.some((v) => !Number.isFinite(v))) continue;
      const P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]; const cut = [];
      for (let k = 0; k < 4; k++) { const a = q[k] - L, b = q[(k + 1) % 4] - L; if ((a < 0) !== (b < 0)) { const t = a / (a - b); const A = P[k], B = P[(k + 1) % 4]; cut.push([x0 + (A[0] + (B[0] - A[0]) * t) * c, y0 + (A[1] + (B[1] - A[1]) * t) * c]); } }
      if (cut.length === 2) segs.push(cut); else if (cut.length === 4) { segs.push([cut[0], cut[1]], [cut[2], cut[3]]); }
    }
    for (const pts of chain(segs)) if (pts.length > 2) out.push({ z: +L.toFixed(3), pts });
  }
  return out;
}
function chain(segs) {
  const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`; const ends = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); (ends.get(k) || ends.set(k, []).get(k)).push([i, e]); } });
  const used = new Uint8Array(segs.length), out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1; let line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) { let end = dir ? line[line.length - 1] : line[0];
      for (;;) { const n = (ends.get(key(end)) || []).find(([j]) => !used[j]); if (!n) break; used[n[0]] = 1; end = segs[n[0]][1 - n[1]]; if (dir) line.push(end); else line.unshift(end); } }
    out.push(line);
  }
  return out;
}
export function autoInterval(range) { for (const s of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50]) if (range / s <= 40) return s; return 100; }

function distToPoly(p, poly) {
  let inside = false, d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return inside ? 0 : d;
}

/**
 * Grading: a level platform (pad) at pad_z inside pad, batters outside (cut H:V = cut_slope, fill H:V = fill_slope)
 * until they meet the existing ground. Returns the proposed grid and earthworks (m³) and areas (m²).
 */
export function grade(grid, { pad, pad_z, cut_slope = 1, fill_slope = 2 }) {
  const { x0, y0, cell: c, nx, ny, z } = grid; const p = new Float64Array(nx * ny); let cut = 0, fill = 0, cutA = 0, fillA = 0, disturbed = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, e = z[k]; if (!Number.isFinite(e)) { p[k] = NaN; continue; }
    const d = distToPoly([x0 + i * c, y0 + j * c], pad);
    const v = d === 0 ? pad_z : e > pad_z ? Math.min(e, pad_z + d / cut_slope) : Math.max(e, pad_z - d / fill_slope);
    p[k] = v; const dz = e - v; const A = c * c;
    if (dz > 1e-6) { cut += dz * A; cutA += A; } else if (dz < -1e-6) { fill -= dz * A; fillA += A; }
    if (Math.abs(dz) > 1e-6 || d === 0) disturbed += A;
  }
  return { grid: { ...grid, z: p }, cut_m3: cut, fill_m3: fill, net_m3: cut - fill, cut_area_m2: cutA, fill_area_m2: fillA, disturbed_m2: disturbed };
}

/** Grid -> triangle list [x,y,z,...] (metres), skipping holes; step thins it for export. */
export function gridTriangles(grid, step = 1) {
  const { x0, y0, cell: c, nx, ny, z } = grid; const T = [];
  for (let j = 0; j + step < ny; j += step) for (let i = 0; i + step < nx; i += step) {
    const a = j * nx + i, b = a + step, d = (j + step) * nx + i, e = d + step; const q = [z[a], z[b], z[e], z[d]]; if (q.some((v) => !Number.isFinite(v))) continue;
    const X = (ii) => x0 + ii * c, Y = (jj) => y0 + jj * c;
    T.push(X(i), Y(j), z[a], X(i + step), Y(j), z[b], X(i + step), Y(j + step), z[e], X(i), Y(j), z[a], X(i + step), Y(j + step), z[e], X(i), Y(j + step), z[d]);
  }
  return T;
}
