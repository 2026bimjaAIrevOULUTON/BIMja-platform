// three.js viewer: builds meshes from openModel() output, picking, isolate, x-ray, section, fit.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export class Viewer {
  constructor(container) {
    this.el = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0c0f13");
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a2230, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(30, 60, 20); this.scene.add(sun);
    this.grid = new THREE.GridHelper(200, 100, 0x263040, 0x161c24); this.scene.add(this.grid);
    this.section = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.auth = new THREE.Group(); this.scene.add(this.auth);
    this.fed = new Map(); // federated models: fid -> group
    this.byId = new Map(); // expressID -> [mesh]
    this.hl = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x552200, side: THREE.DoubleSide, clippingPlanes: [this.section] });
    this.ray = new THREE.Raycaster();
    this.onPick = () => {};
    new ResizeObserver(() => this.resize()).observe(container);
    this.renderer.domElement.addEventListener("pointerdown", (e) => (this._down = [e.clientX, e.clientY]));
    this.renderer.domElement.addEventListener("pointerup", (e) => {
      if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > 4) return;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
      const hit = this.ray.intersectObjects(this.meshes(), false).find((h) => h.object.visible && this._inSection(h.point));
      this.onPick(hit ? hit.object.userData.expressID : null);
    });
    const loop = () => { requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop(); this.resize();
  }
  meshes() { return [...this.root.children, ...this.auth.children, ...[...this.fed.values()].flatMap((g) => g.visible ? g.children : [])]; }
  /** Add a federated model: its meshes get ids "<fid>#<expressID>"; tint helps tell models apart. */
  addModel(fid, model, classOf, tint = 0x7fb3ff) {
    this.removeModel(fid); const g = new THREE.Group(); g.name = fid; this.scene.add(g); this.fed.set(fid, g);
    const mats = new Map();
    for (const m of model.meshes) for (const geo of m.geometries) {
      const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(geo.positions, 3)); bg.setAttribute("normal", new THREE.BufferAttribute(geo.normals, 3)); bg.setIndex(new THREE.BufferAttribute(geo.index, 1));
      const c = geo.color; const key = `${c.x.toFixed(2)}${c.y.toFixed(2)}${c.z.toFixed(2)}${c.w}`;
      if (!mats.has(key)) { const col = new THREE.Color(c.x, c.y, c.z).lerp(new THREE.Color(tint), 0.45); mats.set(key, new THREE.MeshStandardMaterial({ color: col, transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide, roughness: 0.8, clippingPlanes: [this.section] })); }
      const mesh = new THREE.Mesh(bg, mats.get(key)); mesh.applyMatrix4(new THREE.Matrix4().fromArray(geo.matrix));
      const id = `${fid}#${m.expressID}`; const cls = classOf(m.expressID);
      mesh.userData = { expressID: id, ifcClass: cls, baseMat: mesh.material, isSpace: cls === "IfcSpace" }; if (cls === "IfcSpace") mesh.visible = false;
      g.add(mesh); (this.byId.get(id) || this.byId.set(id, []).get(id)).push(mesh);
    }
    g.position.copy(this.root.position); return g;
  }
  removeModel(fid) { const g = this.fed.get(fid); if (!g) return; g.children.forEach((c) => c.geometry.dispose()); this.scene.remove(g); this.fed.delete(fid); for (const k of [...this.byId.keys()]) if (typeof k === "string" && k.startsWith(fid + "#")) this.byId.delete(k); }
  setModelVisible(fid, on) { const g = fid === "main" ? this.root : this.fed.get(fid); if (g) g.visible = on; }
  /** Re-centre models far from the origin (georeferenced coordinates) so the GPU keeps precision; all models share the offset. */
  setOffset(v) { this.offset = v; for (const g of [this.root, ...this.fed.values()]) g.position.set(-v[0], -v[1], -v[2]); } // authored stays local
  /** Camera in BCF terms (IFC world, metres, Z up). */
  getCameraBCF() {
    const o = this.offset || [0, 0, 0]; const p = this.camera.position, d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    const toIfc = (x, y, z) => [x, -z, y];
    return { position: toIfc(p.x + o[0], p.y + o[1], p.z + o[2]), direction: toIfc(d.x, d.y, d.z), up: [0, 0, 1], fov: Math.round(this.camera.fov) };
  }
  setCameraBCF(c) {
    const o = this.offset || [0, 0, 0]; const fromIfc = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
    const p = fromIfc(c.position).sub(new THREE.Vector3(...o)), d = fromIfc(c.direction).normalize();
    this.camera.position.copy(p); this.controls.target.copy(p.clone().add(d.multiplyScalar(10))); this.camera.fov = c.fov || this.camera.fov; this.camera.updateProjectionMatrix();
  }
  setAuthored(group) {
    this.auth.children.slice().forEach((c) => { c.geometry.dispose(); this.auth.remove(c); });
    for (const [id, list] of [...this.byId]) if (typeof id === "string") this.byId.delete(id);
    for (const c of group.children.slice()) { c.material = c.userData.baseMat; this.auth.add(c); (this.byId.get(c.userData.authoredId) || this.byId.set(c.userData.authoredId, []).get(c.userData.authoredId)).push(c); }
    this.highlight(this._hl || [], this._ghost);
  }
  _inSection(p) { return this.section.distanceToPoint(p) >= -1e-6; }
  resize() { const { clientWidth: w, clientHeight: h } = this.el; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  load(model, classOf) {
    this.clear();
    const mats = new Map();
    const matFor = (c) => {
      const key = `${c.x.toFixed(3)}${c.y.toFixed(3)}${c.z.toFixed(3)}${c.w.toFixed(2)}`;
      if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(c.x, c.y, c.z), transparent: c.w < 1, opacity: c.w,
        side: THREE.DoubleSide, roughness: 0.8, metalness: 0.05, clippingPlanes: [this.section], depthWrite: c.w >= 1 }));
      return mats.get(key);
    };
    for (const m of model.meshes) {
      const cls = classOf(m.expressID);
      for (const g of m.geometries) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3));
        geo.setIndex(new THREE.BufferAttribute(g.index, 1));
        const mesh = new THREE.Mesh(geo, matFor(g.color));
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(g.matrix));
        mesh.userData = { expressID: m.expressID, ifcClass: cls, baseMat: mesh.material };
        if (cls === "IfcSpace") { mesh.visible = false; mesh.userData.isSpace = true; }
        this.root.add(mesh);
        (this.byId.get(m.expressID) || this.byId.set(m.expressID, []).get(m.expressID)).push(mesh);
      }
    }
    if (!this.offset) { const b = new THREE.Box3().setFromObject(this.root); const c = b.getCenter(new THREE.Vector3()); if (!b.isEmpty() && c.length() > 1000) this.setOffset([c.x, c.y, c.z]); }
    this.fit();
  }
  clear() { this.root.children.slice().forEach((c) => { c.geometry.dispose(); this.root.remove(c); }); for (const k of [...this.byId.keys()]) if (typeof k === "number") this.byId.delete(k); }
  box(ids) {
    const b = new THREE.Box3();
    (ids ? ids.flatMap((i) => this.byId.get(i) || []) : this.meshes().filter((c) => c.visible)).forEach((m) => b.expandByObject(m));
    return b;
  }
  fit(ids) {
    const b = this.box(ids); if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    let r = b.getSize(new THREE.Vector3()).length() / 2 || 1;
    if (ids && this.modelBox) r = Math.max(r, this.modelBox.getSize(new THREE.Vector3()).length() * 0.18); // keep context around small elements
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(new THREE.Vector3(1, 0.75, 1.1).normalize().multiplyScalar(r * 2.2));
    this.camera.near = r / 100; this.camera.far = r * 50; this.camera.updateProjectionMatrix();
    if (!ids) { this.grid.position.set(c.x, b.min.y - 0.01, c.z); this.modelBox = b; }
  }
  highlight(ids = [], ghost = false) {
    this.ghost ||= new THREE.MeshStandardMaterial({ color: 0x8090a0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [this.section] });
    this._hl = ids; this._ghost = ghost;
    this.meshes().forEach((m) => (m.material = ghost && ids.length ? this.ghost : m.userData.baseMat));
    for (const i of ids) (this.byId.get(i) || []).forEach((m) => (m.material = this.hl));
  }
  setVisible(pred) { this.meshes().forEach((m) => (m.visible = pred(m.userData))); }
  xray(on) {
    const seen = new Set();
    this.meshes().forEach((m) => { const mt = m.userData.baseMat; if (seen.has(mt)) return; seen.add(mt);
      if (on) { mt.userData.o ??= [mt.transparent, mt.opacity, mt.depthWrite]; mt.transparent = true; mt.opacity = Math.min(mt.opacity, 0.18); mt.depthWrite = false; }
      else if (mt.userData.o) { [mt.transparent, mt.opacity, mt.depthWrite] = mt.userData.o; }
      mt.needsUpdate = true; });
  }
  /** Horizontal section: t in [0,1] from bottom to top of the model; 1 = off. */
  setSection(t) {
    const b = this.modelBox; if (!b) return;
    this.section.constant = t >= 1 ? 1e6 : b.min.y + (b.max.y - b.min.y) * t;
  }
  screenshot(maxWidth = 1600) {
    this.renderer.render(this.scene, this.camera); const c = this.renderer.domElement;
    if (c.width <= maxWidth) return c.toDataURL("image/png");
    const k = maxWidth / c.width, o = document.createElement("canvas"); o.width = maxWidth; o.height = Math.round(c.height * k);
    o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); return o.toDataURL("image/png");
  }
  /** Screen position of an element's centre (for agent ghost cursors), or null. */
  screenPos(id) {
    const b = this.box([id]); if (b.isEmpty()) return null; const v = b.getCenter(new THREE.Vector3()).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect(); return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height };
  }
}
