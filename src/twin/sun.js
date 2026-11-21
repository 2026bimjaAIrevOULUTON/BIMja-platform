// Sun position (NOAA Solar Calculator equations, after Meeus; ~0.01° 1800–2100) and clear-sky irradiance.
// Times are local standard time at a fixed UTC offset (no daylight saving), which is what solar studies use.
const D = Math.PI / 180;

/** Julian day from a UTC Date. */
const jd = (t) => t.getTime() / 86400000 + 2440587.5;

/** {azimuth_deg (clockwise from true north), elevation_deg (with refraction), declination_deg, eot_min} */
export function sunPosition(lat, lon, utc) {
  const T = (jd(utc) - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const ecc = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * D) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * D) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * D) * 0.000289;
  const omega = 125.04 - 1934.136 * T; const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * D);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60; const eps = eps0 + 0.00256 * Math.cos(omega * D);
  const decl = Math.asin(Math.sin(eps * D) * Math.sin(lambda * D)) / D;
  const y = Math.tan((eps / 2) * D) ** 2;
  const eot = 4 * (y * Math.sin(2 * L0 * D) - 2 * ecc * Math.sin(M * D) + 4 * ecc * y * Math.sin(M * D) * Math.cos(2 * L0 * D) - 0.5 * y * y * Math.sin(4 * L0 * D) - 1.25 * ecc * ecc * Math.sin(2 * M * D)) / D;
  const minutes = utc.getUTCHours() * 60 + utc.getUTCMinutes() + utc.getUTCSeconds() / 60;
  let ha = (minutes + eot + 4 * lon) / 4 - 180; if (ha < -180) ha += 360;
  const cz = Math.sin(lat * D) * Math.sin(decl * D) + Math.cos(lat * D) * Math.cos(decl * D) * Math.cos(ha * D);
  const zen = Math.acos(Math.min(1, Math.max(-1, cz))) / D; const el0 = 90 - zen;
  let az = Math.acos(Math.min(1, Math.max(-1, (Math.sin(lat * D) * cz - Math.sin(decl * D)) / (Math.cos(lat * D) * Math.sin(zen * D) || 1e-12)))) / D;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  const te = Math.tan(el0 * D); // atmospheric refraction (NOAA)
  const refr = el0 > 85 ? 0 : el0 > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5 : el0 > -0.575 ? 1735 + el0 * (-518.2 + el0 * (103.4 + el0 * (-12.79 + el0 * 0.711))) : -20.772 / te;
  return { azimuth_deg: az, elevation_deg: el0 + refr / 3600, declination_deg: decl, eot_min: eot };
}

/** Local standard time string pieces -> UTC Date. tz = hours east of UTC. */
export function localToUtc(date, time, tz) {
  const [Y, Mo, Dd] = String(date).split("-").map(Number); const [h, mi = 0] = String(time).split(":").map(Number);
  if (![Y, Mo, Dd, h, mi].every(Number.isFinite)) throw Object.assign(new Error("date YYYY-MM-DD and time HH:MM"), { code: "bad_arg" });
  return new Date(Date.UTC(Y, Mo - 1, Dd, h, mi) - tz * 3600000);
}

/** Sunrise, solar noon, sunset (local standard time HH:MM) by bisection on elevation = -0.833°. */
export function sunTimes(lat, lon, date, tz) {
  const el = (m) => sunPosition(lat, lon, localToUtc(date, `${Math.floor(m / 60)}:${m % 60}`, tz)).elevation_deg;
  const f = (m) => sunPosition(lat, lon, new Date(localToUtc(date, "0:00", tz).getTime() + m * 60000)).elevation_deg + 0.833;
  let noon = 0, best = -99; for (let m = 0; m < 1440; m += 5) { const e = el(m); if (e > best) { best = e; noon = m; } }
  for (let step = 2.5; step > 0.01; step /= 2) { const a = f(noon - step), b = f(noon + step); noon += a > b ? -step : step; }
  const root = (lo, hi) => { if (Math.sign(f(lo)) === Math.sign(f(hi))) return null; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const hm = (m) => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60) % 60).padStart(2, "0")}`);
  const rise = root(noon - 720, noon), set = root(noon, noon + 720);
  return { sunrise: hm(rise), solar_noon: hm(noon), sunset: hm(set), day_length_h: rise != null && set != null ? +((set - rise) / 60).toFixed(2) : best > 0 ? 24 : 0, max_elevation_deg: +best.toFixed(2) };
}

/** Clear-sky beam (DNI) and diffuse horizontal irradiance, W/m² (Meinel beam attenuation, Kasten–Young air mass). */
export function clearSky(elevation_deg, altitude_m = 0) {
  if (elevation_deg <= 0) return { dni: 0, dhi: 0 };
  const zen = 90 - elevation_deg; const am = 1 / (Math.cos(zen * D) + 0.50572 * (96.07995 - zen) ** -1.6364);
  const ah = Math.min(altitude_m, 4000) / 1000; const dni = 1361 * ((1 - 0.14 * ah) * 0.7 ** (am ** 0.678) + 0.14 * ah);
  return { dni, dhi: 0.1 * dni * Math.sin(elevation_deg * D) + 20 * Math.sin(elevation_deg * D) };
}

/** Unit vector toward the sun in project axes (x east, y north, z up) after the building's orientation. */
export function sunVector(az_deg, el_deg, orient_deg = 0) {
  const a = az_deg * D, e = el_deg * D, o = orient_deg * D; const x = Math.sin(a) * Math.cos(e), y = Math.cos(a) * Math.cos(e);
  return [x * Math.cos(o) + y * Math.sin(o), -x * Math.sin(o) + y * Math.cos(o), Math.sin(e)];
}
