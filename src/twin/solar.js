// Solar and shadow simulation on the model's own geometry: for each time step the scene is rasterised into a
// depth buffer looking from the sun (orthographic), so every surface sample and ground point knows whether it is in
// sun or in shadow. Integrates clear-sky irradiance per element and per facade orientation, sun hours, and the
// ground area in shadow. Deterministic and headless (Node, MCP, CI); the browser shows the same sun with shadows.
import { modelTriangles } from "../docs/mesh.js";
import { sunPosition, localToUtc, clearSky, sunVector, sunTimes } from "./sun.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Depth buffer from the sun direction s (unit, toward the sun). Returns a lit(p) test. Coordinates in metres. */
function sunBuffer(tris, s, box, res) {
  const up = Math.abs(s[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1]; const U = nrm(cross(up, s)), V = cross(s, U);
  const P = (x, y, z) => [x * U[0] + y * U[1] + z * U[2], x * V[0] + y * V[1] + z * V[2], -(x * s[0] + y * s[1] + z * s[2])]; // depth grows away from the sun
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, y, z] of box) { const p = P(x, y, z); u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
  const W = res, H = res, cu = (u1 - u0) / W || 1, cv = (v1 - v0) / H || 1; const Z = new Float32Array(W * H).fill(Infinity);
  for (const T of tris) for (let i = 0; i < T.length; i += 9) {
    const a = P(T[i], T[i + 1], T[i + 2]), b = P(T[i + 3], T[i + 4], T[i + 5]), c = P(T[i + 6], T[i + 7], T[i + 8]);
    const ax = (a[0] - u0) / cu, ay = (a[1] - v0) / cv, bx = (b[0] - u0) / cu, by = (b[1] - v0) / cv, cx = (c[0] - u0) / cu, cy = (c[1] - v0) / cv;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(area) < 1e-9) continue;
    const xmin = Math.max(0, Math.floor(Math.min(ax, bx, cx))), xmax = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), ymin = Math.max(0, Math.floor(Math.min(ay, by, cy))), ymax = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = ymin; y <= ymax; y++) for (let x = xmin; x <= xmax; x++) {
      const px = x + 0.5, py = y + 0.5; const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue; // slight dilation closes cracks between triangles
      const d = w0 * a[2] + w1 * b[2] + w2 * c[2]; const k = y * W + x; if (d < Z[k]) Z[k] = d;
    }
  }
  const cell = Math.max(cu, cv);
  // slope-scaled bias: a surface at a grazing angle to the sun changes depth fast across one cell
  return { lit: (x, y, z, cosi = 1) => { const p = P(x, y, z); const ix = Math.floor((p[0] - u0) / cu), iy = Math.floor((p[1] - v0) / cv); if (ix < 0 || iy < 0 || ix >= W || iy >= H) return true;
    const c = Math.max(0.05, Math.min(1, cosi)); const tol = cell * (0.75 + 1.5 * Math.min(12, Math.sqrt(1 - c * c) / c)) + 0.05; return p[2] <= Z[iy * W + ix] + tol; }, cell };
}

const BINS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** Facade orientation of a normal in true-north terms (project normal rotated by the building orientation). */
const binOf = (n, orient) => { if (n[2] > 0.7) return "Roof"; if (n[2] < -0.7) return "Soffit"; const o = (orient * Math.PI) / 180; const e = n[0] * Math.cos(o) - n[1] * Math.sin(o), nn = n[0] * Math.sin(o) + n[1] * Math.cos(o); const az = (Math.atan2(e, nn) * 180) / Math.PI; return BINS[Math.round(((az + 360) % 360) / 45) % 8]; };

/**
 * Solar study for one day. opts: {date, from:"HH:MM", to, step_min, res, ground_margin_m}
 * geo.location: {lat, lon, timezone, orient_deg}; altitude from geo.anchor.height.
 */
