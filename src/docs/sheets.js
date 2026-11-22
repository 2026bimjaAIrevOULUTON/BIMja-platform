// Drawing standards, ISO 19650 information-container naming and status codes, and sheet composition:
// views are scaled into the drawing area with titles, dimensions and a standard title block.
// Paper coordinates: millimetres, origin bottom-left, y up.
import { planView, elevationView, sectionView, sitePlanView, siteSectionView, isoView } from "./views.js";
import { schedule } from "../author/model.js";
import { servicePlan, coordinatedPlan, pipingIso, spoolSheet, penetrations, bwicPlan, plantRoom, containment, whitespace, fireStrategy, schematic, equipmentRows } from "./services.js";
import { clashModel } from "../coord/model-clash.js";
import { toManifold } from "../author/kernel.js";
import { triangulate } from "../author/geom.js";
import { polygonArea } from "../author/geom.js";

export const PAPER = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297], "ARCH D": [914.4, 609.6], "ANSI D": [863.6, 558.8], "ARCH E1": [1066.8, 762] };
export const SCALES = [50, 100, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000]; // preferred GA scales (ISO 5455)

// UK National Annex to BS EN ISO 19650-2 status codes (suitability) and revision prefixes
export const STATUS = {
  S0: { text: "Initial status / work in progress", state: "WIP", rev: "P" },
  S1: { text: "Suitable for coordination", state: "Shared", rev: "P" },
  S2: { text: "Suitable for information", state: "Shared", rev: "P" },
  S3: { text: "Suitable for review and comment", state: "Shared", rev: "P" },
  S4: { text: "Suitable for stage approval", state: "Shared", rev: "P" },
  A1: { text: "Authorised and accepted (stage 1)", state: "Published", rev: "C" }, A2: { text: "Authorised and accepted (stage 2)", state: "Published", rev: "C" },
  A3: { text: "Authorised and accepted (stage 3)", state: "Published", rev: "C" }, A4: { text: "Authorised and accepted (stage 4)", state: "Published", rev: "C" },
  A5: { text: "Authorised and accepted (stage 5)", state: "Published", rev: "C" },
  B1: { text: "Partially authorised, with comments", state: "Published", rev: "C" },
  CR: { text: "As constructed record", state: "Published", rev: "C" },
};

export const STANDARDS = {
  "iso19650-uk": { label: "ISO 19650 + UK National Annex (BS EN)", paper: "A1", strip: 180, margin: [20, 10, 10, 10], font: "Helvetica",
    layers: { grading: "C-Ss_20_10-M_Grading", cutmass: "A-Ss_20-M_Structure-Cut", cut: "A-Ss_25_10-M_Walls-Cut", cutline: "A-Ss_25_10-M_Walls-Cut", beyond: "A-Ss_25-M_Elements-Beyond", door: "A-Ss_30_10-M_Doors", window: "A-Ss_30_20-M_Windows", room: "A-SL-T_Spaces", slab: "A-Ss_30-M_Floors", dims: "A-Zz_70-D_Dimensions", text: "A-Zz_70-T_Text", tag: "A-Zz_70-T_Tags", level: "A-Zz_70-A_Levels", ground: "C-Zz_70-M_Existing-Ground", frame: "A-Zz_70-A_Sheet", grid: "A-Zz_70-A_Grid" } },
  "us-ncs": { label: "US National CAD Standard (NCS 6) + ISO 19650 process", paper: "ARCH D", strip: 110, margin: [12, 12, 12, 12], font: "Helvetica",
    layers: { grading: "C-TOPO-PROP", cutmass: "A-STRC-PATT", cut: "A-WALL-PATT", cutline: "A-WALL", beyond: "A-ELEV-OTLN", door: "A-DOOR", window: "A-GLAZ", room: "A-AREA-IDEN", slab: "A-FLOR-OTLN", dims: "A-ANNO-DIMS", text: "A-ANNO-TEXT", tag: "A-ANNO-SYMB", level: "A-ANNO-LEVL", ground: "C-TOPO-EXST", frame: "G-ANNO-TTLB", grid: "A-GRID" } },
  "is-nbc": { label: "IS 962 / NBC 2016 (India) + ISO 19650 naming", paper: "A1", strip: 180, margin: [20, 10, 10, 10], font: "Helvetica",
    layers: { grading: "GRADING", cutmass: "MASS-HATCH", cut: "WALL-HATCH", cutline: "WALL", beyond: "OUTLINE", door: "DOOR", window: "WINDOW", room: "ROOM-TEXT", slab: "SLAB", dims: "DIMENSION", text: "TEXT", tag: "TAG", level: "LEVEL", ground: "GROUND", frame: "TITLE-BLOCK", grid: "GRID" } },
};

