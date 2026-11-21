// City context from OpenStreetMap and live site data: real OSM features land where they are, indicative elements
// say so, layers carry into the IFC, everything replays; live feeds parse real captured responses.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
import { normalizeWeather, normalizeAir, normalizeQuakes, cloudFactor, weatherUrl } from "../src/twin/live.js";
import { landmarkProject, landmarkStages } from "../src/app/landmarks.js";
import { latLonToLocal } from "../src/geo/utm.js";
import { parseOSM } from "../src/geo/osm-city.js";
await (await import("../src/author/kernel.js")).loadKernel();
mkdirSync("dist-test", { recursive: true });

// 1. live feeds (real responses captured from the APIs)
const fx = (f) => JSON.parse(readFileSync(`tests/fixtures/${f}`, "utf8"));
const w = normalizeWeather(fx("openmeteo-weather-agra.json")); assert.ok(w && Number.isFinite(w.temp_c) && w.wind_ms >= 0 && w.hourly.length === 48 && /^[NESW]{1,3}$/.test(w.wind_from), JSON.stringify(w).slice(0, 200));
const a = normalizeAir(fx("openmeteo-aq-agra.json")); assert.ok(a && Number.isFinite(a.us_aqi) && typeof a.us_band === "string");
const qk = normalizeQuakes(fx("usgs-2.5-week.json"), { lat: 27.175, lon: 78.0421 }, 20000); assert.ok(qk.length > 0 && qk.every((x, i) => i === 0 || x.distance_km >= qk[i - 1].distance_km), "quakes nearest first");
for (const bad of [null, {}, { current: {} }, { features: "x" }]) { assert.equal(normalizeWeather(bad), null); assert.equal(normalizeAir(bad), null); assert.equal(normalizeQuakes(bad, { lat: 0, lon: 0 }), null); }
assert.equal(cloudFactor(0), 1); assert.ok(Math.abs(cloudFactor(100) - 0.25) < 1e-9); assert.ok(weatherUrl({ lat: 27.175, lon: 78.0421 }).startsWith("https://api.open-meteo.com/v1/forecast?latitude=27.1750&longitude=78.0421"));

