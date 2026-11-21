// Survey readers: CSV/XYZ/TXT points, DXF (spot levels, 3D polylines, contours with elevation, 3DFACE), LandXML
// (TIN surface or CgPoints), LAS 1.0–1.4 point clouds (ground class preferred), PLY (ascii / binary). Each returns
// { ok, points: [[E, N, Z], ...] (metres), info } or { ok:false, error } (never throws). Large inputs are thinned
// to a ground grid (lowest point per cell) so terrain stays fast in the browser.
import { parseXML } from "../coord/bcf.js";

const bad = (error) => ({ ok: false, error });
const num = (s) => { const v = Number(String(s).trim()); return Number.isFinite(v) ? v : NaN; };

export function thin(points, max = 20000) {
  if (points.length <= max) return points;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of points) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const cell = Math.sqrt(((x1 - x0) * (y1 - y0) || 1) / max) * 1.05; const g = new Map();
  for (const p of points) { const k = `${Math.floor((p[0] - x0) / cell)},${Math.floor((p[1] - y0) / cell)}`; const q = g.get(k); if (!q || p[2] < q[2]) g.set(k, p); }
  return [...g.values()];
}

// ---------- CSV / XYZ ----------
export function parseCSV(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (!lines.length) return bad("empty file");
  const split = (l) => l.split(/[,;\t ]+/).filter((x) => x !== "");
  const head = split(lines[0]).map((h) => h.toLowerCase());
  let ix = -1, iy = -1, iz = -1, start = 0;
  if (head.some((h) => isNaN(num(h)))) { // header row
    const find = (names) => head.findIndex((h) => names.includes(h.replace(/[^a-z]/g, "")));
    ix = find(["x", "e", "east", "easting", "eastings"]); iy = find(["y", "n", "north", "northing", "northings"]); iz = find(["z", "h", "elev", "elevation", "rl", "level", "height", "alt"]); start = 1;
    if (ix < 0 || iy < 0 || iz < 0) return bad(`could not find X/E, Y/N and Z columns in the header: ${head.join(", ")}`);
  } else { // no header: P,E,N,Z[,code] or E,N,Z
    const n = split(lines[0]).length; const numeric = split(lines[0]).map((v) => !isNaN(num(v)));
    if (n >= 4 && numeric[1] && numeric[2] && numeric[3] && (!numeric[0] || Number.isInteger(num(split(lines[0])[0])) && num(split(lines[0])[0]) < 1e6 && n >= 5)) { ix = 1; iy = 2; iz = 3; }
    else { ix = 0; iy = 1; iz = 2; }
  }
  const pts = []; let skipped = 0;
  for (let i = start; i < lines.length; i++) { const c = split(lines[i]); const p = [num(c[ix]), num(c[iy]), num(c[iz])]; if (p.every(Number.isFinite)) pts.push(p); else skipped++; }
  if (pts.length < 3) return bad("fewer than 3 valid points");
  return { ok: true, points: pts, info: { format: "csv", read: pts.length, skipped } };
}

