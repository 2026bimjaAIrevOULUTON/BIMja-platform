// Headless georeferencing from a map pin: one command puts the project on the earth (UTM CRS, IfcMapConversion
// anchor with grid convergence, true north, site pin). The same record drives the IFC, the map, map context and the
// sun simulation. Works in Node (agents, MCP, CI) without a projection library.
import { toUtm, epsgOf, proj4Utm } from "./utm.js";
import { parseOSM, cityLayers } from "./osm-city.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };
export function installGeo(bus) {
  bus.register("geolocate", (a) => {
    const lat = +a.lat, lon = +a.lon; if (!(Math.abs(lat) <= 84 && Math.abs(lon) <= 180)) fail("lat/lon in degrees (WGS84) between 84°S and 84°N, e.g. from a Google Maps pin");
    const height = a.height_m != null ? +a.height_m : 0, orient = a.orient_deg != null ? +a.orient_deg : 0;
    if (!Number.isFinite(height) || !Number.isFinite(orient)) fail("height_m and orient_deg must be numbers");
    const ep = a.epsg ? +String(a.epsg).replace(/\D/g, "") : epsgOf(lat, lon); if (!((ep > 32600 && ep <= 32660) || (ep > 32700 && ep <= 32760))) fail("epsg must be a WGS84 UTM zone (EPSG:326xx or 327xx)");
    const u = toUtm(lat, lon, ep % 100);
    const geo = (bus.extra.geo = { ...(bus.extra.geo || {}), crs: `EPSG:${ep}`, def: proj4Utm(ep), description: `WGS 84 / UTM zone ${ep % 100}${ep > 32700 ? "S" : "N"}`,
      anchor: { easting: +u.E.toFixed(3), northing: +u.N.toFixed(3), height, rotation_deg: +(u.gamma_deg + orient).toFixed(6), scale: 1 },
      location: { lat, lon, label: a.label ? String(a.label).slice(0, 80) : undefined, orient_deg: orient, convergence_deg: +u.gamma_deg.toFixed(6), timezone: a.timezone != null ? +a.timezone : Math.round(lon / 15) } });
    (bus.extra.site ||= { points: [] }).pin = { lat, lon, label: geo.location.label };
    return { crs: geo.crs, anchor: geo.anchor, convergence_deg: geo.location.convergence_deg, google_maps: `https://www.google.com/maps/@${lat},${lon},18z`, timezone: geo.location.timezone };
  });
  bus.register("location", () => { const g = bus.extra.geo; if (!g?.location) return { located: false }; return { located: true, ...g.location, crs: g.crs, anchor: g.anchor, google_maps: `https://www.google.com/maps/@${g.location.lat},${g.location.lon},18z` }; }, { kind: "read" });
  bus.register("city_plan", (a) => {
    if (!bus.extra.geo?.location) fail("place the project on the earth first: geolocate {lat, lon}", "no_location");
    if (typeof a.osm !== "string" && typeof a.osm !== "object") fail("osm: the OpenStreetMap XML (API map call) or JSON (Overpass) text");
    const r = Math.min(3000, Math.max(50, +a.radius_m || 600)); const osm = parseOSM(a.osm);
    const out = cityLayers(osm, bus.extra.geo, { radius_m: r, exclude: Array.isArray(a.exclude) ? a.exclude.map(Number) : null, infill: a.infill !== false, services: a.services !== false, furniture: a.furniture !== false });
    return { ...out, run: "script the families first, then each layer: script {commands: layer.commands}" };
  }, { kind: "read" });
  return bus;
}
