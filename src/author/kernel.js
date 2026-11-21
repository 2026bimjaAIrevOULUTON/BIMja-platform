// Geometry kernel for booleans: Manifold (Apache-2.0, WebAssembly, lazy-loaded). Robust mesh CSG: difference,
// union, intersection on closed solids. Loaded once; after that every operation is synchronous, so commands
// stay synchronous and replayable.
let K = null, loading = null;
export async function loadKernel() {
  if (K) return K;
  loading ||= (async () => {
    const mod = (await import("manifold-3d")).default;
    let opts = {};
    if (typeof window !== "undefined") { const url = (await import("manifold-3d/manifold.wasm?url")).default; opts = { locateFile: () => url }; }
    const m = await mod(opts); m.setup(); K = m; return m;
  })();
  return loading;
}
export const kernel = () => K;
export function needKernel() { if (!K) { loadKernel(); throw Object.assign(new Error("the geometry kernel is loading; try again in a moment"), { code: "unavailable" }); } return K; }

/** {verts, faces} (polygons, mm) -> Manifold. */
export function toManifold(sol, triangulate) {
  const k = needKernel(); const key = new Map(), vp = [], tv = [];
  const vid = (v) => { const s = `${Math.round(v[0] * 100)},${Math.round(v[1] * 100)},${Math.round(v[2] * 100)}`; let i = key.get(s); if (i == null) { i = vp.length / 3; key.set(s, i); vp.push(v[0], v[1], v[2]); } return i; };
  const ids = sol.verts.map(vid);
  for (const f of sol.faces) {
    if (f.length === 3) { tv.push(ids[f[0]], ids[f[1]], ids[f[2]]); continue; }
    const V = f.map((i) => sol.verts[i]); let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const ax = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
    const P = V.map((v) => (ax === 0 ? [v[1], v[2]] : ax === 1 ? [v[2], v[0]] : [v[0], v[1]])); let tris = triangulate(P); if ((ax === 0 ? nx : ax === 1 ? ny : nz) < 0) tris = tris.map(([a, b, c]) => [a, c, b]);
    for (const [a, b, c] of tris) { const A = ids[f[a]], B = ids[f[b]], C = ids[f[c]]; if (A !== B && B !== C && A !== C) tv.push(A, B, C); }
  }
  const mesh = new k.Mesh({ numProp: 3, vertProperties: new Float32Array(vp), triVerts: new Uint32Array(tv) });
  const m = new k.Manifold(mesh); return m;
}
export function fromManifold(m) {
  const mesh = m.getMesh(); const n = mesh.numProp; const verts = []; for (let i = 0; i < mesh.vertProperties.length; i += n) verts.push([mesh.vertProperties[i], mesh.vertProperties[i + 1], mesh.vertProperties[i + 2]]);
  const faces = []; for (let i = 0; i < mesh.triVerts.length; i += 3) faces.push([mesh.triVerts[i], mesh.triVerts[i + 1], mesh.triVerts[i + 2]]);
  return { verts, faces };
}
