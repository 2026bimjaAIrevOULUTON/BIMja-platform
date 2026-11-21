// Site workspace: pin, survey import (files and samples), terrain from open elevation tiles, grading, and the
// terrain shown in 3D under the building (existing ground, graded platform, contours).
import * as THREE from "three";
import { siteSurfaces } from "../site/commands.js";
import { gridTriangles } from "../site/terrain.js";
import { proj4 } from "../geo/geo.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"; // AWS Open Data "Terrain Tiles"

/** Terrarium RGB -> metres. */
export const terrariumZ = (r, g, b) => r * 256 + g + b / 256 - 32768;

export function installSiteUI({ bus, viewer, run, toast, BASE }) {
  const group = new THREE.Group(); group.name = "site"; viewer.scene.add(group);
  const mats = { ex: new THREE.MeshStandardMaterial({ color: 0x8c7a5b, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    pr: new THREE.MeshStandardMaterial({ color: 0xb9ab8c, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    cl: new THREE.LineBasicMaterial({ color: 0x3b3326 }), cp: new THREE.LineBasicMaterial({ color: 0xffffff }) };
  const ref = (site, v) => site.ffl ?? (Number.isFinite(v.tin.at(0, 0)) ? v.tin.at(0, 0) + 0.45 : (v.tin.box.z0 + v.tin.box.z1) / 2);

  function draw() {
    group.children.slice().forEach((c) => { c.geometry?.dispose(); group.remove(c); });
    const site = bus.extra.site; const v = site?.points?.length ? siteSurfaces(site) : null; info(v);
    if (!v) { viewer.fit?.(); return; }
    const z0 = ref(site, v); const show = $("#showTerrain").checked, showC = $("#showContours").checked;
    const mesh = (grid, mat) => { const T = gridTriangles(grid, 1); const pos = new Float32Array(T.length); for (let i = 0; i < T.length; i += 3) { pos[i] = T[i]; pos[i + 1] = T[i + 2] - z0; pos[i + 2] = -T[i + 1]; }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.userData = { site: true }; return m; };
    if (show) group.add(mesh(v.proposed || v.grid, v.proposed ? mats.pr : mats.ex));
    if (showC) for (const [list, mat, lift] of [[v.proposed ? v.proposedContours : v.existing, v.proposed ? mats.cp : mats.cl, 0.03]]) {
      const pts = []; for (const c of list) for (let i = 0; i < c.pts.length - 1; i++) pts.push(c.pts[i][0], c.z - z0 + lift, -c.pts[i][1], c.pts[i + 1][0], c.z - z0 + lift, -c.pts[i + 1][1]);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); group.add(new THREE.LineSegments(g, mat)); }
    viewer.grid.visible = !show;
  }
  function info(v) {
    const site = bus.extra.site;
    $("#siteInfo").innerHTML = v ? `${esc(site.sources.map((s) => `${s.name} (${s.format}, ${s.kept ?? s.read} pts)`).join(", "))}<br>${v.tin.triangles.length / 3} triangles · ${(v.tin.box.x1 - v.tin.box.x0).toFixed(0)} × ${(v.tin.box.y1 - v.tin.box.y0).toFixed(0)} m · levels ${v.tin.box.z0.toFixed(2)}–${v.tin.box.z1.toFixed(2)} m · contours every ${v.interval} m` : "No survey yet.";
    const g = v?.earthworks; $("#siteReport").innerHTML = g ? `<table><tr><th>FFL</th><td>+${site.ffl.toFixed(3)} m</td></tr><tr><th>Platform</th><td>+${site.grading.pad_z.toFixed(3)} m</td></tr><tr><th>Cut</th><td>${g.cut_m3.toFixed(1)} m³</td></tr><tr><th>Fill</th><td>${g.fill_m3.toFixed(1)} m³</td></tr><tr><th>Net</th><td>${g.net_m3.toFixed(1)} m³ (${g.net_m3 > 0 ? "surplus to export" : "import fill"})</td></tr></table>` : "";
  }
  const read = (f) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsArrayBuffer(f); });
  const fmtOf = (name) => { const e = name.split(".").pop().toLowerCase(); return { txt: "csv", xyz: "csv", pts: "csv", xml: "landxml" }[e] || e; };
  $("#surveyFile").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    const fmt = fmtOf(f.name); const buf = new Uint8Array(await read(f));
    const args = ["las", "ply", "e57", "laz"].includes(fmt) ? { base64: btoa(Array.from(buf, (x) => String.fromCharCode(x)).join("")) } : { data: new TextDecoder().decode(buf) };
    const r = await run("survey_import", { format: fmt, name: f.name, ...args }); if (r.ok) { toast(`Survey: ${r.data.points} points, ${r.data.contours} contours`); setTimeout(() => viewer.fitObject(group), 50); } else toast(r.refusals[0].message); };
  $("#surveySample").onchange = async (e) => { const [file, fmt] = e.target.value.split("|"); e.target.value = ""; if (!file) return;
    const data = await (await fetch(`${BASE}survey/${file}`)).text(); const r = await run("survey_import", { format: fmt, name: file, data }); if (r.ok) { toast(`Sample survey: ${r.data.points} points`); setTimeout(() => viewer.fitObject(group), 50); } };
  $("#pinSet").onclick = async () => { const r = await run("site_pin", { lat: +$("#pinLat").value, lon: +$("#pinLon").value }); if (r.ok) $("#pinStatus").textContent = `Suggested CRS ${r.data.suggested_crs}`; };
  $("#pinTerrain").onclick = () => terrainFromPin().catch((e) => { $("#pinStatus").textContent = ""; toast(`Terrain tiles: ${e.message}`); });
  $("#gradeBtn").onclick = async () => { const r = await run("site_grade", { margin: +$("#gradeMargin").value, plinth: +$("#gradePlinth").value, cut_slope: +$("#gradeCut").value, fill_slope: +$("#gradeFill").value });
    if (r.ok) toast(`Cut ${r.data.cut_m3} m³ · fill ${r.data.fill_m3} m³ · net ${r.data.net_m3} m³`); else toast(r.refusals[0].message); };
  $("#siteClear").onclick = () => run("site_clear", {});
  $("#showTerrain").onchange = draw; $("#showContours").onchange = draw;

  async function terrainFromPin({ radius = 150, zoom = 15 } = {}) {
    const lat = +$("#pinLat").value, lon = +$("#pinLon").value; const pin = await run("site_pin", { lat, lon }); if (!pin.ok) return;
    $("#pinStatus").textContent = "Fetching elevation tiles…"; await proj4();
    if (!bus.extra.geo?.crs) { const c = await run("crs", { epsg: pin.data.suggested_crs }); if (!c.ok) throw new Error(c.refusals[0].message); }
    if (!bus.extra.geo?.anchor) { const a = await run("anchor", { lat, lon }); if (!a.ok) throw new Error(a.refusals[0].message); }
    const n = 2 ** zoom; const tx = (lo) => ((lo + 180) / 360) * n, ty = (la) => ((1 - Math.log(Math.tan((la * Math.PI) / 180) + 1 / Math.cos((la * Math.PI) / 180)) / Math.PI) / 2) * n;
    const dLat = radius / 111320, dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const x0 = Math.floor(tx(lon - dLon)), x1 = Math.floor(tx(lon + dLon)), y0 = Math.floor(ty(lat + dLat)), y1 = Math.floor(ty(lat - dLat));
    const P = (await proj4()); const def = bus.extra.geo.def; const rows = ["E,N,Z"];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const img = new Image(); img.crossOrigin = "anonymous"; img.src = TERRAIN_TILES.replace("{z}", zoom).replace("{x}", x).replace("{y}", y);
      await img.decode(); const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let py = 0; py < cv.height; py += 2) for (let px = 0; px < cv.width; px += 2) {
        const fx = x + (px + 0.5) / cv.width, fy = y + (py + 0.5) / cv.height; const lo = (fx / n) * 360 - 180, la = (Math.atan(Math.sinh(Math.PI * (1 - (2 * fy) / n))) * 180) / Math.PI;
        if (Math.abs(la - lat) > dLat || Math.abs(lo - lon) > dLon) continue;
        const i = (py * cv.width + px) * 4; const [E, N] = P("EPSG:4326", def, [lo, la]); rows.push(`${E.toFixed(2)},${N.toFixed(2)},${terrariumZ(d[i], d[i + 1], d[i + 2]).toFixed(2)}`);
      }
    }
    const r = await run("survey_import", { format: "csv", name: `Terrain tiles z${zoom} around ${lat.toFixed(5)}, ${lon.toFixed(5)}`, data: rows.join("\n"), coords: "map" });
    $("#pinStatus").textContent = r.ok ? `${r.data.points} points from open elevation tiles (approx. ${Math.round((40075016 * Math.cos((lat * Math.PI) / 180)) / n / 256 * 2)} m spacing)` : r.refusals[0].message; setTimeout(() => viewer.fitObject(group), 50);
  }
  let last = null; // redraw when the site state changes (any applied command, undo or redo)
  bus.on((ev) => { if (ev.type !== "applied") return; const s = bus.extra.site; const key = s ? `${s.points?.length}|${s.points?.[0]}|${JSON.stringify(s.grading)}|${s.ffl}` : ""; if (key !== last) { last = key; setTimeout(draw); } });
  draw();
  return { draw, terrainFromPin };
}
