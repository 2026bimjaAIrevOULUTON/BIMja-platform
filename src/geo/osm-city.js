// City context from OpenStreetMap -> ordinary BIMja commands, in named layers by discipline.
// Real (from OSM, © OpenStreetMap contributors, ODbL 1.0): road and path centrelines and classes, building footprints
// and heights, parks, gardens, grass, water, trees, benches, fountains, street lamps.
// Indicative (generated from the road network, NOT surveyed): carriageway widths, kerbs, water mains, sewers with
// manholes, storm drains with gullies, electrical duct banks, street lighting where OSM has none, and infill massing
// on street frontages with no mapped building. Every indicative element says so in its name and layer.
import { latLonToLocal } from "./utm.js";

// ---------- parsing (OSM XML from the API, or Overpass/API JSON) ----------
const attr = (s, k) => { const m = s.match(new RegExp(`\\b${k}="([^"]*)"`)); return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : undefined; };
export function parseOSM(src) {
  const nodes = new Map(), ways = new Map(), rels = [];
  if (typeof src === "object" || /^\s*\{/.test(src)) {
    const j = typeof src === "object" ? src : JSON.parse(src);
    for (const e of j.elements || []) { if (e.type === "node") nodes.set(e.id, { lat: e.lat, lon: e.lon, tags: e.tags || {} }); else if (e.type === "way") ways.set(e.id, { nodes: e.nodes || [], tags: e.tags || {} }); else if (e.type === "relation") rels.push({ id: e.id, tags: e.tags || {}, members: (e.members || []).map((m) => ({ type: m.type, ref: m.ref, role: m.role })) }); }
    return { nodes, ways, rels };
  }
  const re = /<(node|way|relation)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g; let m;
  while ((m = re.exec(src))) {
    const [, type, head, , body = ""] = m; const id = +attr(head, "id"); const tags = {};
    for (const t of body.matchAll(/<tag\b([^>]*)\/>/g)) tags[attr(t[1], "k")] = attr(t[1], "v");
    if (type === "node") nodes.set(id, { lat: +attr(head, "lat"), lon: +attr(head, "lon"), tags });
    else if (type === "way") ways.set(id, { nodes: [...body.matchAll(/<nd\b[^>]*ref="(\d+)"/g)].map((x) => +x[1]), tags });
    else rels.push({ id, tags, members: [...body.matchAll(/<member\b([^>]*)\/>/g)].map((x) => ({ type: attr(x[1], "type"), ref: +attr(x[1], "ref"), role: attr(x[1], "role") })) });
  }
  return { nodes, ways, rels };
}

// ---------- geometry helpers (local metres) ----------
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
const ccw = (P) => (area(P) < 0 ? P.slice().reverse() : P);
const inside = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
function clipBox(P, h) { // Sutherland–Hodgman against the square |x|,|y| <= h
  let out = P; for (const [ax, sg] of [[0, 1], [0, -1], [1, 1], [1, -1]]) { const inp = out; out = []; if (!inp.length) break;
    const ins = (p) => sg * p[ax] <= h; const cut = (a, b) => { const t = (sg * h - a[ax]) / (b[ax] - a[ax]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    for (let i = 0; i < inp.length; i++) { const a = inp[i], b = inp[(i + 1) % inp.length]; if (ins(b)) { if (!ins(a)) out.push(cut(a, b)); out.push(b); } else if (ins(a)) out.push(cut(a, b)); } } return out; }
function clipLine(L, h) { // keep the parts of a polyline inside the square; returns pieces
  const pieces = []; let cur = []; const ins = (p) => Math.abs(p[0]) <= h && Math.abs(p[1]) <= h;
  for (let i = 0; i < L.length; i++) { if (ins(L[i])) cur.push(L[i]); else { if (cur.length > 1) pieces.push(cur); cur = []; } }
  if (cur.length > 1) pieces.push(cur); return pieces; }
const simplify = (L, tol) => { if (L.length < 3) return L; const out = [L[0]]; for (let i = 1; i < L.length - 1; i++) { const a = out.at(-1), b = L[i]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= tol) out.push(b); } out.push(L.at(-1)); return out; };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const mm = (P) => P.map(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]);
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
/** points every `step` metres along a polyline, with the local direction */
function along(L, step, offset0 = step / 2) { const out = []; let carry = offset0;
  for (let i = 0; i < L.length - 1; i++) { const [ax, ay] = L[i], [bx, by] = L[i + 1]; const len = Math.hypot(bx - ax, by - ay); if (!len) continue; const ux = (bx - ax) / len, uy = (by - ay) / len;
    for (let s = carry; s <= len; s += step) out.push({ p: [ax + ux * s, ay + uy * s], d: [ux, uy] }); carry = ((carry - len) % step + step) % step; } return out; }

// ---------- road classes: carriageway width (m), kerbs, services ----------
const ROADS = { primary: [12, true, true], secondary: [10, true, true], tertiary: [8.5, true, true], unclassified: [6.5, true, true], residential: [6, true, true], living_street: [5, true, true], service: [4.5, false, false], pedestrian: [6, false, false], track: [3.5, false, false], footway: [2, false, false], path: [1.6, false, false], steps: [2.4, false, false], cycleway: [2.5, false, false] };
const BTYPE = { house: 2, residential: 3, apartments: 4, commercial: 3, retail: 2, hotel: 4, mosque: 2, temple: 2, church: 2, school: 2, hospital: 4, train_station: 2, roof: 1, garage: 1, shed: 1, hut: 1 };

/**
 * Build the city as layered command scripts. opts: {radius_m, exclude:[x0,y0,x1,y1] m (the project's own footprint), infill, services, furniture}
 * Returns {layers:[{layer, title, discipline, real, commands}], stats, attribution}
 */
export function cityLayers(osm, geo, { radius_m = 600, exclude = null, infill = true, services = true, furniture = true } = {}) {
  const P = (id) => { const n = osm.nodes.get(id); return n ? latLonToLocal(geo, n.lat, n.lon) : null; };
  const wayPts = (w) => w.nodes.map(P).filter(Boolean);
  const h = radius_m; const L = {}; const add = (layer, title, discipline, real, cmd) => (L[layer] ||= { layer, title, discipline, real, commands: [] }).commands.push(cmd);
  const ex = (p) => exclude && p[0] > exclude[0] && p[0] < exclude[2] && p[1] > exclude[1] && p[1] < exclude[3];
  const blockers = []; // polygons infill must avoid (parks, water, mapped buildings, monuments)
  const roads = []; // {pts, w, cls, kerb, svc, id, name}
  // areas: ways + multipolygon outers
  const areaOf = (tags) => tags.natural === "water" || tags.waterway === "riverbank" || tags.landuse === "basin" ? "water"
    : ["park", "garden", "pitch", "playground"].includes(tags.leisure) || ["grass", "meadow", "farmland", "forest", "recreation_ground", "village_green", "cemetery"].includes(tags.landuse) || ["wood", "scrub", "grassland"].includes(tags.natural) ? "green"
    : tags.building ? "building" : tags.amenity === "parking" ? "paved" : tags.historic || tags.tourism === "attraction" || tags.amenity === "place_of_worship" ? "monument" : null;
  const polys = [];
  for (const [id, w] of osm.ways) if (w.nodes.length > 3 && w.nodes[0] === w.nodes.at(-1)) { const k = areaOf(w.tags); if (k) polys.push({ id: `w${id}`, k, tags: w.tags, pts: wayPts(w).slice(0, -1) }); }
  for (const r of osm.rels) if (r.tags.type === "multipolygon") { const k = areaOf(r.tags); if (!k) continue;
    // stitch outer ways into rings
    let segs = r.members.filter((m) => m.type === "way" && m.role !== "inner").map((m) => osm.ways.get(m.ref)?.nodes).filter((n) => n && n.length > 1).map((n) => n.slice());
    while (segs.length) { let ring = segs.shift(); let grew = true;
      while (grew && ring[0] !== ring.at(-1)) { grew = false; for (let i = 0; i < segs.length; i++) { const s = segs[i];
        if (s[0] === ring.at(-1)) ring = ring.concat(s.slice(1)); else if (s.at(-1) === ring.at(-1)) ring = ring.concat(s.slice(0, -1).reverse()); else if (s.at(-1) === ring[0]) ring = s.concat(ring.slice(1)); else if (s[0] === ring[0]) ring = s.slice().reverse().concat(ring.slice(1)); else continue; segs.splice(i, 1); grew = true; break; } }
      const pts = ring.map(P).filter(Boolean); if (pts.length > 3) polys.push({ id: `r${r.id}`, k, tags: r.tags, pts: ring[0] === ring.at(-1) ? pts.slice(0, -1) : pts }); } }
  let nB = 0;
  for (const a of polys) {
    const c = ccw(simplify(clipBox(a.pts, h), 0.4)); if (c.length < 3 || Math.abs(area(c)) < 4) continue;
    const cen = c.reduce((s, p) => [s[0] + p[0] / c.length, s[1] + p[1] / c.length], [0, 0]);
    if (a.k !== "building") blockers.push(c);
    if (a.k === "water") add("L-WATER", "Water bodies (OSM)", "L", true, { name: "mass", args: { name: a.tags.name ? `Water: ${a.tags.name}` : "Water", outline: mm(c), base: -1200, height: 1000, material: "Water", color: "#3f6f8f", ifc_class: "IfcGeographicElement", discipline: "L", layer: "L-WATER" } });
    else if (a.k === "green") add("L-LANDSCAPE", "Parks, gardens and grass (OSM)", "L", true, { name: "mass", args: { name: a.tags.name || `Green: ${a.tags.leisure || a.tags.landuse || a.tags.natural}`, outline: mm(c), base: 0, height: 80, material: "Grass", color: "#6f9a52", ifc_class: "IfcGeographicElement", discipline: "L", layer: "L-LANDSCAPE" } });
    else if (a.k === "paved") add("C-PAVING", "Paved areas and car parks (OSM)", "C", true, { name: "mass", args: { name: a.tags.name || "Car park", outline: mm(c), base: 0, height: 120, material: "Asphalt", color: "#5a5d61", ifc_class: "IfcSlab", discipline: "C", layer: "C-PAVING" } });
    else if (a.k === "building" && !ex(cen)) { blockers.push(c);
      const t = a.tags; const hv = parseFloat(t.height); const lv = parseFloat(t["building:levels"]); const H = Number.isFinite(hv) && hv > 0 ? hv : Number.isFinite(lv) && lv > 0 ? lv * 3.2 : (BTYPE[t.building] || 2) * 3.2;
      add("A-BUILDING", "Buildings (OSM footprints)", "A", true, { name: "mass", args: { name: t.name ? t.name.slice(0, 60) : `Building (${t.building})`, outline: mm(c), base: 0, height: Math.round(H * 1000), material: "Masonry", color: t.amenity === "place_of_worship" || t.building === "mosque" || t.building === "temple" ? "#e8dcc4" : "#c9c2b6", ifc_class: "IfcBuildingElementProxy", discipline: "A", layer: "A-BUILDING" } }); nB++; }
  }
  // roads: carriageway sweeps (real centrelines, indicative widths), kerbs (indicative)
  for (const [id, w] of osm.ways) { const cls = w.tags.highway; const spec = ROADS[cls]; if (!spec || w.tags.area === "yes") continue;
    const tagW = parseFloat(w.tags.width); const W = Number.isFinite(tagW) && tagW > 1 && tagW < 40 ? tagW : spec[0];
    for (const piece of clipLine(wayPts(w), h)) { const pts = simplify(piece, 0.8); if (pts.length < 2) continue; const len = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0); if (len < 3) continue;
      const path = pts.map(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000), 0]); const hw = Math.round((W * 1000) / 2); const nm = w.tags.name ? `: ${w.tags.name.slice(0, 40)}` : "";
      const foot = ["footway", "path", "steps", "pedestrian", "cycleway"].includes(cls);
      add(foot ? "C-FOOTWAY" : "C-ROAD", foot ? "Footways and paths (OSM centrelines)" : "Road carriageways (OSM centrelines, indicative widths)", "C", true,
        { name: "sweep", args: { name: `${foot ? "Footway" : "Carriageway"} (${cls})${nm}`, profile: [[-hw, 0], [hw, 0], [hw, foot ? 100 : 150], [-hw, foot ? 100 : 150]], path, material: foot ? "Paving" : "Asphalt", color: foot ? "#b9b2a5" : "#45484c", ifc_class: "IfcSlab", discipline: "C", layer: foot ? "C-FOOTWAY" : "C-ROAD" } });
      if (!foot) roads.push({ pts, W, cls, kerb: spec[1] && W >= 4.5, svc: spec[2], id, name: w.tags.name });
      if (spec[1] && W >= 4.5) for (const sgn of [1, -1]) { const a = sgn * hw, b = sgn * (hw + 150);
        add("C-KERB", "Kerbs (indicative, 150 × 300 mm)", "C", false, { name: "sweep", args: { name: `Kerb ${sgn > 0 ? "left" : "right"} (${cls})${nm}`, profile: sgn > 0 ? [[a, 0], [b, 0], [b, 300], [a, 300]] : [[b, 0], [a, 0], [a, 300], [b, 300]], path, material: "Concrete", color: "#d8d4cc", ifc_class: "IfcMember", discipline: "C", layer: "C-KERB" } }); }
    } }
  // services under the carriageway (indicative): water main, sewer + manholes, storm drain + gullies, electrical duct bank; street lighting
  if (services) for (const r of roads.filter((x) => x.svc)) { const path = (z) => r.pts.map(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000), z]); const hw = (r.W * 1000) / 2;
    const pipe = (rad, u) => { const pr = []; for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4 + Math.PI / 8; pr.push([Math.round(u + rad * Math.cos(a)), Math.round(rad + rad * Math.sin(a))]); } return pr; };
    add("P-WATER", "Water mains DN200 (indicative, 1.2 m cover)", "P", false, { name: "sweep", args: { name: "Water main DN200 (indicative)", profile: pipe(110, Math.round(hw / 2)), path: path(-1300), material: "Ductile iron", color: "#2f7fd8", ifc_class: "IfcPipeSegment", discipline: "P", layer: "P-WATER" } });
    add("P-SEWER", "Foul sewers DN300 (indicative, 2.5 m invert)", "P", false, { name: "sweep", args: { name: "Foul sewer DN300 (indicative)", profile: pipe(160, 0), path: path(-2660), material: "Vitrified clay", color: "#8a5a2b", ifc_class: "IfcPipeSegment", discipline: "P", layer: "P-SEWER" } });
    add("P-STORM", "Storm drains DN450 (indicative)", "P", false, { name: "sweep", args: { name: "Storm drain DN450 (indicative)", profile: pipe(235, -Math.round(hw / 2)), path: path(-1900), material: "Concrete", color: "#5aa36b", ifc_class: "IfcPipeSegment", discipline: "P", layer: "P-STORM" } });
    if (r.kerb) add("E-DUCT", "Electrical duct banks 600 × 400 (indicative, under the verge)", "E", false, { name: "sweep", args: { name: "LV/HV duct bank (indicative)", profile: [[Math.round(hw + 400), 0], [Math.round(hw + 1000), 0], [Math.round(hw + 1000), 400], [Math.round(hw + 400), 400]], path: path(-1100), material: "Concrete", color: "#e0a428", ifc_class: "IfcCableCarrierSegment", discipline: "E", layer: "E-DUCT" } });
    for (const [i, s] of along(r.pts, 60, 20).entries()) add("P-SEWER", "", "P", false, { name: "place", args: { family: "Manhole 1200", at: [Math.round(s.p[0] * 1000), Math.round(s.p[1] * 1000), -2800], mark: `MH-${r.id % 100000}-${i + 1}` } });
    if (r.kerb) for (const [i, s] of along(r.pts, 30, 10).entries()) { const sg = i % 2 ? 1 : -1; const n = [-s.d[1] * sg, s.d[0] * sg]; const q = [s.p[0] + n[0] * (r.W / 2 - 0.3), s.p[1] + n[1] * (r.W / 2 - 0.3)];
      add("P-STORM", "", "P", false, { name: "place", args: { family: "Road gully", at: [Math.round(q[0] * 1000), Math.round(q[1] * 1000), -900], rotation_deg: Math.round((Math.atan2(s.d[1], s.d[0]) * 180) / Math.PI) } }); }
    if (r.kerb) for (const [i, s] of along(r.pts, 35, 12).entries()) { const sg = i % 2 ? 1 : -1; const n = [-s.d[1] * sg, s.d[0] * sg]; const q = [s.p[0] + n[0] * (r.W / 2 + 0.7), s.p[1] + n[1] * (r.W / 2 + 0.7)];
      add("E-LIGHTING", "Street lighting 8 m columns (indicative)", "E", false, { name: "place", args: { family: "Street light 8 m", at: [Math.round(q[0] * 1000), Math.round(q[1] * 1000), 0], rotation_deg: Math.round((Math.atan2(-n[1], -n[0]) * 180) / Math.PI) } }); }
  }
  // point features from OSM: trees, benches, fountains, lamps
  if (furniture) for (const [, n] of osm.nodes) { const t = n.tags; const f = t.natural === "tree" ? ["Tree (indicative crown)", "L-TREES", "Trees (OSM positions)", "L"] : t.amenity === "bench" ? ["Bench", "A-FURNITURE", "Street furniture (OSM)", "A"] : t.amenity === "fountain" ? ["Fountain jet", "L-WATER-FEATURE", "Fountains (OSM)", "L"] : t.highway === "street_lamp" ? ["Street light 8 m", "E-LIGHTING", "Street lighting 8 m columns (indicative)", "E"] : null;
    if (!f) continue; const p = latLonToLocal(geo, n.lat, n.lon); if (Math.abs(p[0]) > h || Math.abs(p[1]) > h || ex(p)) continue;
    add(f[1], f[2], f[3], true, { name: "place", args: { family: f[0], at: [Math.round(p[0] * 1000), Math.round(p[1] * 1000), 0] } }); }
  // indicative infill on street frontages with no mapped building
  let nI = 0;
  if (infill) { const roadSegs = []; for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) roadSegs.push([r.pts[i], r.pts[i + 1], r.W]);
    for (const [, w] of osm.ways) { const cls = w.tags.highway; if (!["footway", "path", "steps", "pedestrian"].includes(cls)) continue; const pts = wayPts(w); for (let i = 0; i < pts.length - 1; i++) roadSegs.push([pts[i], pts[i + 1], 2]); }
    const placed = []; const clear = (q, rad) => roadSegs.every(([a, b, W]) => segDist(q, a, b) > W / 2 + rad) && !blockers.some((B) => inside(q, B)) && placed.every((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) > rad + o[2]);
    for (const r of roads.filter((x) => ["residential", "living_street", "unclassified", "tertiary", "secondary"].includes(x.cls))) for (const [i, s] of along(r.pts, 11, 6).entries()) for (const sg of [1, -1]) {
      const D = 9 + 5 * hash(r.id * 31 + i * 7 + (sg > 0 ? 1 : 0)), Wd = 8 + 3 * hash(r.id * 17 + i), n = [-s.d[1] * sg, s.d[0] * sg]; const off = r.W / 2 + 2.5 + D / 2;
      const q = [s.p[0] + n[0] * off, s.p[1] + n[1] * off]; if (Math.abs(q[0]) > h - 10 || Math.abs(q[1]) > h - 10 || ex(q)) continue; const rad = Math.max(D, Wd) / 2;
      if (!clear(q, rad * 0.95)) continue; placed.push([q[0], q[1], rad]); nI++;
      const hu = [s.d[0] * Wd / 2, s.d[1] * Wd / 2], hn = [n[0] * D / 2, n[1] * D / 2]; const box = [[q[0] - hu[0] - hn[0], q[1] - hu[1] - hn[1]], [q[0] + hu[0] - hn[0], q[1] + hu[1] - hn[1]], [q[0] + hu[0] + hn[0], q[1] + hu[1] + hn[1]], [q[0] - hu[0] + hn[0], q[1] - hu[1] + hn[1]]];
      const storeys = 2 + Math.floor(3 * hash(r.id * 13 + i * 3 + sg));
      add("A-INFILL", "Indicative infill massing (not surveyed)", "A", false, { name: "mass", args: { name: "Indicative infill block (not surveyed)", outline: mm(ccw(box)), base: 0, height: storeys * 3200, material: "Masonry", color: "#e2d7c3", ifc_class: "IfcBuildingElementProxy", discipline: "A", layer: "A-INFILL" } }); } }
  const order = ["L-WATER", "L-LANDSCAPE", "C-PAVING", "C-ROAD", "C-FOOTWAY", "C-KERB", "P-WATER", "P-SEWER", "P-STORM", "E-DUCT", "E-LIGHTING", "A-BUILDING", "A-INFILL", "L-TREES", "L-WATER-FEATURE", "A-FURNITURE"];
  const layers = order.filter((k) => L[k]).map((k) => L[k]);
  return { layers, families: CITY_FAMILIES, stats: { osm_buildings: nB, infill_blocks: nI, roads: roads.length, commands: layers.reduce((s, l) => s + l.commands.length, 0) }, attribution: "© OpenStreetMap contributors (ODbL 1.0)" };
}

