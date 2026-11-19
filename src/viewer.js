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
      const hit = this.ray.intersectObjects(this.root.children, false).find((h) => h.object.visible && this._inSection(h.point));
      this.onPick(hit ? hit.object.userData.expressID : null);
    });
    const loop = () => { requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop(); this.resize();
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
    this.fit();
  }
  clear() { this.root.children.slice().forEach((c) => { c.geometry.dispose(); this.root.remove(c); }); this.byId.clear(); }
  box(ids) {
    const b = new THREE.Box3();
    (ids ? ids.flatMap((i) => this.byId.get(i) || []) : this.root.children.filter((c) => c.visible)).forEach((m) => b.expandByObject(m));
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
    this.root.children.forEach((m) => (m.material = ghost && ids.length ? this.ghost : m.userData.baseMat));
    for (const i of ids) (this.byId.get(i) || []).forEach((m) => (m.material = this.hl));
  }
  setVisible(pred) { this.root.children.forEach((m) => (m.visible = pred(m.userData))); }
  xray(on) {
    const seen = new Set();
    this.root.children.forEach((m) => { const mt = m.userData.baseMat; if (seen.has(mt)) return; seen.add(mt);
      if (on) { mt.userData.o ??= [mt.transparent, mt.opacity, mt.depthWrite]; mt.transparent = true; mt.opacity = Math.min(mt.opacity, 0.18); mt.depthWrite = false; }
      else if (mt.userData.o) { [mt.transparent, mt.opacity, mt.depthWrite] = mt.userData.o; }
      mt.needsUpdate = true; });
  }
  /** Horizontal section: t in [0,1] from bottom to top of the model; 1 = off. */
  setSection(t) {
    const b = this.modelBox; if (!b) return;
    this.section.constant = t >= 1 ? 1e6 : b.min.y + (b.max.y - b.min.y) * t;
  }
  screenshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL("image/png"); }
}