export function solarStudy(model, geo, { date = "2026-06-21", from = null, to = null, step_min = 60, res = 384, ground_res = 96 } = {}) {
  const L = geo.location; const tz = L.timezone ?? Math.round(L.lon / 15); const times = sunTimes(L.lat, L.lon, date, tz);
  const t0 = from || times.sunrise || "06:00", t1 = to || times.sunset || "18:00"; const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  // geometry in metres: per element triangles with area, centroid and normal
  const els = modelTriangles(model).map((e) => ({ ...e, tris: Float64Array.from(e.tris, (v) => v / 1000) }));
  if (!els.length) throw Object.assign(new Error("the model has no geometry to simulate"), { code: "bad_arg" });
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const e of els) for (let i = 0; i < e.tris.length; i += 3) { x0 = Math.min(x0, e.tris[i]); x1 = Math.max(x1, e.tris[i]); y0 = Math.min(y0, e.tris[i + 1]); y1 = Math.max(y1, e.tris[i + 1]); z0 = Math.min(z0, e.tris[i + 2]); z1 = Math.max(z1, e.tris[i + 2]); }
  const samples = []; // {el, area, c:[..], n:[..], bin}
  const target = Math.max(1, (Math.max(x1 - x0, y1 - y0, z1 - z0) / 150) ** 2); // ~150 samples across the model
  for (const [ei, e] of els.entries()) for (let i = 0; i < e.tris.length; i += 9) {
    const a = [e.tris[i], e.tris[i + 1], e.tris[i + 2]], b = [e.tris[i + 3], e.tris[i + 4], e.tris[i + 5]], c = [e.tris[i + 6], e.tris[i + 7], e.tris[i + 8]];
    const cr = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]); const area = Math.hypot(...cr) / 2; if (area < 1e-6) continue;
    const n = nrm(cr), bin = binOf(n, L.orient_deg || 0); const k = Math.min(24, Math.max(1, Math.ceil(Math.sqrt(area / target)))); const sa = area / (k * k);
    // big triangles are split into k² sub-triangles so partial shade is measured, not decided by one centroid
    for (let i2 = 0; i2 < k; i2++) for (let j = 0; j < k - i2; j++) for (const up of [0, 1]) { if (up && j === k - i2 - 1) continue;
      const u = up ? (i2 + 2 / 3) / k : (i2 + 1 / 3) / k, v = up ? (j + 2 / 3) / k : (j + 1 / 3) / k;
      samples.push({ ei, area: sa, c: [a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]), a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2])], n, bin }); }
  }
  // ground grid around the model, sized for long low-sun shadows (capped)
  const H = z1 - z0, reach = Math.min(1500, Math.max(20, H * 5.7)); /* shadows of a sun 10° up */ const gx0 = x0 - reach, gx1 = x1 + reach, gy0 = y0 - reach, gy1 = y1 + reach;
  const gstep = Math.max((gx1 - gx0) / ground_res, (gy1 - gy0) / ground_res); const ground = [];
  for (let x = gx0 + gstep / 2; x < gx1; x += gstep) for (let y = gy0 + gstep / 2; y < gy1; y += gstep) ground.push([x, y]);
  const corners = []; for (const x of [Math.min(x0, gx0), Math.max(x1, gx1)]) for (const y of [Math.min(y0, gy0), Math.max(y1, gy1)]) for (const z of [z0, z1]) corners.push([x, y, z]);
  const perEl = els.map(() => ({ wh: 0, area: 0, sunlit_h: 0 })); for (const s of samples) perEl[s.ei].area += s.area;
  const perBin = {}; const steps = []; const gShade = new Float64Array(ground.length); const alt = geo.anchor?.height || 0;
  for (let m = toMin(t0); m <= toMin(t1); m += step_min) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const sp = sunPosition(L.lat, L.lon, localToUtc(date, hhmm, tz)); if (sp.elevation_deg <= 0.5) continue;
    const s = sunVector(sp.azimuth_deg, sp.elevation_deg, L.orient_deg || 0); const irr = clearSky(sp.elevation_deg, alt); const dt = step_min / 60;
    const buf = sunBuffer(els.map((e) => e.tris), s, corners, res);
    for (const smp of samples) {
      const cosi = dot(smp.n, s); const sky = 0.5 * (1 + smp.n[2]); // isotropic sky view
      const lit = cosi > 0.02 && buf.lit(smp.c[0], smp.c[1], smp.c[2], cosi);
      const g = (lit ? irr.dni * cosi : 0) + irr.dhi * sky; const E = perEl[smp.ei]; E.wh += g * smp.area * dt; if (lit) E.sunlit_h += dt * smp.area;
      const B = (perBin[smp.bin] ||= { area: 0, wh: 0, sunlit_h: 0 }); B.wh += g * smp.area * dt; if (lit) B.sunlit_h += dt * smp.area;
    }
    let shaded = 0; for (let i = 0; i < ground.length; i++) { const [x, y] = ground[i]; if (x > x0 && x < x1 && y > y0 && y < y1) continue; if (!buf.lit(x, y, z0, s[2])) { shaded++; gShade[i] += dt; } }
    steps.push({ time: hhmm, azimuth_deg: +sp.azimuth_deg.toFixed(2), elevation_deg: +sp.elevation_deg.toFixed(2), dni_w_m2: Math.round(irr.dni), ground_shadow_m2: Math.round(shaded * gstep * gstep), shadow_length_m: +(H / Math.tan((sp.elevation_deg * Math.PI) / 180)).toFixed(1) });
  }
  const binArea = {}; for (const s of samples) binArea[s.bin] = (binArea[s.bin] || 0) + s.area;
  const facades = Object.entries(perBin).map(([bin, B]) => ({ facade: bin, area_m2: Math.round(binArea[bin] || 0), kwh_m2_day: +((B.wh / 1000) / (binArea[bin] || 1)).toFixed(2), sun_hours: +(B.sunlit_h / (binArea[bin] || 1)).toFixed(2) }))
    .sort((a, b) => ["Roof", ...BINS, "Soffit"].indexOf(a.facade) - ["Roof", ...BINS, "Soffit"].indexOf(b.facade));
  const elements = els.map((e, i) => ({ id: e.id, name: e.name || e.id, kwh_m2_day: +((perEl[i].wh / 1000) / (perEl[i].area || 1)).toFixed(2), sun_hours: +(perEl[i].sunlit_h / (perEl[i].area || 1)).toFixed(2), area_m2: +perEl[i].area.toFixed(1) }));
  const dayH = steps.length * (step_min / 60); const groundHours = []; for (let i = 0; i < ground.length; i++) if (gShade[i] > 0) groundHours.push([+ground[i][0].toFixed(1), +ground[i][1].toFixed(1), +gShade[i].toFixed(2)]);
  return { date, timezone: tz, location: { lat: L.lat, lon: L.lon }, ...times, step_min, steps, facades, elements, ground: { cell_m: +gstep.toFixed(2), hours_in_shadow: groundHours, max_shadow_m2: Math.max(0, ...steps.map((s) => s.ground_shadow_m2)) },
    method: "Clear-sky irradiance (Meinel beam, Kasten–Young air mass, isotropic diffuse); shadows from a depth buffer cast from the sun over the model's own geometry. No neighbouring buildings, terrain or weather; standard time without daylight saving.", sun_hours_window: +dayH.toFixed(2) };
}
