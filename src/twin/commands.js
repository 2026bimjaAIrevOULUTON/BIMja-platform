// Simulation twin (headless): the sun at the project's real location, and a solar/shadow study on the model.
import { sunPosition, localToUtc, sunTimes, clearSky, sunVector } from "./sun.js";
import { solarStudy } from "./solar.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };
export function installSimTwin(bus) {
  const loc = () => bus.extra.geo?.location || fail("place the project on the earth first: geolocate {lat, lon}", "no_location");
  bus.register("sun", (a) => {
    const L = loc(); const tz = a.timezone != null ? +a.timezone : L.timezone; const date = a.date || "2026-06-21", time = a.time || "12:00";
    const p = sunPosition(L.lat, L.lon, localToUtc(date, time, tz)); const v = sunVector(p.azimuth_deg, p.elevation_deg, L.orient_deg || 0); const irr = clearSky(p.elevation_deg, bus.extra.geo.anchor?.height || 0);
    return { date, time, timezone: tz, azimuth_deg: +p.azimuth_deg.toFixed(3), elevation_deg: +p.elevation_deg.toFixed(3), above_horizon: p.elevation_deg > 0, direction: v.map((x) => +x.toFixed(6)), dni_w_m2: Math.round(irr.dni), dhi_w_m2: Math.round(irr.dhi), ...sunTimes(L.lat, L.lon, date, tz) };
  }, { kind: "read" });
  bus.register("solar_study", (a) => {
    loc(); const step = a.step_min != null ? +a.step_min : 60; if (!(step >= 5 && step <= 240)) fail("step_min between 5 and 240");
    const r = solarStudy(bus.model, bus.extra.geo, { date: a.date || "2026-06-21", from: a.from, to: a.to, step_min: step, res: Math.min(1024, Math.max(128, +a.res || 384)), clouds: Array.isArray(a.cloud_cover) ? (a.cloud_cover.length === 24 && a.cloud_cover.every((v) => Number.isFinite(+v) && v >= 0 && v <= 100) ? a.cloud_cover.map(Number) : fail("cloud_cover: 24 hourly values, 0 to 100 %")) : null });
    bus.simCache = { date: r.date, elements: Object.fromEntries(r.elements.map((e) => [e.id, e.kwh_m2_day])), ground: r.ground }; // for the exposure view only: not saved, not part of the model
    return a.full ? r : { ...r, elements: r.elements.sort((x, y) => y.kwh_m2_day - x.kwh_m2_day).slice(0, 25), ground: { cell_m: r.ground.cell_m, max_shadow_m2: r.ground.max_shadow_m2, cells_ever_shaded: r.ground.hours_in_shadow.length } };
  }, { kind: "read" });
  return bus;
}