export function defaultDocs() {
  return { standard: "iso19650-uk", project_code: "BIMJ", originator: "BJA", volume: "ZZ", role: "A", project_name: "", client: "", address: "", author: "BIMja", checker: "", approver: "",
    paper: null, sheets: [], register: [], next: 1 };
}
const levelCode = (model, levelId) => { if (!levelId) return "ZZ"; const ls = [...model.data.levels].sort((a, b) => a.elevation - b.elevation); const i = ls.findIndex((l) => l.id === levelId); return i < 0 ? "ZZ" : String(i).padStart(2, "0"); };

/** ISO 19650 container name, and the sheet number the chosen convention shows big in the title block. */
export function sheetNumber(docs, model, sh) {
  const typeCode = ["schedule", "register", "equipment"].includes(sh.kind) ? "SH" : sh.kind === "sld" ? "DR" : "DR";
  const series = { register: 0, site: 100, site_section: 150, plan: 1000, elevations: 2000, sections: 3000, isometric: 4000, service: 5000 + 100 * (" MEPF".indexOf(sh.discipline || " ")), coordinated: 5500, piping_iso: 5600, spool: 5700, bwic: 5800, plant: 5900, schedule: 6000, containment: 6100, sld: 6200, whitespace: 6300, equipment: 6400, fire: 7000 }[sh.kind] ?? 9000;
  const num = String(series + (sh.seq || 1)).padStart(4, "0");
  const container = [docs.project_code, docs.originator, docs.volume, sh.kind === "plan" ? levelCode(model, sh.level) : "ZZ", typeCode, sh.role || docs.role, num].join("-");
  if (docs.standard === "us-ncs") { const t = { register: "G-00", site: "C-10", site_section: "C-30", plan: "A-10", elevations: "A-20", sections: "A-30", isometric: "A-40", schedule: "A-60" }[sh.kind] || "A-90"; return { container, shown: `${t}${sh.seq || 1}` }; }
  if (docs.standard === "is-nbc") return { container, shown: `${sh.kind === "register" ? "G" : "A"}/${String(series / 1000 + (sh.seq || 1) / 100).replace(".", "").padStart(3, "0")}` };
  return { container, shown: container };
}

export const GRAPHIC = ["service", "coordinated", "piping_iso", "spool", "bwic", "plant", "containment", "whitespace", "fire", "sld"];
export function chooseScale(boxes, cell) {
  for (const s of SCALES) if (boxes.every((b) => (b.x1 - b.x0) / s <= cell[0] && (b.y1 - b.y0) / s <= cell[1])) return s;
  return SCALES[SCALES.length - 1];
}