// 2. Taj + its city: layers, real vs indicative, footprint excluded, IFC layers, replay
const bus = installCore(new Bus()); const ex = (n, x) => bus.execute({ name: n, args: x, actor: "agent:claude", apply: true });
const lp = landmarkProject("taj"); ex("load_project", { project: lp.project }); assert.ok(ex("script", { commands: lp.landmark.commands }).ok); ex("geolocate", landmarkStages("taj")[0].args);
const osm = readFileSync("public/context/agra-taj-mahal.osm", "utf8");
const plan = bus.execute({ name: "city_plan", args: { osm, radius_m: 450, exclude: [-50, -50, 50, 50] }, actor: "agent:claude" }); assert.ok(plan.ok, JSON.stringify(plan.refusals));
const P = plan.data; const names = P.layers.map((l) => l.layer);
for (const k of ["L-WATER", "L-LANDSCAPE", "C-ROAD", "C-FOOTWAY", "C-KERB", "P-WATER", "P-SEWER", "P-STORM", "E-LIGHTING", "A-BUILDING", "L-TREES"]) assert.ok(names.includes(k), `layer ${k} present (${names})`);
for (const l of P.layers) if (!l.real) assert.ok(/indicative|not surveyed/i.test(l.title), `${l.layer} says it is indicative`);
for (const l of P.layers.filter((x) => ["P-WATER", "P-SEWER", "P-STORM", "E-DUCT", "A-INFILL", "C-KERB"].includes(x.layer))) for (const c of l.commands.filter((x) => x.name !== "place")) assert.ok(/indicative|not surveyed|Kerb/i.test(c.args.name), `named indicative: ${c.args.name}`);
assert.ok(ex("script", { commands: P.families }).ok); for (const l of P.layers) { const r = ex("script", { commands: l.commands }); assert.ok(r.ok, `${l.layer}: ${JSON.stringify(r.refusals)}`); }
const els = Object.values(bus.model.data.elements); const city = els.filter((e) => e.layer);
assert.ok(!city.some((e) => e.layer === "A-BUILDING" && e.outline.every(([x, y]) => Math.abs(x) < 50000 && Math.abs(y) < 50000)), "the OSM footprint of the mausoleum is replaced by our model");
const trees = [...parseOSM(osm).nodes.values()].filter((n) => n.tags.natural === "tree").map((n) => latLonToLocal(bus.extra.geo, n.lat, n.lon).map((v) => Math.round(v * 1000)));
for (const c of P.layers.find((l) => l.layer === "L-TREES").commands) assert.ok(trees.some((t) => t[0] === c.args.at[0] && t[1] === c.args.at[1]), "every tree sits exactly on an OSM tree node");
const pipes = city.filter((e) => e.layer === "P-SEWER" && e.shape === "sweep"); assert.ok(pipes.length && pipes.every((e) => e.path.every((p) => p[2] < -2000)), "sewers are underground");
const cl = bus.execute({ name: "clash_model", args: { a: "P", b: "E", min_volume_m3: 0.001 }, actor: "human" }); assert.ok(cl.ok, "services clash check runs");
const ifc = bus.execute({ name: "export_ifc", args: {}, actor: "human" }).data;
for (const s of ["IFCPRESENTATIONLAYERASSIGNMENT('C-ROAD'", "IFCPRESENTATIONLAYERASSIGNMENT('P-SEWER'", "'BIMja_Coordination'", "IFCPIPESEGMENT("]) assert.ok(ifc.includes(s), `IFC has ${s}`);
writeFileSync("dist-test/taj-city.ifc", ifc); console.log(execFileSync("python3", ["ci/validate_ifc.py", "dist-test/taj-city.ifc"], { encoding: "utf8" }).trim());
const again = bus.execute({ name: "city_plan", args: { osm, radius_m: 450, exclude: [-50, -50, 50, 50] }, actor: "agent:claude" }).data; assert.equal(JSON.stringify(again.layers), JSON.stringify(P.layers), "deterministic plan");
const replay = Bus.replay(bus.log, () => installCore(new Bus())); assert.equal(Object.keys(replay.model.data.elements).length, els.length, "replay rebuilds the city");

// 3. solar study with the live cloud forecast is lower than clear sky
const day = w.hourly[0].time.slice(0, 10); const clouds = Array.from({ length: 24 }, (_, i) => w.hourly.find((x) => x.time === `${day}T${String(i).padStart(2, "0")}:00`).cloud_pct);
const b2 = installCore(new Bus()); b2.execute({ name: "mass", args: { outline: [[0, 0], [20000, 0], [20000, 10000], [0, 10000]], height: 10000 }, actor: "human", apply: true }); b2.execute({ name: "geolocate", args: { lat: 27.175, lon: 78.0421, timezone: 5.5 }, actor: "human", apply: true });
const clear = b2.execute({ name: "solar_study", args: { date: day, step_min: 60 }, actor: "human" }).data, cloudy = b2.execute({ name: "solar_study", args: { date: day, step_min: 60, cloud_cover: clouds.map((c) => Math.max(c, 60)) }, actor: "human" }).data;
const roof = (d) => d.facades.find((f) => f.facade === "Roof").kwh_m2_day; assert.ok(roof(cloudy) < roof(clear), `clouds lower the yield ${roof(cloudy)} < ${roof(clear)}`);
assert.equal(b2.execute({ name: "solar_study", args: { cloud_cover: [1, 2] }, actor: "human" }).ok, false, "bad cloud array refused");
console.log(`ok city: ${P.stats.commands} commands in ${P.layers.length} layers (${P.stats.osm_buildings} OSM buildings, ${P.stats.infill_blocks} infill, ${P.stats.roads} roads), IFC layers, replay identical; live weather ${w.temp_c} °C ${w.wind_ms} m/s from ${w.wind_from}, US AQI ${a.us_aqi} (${a.us_band}), ${qk.length} quakes parsed; cloudy roof ${roof(cloudy)} vs clear ${roof(clear)} kWh/m²`);
