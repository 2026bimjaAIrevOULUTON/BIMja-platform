// Live context for the twin at the project's real location (ideas from gods-eye-view, MIT, © Bilawal Sidhu;
// BIMja's own code). Keyless, CORS-enabled public sources, called from the browser:
//   Open-Meteo forecast and air quality (CC BY 4.0, open-meteo.com), USGS earthquakes (U.S. public domain).
// Pure URL builders and normalisers here (tested with real captured responses); polling lives in the UI.

export const LIVE_SOURCES = {
  weather: { name: "Open-Meteo forecast", licence: "CC BY 4.0", credit: "Weather data by Open-Meteo.com", every_s: 900 },
  air: { name: "Open-Meteo air quality (CAMS)", licence: "CC BY 4.0", credit: "Air quality by Open-Meteo.com (CAMS)", every_s: 3600 },
  quakes: { name: "USGS earthquakes", licence: "U.S. public domain", credit: "Earthquakes: U.S. Geological Survey", every_s: 300 },
};
const q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
export const weatherUrl = ({ lat, lon }) => `https://api.open-meteo.com/v1/forecast?${q({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,shortwave_radiation", hourly: "temperature_2m,cloud_cover,shortwave_radiation,wind_speed_10m,wind_direction_10m", forecast_days: 2, timezone: "auto" })}`;
export const airUrl = ({ lat, lon }) => `https://air-quality-api.open-meteo.com/v1/air-quality?${q({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), current: "pm10,pm2_5,nitrogen_dioxide,ozone,us_aqi,european_aqi", hourly: "pm2_5,us_aqi", forecast_days: 2, timezone: "auto" })}`;
export const quakesUrl = () => "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const compass = (deg) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

/** Open-Meteo forecast JSON -> {time, temp_c, rh, wind_ms, wind_from_deg, wind_from, gust_ms, cloud_pct, rain_mm, ghi_w_m2, hourly:[{time, cloud_pct, ghi_w_m2, temp_c, wind_ms, wind_from_deg}]} or null */
export function normalizeWeather(j) {
  const c = j?.current; if (!c || typeof c.time !== "string") return null;
  const kmh = (v) => (num(v) == null ? null : +(v / 3.6).toFixed(2)); // Open-Meteo default wind unit is km/h
  const H = j.hourly || {}; const hourly = Array.isArray(H.time) ? H.time.map((t, i) => ({ time: t, cloud_pct: num(H.cloud_cover?.[i]), ghi_w_m2: num(H.shortwave_radiation?.[i]), temp_c: num(H.temperature_2m?.[i]), wind_ms: kmh(H.wind_speed_10m?.[i]), wind_from_deg: num(H.wind_direction_10m?.[i]) })) : [];
  const wd = num(c.wind_direction_10m);
  return { time: c.time, utc_offset_s: num(j.utc_offset_seconds), temp_c: num(c.temperature_2m), rh: num(c.relative_humidity_2m), wind_ms: kmh(c.wind_speed_10m), gust_ms: kmh(c.wind_gusts_10m), wind_from_deg: wd, wind_from: wd == null ? null : compass(wd), cloud_pct: num(c.cloud_cover), rain_mm: num(c.precipitation), ghi_w_m2: num(c.shortwave_radiation), hourly };
}
/** Open-Meteo air-quality JSON -> current pollutants and AQIs, with the US AQI band. */
export function normalizeAir(j) {
  const c = j?.current; if (!c || typeof c.time !== "string") return null; const aqi = num(c.us_aqi);
  const band = aqi == null ? null : aqi <= 50 ? "Good" : aqi <= 100 ? "Moderate" : aqi <= 150 ? "Unhealthy for sensitive groups" : aqi <= 200 ? "Unhealthy" : aqi <= 300 ? "Very unhealthy" : "Hazardous";
  return { time: c.time, pm2_5: num(c.pm2_5), pm10: num(c.pm10), no2: num(c.nitrogen_dioxide), o3: num(c.ozone), us_aqi: aqi, us_band: band, eu_aqi: num(c.european_aqi) };
}
const hav = (a, b, c, d) => { const R = 6371, r = Math.PI / 180; const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
/** USGS GeoJSON -> quakes within radius_km of the site, nearest first. */
export function normalizeQuakes(j, { lat, lon }, radius_km = 1000) {
  if (!Array.isArray(j?.features)) return null;
  return j.features.map((f) => { const [qlon, qlat, depth] = f?.geometry?.coordinates || []; const p = f?.properties || {}; if (!Number.isFinite(qlat) || !Number.isFinite(qlon)) return null;
    return { id: String(f.id || ""), mag: num(p.mag), place: String(p.place || "").slice(0, 120), time: num(p.time) ? new Date(p.time).toISOString() : null, depth_km: num(depth), distance_km: +hav(lat, lon, qlat, qlon).toFixed(1), url: /^https:\/\/earthquake\.usgs\.gov\//.test(p.url || "") ? p.url : null };
  }).filter((x) => x && x.distance_km <= radius_km).sort((a, b) => a.distance_km - b.distance_km);
}
/** Cloud cover (0..100 %) -> factor on clear-sky global irradiance (Kasten & Czeplak 1980: 1 − 0.75·n^3.4). */
export const cloudFactor = (pct) => 1 - 0.75 * Math.pow(Math.min(100, Math.max(0, pct)) / 100, 3.4);
