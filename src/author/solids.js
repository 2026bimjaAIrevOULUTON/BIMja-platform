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

export const solidOf = (e) => (e.kind === "mass" ? (e.shape === "revolve" ? revolveSolid(e) : massSolid(e)) : null);

export const MASS_CLASSES = ["IfcBuildingElementProxy", "IfcColumn", "IfcBeam", "IfcMember", "IfcSlab", "IfcRoof", "IfcWall", "IfcPlate", "IfcFooting", "IfcCovering", "IfcRailing", "IfcStair"];
