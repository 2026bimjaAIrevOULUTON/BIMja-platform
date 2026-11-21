// Georeferencing: project CRS (EPSG code, never a bare lat/long) + IfcMapConversion-style anchor.
// local (metres, IFC frame: x east-ish, y north-ish, z up) -> map (E, N, H in the CRS) -> WGS84 lon/lat via proj4js.
let proj4lib = null;
export async function proj4() { proj4lib ||= (await import("proj4")).default; return proj4lib; }
export const proj4Sync = () => proj4lib;

// Common EPSG definitions (proj4 strings as published by EPSG/epsg.io). Others: pass `proj4` with the code.
const KNOWN = {
  "EPSG:4326": "+proj=longlat +datum=WGS84 +no_defs",
  "EPSG:3857": "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs",
  "EPSG:27700": "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
  "EPSG:7755": "+proj=lcc +lat_0=24 +lon_0=80 +lat_1=12.472955 +lat_2=35.1728044444444 +x_0=4000000 +y_0=4000000 +datum=WGS84 +units=m +no_defs",
  "EPSG:2263": "+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000.0000000001 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs",
  "EPSG:2154": "+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};
export function definitionFor(code, custom) {
  const c = String(code || "").toUpperCase().replace(/^EPSG\s*:?\s*/, "EPSG:");
  if (!/^EPSG:\d{4,6}$/.test(c)) throw Object.assign(new Error(`CRS must be an EPSG code like "EPSG:32643" (got "${code}")`), { code: "bad_arg" });
  if (custom) return { code: c, def: String(custom) };
  if (KNOWN[c]) return { code: c, def: KNOWN[c] };
  const n = +c.slice(5);
  if (n >= 32601 && n <= 32660) return { code: c, def: `+proj=utm +zone=${n - 32600} +datum=WGS84 +units=m +no_defs` };
  if (n >= 32701 && n <= 32760) return { code: c, def: `+proj=utm +zone=${n - 32700} +south +datum=WGS84 +units=m +no_defs` };
  if (n >= 25828 && n <= 25838) return { code: c, def: `+proj=utm +zone=${n - 25800} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs` };
  throw Object.assign(new Error(`${c} is not built in. Pass its proj4 definition (from epsg.io) as "proj4".`), { code: "bad_arg" });
}

/** IfcMapConversion: E = E0 + s(x·a − y·b), N = N0 + s(x·b + y·a), H = H0 + z, with (a, b) the unit x-axis in map terms. */
export function localToMap(p, anchor) {
  const r = ((anchor.rotation_deg || 0) * Math.PI) / 180, a = Math.cos(r), b = Math.sin(r), s = anchor.scale || 1;
  return [anchor.easting + s * (p[0] * a - p[1] * b), anchor.northing + s * (p[0] * b + p[1] * a), (anchor.height || 0) + (p[2] || 0)];
}
export function mapToLocal(m, anchor) {
  const r = ((anchor.rotation_deg || 0) * Math.PI) / 180, a = Math.cos(r), b = Math.sin(r), s = anchor.scale || 1;
  const dx = (m[0] - anchor.easting) / s, dy = (m[1] - anchor.northing) / s; return [dx * a + dy * b, -dx * b + dy * a, (m[2] || 0) - (anchor.height || 0)];
}
export async function mapToWgs84(m, crs) { const P = await proj4(); const [lon, lat] = P(crs.def, "EPSG:4326", [m[0], m[1]]); return [lon, lat]; }
export async function wgs84ToMap(ll, crs) { const P = await proj4(); return P("EPSG:4326", crs.def, ll); }

/** Read the georeference written in an IFC (web-ifc api + model id), or null. */
export function readIfcGeoref(api, modelID, WebIFC) {
  const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION); if (!ids || !ids.size()) return null;
  const mc = api.GetLine(modelID, ids.get(0), true); const v = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);
  const crsName = v(mc.TargetCRS?.Name) || null; const a = +v(mc.XAxisAbscissa ?? 1), b = +v(mc.XAxisOrdinate ?? 0);
  return { crs: crsName, anchor: { easting: +v(mc.Eastings), northing: +v(mc.Northings), height: +v(mc.OrthogonalHeight ?? 0), rotation_deg: (Math.atan2(b, a) * 180) / Math.PI, scale: +v(mc.Scale ?? 1) } };
}
