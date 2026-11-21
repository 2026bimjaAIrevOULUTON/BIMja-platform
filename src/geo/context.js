// Map context around a located project: OpenStreetMap raster tiles draped on the ground, and OSM building
// footprints (Overpass API) extruded to their tagged height. Context only: never part of the BIM model or its IFC.
// Pure functions here (tested headless); fetching and drawing live in the browser UI.
import { latLonToLocal } from "./utm.js";

export const OSM_TILES = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap contributors", maxZoom: 19 };
export const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
export const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
export const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

/** Tiles covering a radius (m) around the located origin; each tile with its four corners in local metres. */
export function tilesAround(geo, radius_m = 400, zoom = null) {
  const { lat, lon } = geo.location; const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180));
  const z = zoom ?? Math.max(12, Math.min(18, Math.round(Math.log2(mpp / (radius_m / 600)))));
  const cx = lon2x(lon, z), cy = lat2y(lat, z); const span = radius_m / (mpp / 2 ** z) / 256;
  const out = [];
  for (let ty = Math.floor(cy - span); ty <= Math.floor(cy + span); ty++) for (let tx = Math.floor(cx - span); tx <= Math.floor(cx + span); tx++) {
    const corner = (x, y) => latLonToLocal(geo, y2lat(y, z), x2lon(x, z));
    out.push({ z, x: tx, y: ty, url: OSM_TILES.url.replace("{z}", z).replace("{x}", tx).replace("{y}", ty), nw: corner(tx, ty), ne: corner(tx + 1, ty), se: corner(tx + 1, ty + 1), sw: corner(tx, ty + 1) });
  }
  return { zoom: z, tiles: out, attribution: OSM_TILES.attribution };
}

/** Overpass QL for buildings within a radius of the location. */
export const overpassQuery = (geo, radius_m = 400) => `[out:json][timeout:25];(way["building"](around:${Math.round(radius_m)},${geo.location.lat},${geo.location.lon});relation["building"](around:${Math.round(radius_m)},${geo.location.lat},${geo.location.lon}););out geom;`;

/** Overpass JSON -> [{id, name, outline:[[x,y] m], height_m, min_height_m}] in local metres; skips footprints over `exclude` (a local bbox). */
export function osmBuildings(json, geo, { exclude = null, default_height_m = 9, level_m = 3.2 } = {}) {
  const out = []; const els = Array.isArray(json?.elements) ? json.elements : [];
  const h = (t) => { const v = parseFloat(String(t?.height ?? "").replace(",", ".")); if (Number.isFinite(v) && v > 0 && v < 1000) return v; const l = parseFloat(t?.["building:levels"]); return Number.isFinite(l) && l > 0 && l < 300 ? l * level_m : default_height_m; };
  const mh = (t) => { const v = parseFloat(t?.min_height); if (Number.isFinite(v) && v >= 0) return v; const l = parseFloat(t?.["building:min_level"]); return Number.isFinite(l) && l >= 0 ? l * level_m : 0; };
  const ring = (geom) => (Array.isArray(geom) ? geom.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon)).map((p) => latLonToLocal(geo, p.lat, p.lon)) : []);
  const push = (id, tags, pts) => {
    if (pts.length > 2 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0, -1); if (pts.length < 3 || pts.length > 2000) return;
    const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
    if (exclude && c[0] > exclude[0] && c[0] < exclude[2] && c[1] > exclude[1] && c[1] < exclude[3]) return;
    const H = h(tags), m = Math.min(mh(tags), H - 0.5); out.push({ id, name: String(tags?.name || "").slice(0, 80), outline: pts.map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]), height_m: +H.toFixed(2), min_height_m: +Math.max(0, m).toFixed(2) });
  };
  for (const e of els) {
    if (e.type === "way" && e.tags?.building) push(`w${e.id}`, e.tags, ring(e.geometry));
    else if (e.type === "relation" && e.tags?.building && Array.isArray(e.members)) for (const [k, m] of e.members.entries()) if (m.role === "outer" && m.type === "way") push(`r${e.id}.${k}`, e.tags, ring(m.geometry));
  }
  return out;
}
