// Site commands on the bus (headless-safe): import survey data, pin the site, grade a building platform, report.
// State: bus.extra.site. Plan units in commands: model millimetres for anything the user draws (pad), survey
// metres for levels (FFL, pad level). The site local frame is the model frame: x, y in metres = model mm / 1000.
import { parseSurvey, thin } from "./survey.js";
import { buildTIN, heightGrid, contours, grade, autoInterval, gridTriangles } from "./terrain.js";
import { mapToLocal } from "../geo/geo.js";
import { offsetPolygon, polygonArea } from "../author/geom.js";
import { solidOf } from "../author/solids.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };
const b64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

/** Convex hull (monotone chain), CCW. */
function hull(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = []; for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Building footprint (model mm) on the lowest level: walls, floors and ground-touching solids. */
export function footprint(model) {
  const pts = []; const low = [...model.data.levels].sort((a, b) => a.elevation - b.elevation)[0]?.id;
  for (const e of model.elements) {
    if (e.kind === "wall" && e.level === low) pts.push(e.a, e.b);
    else if (e.kind === "floor" && e.level === low) pts.push(...e.boundary);
    else if (e.kind === "mass") { const s = solidOf(e); if (s.zmin <= 1500) for (const v of s.verts) if (v[2] <= s.zmin + 2000) pts.push([v[0], v[1]]); }
  }
  return pts.length >= 3 ? hull(pts) : null;
}

export function siteSurfaces(site) {
  if (!site?.points?.length) return null;
  const key = `${site.points.length}|${site.points[0]}|${site.points[site.points.length - 1]}|${JSON.stringify(site.grading || {})}`;
  if (site.__cache?.key === key) return site.__cache.v;
  const tin = buildTIN(site.points); const grid = heightGrid(tin); const relief = tin.box.z1 - tin.box.z0; const interval = site.interval || autoInterval(relief);
  const v = { tin, grid, interval, existing: contours(grid, interval) };
  if (site.grading) { const g = grade(grid, site.grading); v.proposed = g.grid; v.earthworks = g; v.proposedContours = contours(g.grid, interval); }
  Object.defineProperty(site, "__cache", { value: { key, v }, enumerable: false, configurable: true, writable: true });
  return v;
}

export function installSite(bus) {
  const S = () => (bus.extra.site ||= { origin: null, points: [], sources: [] });

  bus.register("survey_import", (a) => {
    const site = S(); let pts = a.points, info = a.info;
    if (!pts) {
      if (a.data == null && a.base64 == null) fail("give data (text) or base64 (binary LAS/PLY) and a format: csv, xyz, dxf, landxml, las, ply");
      const r = parseSurvey(a.format, a.base64 != null ? b64(a.base64) : a.data); if (!r.ok) fail(r.error);
      const anchor = bus.extra.geo?.anchor; const coords = a.coords || (r.points[0] && Math.abs(r.points[0][0]) > 20000 ? "map" : "local");
      let raw = thin(r.points, 20000);
      if (coords === "map" && anchor && Number.isFinite(anchor.easting)) raw = raw.map((p) => { const l = mapToLocal([p[0], p[1], 0], anchor); return [l[0], l[1], p[2]]; });
      else if (coords === "map") { site.origin ||= [Math.round(raw.reduce((s, p) => s + p[0], 0) / raw.length), Math.round(raw.reduce((s, p) => s + p[1], 0) / raw.length)]; raw = raw.map((p) => [p[0] - site.origin[0], p[1] - site.origin[1], p[2]]); }
      pts = raw.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3), +p[2].toFixed(3)]); info = { ...r.info, coords, kept: pts.length };
      a.points = pts; a.info = info; if (site.origin) a.origin = site.origin; delete a.data; delete a.base64; // the log keeps the parsed levels (and origin), not the file
    }
    if (!Array.isArray(pts) || pts.length < 3) fail("need at least 3 points");
    site.points = a.merge ? [...site.points, ...pts] : pts; site.sources = [...(a.merge ? site.sources : []), { name: String(a.name || info?.format || "survey").slice(0, 80), ...info }];
    if (a.origin) site.origin = a.origin;
    const v = siteSurfaces(site); const b = v.tin.box;
    return { points: site.points.length, triangles: v.tin.triangles.length / 3, extent_m: [+(b.x1 - b.x0).toFixed(1), +(b.y1 - b.y0).toFixed(1)], levels_m: [+b.z0.toFixed(3), +b.z1.toFixed(3)], contour_interval_m: v.interval, contours: v.existing.length, source: info };
  });

  bus.register("site_pin", (a) => {
    const lat = +a.lat, lon = +a.lon; if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) fail("lat/lon in degrees (WGS84), e.g. from a Google Maps pin");
    S().pin = { lat, lon, label: a.label ? String(a.label).slice(0, 80) : undefined };
    const zone = Math.floor((lon + 180) / 6) + 1; return { pin: S().pin, suggested_crs: `EPSG:${lat >= 0 ? 32600 + zone : 32700 + zone}` };
  });

  bus.register("site_grade", (a) => {
    const site = S(); if (!site.points.length) fail("import survey data first (survey_import)");
    const base = siteSurfaces({ ...site, grading: null, __cache: undefined }) || fail("no terrain");
    let pad = a.pad ? a.pad.map((p) => [p[0] / 1000, p[1] / 1000]) : null;
    if (!pad) { const fp = footprint(bus.model); if (!fp) fail("no building footprint yet: draw or load a building, or pass pad:[[x,y],...] in mm");
      let f = fp; if (polygonArea(f) < 0) f = f.slice().reverse(); pad = offsetPolygon(f, a.margin ?? 2000).map((p) => [p[0] / 1000, p[1] / 1000]); }
    const cx = pad.reduce((s, p) => s + p[0], 0) / pad.length, cy = pad.reduce((s, p) => s + p[1], 0) / pad.length;
    let ground = base.tin.at(cx, cy); if (!Number.isFinite(ground)) fail("the building sits outside the surveyed area: move it, or survey more");
    const ffl = a.ffl != null ? +a.ffl : +(ground + (a.plinth ?? 450) / 1000).toFixed(3);
    const cut_slope = +(a.cut_slope ?? 1), fill_slope = +(a.fill_slope ?? 2); if (!(cut_slope > 0 && fill_slope > 0)) fail("batter slopes are H:V and must be > 0");
    site.ffl = ffl; site.grading = { pad: pad.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]), pad_z: +(ffl - (a.plinth ?? 450) / 1000).toFixed(3), cut_slope, fill_slope };
    const v = siteSurfaces(site); const g = v.earthworks;
    return { ffl_m: ffl, pad_level_m: site.grading.pad_z, ground_at_building_m: +ground.toFixed(3), cut_m3: +g.cut_m3.toFixed(1), fill_m3: +g.fill_m3.toFixed(1), net_m3: +g.net_m3.toFixed(1), cut_area_m2: +g.cut_area_m2.toFixed(1), fill_area_m2: +g.fill_area_m2.toFixed(1), balance: g.net_m3 > 0 ? "surplus (export)" : "deficit (import)" };
  });

  bus.register("site_report", () => {
    const site = S(); const v = siteSurfaces(site); if (!v) fail("no survey yet");
    const b = v.tin.box; const g = v.earthworks;
    return { origin: site.origin, pin: site.pin || null, sources: site.sources, points: site.points.length, extent_m: [+(b.x1 - b.x0).toFixed(1), +(b.y1 - b.y0).toFixed(1)], levels_m: [+b.z0.toFixed(3), +b.z1.toFixed(3)],
      contour_interval_m: v.interval, ffl_m: site.ffl ?? null, earthworks: g ? { cut_m3: +g.cut_m3.toFixed(1), fill_m3: +g.fill_m3.toFixed(1), net_m3: +g.net_m3.toFixed(1) } : null };
  }, { kind: "read" });

  bus.register("site_clear", () => { bus.extra.site = { origin: null, points: [], sources: [] }; return { cleared: true }; });
  return bus;
}

/** Terrain for IFC/3D: triangles in model metres with z relative to FFL (so the building sits at z = 0). */
export function siteMeshes(site, step = 2) {
  const v = siteSurfaces(site); if (!v) return null; const ffl = site.ffl ?? (v.tin.box.z0 + v.tin.box.z1) / 2;
  const rel = (T) => { const o = T.slice(); for (let i = 2; i < o.length; i += 3) o[i] -= ffl; return o; };
  return { existing: rel(gridTriangles(v.grid, step)), proposed: v.proposed ? rel(gridTriangles(v.proposed, step)) : null, ffl };
}

export function siteForIfc(bus) { const s = bus.extra.site; if (!s?.points?.length) return null; const m = siteMeshes(s, 3); return { ...m, pin: s.pin, ffl: s.ffl ?? m.ffl }; }
