// Twin workspace, simulation side: locate the project from a pin, drape OpenStreetMap context (imagery and
// buildings) under it, put the real sun in the sky for any date and time with shadows, play a day, and run the
// solar study (sun hours, kWh/m², ground shadow) with an exposure heatmap on the model.
import * as THREE from "three";
import { tilesAround, overpassQuery, osmBuildings } from "../geo/context.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const M = 0.001;

export function installSimUI({ bus, viewer, run, toast, rebuild }) {
  const ctx = new THREE.Group(); ctx.name = "map-context"; viewer.scene.add(ctx);
  const tileGroup = new THREE.Group(), bldGroup = new THREE.Group(); ctx.add(tileGroup, bldGroup);
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.38 })); catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true; catcher.visible = false; viewer.scene.add(catcher);
  const sun = viewer.scene.children.find((o) => o.isDirectionalLight); viewer.scene.add(sun.target);
  let sunOn = false, playing = null, exposure = false;
  const geo = () => bus.extra.geo;
  const ground = () => { const b = new THREE.Box3().setFromObject(viewer.auth); return b.isEmpty() ? 0 : b.min.y; };

  // ---------- location ----------
  function renderLoc() {
    const g = geo(); const L = g?.location;
    $("#locInfo").innerHTML = L ? `<b>${esc(L.label || "Located")}</b> · ${L.lat.toFixed(5)}, ${L.lon.toFixed(5)} · ${esc(g.crs)} · UTC${L.timezone >= 0 ? "+" : ""}${L.timezone} · convergence ${L.convergence_deg.toFixed(3)}° · <a href="https://www.google.com/maps/@${L.lat},${L.lon},18z" target="_blank" rel="noopener">Open in Google Maps</a>` : "Not located yet: paste a Google Maps pin (lat, lon).";
    if (L) { $("#locLat").value = L.lat; $("#locLon").value = L.lon; $("#locTz").value = L.timezone; $("#locOrient").value = L.orient_deg || 0; }
  }
  $("#geoLocate").onclick = async () => { const [la, lo] = $("#locLat").value.includes(",") ? $("#locLat").value.split(",") : [$("#locLat").value, $("#locLon").value];
    const r = await run("geolocate", { lat: +la, lon: +lo, timezone: $("#locTz").value === "" ? undefined : +$("#locTz").value, orient_deg: +$("#locOrient").value || 0, height_m: +$("#locH").value || 0 });
    if (r.ok) { toast(`Located: ${r.data.crs}`); renderLoc(); if ($("#ctxImagery").checked) mapContext(); } else toast(r.refusals[0].message); };
  $("#locInfoBtn").onclick = async () => { const r = await run("location", {}); if (r.ok) renderLoc(); };

  // ---------- map context ----------
  async function mapContext({ imagery = $("#ctxImagery").checked, buildings = $("#ctxBuildings").checked, radius_m = +$("#ctxRadius").value || 500 } = {}) {
    tileGroup.clear(); bldGroup.clear(); $("#mapAttribution").hidden = true; const g = geo(); if (!g?.location) return { imagery: 0, buildings: 0 };
    const y0 = ground() - 0.06; let nT = 0, nB = 0;
    if (imagery) { const T = tilesAround(g, radius_m); for (const t of T.tiles) {
      const geom = new THREE.BufferGeometry(); const P = [t.nw, t.ne, t.se, t.sw].map(([x, y]) => [x, y0, -y]);
      geom.setAttribute("position", new THREE.Float32BufferAttribute([...P[0], ...P[3], ...P[1], ...P[1], ...P[3], ...P[2]], 3)); geom.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0], 2)); geom.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }); loader.load(t.url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; mat.map = tex; mat.needsUpdate = true; }, undefined, () => {});
      const m = new THREE.Mesh(geom, mat); m.receiveShadow = true; m.userData.context = true; tileGroup.add(m); nT++; }
      $("#mapAttribution").textContent = T.attribution; $("#mapAttribution").hidden = false; viewer.grid.visible = false; }
    else viewer.grid.visible = true;
    if (buildings) {
      try { const b = new THREE.Box3().setFromObject(viewer.auth); const ex = b.isEmpty() ? null : [b.min.x, -b.max.z, b.max.x, -b.min.z];
        const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: overpassQuery(g, radius_m) }) }); if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const list = osmBuildings(await res.json(), g, { exclude: ex }); const mat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.9, transparent: true, opacity: 0.92 });
        for (const bd of list) { const sh = new THREE.Shape(bd.outline.map(([x, y]) => new THREE.Vector2(x, y))); const geom = new THREE.ExtrudeGeometry(sh, { depth: bd.height_m - bd.min_height_m, bevelEnabled: false });
          geom.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geom, mat); m.position.y = y0 + bd.min_height_m; m.castShadow = m.receiveShadow = true; m.userData.context = true; bldGroup.add(m); nB++; }
        $("#mapAttribution").textContent = "© OpenStreetMap contributors"; $("#mapAttribution").hidden = false;
      } catch (e) { toast(`OSM buildings: ${e.message}`); }
    }
    if (sunOn) applySun(); return { imagery: nT, buildings: nB };
  }
  bus.register("map_context", (a) => { mapContext({ imagery: a.imagery !== false, buildings: !!a.buildings, radius_m: a.radius_m ?? 500 }); return { requested: true, imagery: a.imagery !== false, buildings: !!a.buildings }; }, { kind: "view" });
  for (const id of ["#ctxImagery", "#ctxBuildings"]) $(id).onchange = () => mapContext();

  // ---------- sun and shadows ----------
  const timeStr = () => { const v = +$("#simTime").value; return `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`; };
  async function applySun() {
    if (!sunOn) { viewer.renderer.shadowMap.enabled = false; sun.castShadow = false; catcher.visible = false; sun.position.set(30, 60, 20); sun.intensity = 1.6; return; }
    const r = await run("sun", { date: $("#simDate").value, time: timeStr() }); if (!r.ok) { toast(r.refusals[0].message); sunOn = false; $("#simSun").classList.remove("on"); return; }
    const d = r.data; $("#simSunInfo").textContent = `${d.time} · azimuth ${d.azimuth_deg.toFixed(1)}° · elevation ${d.elevation_deg.toFixed(1)}° · DNI ${d.dni_w_m2} W/m² · sunrise ${d.sunrise} · sunset ${d.sunset}`;
    const b = new THREE.Box3().setFromObject(viewer.auth); const c = b.getCenter(new THREE.Vector3()); const R = Math.max(10, b.getSize(new THREE.Vector3()).length());
    const [sx, sy, sz] = d.direction; const dir = new THREE.Vector3(sx, sz, -sy).normalize();
    viewer.renderer.shadowMap.enabled = true; viewer.renderer.shadowMap.type = THREE.PCFSoftShadowMap; sun.castShadow = d.above_horizon; sun.intensity = d.above_horizon ? 0.6 + 2.2 * Math.max(0, dir.y) : 0.15;
    sun.position.copy(c).addScaledVector(dir, R * 1.5); sun.target.position.copy(c); sun.target.updateMatrixWorld();
    const reach = Math.min(R * 3, R / Math.max(0.12, dir.y)); const cam = sun.shadow.camera; cam.left = cam.bottom = -reach; cam.right = cam.top = reach; cam.near = 0.1; cam.far = R * 5; cam.updateProjectionMatrix();
    sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = R / 2000; sun.shadow.map?.dispose(); sun.shadow.map = null;
    viewer.auth.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    catcher.visible = !tileGroup.children.length; catcher.scale.set(reach * 2.2, reach * 2.2, 1); catcher.position.set(c.x, ground() - 0.03, c.z);
  }
  $("#simSun").onclick = () => { sunOn = !sunOn; $("#simSun").classList.toggle("on", sunOn); applySun(); };
  $("#simTime").oninput = () => { $("#simTimeLabel").textContent = timeStr(); if (sunOn) applySun(); };
  $("#simDate").onchange = () => { if (sunOn) applySun(); };
  $("#simPlay").onclick = () => { if (playing) { clearInterval(playing); playing = null; $("#simPlay").textContent = "Play day"; return; }
    if (!sunOn) $("#simSun").click(); $("#simPlay").textContent = "Stop"; $("#simTime").value = 5;
    playing = setInterval(() => { const v = +$("#simTime").value + 0.25; if (v > 20) { clearInterval(playing); playing = null; $("#simPlay").textContent = "Play day"; return; } $("#simTime").value = v; $("#simTime").oninput(); }, 160); };

  // ---------- solar study + exposure heatmap ----------
  const heat = (t) => new THREE.Color().setHSL(0.66 - 0.66 * Math.min(1, Math.max(0, t)), 0.85, 0.5);
  $("#simRun").onclick = async () => {
    $("#simResult").innerHTML = '<span class="note">Simulating the day…</span>'; await new Promise((r) => setTimeout(r, 30));
    const r = await run("solar_study", { date: $("#simDate").value, step_min: 30 }); if (!r.ok) { $("#simResult").textContent = r.refusals[0].message; return; }
    const d = r.data; const peak = Math.max(...d.steps.map((s) => s.ground_shadow_m2), 0);
    $("#simResult").innerHTML = `<div class="note">${esc(d.date)} · sunrise ${d.sunrise} · noon ${d.solar_noon} · sunset ${d.sunset} · ${d.day_length_h} h of daylight · peak ground shadow ${peak.toLocaleString()} m²</div>
      <table class="qto"><tr><th>Facade</th><th>Area m²</th><th>Sun hours</th><th>kWh/m²·day</th></tr>${d.facades.map((f) => `<tr><td>${f.facade}</td><td>${f.area_m2.toLocaleString()}</td><td>${f.sun_hours}</td><td>${f.kwh_m2_day}</td></tr>`).join("")}</table>
      <div class="note">${esc(d.method)}</div>`;
    exposure = true; showExposure();
  };
  function showExposure() {
    const sim = bus.simCache; if (!sim) return; const vals = Object.values(sim.elements); const hi = Math.max(0.01, ...vals);
    viewer.auth.traverse((o) => { if (o.isMesh && o.userData?.authoredId && sim.elements[o.userData.authoredId] != null) { o.userData._mat ||= o.material; o.material = new THREE.MeshStandardMaterial({ color: heat(sim.elements[o.userData.authoredId] / hi), roughness: 0.8, side: THREE.DoubleSide }); } });
    $("#simLegend").innerHTML = `<span style="background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((t) => "#" + heat(t).getHexString()).join(",")})"></span> 0 – ${hi.toFixed(1)} kWh/m² per day`; $("#simLegend").hidden = false; $("#simExposureOff").hidden = false;
  }
  $("#simExposureOff").onclick = () => { exposure = false; $("#simLegend").hidden = true; $("#simExposureOff").hidden = true; rebuild(); };
  bus.on((ev) => { if (ev.type === "applied") { renderLoc(); if (ev.entry?.name === "geolocate" && $("#ctxImagery").checked) mapContext(); else if (sunOn && !["sun", "solar_study"].includes(ev.entry?.name)) setTimeout(applySun, 50); } });
  $("#simDate").value ||= "2026-06-21"; $("#simTimeLabel").textContent = timeStr(); renderLoc();
  return { mapContext, applySun, renderLoc, setSun: (on) => { sunOn = on; $("#simSun").classList.toggle("on", on); return applySun(); } };
}
