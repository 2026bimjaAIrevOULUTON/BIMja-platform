// Authored model -> three.js meshes. Plan (x, y) in mm maps to three (x, -z) in metres, up is +y.
import * as THREE from "three";
import { dist, norm, sub, add, mul, perp } from "./geom.js";
import { solidOf } from "./solids.js";

const M = 1 / 1000;
const COLORS = { wall: 0xd9dde3, wallInt: 0xc9ced6, door: 0x9a6b3f, window: 0x7cc4ff, floor: 0xb9bec7, roof: 0x8c939e, room: 0x5adcff };
const mats = {};
const mat = (key, color, opts = {}) => (mats[key] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide, ...opts }));

function boxAlong(a, b, t, z0, z1, material, userData) {
  const L = dist(a, b); if (L < 1 || z1 - z0 < 1) return null;
  const g = new THREE.BoxGeometry(L * M, (z1 - z0) * M, t * M);
  const mesh = new THREE.Mesh(g, material);
  const c = mul(add(a, b), 0.5);
  mesh.position.set(c[0] * M, ((z0 + z1) / 2) * M, -c[1] * M);
  mesh.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
  mesh.userData = userData; return mesh;
}
function slab(boundary, z0, z1, material, userData) {
  const shape = new THREE.Shape(boundary.map((p) => new THREE.Vector2(p[0] * M, p[1] * M)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: (z1 - z0) * M, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // shape XY -> XZ with y up (plan y becomes -z)
  const mesh = new THREE.Mesh(g, material); mesh.position.y = z0 * M; mesh.userData = userData; return mesh;
}

/** Build a THREE.Group for the authored model. Each mesh carries userData {authoredId, kind}. */
export function buildAuthored(model) {
  const group = new THREE.Group(); group.name = "authored";
  const elev = (lv) => model.level(lv).elevation;
  for (const w of model.elements.filter((e) => e.kind === "wall")) {
    const t = model.type("wall", w.type), H = model.wallHeight(w), z = elev(w.level);
    const { ea, eb } = model.wallExtents(w); const dir = norm(sub(w.b, w.a)); const L = dist(w.a, w.b);
    const A = add(w.a, mul(dir, -ea)), m = t.isExternal ? mat("wall", COLORS.wall) : mat("wallInt", COLORS.wallInt);
    const ud = { authoredId: w.id, kind: "wall" };
    // pieces between openings (along the extended wall): full height where solid, below sill and above head at openings
    const spans = model.hosted(w.id).map((o) => model.openingSpan(o)).sort((p, q) => p.from - q.from);
    let s = -ea; const at = (d) => add(w.a, mul(dir, d));
    for (const sp of spans) {
      group.add(boxAlong(at(s), at(sp.from), t.thickness, z, z + H, m, ud));
      if (sp.sill > 0) group.add(boxAlong(at(sp.from), at(sp.to), t.thickness, z, z + sp.sill, m, ud));
      if (sp.sill + sp.height < H) group.add(boxAlong(at(sp.from), at(sp.to), t.thickness, z + sp.sill + sp.height, z + H, m, ud));
      s = sp.to;
    }
    group.add(boxAlong(at(s), at(L + eb), t.thickness, z, z + H, m, ud));
    for (const o of model.hosted(w.id)) {
      const sp = model.openingSpan(o);
      const panel = boxAlong(at(sp.from), at(sp.to), o.kind === "door" ? 50 : 30, z + sp.sill, z + sp.sill + sp.height,
        o.kind === "door" ? mat("door", COLORS.door) : mat("window", COLORS.window, { transparent: true, opacity: 0.55 }), { authoredId: o.id, kind: o.kind });
      group.add(panel);
    }
    void A;
  }
  for (const f of model.elements.filter((e) => e.kind === "floor")) {
    const t = model.type("floor", f.type).thickness, top = elev(f.level) + (f.offset || 0);
    group.add(slab(f.boundary, top - t, top, mat("floor", COLORS.floor), { authoredId: f.id, kind: "floor" }));
  }
  for (const r of model.elements.filter((e) => e.kind === "roof")) {
    const t = model.type("roof", r.type).thickness, z = elev(r.level);
    const b = r.overhang ? offset(r.boundary, r.overhang) : r.boundary;
    group.add(slab(b, z, z + t, mat("roof", COLORS.roof), { authoredId: r.id, kind: "roof" }));
  }
  for (const r of model.elements.filter((e) => e.kind === "room")) {
    const z = elev(r.level) + 5; const m = slab(r.boundary, z, z + 10, mat("room", COLORS.room, { transparent: true, opacity: 0.18, depthWrite: false }), { authoredId: r.id, kind: "room", isSpace: true });
    m.visible = false; group.add(m);
  }
  const MASS_COLORS = { Glass: 0x9fc6dc, Marble: 0xf1ede4, Stone: 0xb8ab94, Concrete: 0xc4c2bc, Steel: 0x9aa0a8, Brick: 0xb0715a, Timber: 0xa77a4f };
  for (const e of model.elements.filter((x) => x.kind === "mass")) {
    const sol = solidOf(e); const z = elev(e.level); const pos = [];
    for (const f of sol.faces) {
      // fan-triangulate planar faces (caps may be concave: use three's triangulator for those)
      if (f.length > 4) { const pts = f.map((i) => sol.verts[i]); const nz = Math.sign(pts.reduce((acc, p, i) => { const q = pts[(i + 1) % pts.length]; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0)) || 1;
        const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
        for (const t of tris) { const o = nz > 0 ? t : [t[0], t[2], t[1]]; for (const k of o) { const v = pts[k]; pos.push(v[0] * M, (v[2] + z) * M, -v[1] * M); } } continue; }
      for (let i = 1; i < f.length - 1; i++) for (const k of [f[0], f[i], f[i + 1]]) { const v = sol.verts[k]; pos.push(v[0] * M, (v[2] + z) * M, -v[1] * M); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const color = e.color ? parseInt(e.color.slice(1), 16) : MASS_COLORS[e.material] ?? 0xd9dde3;
    const glassy = e.material === "Glass";
    const mesh = new THREE.Mesh(g, mat(`mass/${color}/${glassy}`, color, glassy ? { transparent: true, opacity: 0.8, roughness: 0.25, metalness: 0.1 } : { flatShading: e.shape !== "revolve" }));
    mesh.userData = { authoredId: e.id, kind: "mass" }; group.add(mesh);
  }
  group.children = group.children.filter(Boolean);
  for (const c of group.children) { c.userData.baseMat = c.material; c.userData.expressID = c.userData.authoredId; c.userData.ifcClass = c.userData.kind; }
  return group;
}
function offset(poly, d) { // outward offset for CCW polygons via edge normals
  const n = poly.length; return poly.map((p, i) => {
    const p0 = poly[(i - 1 + n) % n], p2 = poly[(i + 1) % n];
    const n1 = perp(norm(sub(p, p0))).map((x) => -x), n2 = perp(norm(sub(p2, p))).map((x) => -x);
    const bis = norm(add(n1, n2)); const c = bis[0] * n1[0] + bis[1] * n1[1] || 1; return add(p, mul(bis, d / Math.max(c, 0.3)));
  });
}