// ---------- DXF ----------
export function parseDXF(text) {
  const L = String(text).split(/\r?\n/); if (L.length < 4) return bad("empty DXF");
  const pairs = []; for (let i = 0; i + 1 < L.length; i += 2) pairs.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
  const es = pairs.findIndex(([c, v], i) => c === 2 && v === "ENTITIES" && pairs[i - 1]?.[1] === "SECTION"); if (es < 0) return bad("no ENTITIES section (is this a DXF file?)");
  const ents = []; let cur = null;
  for (let i = es + 1; i < pairs.length; i++) { const [c, v] = pairs[i]; if (c === 0) { if (v === "ENDSEC") break; cur = { type: v, g: [] }; ents.push(cur); } else if (cur) cur.g.push([c, v]); }
  const pts = []; let poly = null; const stats = {};
  const val = (e, code) => { const p = e.g.find(([c]) => c === code); return p ? num(p[1]) : NaN; };
  const along = (a, b, step = 2) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(d / step)); for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); } };
  for (const e of ents) {
    stats[e.type] = (stats[e.type] || 0) + 1;
    if (e.type === "POINT") { const p = [val(e, 10), val(e, 20), val(e, 30)]; if (p.every(Number.isFinite)) pts.push(p); }
    else if (e.type === "TEXT" || e.type === "MTEXT") { const t = (e.g.find(([c]) => c === 1)?.[1] || "").replace(/\\[A-Za-z][^;]*;|[{}]/g, "").replace(/^\+/, ""); const z = num(t); const p = [val(e, 10), val(e, 20)]; if (Number.isFinite(z) && p.every(Number.isFinite) && /^-?\d+(\.\d+)?$/.test(t.trim())) pts.push([...p, z]); }
    else if (e.type === "LINE") { const a = [val(e, 10), val(e, 20), val(e, 30)], b = [val(e, 11), val(e, 21), val(e, 31)]; if ([...a, ...b].every(Number.isFinite) && (a[2] || b[2])) { along(a, b); pts.push(b); } }
    else if (e.type === "LWPOLYLINE") { const z = val(e, 38) || 0; if (!z) continue; const xs = e.g.filter(([c]) => c === 10).map(([, v]) => num(v)), ys = e.g.filter(([c]) => c === 20).map(([, v]) => num(v));
      for (let k = 0; k < xs.length; k++) { const a = [xs[k], ys[k], z], b = [xs[(k + 1) % xs.length], ys[(k + 1) % xs.length], z]; if (k < xs.length - 1 || val(e, 70) & 1) along(a, b); else pts.push(a); } }
    else if (e.type === "POLYLINE") poly = { flags: val(e, 70) || 0, z: val(e, 30) || 0, v: [] };
    else if (e.type === "VERTEX" && poly) { const p = [val(e, 10), val(e, 20), Number.isFinite(val(e, 30)) && val(e, 30) !== 0 ? val(e, 30) : poly.z]; if (p.every(Number.isFinite)) poly.v.push(p); }
    else if (e.type === "SEQEND" && poly) { if (poly.v.some((p) => p[2])) for (let k = 0; k < poly.v.length - 1; k++) { along(poly.v[k], poly.v[k + 1]); } if (poly.v.length) pts.push(poly.v[poly.v.length - 1]); poly = null; }
    else if (e.type === "3DFACE") for (const k of [0, 1, 2, 3]) { const p = [val(e, 10 + k), val(e, 20 + k), val(e, 30 + k)]; if (p.every(Number.isFinite)) pts.push(p); }
  }
  const uniq = dedupe(pts); if (uniq.length < 3) return bad("no survey levels found: the DXF needs POINTs with Z, spot-level TEXT, 3D polylines, contours with elevation, or 3DFACEs");
  return { ok: true, points: uniq, info: { format: "dxf", read: uniq.length, entities: stats } };
}
function dedupe(pts) { const s = new Map(); for (const p of pts) s.set(`${p[0].toFixed(3)},${p[1].toFixed(3)}`, p); return [...s.values()]; }

// ---------- LandXML ----------
export function parseLandXML(text) {
  let root; try { root = parseXML(String(text)); } catch (e) { return bad(`not XML: ${e.message}`); }
  if (!root || root.name !== "LandXML") return bad("not a LandXML file (no LandXML root)");
  const pts = []; const walk = (n) => { if (n.name === "P" || n.name === "CgPoint") { const v = n.text.trim().split(/\s+/).map(num); if (v.length >= 3 && v.every(Number.isFinite)) pts.push([v[1], v[0], v[2]]); } for (const c of n.children) walk(c); }; // LandXML order is northing easting elevation
  walk(root); if (pts.length < 3) return bad("no surface points (Surface/Definition/Pnts or CgPoints)");
  return { ok: true, points: dedupe(pts), info: { format: "landxml", read: pts.length } };
}