/** Views for one sheet. */
export function sheetViews(model, sh) {
  if (sh.kind === "plan") return [planView(model, sh.level || model.data.levels[0].id, { cut: sh.cut ?? 1200, cut_z: sh.cut_z ?? null, title: sh.view_title || null })];
  if (sh.kind === "elevations") return ["south", "east", "north", "west"].map((d) => elevationView(model, d));
  if (sh.kind === "isometric") return [isoView(model, "sw"), isoView(model, "ne")];
  if (sh.kind === "sections") return [sectionView(model, { axis: "x", label: "A" }), sectionView(model, { axis: "y", label: "B" })];
  if (sh.kind === "site") return [sitePlanView(model, sh.__site)];
  if (sh.kind === "site_section") return [siteSectionView(model, sh.__site)];
  if (sh.kind === "service") return [servicePlan(model, { discipline: sh.discipline || "M", cut_z: sh.cut_z ?? null })];
  if (sh.kind === "coordinated") { let clashes = []; try { clashes = clashModel(model, { a: ["M", "E", "P", "F"], b: ["M", "E", "P", "F", "S"], min_volume_m3: 0.0005, ignore_same_discipline: false, limit: 200 }).clashes
      // builder's work (through walls and slabs) and a service ending in its own discipline's equipment are not clashes
      .filter((c) => !/IfcWall|IfcSlab/.test(c.a_class + c.b_class) && !(c.a_discipline === c.b_discipline && /Segment/.test(c.a_class) !== /Segment/.test(c.b_class))).slice(0, 60); } catch {} return [coordinatedPlan(model, { cut_z: sh.cut_z ?? null, clashes })]; }
  if (sh.kind === "piping_iso") return [pipingIso(model, { system: sh.system || null })];
  if (sh.kind === "spool") return spoolSheet(model, { page: sh.page || 1 }).views;
  if (sh.kind === "bwic") return [bwicPlan(model, penetrations(model, { toManifold, triangulate }))];
  if (sh.kind === "plant") return [plantRoom(model)];
  if (sh.kind === "containment") return [containment(model)];
  if (sh.kind === "whitespace") return [whitespace(model)];
  if (sh.kind === "fire") return [fireStrategy(model)];
  if (sh.kind === "sld") return [schematic(model, { medium: sh.medium || "power" })];
  return [];
}

