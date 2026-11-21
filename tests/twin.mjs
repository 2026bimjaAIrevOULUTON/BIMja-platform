// Location and simulation twin: UTM + convergence against proj4, sun position and times against known values,
// shadows against a hand calculation, OSM context parsing, and the georeferenced IFC validated by IfcOpenShell.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import proj4 from "proj4";
import { toUtm, fromUtm, epsgOf, proj4Utm, latLonToLocal, localToLatLon } from "../src/geo/utm.js";
import { sunPosition, sunTimes, localToUtc } from "../src/twin/sun.js";
import { osmBuildings, tilesAround, overpassQuery } from "../src/geo/context.js";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";

mkdirSync("dist-test", { recursive: true });
// 1. UTM forward/inverse and grid convergence vs proj4 (five landmark sites + both hemispheres + Norway exception)
for (const [lat, lon] of [[27.175, 78.0421], [25.197139, 55.274111], [39.90611, -79.46806], [47.6003639, 7.6146778], [43.72306, 10.39639], [-33.86, 151.21], [60.1, 5.3]]) {
  const ep = epsgOf(lat, lon); const [E, N] = proj4("EPSG:4326", proj4Utm(ep), [lon, lat]); const u = toUtm(lat, lon, ep % 100);
  assert.ok(Math.abs(u.E - E) < 1e-4 && Math.abs(u.N - N) < 1e-4, `UTM ${lat},${lon}: ${u.E - E}, ${u.N - N}`);
  const b = fromUtm(u.E, u.N, ep % 100, lat < 0); assert.ok(Math.abs(b.lat - lat) < 1e-9 && Math.abs(b.lon - lon) < 1e-9, "inverse");
  const [E2, N2] = proj4("EPSG:4326", proj4Utm(ep), [lon, lat + 0.009]); const g = (Math.atan2(-(E2 - E), N2 - N) * 180) / Math.PI;
  assert.ok(Math.abs(u.gamma_deg - g) < 0.002, `convergence ${u.gamma_deg} vs ${g}`);
}
assert.equal(epsgOf(60.1, 5.3), 32632, "Norway exception zone 32V");

// 2. geolocate: local axes stay true to the earth (1 km local north lands due north)
const bus = installCore(new Bus()); const ex = (n, a) => bus.execute({ name: n, args: a, actor: "agent:test", apply: true });
assert.equal(ex("geolocate", { lat: 95, lon: 0 }).ok, false, "bad latitude refused");
const g = ex("geolocate", { lat: 27.175, lon: 78.0421, height_m: 170, timezone: 5.5, label: "Taj Mahal" }).data; assert.equal(g.crs, "EPSG:32644");
const geo = bus.extra.geo; const n1 = localToLatLon(geo, 0, 1000), e1 = localToLatLon(geo, 1000, 0);
assert.ok(Math.abs(n1.lon - 78.0421) < 1e-7 && n1.lat > 27.175, `north stays north: ${n1.lon}`); assert.ok(Math.abs(e1.lat - 27.175) < 1e-4 && e1.lon > 78.0421, "east stays east");
const back = latLonToLocal(geo, n1.lat, n1.lon); assert.ok(Math.abs(back[0]) < 1e-6 && Math.abs(back[1] - 1000) < 1e-6, "round trip");
assert.ok(bus.execute({ name: "location", args: {}, actor: "human" }).data.google_maps.includes("27.175,78.0421"));

// 3. sun: equinox noon elevation = 90° − latitude; known sunrise/sunset (NOAA calculator, ±3 min)
const eq = sunPosition(51.4769, 0, new Date(Date.UTC(2026, 2, 20, 12, 7))); assert.ok(Math.abs(eq.elevation_deg - (90 - 51.4769)) < 0.6 && Math.abs(eq.azimuth_deg - 180) < 1, `equinox ${eq.elevation_deg}`);
const agra = sunTimes(27.175, 78.0421, "2026-06-21", 5.5); const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
assert.ok(Math.abs(mins(agra.sunrise) - mins("05:23")) <= 3 && Math.abs(mins(agra.sunset) - mins("19:17")) <= 3, JSON.stringify(agra));
const pole = sunTimes(78.2, 15.6, "2026-06-21", 1); assert.equal(pole.day_length_h, 24, "midnight sun in Svalbard");
assert.ok(localToUtc("2026-06-21", "12:00", 5.5).toISOString().startsWith("2026-06-21T06:30"));