// ---------- LAS ----------
export function parseLAS(u8) {
  const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8); if (b.length < 227) return bad("file too small for LAS");
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== "LASF") return bad("not a LAS file (no LASF signature). E57 and LAZ: convert to LAS first (CloudCompare or PDAL).");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength); const minor = b[25];
  const offset = v.getUint32(96, true), fmt = b[104] & 0x3f, rec = v.getUint16(105, true);
  let n = v.getUint32(107, true); if (minor >= 4 && b.length >= 255) { const n64 = Number(v.getBigUint64(247, true)); if (n64) n = n64; }
  if (fmt > 10 || rec < 20) return bad(`unsupported LAS point format ${fmt}`);
  const sx = v.getFloat64(131, true), sy = v.getFloat64(139, true), sz = v.getFloat64(147, true), ox = v.getFloat64(155, true), oy = v.getFloat64(163, true), oz = v.getFloat64(171, true);
  n = Math.min(n, Math.floor((b.length - offset) / rec)); const all = [], ground = [];
  for (let i = 0; i < n; i++) {
    const o = offset + i * rec; const p = [v.getInt32(o, true) * sx + ox, v.getInt32(o + 4, true) * sy + oy, v.getInt32(o + 8, true) * sz + oz];
    const cls = fmt >= 6 ? b[o + 16] : b[o + 15] & 31; (cls === 2 ? ground : all).push(p);
  }
  const use = ground.length > 100 ? ground : [...all, ...ground];
  if (use.length < 3) return bad("no points in the LAS file");
  return { ok: true, points: thin(use, 50000), info: { format: "las", version: `1.${minor}`, pointFormat: fmt, read: n, ground: ground.length, used: ground.length > 100 ? "ground class 2" : "all points (no ground classification)" } };
}

// ---------- PLY ----------
export function parsePLY(u8) {
  const b = u8 instanceof Uint8Array ? u8 : typeof u8 === "string" ? new TextEncoder().encode(u8) : new Uint8Array(u8);
  const headEnd = (() => { const s = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096))); const i = s.indexOf("end_header"); return i < 0 ? -1 : i; })();
  if (headEnd < 0) return bad("not a PLY file (no end_header)");
  const head = new TextDecoder().decode(b.subarray(0, headEnd)); const fmt = (head.match(/format (\w+)/) || [])[1];
  const nv = +((head.match(/element vertex (\d+)/) || [])[1] || 0); const props = []; let inV = false;
  for (const l of head.split(/\r?\n/)) { if (l.startsWith("element")) inV = l.startsWith("element vertex"); else if (inV && l.startsWith("property")) { const [, t, name] = l.split(/\s+/); props.push({ t, name }); } }
  const ix = props.findIndex((p) => p.name === "x"), iy = props.findIndex((p) => p.name === "y"), iz = props.findIndex((p) => p.name === "z"); if (ix < 0 || iy < 0 || iz < 0 || !nv) return bad("PLY has no x/y/z vertices");
  let p0 = headEnd + "end_header".length; while (b[p0] === 13 || b[p0] === 10) { p0++; if (b[p0 - 1] === 10) break; }
  const pts = [];
  if (fmt === "ascii") { const rows = new TextDecoder().decode(b.subarray(p0)).split(/\r?\n/); for (let i = 0; i < nv && i < rows.length; i++) { const c = rows[i].trim().split(/\s+/).map(num); const p = [c[ix], c[iy], c[iz]]; if (p.every(Number.isFinite)) pts.push(p); } }
  else if (fmt === "binary_little_endian") {
    const size = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
    const offs = []; let rec = 0; for (const p of props) { offs.push(rec); rec += size[p.t] || 4; }
    const v = new DataView(b.buffer, b.byteOffset + p0); const rd = (o, t) => (t === "double" || t === "float64" ? v.getFloat64(o, true) : v.getFloat32(o, true));
    for (let i = 0; i < nv && (i + 1) * rec <= v.byteLength; i++) pts.push([rd(i * rec + offs[ix], props[ix].t), rd(i * rec + offs[iy], props[iy].t), rd(i * rec + offs[iz], props[iz].t)]);
  } else return bad(`PLY format ${fmt} not supported (use ascii or binary_little_endian)`);
  if (pts.length < 3) return bad("fewer than 3 points");
  return { ok: true, points: thin(pts, 50000), info: { format: "ply", read: pts.length } };
}

/** text for csv/xyz/dxf/landxml; Uint8Array for las/ply (or ply ascii text). */
export function parseSurvey(format, data) {
  try {
    const f = String(format || "").toLowerCase();
    if (["csv", "xyz", "txt", "pts"].includes(f)) return parseCSV(data);
    if (f === "dxf") return parseDXF(data);
    if (f === "landxml" || f === "xml") return parseLandXML(data);
    if (f === "las") return parseLAS(data);
    if (f === "ply") return parsePLY(data);
    if (f === "e57" || f === "laz") return bad(`${f.toUpperCase()} is not read directly yet: convert to LAS or PLY (CloudCompare: File > Save as .las) and import that`);
    return bad("format must be csv, xyz, dxf, landxml, las or ply");
  } catch (e) { return bad(`could not read the file: ${e.message}`); }
}
