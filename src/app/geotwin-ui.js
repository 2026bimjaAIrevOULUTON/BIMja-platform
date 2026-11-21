// Geo + twin: CRS and anchor (IfcMapConversion), basemap and overlays by URL, sensors bound to GlobalIds,
// a simulated (or WebSocket) feed, threshold alerts that select the element, live values, history scrub, a map.
import * as THREE from "three";
import { definitionFor, localToMap, proj4, proj4Sync } from "../geo/geo.js";
import { defaultSensor, simulate, evaluate, History, SENSOR_KINDS } from "../twin/twin.js";
import { ifcGuid } from "../author/ifc-export.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const err = (m, code = "bad_arg") => Object.assign(new Error(m), { code });

export function installGeoTwin({ bus, viewer, run, toast, resolveElement, selectIds }) {
  const geo = () => (bus.extra.geo ||= {});
  const twin = () => (bus.extra.twin ||= { sensors: {}, seed: 7 });
  const hist = new History(5000); let timer = null, ws = null, tick = 0, scrubTick = null; const alerts = []; const latest = new Map();

  // ---------- geo ----------
  bus.register("crs", (a) => { const c = definitionFor(a.epsg || a.crs, a.proj4); geo().crs = c.code; geo().def = c.def; proj4().then(drawMap); return { crs: c.code }; });
  bus.register("anchor", (a) => {
    let e = a.easting, n = a.northing;
    if (a.lat != null && a.lon != null) {
      const P = proj4Sync(); if (!geo().def) throw err("set a CRS first (crs)"); if (!P) { proj4(); throw err("loading the projection library, try again in a moment", "unavailable"); }
      [e, n] = P("EPSG:4326", geo().def, [+a.lon, +a.lat]); a.easting = e; a.northing = n; // recorded in the log, so a replay is exact
    }
    if (!Number.isFinite(+e) || !Number.isFinite(+n)) throw err("give easting and northing (map units), or lat and lon");
    geo().anchor = { easting: +e, northing: +n, height: +(a.height || 0), rotation_deg: +(a.rotation_deg || 0), scale: +(a.scale || 1) };
    setTimeout(drawMap); return { anchor: geo().anchor };
  });
  bus.register("basemap", (a) => { if (a.url && !/^https:\/\/.+\{z\}.+\{x\}.+\{y\}/.test(a.url)) throw err("basemap url must be https with {z}/{x}/{y}"); geo().basemap = a.url ? { url: a.url, attribution: a.attribution || "" } : null; setTimeout(drawMap); return { basemap: geo().basemap }; });
  bus.register("overlay", async (a) => {
    let gj = a.geojson; if (a.url) { const r = await fetch(a.url); if (!r.ok) throw err(`HTTP ${r.status}`); gj = await r.json(); }
    if (!gj || !(gj.type === "FeatureCollection" || gj.type === "Feature")) throw err("expected GeoJSON (for ArcGIS REST add f=geojson to the query URL)");
    overlays.push(gj.type === "Feature" ? { type: "FeatureCollection", features: [gj] } : gj); drawMap(); return { features: overlays.reduce((s, o) => s + o.features.length, 0) };
  }, { kind: "view" });
  const overlays = [];

  // ---------- twin ----------
  bus.register("sensor", (a) => {
    const t = twin(); const id = String(a.id || `S${Object.keys(t.sensors).length + 1}`);
    t.sensors[id] = { ...defaultSensor(id, a.kind || "temperature", a), ...(t.sensors[id] && !a.kind ? t.sensors[id] : {}) };
    if (a.min != null) t.sensors[id].min = +a.min; if (a.max != null) t.sensors[id].max = +a.max; if (a.element) t.sensors[id].element = String(a.element);
    renderSensors(); return { id };
  });
  bus.register("bind", (a) => { const s = twin().sensors[a.sensor]; if (!s) throw err(`no sensor ${a.sensor}`, "no_such_element"); if (!resolveElement(a.element)) throw err(`no element ${a.element} in the scene`, "no_such_element"); s.element = String(a.element); renderSensors(); return { sensor: s.id, element: s.element }; });
  bus.register("feed", (a) => {
    stopFeed(); const mode = a.mode || "simulated";
    if (mode === "off") return { feed: "off" };
    if (mode === "simulated") { twin().seed = a.seed ?? twin().seed ?? 7; timer = setInterval(() => step(), Math.max(100, a.interval_ms || 1000)); step(); return { feed: "simulated", seed: twin().seed }; }
    if (mode === "ws") { if (!/^wss?:\/\//.test(a.url || "")) throw err("ws feed needs url ws:// or wss://");
      ws = new WebSocket(a.url); ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); for (const r of [].concat(m)) ingest(String(r.sensor), +r.value, r.tick ?? tick++); } catch { /* ignore bad frames */ } };
      ws.onerror = () => toast("Twin feed: WebSocket error"); return { feed: "ws", url: a.url }; }
    throw err("mode must be simulated, ws or off");
  }, { kind: "view" });
  function stopFeed() { if (timer) clearInterval(timer); timer = null; if (ws) ws.close(); ws = null; }
  function step() { tick++; for (const s of Object.values(twin().sensors)) ingest(s.id, simulate(s, tick, twin().seed), tick); renderLive(); }
  function ingest(sensorId, value, t) {
    const s = twin().sensors[sensorId]; if (!s || !Number.isFinite(value)) return;
    const status = evaluate(s, value); const prev = latest.get(sensorId)?.status;
    const row = { sensor: sensorId, value, tick: t, status }; latest.set(sensorId, row); hist.push(row);
    if (status !== "ok" && prev !== status) {
      const a = { at: performance.now(), tick: t, sensor: sensorId, name: s.name, value, unit: s.unit, status, element: s.element };
      alerts.unshift(a); alerts.length = Math.min(alerts.length, 100);
      const v = s.element && resolveElement(s.element); if (v) selectIds([v]); a.selectedMs = performance.now() - a.at; // alert selects its element
      toast(`⚠ ${s.name}: ${value} ${s.unit} (${status})`); window.dispatchEvent(new CustomEvent("bimja:alert", { detail: a }));
    }
  }

  // ---------- live view: element tint + labels ----------
  const tintMats = { ok: new THREE.MeshStandardMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0.85 }), high: new THREE.MeshStandardMaterial({ color: 0xe5484d }), low: new THREE.MeshStandardMaterial({ color: 0x5adcff }) };
  const labels = new Map();
  function renderLive() {
    const vals = scrubTick == null ? latest : hist.at(scrubTick);
    for (const s of Object.values(twin().sensors)) {
      const r = vals.get(s.id), v = s.element && resolveElement(s.element); if (!r || !v) continue;
      for (const m of viewer.byId.get(v) || []) m.material = tintMats[r.status];
      let el = labels.get(s.id); if (!el) { el = document.createElement("div"); el.className = "ghost-cursor twin-label"; $("#ghosts").appendChild(el); labels.set(s.id, el); }
      const p = viewer.screenPos(v); if (p) { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.opacity = 1; }
      el.textContent = `${s.name}: ${r.value} ${s.unit}`; el.dataset.status = r.status;
    }
    renderSensors(); renderAlerts(); drawMap();
    const [t0, t1] = hist.range(); const sl = $("#twinScrub"); sl.min = t0; sl.max = t1; if (scrubTick == null) sl.value = t1;
    $("#twinScrubLabel").textContent = scrubTick == null ? `live · tick ${t1}` : `tick ${scrubTick} (history)`;
  }
  $("#twinScrub").oninput = (e) => { scrubTick = +e.target.value >= +e.target.max ? null : +e.target.value; renderLive(); };

  // ---------- UI ----------
  function renderSensors() {
    const t = twin();
    $("#sensorList").innerHTML = Object.values(t.sensors).map((s) => { const r = latest.get(s.id);
      return `<div class="sensor ${r?.status || ""}"><b>${esc(s.name)}</b> <small class="note">${esc(s.kind)} · ${s.min}–${s.max} ${esc(s.unit)} · ${s.element ? `on ${esc(s.element)}` : "unbound"}</small><span class="val">${r ? `${r.value} ${esc(s.unit)}` : "—"}</span></div>`; }).join("") || `<p class="note">No sensors. Select an element and add one, or use the sensor command.</p>`;
  }
  function renderAlerts() { $("#alertList").innerHTML = alerts.slice(0, 20).map((a) => `<div class="issue ${a.status === "high" ? "high" : "low"}">⚠ <b>${esc(a.name)}</b> ${a.value} ${esc(a.unit)} (${a.status}) <small>tick ${a.tick} · element ${esc(a.element || "-")} selected in ${a.selectedMs?.toFixed(0)} ms</small></div>`).join(""); }
  function renderGeo() {
    const g = geo(); const warn = !g.crs || !g.anchor;
    $("#geoWarn").hidden = !warn; $("#geoStatus").textContent = warn ? "" : `${g.crs} · E ${g.anchor.easting.toFixed(3)} N ${g.anchor.northing.toFixed(3)} H ${g.anchor.height} · rot ${g.anchor.rotation_deg}°`;
    $("#crsBadge").textContent = g.crs ? g.crs : "No CRS · local origin"; $("#crsBadge").classList.toggle("warn", !g.crs);
  }
  $("#setCrs").onclick = () => run("crs", { epsg: $("#crsCode").value.trim(), ...($("#crsDef").value.trim() ? { proj4: $("#crsDef").value.trim() } : {}) });
  $("#setAnchor").onclick = async () => { await proj4(); const lat = $("#anLat").value, lon = $("#anLon").value;
    run("anchor", lat && lon ? { lat: +lat, lon: +lon, height: +$("#anH").value || 0, rotation_deg: +$("#anRot").value || 0 } : { easting: +$("#anE").value, northing: +$("#anN").value, height: +$("#anH").value || 0, rotation_deg: +$("#anRot").value || 0 }); };
  $("#setBasemap").onclick = () => run("basemap", { url: $("#basemapUrl").value.trim() || undefined, attribution: "© map data from the URL you supplied" });
  $("#addOverlay").onclick = () => run("overlay", { url: $("#overlayUrl").value.trim() });
  $("#addSensor").onclick = () => { const el = window.__bimjaSelectedAuthored || (window.__bimjaSelectedIfc != null ? window.bimja.get(window.__bimjaSelectedIfc)?.globalId : null);
    run("sensor", { kind: $("#sensorKind").value, name: $("#sensorName").value || undefined, ...(el ? { element: el } : {}) }); };
  $("#feedSim").onclick = () => run("feed", { mode: "simulated", interval_ms: 800 });
  $("#feedStop").onclick = () => run("feed", { mode: "off" });
  $("#sensorKind").innerHTML = SENSOR_KINDS.map((k) => `<option>${k}</option>`).join("");

  // ---------- map: basemap tiles (Web Mercator, user URL), model footprint, sensors, overlays ----------
  const tiles = new Map();
  async function drawMap() {
    renderGeo(); const cv = $("#twinMap"); if (!cv || cv.offsetParent === null) return; const g = geo(); const ctx = cv.getContext("2d");
    const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * 2; cv.height = H * 2; ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.fillStyle = "#10141a"; ctx.fillRect(0, 0, W, H);
    if (!g.crs || !g.anchor) { ctx.fillStyle = "#8e99a8"; ctx.font = "12px Inter"; ctx.fillText("Set a CRS and an anchor to place the model on the map", 12, 22); return; }
    const P = await proj4(); const toLL = (local) => { const m = localToMap(local, g.anchor); return P(g.def, "EPSG:4326", [m[0], m[1]]); };
    const [lon0, lat0] = toLL([0, 0, 0]); const z = 18, n = 2 ** z; const merc = ([lon, lat]) => [((lon + 180) / 360) * n * 256, ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256];
    const c0 = merc([lon0, lat0]); const px = (ll) => { const m = merc(ll); return [W / 2 + (m[0] - c0[0]), H / 2 + (m[1] - c0[1])]; };
    if (g.basemap) { const tx0 = Math.floor((c0[0] - W / 2) / 256), tx1 = Math.floor((c0[0] + W / 2) / 256), ty0 = Math.floor((c0[1] - H / 2) / 256), ty1 = Math.floor((c0[1] + H / 2) / 256);
      for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) { const url = g.basemap.url.replace("{z}", z).replace("{x}", tx).replace("{y}", ty); let im = tiles.get(url);
        if (!im) { im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => drawMap(); im.src = url; tiles.set(url, im); }
        if (im.complete && im.naturalWidth) ctx.drawImage(im, W / 2 + tx * 256 - c0[0], H / 2 + ty * 256 - c0[1]); }
      ctx.fillStyle = "#0008"; ctx.fillRect(0, H - 16, W, 16); ctx.fillStyle = "#cfd6df"; ctx.font = "10px Inter"; ctx.fillText(g.basemap.attribution || g.basemap.url.split("/")[2], 6, H - 5); }
    // footprint: authored walls on the lowest level, in metres
    ctx.strokeStyle = "#ff7a1a"; ctx.lineWidth = 2;
    for (const w of Object.values(bus.model.data.elements).filter((e) => e.kind === "wall")) { const a = px(toLL([w.a[0] / 1000, w.a[1] / 1000, 0])), b = px(toLL([w.b[0] / 1000, w.b[1] / 1000, 0])); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
    // overlays (GeoJSON in WGS84)
    ctx.strokeStyle = "#5adcff"; ctx.fillStyle = "#5adcff33";
    for (const o of overlays) for (const f of o.features) { const gm = f.geometry; if (!gm) continue; const rings = gm.type === "Polygon" ? gm.coordinates : gm.type === "MultiPolygon" ? gm.coordinates.flat() : gm.type === "LineString" ? [gm.coordinates] : gm.type === "Point" ? [[gm.coordinates]] : [];
      for (const r of rings) { ctx.beginPath(); r.forEach((c, i) => (i ? ctx.lineTo(...px(c)) : ctx.moveTo(...px(c)))); if (gm.type.includes("Polygon")) { ctx.closePath(); ctx.fill(); } ctx.stroke(); if (gm.type === "Point") { const q = px(r[0]); ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fill(); } } }
    // sensors at their elements
    for (const s of Object.values(twin().sensors)) { const v = s.element && resolveElement(s.element); if (!v) continue; const b = viewer.box([v]); if (b.isEmpty()) continue; const c = b.getCenter(new THREE.Vector3()); const o = viewer.offset || [0, 0, 0];
      const q = px(toLL([c.x + o[0], -(c.z + o[2]), 0])); const r = latest.get(s.id); ctx.fillStyle = r?.status === "high" ? "#e5484d" : r?.status === "low" ? "#5adcff" : "#3ecf8e"; ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "10px Inter"; ctx.fillText(r ? `${r.value}` : s.name, q[0] + 8, q[1] + 3); }
    ctx.fillStyle = "#cfd6df"; ctx.font = "11px Inter"; ctx.fillText(`${g.crs} · origin ${lat0.toFixed(6)}, ${lon0.toFixed(6)}`, 8, 14);
  }
  document.querySelector('button[data-tab="twin"]').addEventListener("click", () => setTimeout(drawMap, 30));
  bus.on((ev) => { if (ev.type === "applied") { renderGeo(); renderSensors(); } });
  renderGeo(); renderSensors();
  return { drawMap, alerts, latest, hist, stop: stopFeed, guidFor: (id) => ifcGuid(`${bus.model.data.name || "BIMja project"}/el/${id}`) };
}
