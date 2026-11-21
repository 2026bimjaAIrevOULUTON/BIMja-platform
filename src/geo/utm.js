// UTM on WGS84 without a projection library: Krüger series (Karney 2011, 6th order), sub-millimetre inside a zone.
// Used to georeference a project from a map pin headlessly (agents, MCP, CI) and to bring map context into local
// coordinates. proj4 stays the reference in tests.
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996, E0 = 500000;
const n = F / (2 - F), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
const AA = (A / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
const alpha = [n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4 - (127 / 288) * n5 + (7891 / 37800) * n6,
  (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4 + (281 / 630) * n5 - (1983433 / 1935360) * n6,
  (61 / 240) * n3 - (103 / 140) * n4 + (15061 / 26880) * n5 + (167603 / 181440) * n6,
  (49561 / 161280) * n4 - (179 / 168) * n5 + (6601661 / 7257600) * n6,
  (34729 / 80640) * n5 - (3418889 / 1995840) * n6, (212378941 / 319334400) * n6];
const beta = [n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4 - (81 / 512) * n5 + (96199 / 604800) * n6,
  (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4 + (46 / 105) * n5 - (1118711 / 3870720) * n6,
  (17 / 480) * n3 - (37 / 840) * n4 - (209 / 4480) * n5 + (5569 / 90720) * n6,
  (4397 / 161280) * n4 - (11 / 504) * n5 - (830251 / 7257600) * n6,
  (4583 / 161280) * n5 - (108847 / 3991680) * n6, (20648693 / 638668800) * n6];
const e = Math.sqrt(F * (2 - F)); const D = Math.PI / 180;

export const zoneOf = (lon, lat = 0) => { let z = Math.floor((lon + 180) / 6) + 1; if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32; return Math.min(60, Math.max(1, z)); };
export const epsgOf = (lat, lon) => (lat >= 0 ? 32600 : 32700) + zoneOf(lon, lat);
export const proj4Utm = (epsg) => { const z = epsg % 100, south = epsg > 32700; return `+proj=utm +zone=${z}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`; };

/** lat/lon (deg) -> {E, N, gamma_deg (grid convergence: true north is gamma_deg anticlockwise of grid north), k (scale)} */
export function toUtm(lat, lon, zone = zoneOf(lon, lat)) {
  const lon0 = (zone - 1) * 6 - 180 + 3; const phi = lat * D, lam = (lon - lon0) * D;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(lam)), eta1 = Math.asinh(Math.sin(lam) / Math.hypot(t, Math.cos(lam)));
  let xi = xi1, eta = eta1, p = 1, q = 0;
  for (let j = 1; j <= 6; j++) { const a = alpha[j - 1]; xi += a * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1); eta += a * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
    p += 2 * j * a * Math.cos(2 * j * xi1) * Math.cosh(2 * j * eta1); q += 2 * j * a * Math.sin(2 * j * xi1) * Math.sinh(2 * j * eta1); }
  const E = E0 + K0 * AA * eta, N = (lat < 0 ? 10000000 : 0) + K0 * AA * xi;
  const gamma = Math.atan((t / Math.sqrt(1 + t * t)) * Math.tan(lam)) + Math.atan2(q, p);
  const k = K0 * (AA / A) * Math.sqrt(1 + ((1 - e * e) * Math.tan(phi) ** 2)) * Math.sqrt(p * p + q * q) / Math.hypot(t, Math.cos(lam));
  return { E, N, gamma_deg: gamma / D, k, zone };
}

/** UTM -> lat/lon (deg). */
export function fromUtm(E, N, zone, south = false) {
  const lon0 = (zone - 1) * 6 - 180 + 3; const xi = (N - (south ? 10000000 : 0)) / (K0 * AA), eta = (E - E0) / (K0 * AA);
  let xi1 = xi, eta1 = eta; for (let j = 1; j <= 6; j++) { xi1 -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); eta1 -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const tp = Math.sin(xi1) / Math.hypot(Math.sinh(eta1), Math.cos(xi1)); const lam = Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  let t = tp; for (let i = 0; i < 6; i++) { const s = Math.sqrt(1 + t * t), sg = Math.sinh(e * Math.atanh(e * t / s)); const tpi = t * Math.sqrt(1 + sg * sg) - sg * s; t += (tp - tpi) / Math.sqrt(1 + tpi * tpi) * ((1 + (1 - e * e) * t * t) / ((1 - e * e) * s)); }
  return { lat: Math.atan(t) / D, lon: lon0 + lam / D };
}

/** Local project metres (x east, y true north at the origin, after `orient_deg` turn of the building) <-> lat/lon, from a geo record. */
export function localToLatLon(geo, x, y) {
  const a = geo.anchor, r = (a.rotation_deg * Math.PI) / 180, s = a.scale || 1;
  const E = a.easting + s * (x * Math.cos(r) - y * Math.sin(r)), N = a.northing + s * (x * Math.sin(r) + y * Math.cos(r));
  const ep = +String(geo.crs).slice(5); return fromUtm(E, N, ep % 100, ep > 32700);
}
export function latLonToLocal(geo, lat, lon) {
  const ep = +String(geo.crs).slice(5); const u = toUtm(lat, lon, ep % 100); const a = geo.anchor, r = (a.rotation_deg * Math.PI) / 180, s = a.scale || 1;
  const dE = (u.E - a.easting) / s, dN = (u.N - a.northing) / s; return [dE * Math.cos(r) + dN * Math.sin(r), -dE * Math.sin(r) + dN * Math.cos(r)];
}
