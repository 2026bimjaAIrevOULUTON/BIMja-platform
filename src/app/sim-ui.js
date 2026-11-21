// Twin workspace, simulation side: locate the project from a pin, drape OpenStreetMap context (imagery and
// buildings) under it, put the real sun in the sky for any date and time with shadows, play a day, and run the
// solar study (sun hours, kWh/m², ground shadow) with an exposure heatmap on the model.
import * as THREE from "three";
import { tilesAround, overpassQuery, osmBuildings } from "../geo/context.js";
import { parseOSM, cityLayers } from "../geo/osm-city.js";
import { LIVE_SOURCES, weatherUrl, airUrl, quakesUrl, normalizeWeather, normalizeAir, normalizeQuakes } from "../twin/live.js";

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

  // ---------- city context: OpenStreetMap -> layered commands ----------
  const BUNDLED = [{ file: "context/agra-taj-mahal.osm", minlat: 27.163, minlon: 78.029, maxlat: 27.187, maxlon: 78.056 }];
  let cityPlan = null;
  async function planCity() {
    const g = geo(); if (!g?.location) throw new Error("Locate the project first");
    const { lat, lon } = g.location; const r = Math.min(1500, Math.max(100, +$("#cityRadius").value || 800));
    const b = BUNDLED.find((x) => lat > x.minlat && lat < x.maxlat && lon > x.minlon && lon < x.maxlon); let text;
    if (b) text = await (await fetch(`${import.meta.env.BASE_URL}${b.file}`)).text();
    else { const dlat = r / 111320, dlon = r / (111320 * Math.cos((lat * Math.PI) / 180)); const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${(lon - dlon).toFixed(5)},${(lat - dlat).toFixed(5)},${(lon + dlon).toFixed(5)},${(lat + dlat).toFixed(5)}`); if (!res.ok) throw new Error(`OpenStreetMap API ${res.status}`); text = await res.text(); }
    const box = new THREE.Box3().setFromObject(viewer.auth); const ex = box.isEmpty() ? null : [box.min.x - 2, -box.max.z - 2, box.max.x + 2, -box.min.z + 2];
    cityPlan = cityLayers(parseOSM(text), g, { radius_m: r, exclude: ex, infill: $("#cityInfill").checked, services: $("#cityServices").checked, furniture: $("#cityFurniture").checked }); return cityPlan;
  }
  async function runCityLayer(i) { const l = cityPlan.layers[i]; const r = await run("script", { commands: l.commands }); $("#cityStatus").textContent = `${l.layer}: ${l.title} (${l.commands.length})${r.ok ? "" : " failed: " + r.refusals?.[0]?.message}`; return r.ok; }
  $("#cityBuild").onclick = async () => { try { $("#cityStatus").textContent = "Reading OpenStreetMap…"; const p = await planCity(); await run("script", { commands: p.families });
      for (let i = 0; i < p.layers.length; i++) { if (!(await runCityLayer(i))) break; await new Promise((r) => setTimeout(r, 30)); }
      $("#cityStatus").textContent = `City built: ${p.stats.commands} commands in ${p.layers.length} layers · ${p.stats.osm_buildings} mapped buildings, ${p.stats.infill_blocks} indicative infill blocks, ${p.stats.roads} roads · ${p.attribution}`; } catch (e) { $("#cityStatus").textContent = e.message; } };
  window.__bimjaCity = { plan: planCity, runLayer: runCityLayer, families: () => run("script", { commands: cityPlan.families }) };

  // ---------- layers ----------
  const hidden = new Set();
  function applyLayers() { const els = bus.model.data.elements; viewer.auth.traverse((o) => { if (o.isMesh && o.userData?.authoredId) { const L = els[o.userData.authoredId]?.layer; o.visible = !(L && hidden.has(L)); } }); }
  function renderLayers() { const counts = {}; for (const e of Object.values(bus.model.data.elements)) if (e.layer) counts[e.layer] = (counts[e.layer] || 0) + 1; const names = Object.keys(counts).sort();
    $("#layerHead").hidden = !names.length; $("#layerList").innerHTML = names.map((n) => `<label class="chk lay"><input type="checkbox" data-layer="${esc(n)}" ${hidden.has(n) ? "" : "checked"}> <b>${esc(n)}</b> <span class="num">${counts[n]}</span></label>`).join(""); }
  $("#layerList").onchange = (e) => { const n = e.target.dataset.layer; if (!n) return; run("layer_visibility", { layers: { [n]: e.target.checked } }); };
  bus.register("layer_visibility", (a) => { for (const [n, v] of Object.entries(a.layers || {})) { if (v) hidden.delete(n); else hidden.add(n); } applyLayers(); renderLayers(); return { hidden: [...hidden] }; }, { kind: "view" });
  bus.on((ev) => { if (ev.type === "applied") { clearTimeout(window.__layT); window.__layT = setTimeout(() => { renderLayers(); applyLayers(); }, 60); } });

  // ---------- live data (weather, wind, air, quakes) ----------
  const live = { weather: null, air: null, quakes: null, at: {} }; const timers = {}; let windArrow = null;
  const card = (k, v, sub = "") => `<div class="livecard"><span class="k">${esc(k)}</span><b>${esc(v)}</b>${esc(sub)}</div>`;
  function renderLive() { const w = live.weather, a = live.air, qs = live.quakes; const c = [];
    if (w) c.push(card("Temperature", `${w.temp_c} °C`, `RH ${w.rh}% · cloud ${w.cloud_pct}%`), card("Wind", `${w.wind_ms} m/s from ${w.wind_from}`, `gusts ${w.gust_ms} m/s`), card("Sunlight now", `${w.ghi_w_m2} W/m²`, `rain ${w.rain_mm} mm`));
    if (a) c.push(card("Air quality (US AQI)", `${a.us_aqi} · ${a.us_band}`, `PM2.5 ${a.pm2_5} · PM10 ${a.pm10} µg/m³`));
    if (qs) c.push(card("Earthquakes M2.5+, 7 days", `${qs.length} within 1000 km`, qs[0] ? `nearest M${qs[0].mag} ${qs[0].distance_km} km` : "none"));
    $("#liveCards").innerHTML = c.join(""); $("#liveCredits").textContent = Object.keys(live.at).map((k) => `${LIVE_SOURCES[k].credit} (${LIVE_SOURCES[k].licence}), ${live.at[k]}`).join(" · "); drawWind(); }
  function drawWind() { if (windArrow) { viewer.scene.remove(windArrow); windArrow = null; } const w = live.weather; if (!w || w.wind_ms == null || !$("#liveWeather").checked) return;
    const b = new THREE.Box3().setFromObject(viewer.auth); const c = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3()); const R = b.isEmpty() ? 20 : b.getSize(new THREE.Vector3()).length() / 2;
    const o = ((geo()?.location?.orient_deg || 0) * Math.PI) / 180; const to = ((w.wind_from_deg + 180) * Math.PI) / 180; const e = Math.sin(to), n = Math.cos(to); // direction the wind blows towards
    const x = e * Math.cos(o) + n * Math.sin(o), y = -e * Math.sin(o) + n * Math.cos(o); const dir = new THREE.Vector3(x, 0, -y).normalize(); const len = R * (0.4 + Math.min(1, w.wind_ms / 15));
    const start = c.clone().addScaledVector(dir, -len / 2); start.y = (b.isEmpty() ? 0 : b.max.y) + R * 0.15; windArrow = new THREE.ArrowHelper(dir, start, len, 0x5adcff, len * 0.25, len * 0.12); viewer.scene.add(windArrow); }
  async function poll(kind) { const g = geo(); if (!g?.location) return; const loc = g.location;
    try { const r = await fetch(kind === "weather" ? weatherUrl(loc) : kind === "air" ? airUrl(loc) : quakesUrl()); if (!r.ok) throw new Error(`${LIVE_SOURCES[kind].name} ${r.status}`); const j = await r.json();
      const v = kind === "weather" ? normalizeWeather(j) : kind === "air" ? normalizeAir(j) : normalizeQuakes(j, loc, 1000); if (!v) throw new Error(`${LIVE_SOURCES[kind].name}: unexpected response`);
      live[kind] = v; live.at[kind] = new Date().toLocaleTimeString(); renderLive(); } catch (e) { toast(e.message); } }
  function setLive(kind, on) { clearInterval(timers[kind]); if (on) { poll(kind); timers[kind] = setInterval(() => poll(kind), LIVE_SOURCES[kind].every_s * 1000); } else { live[kind] = null; delete live.at[kind]; renderLive(); } }
  for (const [id, kind] of [["#liveWeather", "weather"], ["#liveAir", "air"], ["#liveQuakes", "quakes"]]) $(id).onchange = (e) => { if (!geo()?.location) { e.target.checked = false; return toast("Locate the project first"); } setLive(kind, e.target.checked); };
  bus.register("live_data", (a) => { if (!geo()?.location) throw Object.assign(new Error("locate the project first"), { code: "no_location" });
    for (const [kind, id] of [["weather", "#liveWeather"], ["air", "#liveAir"], ["quakes", "#liveQuakes"]]) if (a[kind] != null) { $(id).checked = !!a[kind]; setLive(kind, !!a[kind]); }
    return { weather: live.weather && { ...live.weather, hourly: undefined }, air: live.air, quakes: live.quakes?.slice(0, 10), updated: live.at }; }, { kind: "view" });
  const liveClouds = () => { const h = live.weather?.hourly; if (!$("#liveClouds").checked || !h?.length) return undefined; const day = $("#simDate").value; const v = Array.from({ length: 24 }, (_, i) => h.find((x) => x.time === `${day}T${String(i).padStart(2, "0")}:00`)?.cloud_pct); return v.every((x) => x != null) ? v : undefined; };

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
    const clouds = liveClouds(); if ($("#liveClouds").checked && !clouds) toast("No live cloud forecast for that date: turn on Weather, and pick today or tomorrow"); const r = await run("solar_study", { date: $("#simDate").value, step_min: 30, ...(clouds ? { cloud_cover: clouds } : {}) }); if (!r.ok) { $("#simResult").textContent = r.refusals[0].message; return; }
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