// ---------- composition ----------
export function composeSheet(model, docs, sh, opts = {}) {
  const std = STANDARDS[docs.standard] || STANDARDS["iso19650-uk"];
  if (!sh.paper && !docs.paper && std.paper === "A1" && ["piping_iso", "spool", "sld"].includes(sh.kind)) return composeOn(model, docs, sh, opts, "A2"); // diagrams: not to scale
  if (!sh.paper && !docs.paper && std.paper === "A1" && ["plan", "elevations", "sections", "isometric", "site", "site_section", ...GRAPHIC].includes(sh.kind)) {
    // smallest ISO A sheet that takes the views at 1:100 or larger; otherwise A1, or A0 if that allows a larger scale
    const views = sheetViews(model, sh);
    for (const target of [50, 100]) for (const p of ["A3", "A2", "A1", "A0"]) { const r = composeOn(model, docs, sh, opts, p, views); if (r.scale <= target) return r; }
    const a1 = composeOn(model, docs, sh, opts, "A1", views), a0 = composeOn(model, docs, sh, opts, "A0", views);
    return a0.scale < a1.scale ? a0 : a1;
  }
  return composeOn(model, docs, sh, opts, sh.paper || docs.paper || std.paper);
}
function composeOn(model, docs, sh, { date = "" } = {}, paper, cachedViews = null) {
  const std = STANDARDS[docs.standard] || STANDARDS["iso19650-uk"]; const [W, H] = PAPER[paper] || PAPER.A1; sh = { ...sh, paper };
  const items = []; const L = std.layers;
  const line = (a, b, w = 0.25, layer = L.frame, dash = false) => items.push({ t: "line", p: [a, b], w, layer, dash });
  const rectP = (x0, y0, x1, y1, w = 0.25, layer = L.frame) => items.push({ t: "poly", pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], w, layer, fill: null });
  const text = (at, s, h = 2.5, o = {}) => items.push({ t: "text", at, text: String(s ?? ""), h, align: o.align || "start", layer: o.layer || L.text, bold: !!o.bold });
  const [ml, mt, mr, mb] = std.margin; const fx0 = ml, fy0 = mb, fx1 = W - mr, fy1 = H - mt;
  rectP(fx0, fy0, fx1, fy1, 0.7); const sx0 = fx1 - std.strip; line([sx0, fy0], [sx0, fy1], 0.5);
  const num = sheetNumber(docs, model, sh);
  // ---- drawing area
  const area = { x0: fx0 + 12, y0: fy0 + 12, x1: sx0 - 12, y1: fy1 - 12 };
  let scale = null, nts = false;
  if (["plan", "elevations", "sections", "isometric", "site", "site_section", ...GRAPHIC].includes(sh.kind)) {
    const views = cachedViews || sheetViews(model, sh); const n = views.length;
    const pad = (v) => ({ x0: v.box.x0, y0: v.box.y0, x1: v.box.x1, y1: v.box.y1 });
    // not-to-scale views (schematics, isometrics, spools) fill their cell; scaled views take the largest preferred scale
    nts = views.every((v) => v.nts || v.kind === "isometric");
    const fit = (cell) => (nts ? Math.max(...views.map((v) => Math.max((v.box.x1 - v.box.x0) / Math.max(10, cell[0]), (v.box.y1 - v.box.y0) / Math.max(10, cell[1])))) * 1.02 : chooseScale(views.map(pad), cell));
    // pick the grid (1 row of 4 tall towers, 2x2 for houses, ...) that allows the largest scale
    const grid = (a) => { let best = null; for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c); const cw0 = (a.x1 - a.x0) / c, ch0 = (a.y1 - a.y0) / r; const s0 = sh.scale || fit([cw0 - 50, ch0 - 50]); if (!best || s0 < best.s) best = { c, r, s: s0 }; } return best; };
    const tbls = views.flatMap((v) => v.tables || []);
    if (tbls.length) { // tables beside the drawing or along the bottom, whichever leaves the larger scale
      const tw0 = Math.min(330, (area.x1 - area.x0) * 0.42); const th = Math.min((area.y1 - area.y0) * 0.38, Math.max(...tbls.map((T) => 20 + T.rows.length * 6))); // tables sit side by side below
      const side = { ...area, x1: area.x1 - tw0 - 14 }, below = { ...area, y0: area.y0 + th + 14 };
      if (grid(below).s < grid(side).s) { let tx = area.x0; for (const T of tbls) { const tw = Math.min(tw0, (area.x1 - area.x0) / tbls.length - 12); table(items, tx, area.y0 + th, T.title, T.head, T.rows.slice(0, Math.max(1, Math.floor((th - 16) / 6))), L.text, tw); tx += tw + 14; } area.y0 = below.y0; }
      else { const tx = area.x1 - tw0; let ty = area.y1; for (const T of tbls) ty = table(items, tx, ty, T.title, T.head, T.rows.slice(0, Math.max(1, Math.floor((ty - area.y0 - 20) / 6) - 3)), L.text, tw0) - 12; area.x1 = side.x1; }
    }
    const best = grid(area);
    const cols = best.c, rows = best.r; const cw = (area.x1 - area.x0) / cols, ch = (area.y1 - area.y0) / rows;
    scale = best.s;
    views.forEach((v, i) => {
      const c = i % cols, r = Math.floor(i / cols); const cx0 = area.x0 + c * cw, cy1 = area.y1 - r * ch;
      const bw = (v.box.x1 - v.box.x0) / scale, bh = (v.box.y1 - v.box.y0) / scale;
      const ox = cx0 + (cw - bw) / 2, oy = cy1 - ch + 42 + (ch - 42 - bh) / 2;
      const P = (q) => [ox + (q[0] - v.box.x0) / scale, oy + (q[1] - v.box.y0) / scale];
      const lay = (k) => L[k] || (/^[A-Z]-[A-Z0-9-]+$/.test(k) ? k : k ? `BJ-${String(k).toUpperCase()}` : L.text);
      for (const pl of v.prims.polys) { items.push({ t: "poly", pts: pl.pts.map(P), w: pl.w ?? 0.25, layer: lay(pl.layer), fill: pl.fill ? (pl.col && pl.layer !== "cut" ? pl.col : pl.layer === "cut" ? "#3a3a3a" : pl.layer === "cutmass" ? "#c9c9c9" : "#dddddd") : null, col: pl.col || null });
        if (pl.dash) for (let k = 0; k < pl.pts.length; k++) items.push({ t: "line", p: [P(pl.pts[k]), P(pl.pts[(k + 1) % pl.pts.length])], w: pl.w ?? 0.25, layer: lay(pl.layer), dash: true, col: pl.col || null }); }
      for (const ln of v.prims.lines) items.push({ t: "line", p: ln.p.map(P), w: ln.w ?? 0.25, layer: lay(ln.layer), dash: !!ln.dash, col: ln.col || null });
      const levelYs = [];
      for (const tx of v.prims.texts) { const q = P(tx.at); if (tx.layer === "level") { if (levelYs.some((y) => Math.abs(y - q[1]) < 4)) continue; levelYs.push(q[1]); } items.push({ t: "text", at: [q[0], q[1] + (tx.dy || 0)], text: tx.text, h: tx.h, align: tx.align || "start", layer: lay(tx.layer) }); }
      for (const d of v.prims.dims || []) dimChain(items, d, P, scale, L.dims);
      // view title
      const tx = ox, ty = oy - (v.prims.dims ? 34 : 16); text([tx, ty], `${i + 1}`, 5, { bold: true }); line([tx + 8, ty - 1.5], [tx + Math.max(60, bw), ty - 1.5], 0.35);
      text([tx + 8, ty], v.title, 3.5, { bold: true }); text([tx + 8, ty - 6], v.nts || v.kind === "isometric" ? "Not to scale" : `Scale 1:${scale}`, 2.5);
      if (v.kind === "plan" || v.kind === "site") northArrow(items, [cx0 + cw - 20, cy1 - 25], L.text);
    });
  } else if (sh.kind === "schedule") {
    let y = area.y1;
    for (const k of ["door", "window", "room", "wall"]) {
      const rows = schedule(model, k); if (!rows.length) continue;
      y = table(items, area.x0, y, `${k[0].toUpperCase()}${k.slice(1)} schedule`, Object.keys(rows[0]), rows.map((r) => Object.values(r)), L.text) - 14;
    }
    const masses = model.elements.filter((e) => e.kind === "mass");
    if (masses.length && y > area.y0 + 60) y = table(items, area.x0, y, "Element schedule (free-form)", ["id", "name", "class", "material"], masses.slice(0, Math.floor((y - area.y0) / 6) - 4).map((e) => [e.id, e.name, e.ifc_class, e.material || ""]), L.text) - 14;
  } else if (sh.kind === "equipment") {
    const rows = equipmentRows(model); table(items, area.x0, area.y1, "Equipment schedule", ["Mark", "Equipment / family", "IFC class", "Discipline", "System", "Location x, y", "Key parameters"], rows.slice(0, Math.floor((area.y1 - area.y0) / 6) - 4), L.text);
  } else if (sh.kind === "register") {
    const rows = docs.sheets.map((s) => { const n = sheetNumber(docs, model, s); const last = [...docs.register].reverse().find((r) => r.sheet === s.id); return [n.shown, n.container, s.title, last?.status || "S0", last?.rev || "P01", last?.date || ""]; });
    table(items, area.x0, area.y1, "Drawing register (information delivery)", ["Sheet", "Container name (ISO 19650)", "Title", "Status", "Rev", "Date"], rows, L.text);
    let y = area.y1 - 30 - rows.length * 6 - 20;
    text([area.x0, y], "Status codes (BS EN ISO 19650-2 UK National Annex)", 3.5, { bold: true }); y -= 7;
    for (const [k, v] of Object.entries(STATUS)) { text([area.x0, y], `${k}  ${v.text}  (${v.state}; revisions ${v.rev}01…)`, 2.5); y -= 5; }
  }
  if (docs.standard === "is-nbc" && sh.kind === "plan") areaStatement(items, model, [area.x0, area.y0 + 60], L.text);
  titleBlock(items, docs, { ...sh, nts }, num, scale, { x0: sx0, y0: fy0, x1: fx1, y1: fy1 }, std, date, model);
  return { w: W, h: H, items, number: num, scale: nts ? null : scale, nts, title: sh.title, paper: sh.paper || docs.paper || std.paper, layers: Object.values(L) };
}