// 4. shadows: a 20 × 10 × 10 m block; ground shadow = shadow length × width across the sun, within the grid's resolution
ex("mass", { outline: [[0, 0], [20000, 0], [20000, 10000], [0, 10000]], height: 10000, name: "Block" });
const sun = bus.execute({ name: "sun", args: { date: "2026-12-21", time: "09:00" }, actor: "human" }).data; assert.ok(sun.above_horizon && sun.azimuth_deg > 90 && sun.azimuth_deg < 180, "winter morning sun in the south-east");
const st = bus.execute({ name: "solar_study", args: { date: "2026-12-21", from: "09:00", to: "09:00", step_min: 60, full: true }, actor: "human" }).data;
const s0 = st.steps[0], el = (s0.elevation_deg * Math.PI) / 180, az = (s0.azimuth_deg * Math.PI) / 180; const len = 10 / Math.tan(el);
const across = 20 * Math.abs(Math.cos(az)) + 10 * Math.abs(Math.sin(az)); const exact = len * across;
assert.ok(Math.abs(s0.ground_shadow_m2 - exact) / exact < 0.1, `ground shadow ${s0.ground_shadow_m2} vs ${exact.toFixed(0)} m²`);
const fac = Object.fromEntries(st.facades.map((f) => [f.facade, f])); assert.equal(fac.N.sun_hours, 0, "north face gets no sun on a December morning"); assert.ok(fac.Roof.sun_hours === 1 && fac.S.sun_hours === 1, "roof and south face in sun");
const day = bus.execute({ name: "solar_study", args: { date: "2026-06-21", step_min: 30 }, actor: "human" }).data; const f2 = Object.fromEntries(day.facades.map((f) => [f.facade, f]));
assert.ok(f2.Roof.kwh_m2_day > 6 && f2.Roof.kwh_m2_day < 9.5, `June roof ${f2.Roof.kwh_m2_day} kWh/m² (clear sky, 27°N)`); assert.ok(f2.N.sun_hours > 0, "north face sees early and late sun in June at 27°N");
assert.equal(JSON.stringify(bus.execute({ name: "solar_study", args: { date: "2026-06-21", step_min: 30 }, actor: "human" }).data), JSON.stringify(day), "deterministic");

// 5. OSM context: Overpass JSON -> footprints in local metres, heights from tags, the project's own footprint excluded
const at = (dx, dy) => localToLatLon(geo, dx, dy); const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]].map(([a, b]) => { const p = at(a, b); return { lat: p.lat, lon: p.lon }; });
const fixture = { elements: [{ type: "way", id: 1, tags: { building: "yes", height: "12.5" }, geometry: sq(100, 100, 20) }, { type: "way", id: 2, tags: { building: "house", "building:levels": "3" }, geometry: sq(-80, 40, 10) },
  { type: "way", id: 3, tags: { building: "yes" }, geometry: sq(2, 2, 5) }, { type: "way", id: 4, tags: { highway: "path" }, geometry: sq(50, 50, 5) },
  { type: "relation", id: 5, tags: { building: "yes", height: "30" }, members: [{ type: "way", role: "outer", geometry: sq(200, -60, 30) }, { type: "way", role: "inner", geometry: sq(210, -50, 5) }] }, { type: "way", id: 6, tags: { building: "yes" }, geometry: [{ lat: "x" }] }] };
const blds = osmBuildings(fixture, geo, { exclude: [0, 0, 20, 10] });
assert.deepEqual(blds.map((b) => [b.id, b.height_m]), [["w1", 12.5], ["w2", 9.6], ["r5.0", 30]], "buildings parsed, own footprint and non-buildings skipped");
assert.ok(Math.abs(blds[0].outline[0][0] - 100) < 0.01 && Math.abs(blds[0].outline[0][1] - 100) < 0.01, "footprint lands where it was");
const tiles = tilesAround(geo, 500); assert.ok(tiles.tiles.length >= 4 && tiles.tiles.length <= 100 && tiles.tiles.every((t) => t.url.startsWith("https://tile.openstreetmap.org/")), `${tiles.tiles.length} tiles`);
assert.ok(overpassQuery(geo, 500).includes("around:500,27.175,78.0421"));

// 6. the georeferenced IFC: IfcMapConversion + UTM CRS + true north, schema-valid
const ifc = bus.execute({ name: "export_ifc", args: {}, actor: "human" }).data;
for (const s of ["IFCMAPCONVERSION(", "IFCPROJECTEDCRS('EPSG:32644'", "'UTM','44N'", "IFCSITE("]) assert.ok(ifc.includes(s), `IFC has ${s}`);
writeFileSync("dist-test/located.ifc", ifc); console.log(execFileSync("python3", ["ci/validate_ifc.py", "dist-test/located.ifc"], { encoding: "utf8" }).trim());
const replay = Bus.replay(bus.log, () => installCore(new Bus())); assert.deepEqual(replay.extra.geo, bus.extra.geo, "replay gives the same location");
console.log(`ok twin: UTM = proj4 (<0.1 mm), convergence, sun ±3 min, block shadow ${s0.ground_shadow_m2} vs ${exact.toFixed(0)} m², June roof ${f2.Roof.kwh_m2_day} kWh/m², OSM context parsed, located IFC valid, replay identical`);