/** Families the city layers place: define once before the layers. */
export const CITY_FAMILIES = [
  { name: "family", args: { name: "Manhole 1200", ifc_class: "IfcBuildingElementProxy", material: "Concrete", color: "#7a7a7a", discipline: "P", layer: "P-SEWER", parameters: { Diameter_mm: 1200, Depth_mm: 2800, Status: "indicative" }, parts: [{ shape: "revolve", center: [0, 0], profile: [[450, 0], [600, 0], [600, 2800], [450, 2800]], segments: 12 }, { shape: "revolve", center: [0, 0], profile: [[0, 2800], [380, 2800], [380, 2860], [0, 2860]], segments: 12 }] } },
  { name: "family", args: { name: "Road gully", ifc_class: "IfcBuildingElementProxy", material: "Concrete", color: "#6d746f", discipline: "P", layer: "P-STORM", parameters: { Status: "indicative" }, parts: [{ shape: "box", min: [-250, -200, 0], max: [250, 200, 900] }] } },
  { name: "family", args: { name: "Street light 8 m", ifc_class: "IfcBuildingElementProxy", material: "Steel", color: "#9aa1a8", discipline: "E", layer: "E-LIGHTING", parameters: { Height_mm: 8000, Lamp: "LED", Status: "indicative" }, parts: [{ shape: "revolve", center: [0, 0], profile: [[0, 0], [110, 0], [70, 8000], [0, 8000]], segments: 8 }, { shape: "box", min: [0, -40, 7900], max: [1500, 40, 7980] }, { shape: "box", min: [1300, -120, 7820], max: [1750, 120, 7900] }] } },
  { name: "family", args: { name: "Tree (indicative crown)", ifc_class: "IfcGeographicElement", material: "Vegetation", color: "#4f7f3a", discipline: "L", layer: "L-TREES", parameters: { Crown_mm: 6000, Height_mm: 8000 }, parts: [{ shape: "revolve", center: [0, 0], profile: [[0, 0], [180, 0], [140, 3000], [0, 3000]], segments: 6 }, { shape: "revolve", center: [0, 0], profile: [[0, 2600], [2200, 3400], [3000, 5000], [2400, 6800], [1200, 7700], [0, 8000]], segments: 10 }] } },
  { name: "family", args: { name: "Bench", ifc_class: "IfcFurniture", material: "Stone", color: "#cbc3b4", discipline: "A", layer: "A-FURNITURE", parts: [{ shape: "box", min: [-900, -250, 0], max: [900, 250, 450] }] } },
  { name: "family", args: { name: "Fountain jet", ifc_class: "IfcBuildingElementProxy", material: "Stone", color: "#cfe4ee", discipline: "L", layer: "L-WATER-FEATURE", parts: [{ shape: "revolve", center: [0, 0], profile: [[0, 0], [400, 0], [400, 300], [80, 300], [40, 1500], [0, 1600]], segments: 10 }] } },
];