function dimChain(items, d, P, scale, layer) {
  const off = (d.row === 1 ? 10 : 18) * scale; // paper mm -> model mm
  for (let i = 0; i < d.values.length - 1; i++) {
    const a = d.values[i], b = d.values[i + 1]; if (b - a < 1) continue;
    const A = d.axis === "x" ? [a, d.at - off] : [d.at - off, a], B = d.axis === "x" ? [b, d.at - off] : [d.at - off, b];
    const pa = P(A), pb = P(B); items.push({ t: "line", p: [pa, pb], w: 0.18, layer });
    for (const q of [pa, pb]) items.push({ t: "line", p: [[q[0] - 1, q[1] - 1], [q[0] + 1, q[1] + 1]], w: 0.35, layer }); // architectural ticks
    const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    items.push({ t: "text", at: d.axis === "x" ? [m[0], m[1] + 1.2] : [m[0] - 1.2, m[1]], text: String(Math.round(b - a)), h: 2.2, align: "middle", layer, rot: d.axis === "y" ? 90 : 0 });
  }
}
function northArrow(items, c, layer) {
  const [x, y] = c; items.push({ t: "poly", pts: [[x, y + 9], [x + 4, y - 5], [x, y - 2], [x - 4, y - 5]], w: 0.25, layer, fill: "#222222" });
  items.push({ t: "text", at: [x, y + 12], text: "N", h: 4, align: "middle", layer, bold: true });
}
function table(items, x, y, title, head, rows, layer, maxW = 0) {
  let cw = head.map((h, i) => Math.min(70, Math.max(14, 2.2 * 0.6 * Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? "").length)) + 5)));
  const tot = cw.reduce((a, b) => a + b, 0); if (maxW && tot > maxW) cw = cw.map((c) => (c * maxW) / tot); // fit a side column; long cells are shortened
  const fit = (v, w) => { const n = Math.max(3, Math.floor((w - 3) / (2.2 * 0.55))); const t = String(v ?? ""); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  items.push({ t: "text", at: [x, y], text: maxW ? fit(title, maxW / 0.62) : title, h: 3.5, layer, bold: true }); y -= 8;
  const row = (vals, bold) => { let cx = x; vals.forEach((v, i) => { items.push({ t: "text", at: [cx + 1.5, y - 4.2], text: fit(v, cw[i]), h: 2.2, layer, bold }); cx += cw[i]; });
    items.push({ t: "line", p: [[x, y - 6], [cx, y - 6]], w: bold ? 0.35 : 0.13, layer }); y -= 6; };
  row(head, true); rows.forEach((r) => row(r.map((v) => (typeof v === "number" ? +v.toFixed(3) : v)), false));
  return y;
}
function areaStatement(items, model, at, layer) {
  const rows = model.data.levels.map((l) => { const fl = model.elements.filter((e) => e.kind === "floor" && e.level === l.id).reduce((s, f) => s + Math.abs(polygonArea(f.boundary)) / 1e6, 0); return [l.name, fl.toFixed(2)]; });
  const total = rows.reduce((s, r) => s + +r[1], 0); rows.push(["Total built-up area", total.toFixed(2)]);
  table(items, at[0], at[1], "Area statement (m²)", ["Floor", "Built-up area"], rows, layer);
}
function titleBlock(items, docs, sh, num, scale, b, std, date, model) {
  const x = b.x0 + 4, w = b.x1 - b.x0 - 8; let y = b.y1 - 8; const L = std.layers;
  const t = (s, h = 2.5, o = {}) => { if (h > 3) y -= (h - 2.5) * 0.8; items.push({ t: "text", at: [x, y], text: s, h, layer: L.frame, bold: !!o.bold }); y -= h * 1.6 + (o.gap || 0); };
  const rule = () => { items.push({ t: "line", p: [[b.x0, y + 2], [b.x1, y + 2]], w: 0.25, layer: L.frame }); y -= 3; };
  const last = [...docs.register].reverse().find((r) => r.sheet === sh.id);
  const status = last?.status || "S0", rev = last?.rev || "P01";
  t("BIMja", 6, { bold: true }); t(docs.author ? `Originator: ${docs.originator} · ${docs.author}` : docs.originator); rule();
  t("Client", 2, {}); t(docs.client || "—", 3); t("Project", 2); t(docs.project_name || model.data.name, 3.5, { bold: true }); if (docs.address) t(docs.address, 2.5); rule();
  t("Drawing title", 2); for (const part of wrap(sh.title, Math.floor(w / 2.6))) t(part, 4, { bold: true }); rule();
  t("Scale", 2); t(sh.kind === "isometric" || sh.nts ? `NTS${sh.kind === "isometric" ? " (isometric)" : ""} @ ${sh.paper || docs.paper || std.paper}` : scale ? `1:${scale} @ ${sh.paper || docs.paper || std.paper}` : "As shown", 3); t("Date", 2); t(last?.date || date || "—", 3); rule();
  t("Status (suitability)", 2); t(`${status}  ${STATUS[status]?.text || ""}`, 3, { bold: true }); t(`CDE state: ${STATUS[status]?.state || "WIP"}`, 2.5); t("Revision", 2); t(rev, 4, { bold: true }); rule();
  t("Drawn / checked / approved", 2); t(`${docs.author || "—"} / ${docs.checker || "—"} / ${docs.approver || "—"}`, 2.5); rule();
  // revision table
  t("Revisions", 2.5, { bold: true });
  for (const r of docs.register.filter((r) => r.sheet === sh.id).slice(-6)) t(`${r.rev}  ${r.date}  ${r.status}  ${r.note || ""}`.slice(0, Math.floor(w / 1.5)), 2.2);
  rule();
  for (const note of ["Do not scale from this drawing.", "All dimensions in millimetres unless stated.", model.data.description ? "Credit: " + model.data.description : ""].filter(Boolean))
    for (const part of wrap(note, Math.floor(w / 1.5))) t(part, 2.2);
  // number at the bottom, large
  const ny = b.y0 + 30; items.push({ t: "line", p: [[b.x0, ny], [b.x1, ny]], w: 0.5, layer: L.frame });
  items.push({ t: "text", at: [x, ny - 6], text: docs.standard === "iso19650-uk" ? "Drawing number (ISO 19650 container)" : "Sheet", h: 2, layer: L.frame });
  items.push({ t: "text", at: [x, ny - 15], text: num.shown, h: docs.standard === "iso19650-uk" ? Math.min(5, (w / num.shown.length) * 1.6) : 9, layer: L.frame, bold: true });
  if (docs.standard !== "iso19650-uk") items.push({ t: "text", at: [x, ny - 23], text: num.container, h: 2, layer: L.frame });
  items.push({ t: "text", at: [x, b.y0 + 3], text: STANDARDS[docs.standard].label, h: 1.8, layer: L.frame });
}
function wrap(s, n) { const out = []; let cur = ""; for (const w of String(s).split(/\s+/)) { if ((cur + " " + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } if (cur) out.push(cur); return out; }
