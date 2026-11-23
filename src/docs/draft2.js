// Drafted diagrams and sections that are not plans:
//  - draftBlockSLD: a power block's single-line diagram from the model's own equipment (one column per source, the
//    4N/3 mesh of busways into the rack rows, a line-load table);
//  - draftSection: a building section cut through the model at a plane, drawn at a fixed scale with cut poché,
//    elements beyond as thin outlines (hidden behind parallel walls are left out), grid bubbles and levels;
//  - draftSite: the site plan (boundary, roads, building footprints, zones, plant) at 1:500 / 1:1000.
// All text is placed by a small collision-avoiding placer; the section and site plan carry the same QA report.
import { solidOf } from "../author/solids.js";
import { north, scaleBar } from "./draft.js";

const tw = (s, h, bold) => String(s).length * h * (bold ? 0.6 : 0.55);
const GREY = "#8a8a8a", POCHE = "#4d4d4d";
const rectOfText = (at, txt, h, align = "start", rot = 0, bold = false) => { const w = tw(txt, h, bold); const x0 = align === "middle" ? at[0] - w / 2 : align === "end" ? at[0] - w : at[0]; const r = { x0, y0: at[1] - h * 0.25, x1: x0 + w, y1: at[1] + h * 0.95 };
  if (!rot) return r; const c = at; const rp = (p) => [c[0] - (p[1] - c[1]), c[1] + (p[0] - c[0])]; const a = rp([r.x0, r.y0]), b = rp([r.x1, r.y1]); return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }; };
const hit = (r, list, gap = 0.4) => list.some((q) => r.x0 < q.x1 + gap && r.x1 > q.x0 - gap && r.y0 < q.y1 + gap && r.y1 > q.y0 - gap);
const inRect = (r, b) => r.x0 >= b.x0 && r.x1 <= b.x1 && r.y0 >= b.y0 && r.y1 <= b.y1;
const circ = (c, r, n = 24) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]);

function pen(items) {
  const line = (a, b, w = 0.25, o = {}) => items.push({ t: "line", p: [a, b], w, layer: o.layer || "BJ-DRAW", ...(o.col ? { col: o.col } : {}), ...(o.dash ? { dash: o.dash } : {}) });
  const poly = (pts, o = {}) => items.push({ t: "poly", pts, w: o.w ?? 0.25, fill: o.fill ?? null, layer: o.layer || "BJ-DRAW", ...(o.col ? { col: o.col } : {}) });
  const text = (at, s, h = 2.5, o = {}) => items.push({ t: "text", at, text: String(s), h, align: o.align || "start", bold: !!o.bold, layer: o.layer || "BJ-TEXT", ...(o.rot ? { rot: o.rot } : {}), ...(o.col ? { col: o.col } : {}) });
  const rect = (x0, y0, x1, y1, o = {}) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], o);
  return { line, poly, text, rect };
}
const qaOf = (placed) => { const ov = []; for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) if (hit(placed[i], [placed[j]], -0.05)) ov.push([placed[i].txt, placed[j].txt]); return ov; };

// ---------------------------------------------------------------- power block single line
/** sh = {zone: hall zone code, block}; equipment found by mark: {K}-TX-L{b}{s}, -MSB-, -GEN-, -UPS-, -OB-, -BAT-; rows by rack marks. */
export function draftBlockSLD(model, sh, area, docs = {}) {
  const items = []; const { line, rect, text, poly } = pen(items); const b = sh.block || 1;
  const z = (model.data.zones || []).find((q) => q.code === sh.zone); const K = ((z?.parent || z?.code || "HA").match(/[A-Z]$/) || ["A"])[0];
  const byMark = new Map(model.elements.filter((e) => e.mark).map((e) => [e.mark, e])); const fp = (e) => (e && model.data.families?.[e.family]?.parameters) || {};
  const src = (docs.sld?.sources) || ["A", "B", "C", "D"]; const L = (s) => `L${b}${s}`; const eq = (t, s) => byMark.get(`${K}-${t}-${L(s)}`);
  // rows fed by this block: every busway "BW-{row}" whose name ends in the source letter and is fed from block b's output boards = rows 4b-3..4b
  const rowsAll = [...new Set(model.elements.filter((e) => /busway/.test(e.name || "") && e.system && e.name.startsWith(`Hall ${K} `)).map((e) => e.system))].sort();
  const rows = rowsAll.slice(4 * (b - 1), 4 * b);
  const rackKW = (row) => model.elements.filter((e) => e.mark && e.mark.startsWith(row.replace(/^BW-/, "") + "-")).reduce((a, e) => a + (+fp(e).Nameplate_kW || 0), 0);
  const gpus = (row) => model.elements.filter((e) => e.mark && e.mark.startsWith(row.replace(/^BW-/, "") + "-") && /NVL72/.test(e.family || "")).length;
  const W = area.x1 - area.x0, colW = Math.min(200, (W - 40) / src.length); const X0 = area.x0 + (W - colW * src.length) / 2;
  text([area.x0, area.y1 - 6], `${(z?.name || "Hall").toUpperCase()} — POWER BLOCK B${b} SINGLE LINE DIAGRAM (4N/3, LINES ${src.join("–")})`, 5, { bold: true });
  text([area.x0, area.y1 - 12], "Not to scale. IEC 60617 symbols. Ratings from the model's families; loads from the racks each busway feeds.", 2.5);
  let y0 = area.y1 - 30; const tags = [];
  src.forEach((s, i) => { const cx = X0 + colW * (i + 0.5); let y = y0; const lab = (dy, t, o = {}) => text([cx + 9, y - dy], t, o.h || 2.5, { bold: o.bold });
    const tx = eq("TX", s), msb = eq("MSB", s), gen = eq("GEN", s), ups = eq("UPS", s), ob = eq("OB", s), bat = eq("BAT", s);
    // MV section
    line([cx - colW * 0.42, y], [cx + colW * 0.42, y], 1.4); text([cx - colW * 0.42, y + 2], `${K}-MV 33 kV SECTION ${s}`, 2.5, { bold: true }); line([cx, y], [cx, y - 6], 0.5); y -= 6;
    rect(cx - 3, y, cx + 3, y - 6, { w: 0.5 }); line([cx - 3, y - 6], [cx + 3, y], 0.25); lab(4, "VCB, 630 A, O/C + E/F"); y -= 6; line([cx, y], [cx, y - 6], 0.5); y -= 6;
    poly(circ([cx, y - 6], 6), { w: 0.5 }); poly(circ([cx, y - 14], 6), { w: 0.5 }); const tp = fp(tx);
    lab(5, tx?.mark || `TX-${L(s)}`, { bold: true }); lab(9, `${tp.Rating_kVA || 2500} kVA 33/0.433 kV Dyn11`); lab(13, `Z ${tp.Impedance_pct || 6} %, ONAN, bunded`); y -= 20; line([cx, y], [cx, y - 6], 0.5); y -= 6;
    rect(cx - 3, y, cx + 3, y - 6, { w: 0.5 }); lab(4, "ACB 4000 A"); y -= 6; line([cx, y], [cx, y - 5], 0.5); y -= 5;
    // main switchboard with the generator incomer
    line([cx - colW * 0.38, y], [cx + colW * 0.3, y], 1.4); const mp = fp(msb); text([cx + 9, y + 1.5], `${msb?.mark || `MSB-${L(s)}`}  ${mp.Rating_A || 4000} A, ${mp.Fault_kA || 65} kA 1 s`, 2.5, { bold: true });
    const gx = cx - colW * 0.3; line([gx, y], [gx, y + 8], 0.5); rect(gx - 3, y + 8, gx + 3, y + 14, { w: 0.5 }); line([gx, y + 14], [gx, y + 18], 0.5); poly(circ([gx, y + 24], 6), { w: 0.5 }); text([gx, y + 23], "G", 3.5, { align: "middle", bold: true });
    const gp = fp(gen); text([gx - 8, y + 25], `${gen?.mark || `GEN-${L(s)}`}`, 2.5, { bold: true, align: "end" }); text([gx - 8, y + 21], `${gp.Rating_kVA || 2500} kVA 415 V`, 2.2, { align: "end" }); text([gx + 5, y + 10], "ACB, ATS", 2.2);
    line([cx, y], [cx, y - 6], 0.5); y -= 6; rect(cx - 3, y, cx + 3, y - 6, { w: 0.5 }); lab(4, "ACB 3200 A"); y -= 6; line([cx, y], [cx, y - 5], 0.5); y -= 5;
    // UPS with battery and static bypass
    const up = fp(ups); rect(cx - 9, y, cx + 9, y - 20, { w: 0.5 }); line([cx - 9, y - 20], [cx + 9, y], 0.25); text([cx - 6, y - 7], "~", 3.5); text([cx + 3, y - 17], "=", 3.5);
    text([cx + 12, y - 4], ups?.mark || `UPS-${L(s)}`, 2.5, { bold: true }); text([cx + 12, y - 8], `${up.Rating_kVA || 2000} kVA, Li-ion`, 2.5); text([cx + 12, y - 12], `${bat?.mark || `BAT-${L(s)}`} ≥ ${fp(bat).Runtime_min || 5} min`, 2.5);
    const bx = cx + 46; line([cx + 9, y - 14], [bx - 4, y - 14], 0.35); for (const [dx, h] of [[-4, 6], [-2, 3.5], [0, 6], [2, 3.5]]) line([bx + dx, y - 14 - h / 2], [bx + dx, y - 14 + h / 2], 0.5);
    line([cx - 14, y + 3], [cx - 14, y - 26], 0.35, { dash: "dash" }); line([cx - 14, y + 3], [cx, y + 3], 0.35, { dash: "dash" }); line([cx - 14, y - 26], [cx, y - 26], 0.35, { dash: "dash" }); text([cx - 15, y - 12], "BYPASS", 2.2, { rot: 90, align: "middle" });
    y -= 20; line([cx, y], [cx, y - 6], 0.5); y -= 6;
    // output board and its feeders
    line([cx - colW * 0.42, y], [cx + colW * 0.42, y], 1.2); text([cx + colW * 0.42, y + 1.5], `${ob?.mark || `OB-${L(s)}`}  ${fp(ob).Rating_A || 3200} A`, 2.5, { bold: true, align: "end" });
    const feed = []; for (let k = 0; k < 6; k++) { const fx = cx - colW * 0.36 + k * colW * 0.144; const spare = k >= rows.length; line([fx, y], [fx, y - 6], 0.35, spare ? { dash: "dash" } : {}); rect(fx - 1.8, y - 6, fx + 1.8, y - 10, { w: 0.35 });
      text([fx + 2.6, y - 15], spare ? "SPARE" : `${rows[k]}-${s}`, 2.2, { rot: 90, align: "end" }); if (!spare) feed.push([fx, y - 10]); }
    text([cx - colW * 0.42, y + 1.5], "MCCBs 800 A", 2.2); tags.push({ s, feed, y: y - 40 }); });
  // the mesh: source s, feeder k → row k
  const yRows = Math.min(...tags.map((t) => t.y)) - 18 - 4 * src.length; const rowW = (W - 40) / Math.max(1, rows.length);
  rows.forEach((row, k) => { const rx0 = area.x0 + 20 + rowW * k + 4, rx1 = rx0 + rowW - 8; rect(rx0, yRows, rx1, yRows - 20, { w: 0.5 });
    text([(rx0 + rx1) / 2, yRows - 7], `ROW ${row.replace(/^BW-/, "")}`, 3.5, { bold: true, align: "middle" }); text([(rx0 + rx1) / 2, yRows - 12.5], `${gpus(row)} × GB300 NVL72 + ${10 - gpus(row)} network, ${Math.round(rackKW(row))} kW`, 2.5, { align: "middle" });
    text([(rx0 + rx1) / 2, yRows - 17], "4 × 800 A busways, each GPU rack 8 × 63 A (2 per source)", 2.2, { align: "middle" });
    tags.forEach((t, i) => { const f = t.feed[k]; if (!f) return; const tx_ = rx0 + 12 + i * ((rx1 - rx0 - 24) / Math.max(1, src.length - 1)); const yy = yRows + 6 + i * 4;
      line(f, [f[0], yy], 0.35); line([f[0], yy], [tx_, yy], 0.35); line([tx_, yy], [tx_, yRows], 0.35); text([tx_ + 1, yRows + 1], t.s, 2.2, { bold: true }); }); });
  // line loads (4 make 3: each line normally carries a third more than its share would be under 2N)
  const blockKW = rows.reduce((a, r) => a + rackKW(r), 0); const n = src.length, normal = blockKW / n, n1 = blockKW / (n - 1), peak = n1 * 155 / 136;
  const ty = yRows - 34; text([area.x0 + 20, ty], "LINE LOADS", 3.5, { bold: true }); line([area.x0 + 20, ty - 1.5], [area.x0 + 170, ty - 1.5], 0.35);
  const hdr = ["Line", "Transformer", "UPS", "Normal kW", "One line out kW", "Peak, one out kW", "% of UPS"]; const cw = [24, 30, 30, 26, 32, 34, 22]; let x = area.x0 + 20;
  hdr.forEach((h, i) => { text([x, ty - 7], h, 2.5, { bold: true }); x += cw[i]; });
  src.forEach((s, j) => { x = area.x0 + 20; const upsKVA = +fp(eq("UPS", s)).Rating_kVA || 2000; const vals = [L(s), `${fp(eq("TX", s)).Rating_kVA || 2500} kVA`, `${upsKVA} kVA`, normal.toFixed(0), n1.toFixed(0), peak.toFixed(0), `${Math.round((100 * peak) / upsKVA)} %`];
    vals.forEach((v, i) => { text([x, ty - 12 - 5 * j], v, 2.5); x += cw[i]; }); });
  if (docs.sld?.note) text([area.x0 + 20, ty - 14 - 5 * n], docs.sld.note, 2.5);
  return { items, nts: true };
}

// ---------------------------------------------------------------- building section
/** sh = {zone, cut: {axis, at, look, depth, from?, to?, name}}. axis "x": plane x = at, the section reads along y;
 *  axis "y": plane y = at, reads along x. look picks the side seen: +1 looks toward +axis. */
export function draftSection(model, sh, area, docs = {}) {
  const items = []; const { line, poly, text, rect } = pen(items); const c = sh.cut; const ax = c.axis === "x" ? 0 : 1, hx = 1 - ax;
  const z0 = (model.data.zones || []).find((q) => q.code === sh.zone); const zp = z0?.parent ? model.data.zones.find((q) => q.code === z0.parent) : z0;
  const zb = zp ? zp.outline.reduce((b, p) => ({ x0: Math.min(b.x0, p[0]), y0: Math.min(b.y0, p[1]), x1: Math.max(b.x1, p[0]), y1: Math.max(b.y1, p[1]) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) : null;
  const hMin = c.from ?? (zb ? [zb.x0, zb.y0][hx] : -1e9), hMax = c.to ?? (zb ? [zb.x1, zb.y1][hx] : 1e9);
  // readable direction: looking +x the right hand is -y; looking -x it is +y; looking +y right is +x; looking -y right is -x
  const flip = (ax === 0 && c.look === 1) || (ax === 1 && c.look === -1); const H = (v) => (flip ? -v : v);
  const depthOf = (v) => (v - c.at) * c.look; // > 0 beyond the plane
  const cuts = [], beyond = [], occl = [];
  const inH = (a, b) => Math.max(a, b) >= hMin && Math.min(a, b) <= hMax;
  for (const e of model.elements) {
    if (e.kind === "wall") { const t = (model.data.types.wall?.[e.type]?.thickness || 200) / 2, ht = e.height || 3000; const a = e.a, b = e.b;
      const da = a[ax] - c.at, db = b[ax] - c.at;
      if (da * db < 0 || (Math.abs(da) < t && Math.abs(db) < t && Math.abs(a[hx] - b[hx]) < 1)) { const f = da === db ? 0 : da / (da - db); const h = a[hx] + (b[hx] - a[hx]) * f; if (!inH(h, h)) continue; cuts.push({ h0: h - t, h1: h + t, z0: 0, z1: ht, kind: "wall" }); }
      else if (Math.abs(a[ax] - b[ax]) < 1) { const d = depthOf(a[ax]); if (d > 0 && d <= c.depth && inH(a[hx], b[hx])) { const w = { h0: Math.min(a[hx], b[hx]), h1: Math.max(a[hx], b[hx]), z0: 0, z1: ht, d, kind: "wall" }; beyond.push(w); occl.push(w); } }
      continue; }
    if (e.kind !== "mass" && e.kind !== "instance" && !e.family && e.shape !== "sweep") continue;
    if (/EARTHWORKS|SITE|C-ROAD|TOPO/.test(e.layer || "")) continue;
    if (e.shape === "sweep" && Array.isArray(e.path)) { const r = Math.max(60, ...(e.profile || [[100, 0]]).map((q) => Math.abs(q[0]))); const pz = e.path.map((p) => [p[0], p[1], (p[2] || 0) + (e.base || 0)]);
      for (let i = 0; i < pz.length - 1; i++) { const p = pz[i], q = pz[i + 1]; const dp = p[ax] - c.at, dq = q[ax] - c.at;
        if (dp * dq < 0) { const f = dp / (dp - dq); const h = p[hx] + (q[hx] - p[hx]) * f, zz = (p[2] || 0) + ((q[2] || 0) - (p[2] || 0)) * f; if (inH(h, h)) cuts.push({ h0: h - r, h1: h + r, z0: zz - r, z1: zz + r, kind: "pipe", e }); }
        else if (Math.abs(p[ax] - q[ax]) < 1) { const d = depthOf(p[ax]); if (d > 0 && d <= c.depth && inH(p[hx], q[hx])) beyond.push({ h0: Math.min(p[hx], q[hx]), h1: Math.max(p[hx], q[hx]), z0: Math.min(p[2], q[2]) - r, z1: Math.max(p[2], q[2]) + r, d, kind: "run", e }); } }
      continue; }
    let b; try { b = solidOf(e); } catch { continue; } if (!b || !Number.isFinite(b.xmin)) continue; const lo = [b.xmin, b.ymin][ax], hi = [b.xmax, b.ymax][ax], h0 = [b.xmin, b.ymin][hx], h1 = [b.xmax, b.ymax][hx];
    if (!inH(h0, h1)) continue; const kind = /IfcSlab|IfcColumn|IfcBeam|IfcWall/.test(e.ifc_class || "") ? "struct" : e.family ? "equip" : /CONTAINMENT/.test(e.layer || "") ? "hac" : "other";
    if (lo <= c.at && hi >= c.at) cuts.push({ h0: Math.max(h0, hMin), h1: Math.min(h1, hMax), z0: b.zmin, z1: b.zmax, kind, e });
    else { const d = Math.min(depthOf(lo), depthOf(hi)); if (d > 0 && d <= c.depth) beyond.push({ h0: Math.max(h0, hMin), h1: Math.min(h1, hMax), z0: b.zmin, z1: b.zmax, d, kind, e }); } }
  const hidden = (o) => occl.some((w) => w !== o && w.d < o.d && w.h0 <= (o.h0 + o.h1) / 2 && w.h1 >= (o.h0 + o.h1) / 2 && w.z1 >= (o.z0 + o.z1) / 2);
  const vis = beyond.filter((o) => o.kind === "wall" || !hidden(o));
  const all = [...cuts, ...vis]; const zTop = Math.max(...all.map((o) => o.z1), 3000), zBot = Math.min(0, ...all.map((o) => o.z0));
  const H0 = Math.max(hMin, Math.min(...all.map((o) => o.h0))), H1 = Math.min(hMax, Math.max(...all.map((o) => o.h1)));
  // scale: the largest standard scale that fits, leaving room for levels (right), bubbles (below) and the title
  let s = 50; for (const t of [50, 100, 200, 250, 500]) { s = t; if ((H1 - H0) / t + 60 <= area.x1 - area.x0 && (zTop - zBot + 6000) / t + 60 <= area.y1 - area.y0) break; }
  const hl = flip ? -H1 : H0; const ox = area.x0 + 20 + Math.max(0, (area.x1 - area.x0 - 120 - (H1 - H0) / s) / 2), oy = area.y0 + 40 + Math.max(0, (area.y1 - area.y0 - 60 - (zTop - zBot + 6000) / s) / 2) + (-zBot + 4000) / s;
  const P = (h, zz) => [ox + (H(h) - hl) / s, oy + zz / s]; const R = (o) => { const a = P(o.h0, o.z0), b = P(o.h1, o.z1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const placed = [], hard = [], missing = []; let tags = 0;
  // beyond first (thin), then cut on top (heavy)
  for (const o of vis.sort((a, b) => b.d - a.d)) { const [x0, y0, x1, y1] = R(o); if (x1 - x0 < 0.2 && y1 - y0 < 0.2) continue; rect(x0, y0, x1, y1, { w: o.kind === "equip" ? 0.25 : 0.18, col: o.kind === "equip" ? "#000000" : GREY, layer: "BJ-BEYOND" }); }
  for (const o of cuts) { const [x0, y0, x1, y1] = R(o);
    if (o.kind === "wall" || o.kind === "struct") rect(x0, y0, x1, y1, { w: 0, fill: POCHE, layer: "BJ-CUT" });
    else if (o.kind === "pipe" && /IfcCableCarrierSegment/.test(o.e?.ifc_class || "")) rect(x0, y0, x1, y1, { w: 0.35, layer: "BJ-CUT" });
    else if (o.kind === "pipe") poly(circ([(x0 + x1) / 2, (y0 + y1) / 2], Math.max(0.6, (x1 - x0) / 2), 12), { w: 0.35, layer: "BJ-CUT" });
    else if (o.kind === "hac") rect(x0, y0, x1, y1, { w: 0.25, layer: "BJ-CUT", dash: "hidden" });
    else { rect(x0, y0, x1, y1, { w: 0.5, layer: "BJ-CUT" }); if (x1 - x0 > 2 && y1 - y0 > 2) line([x0, y0], [x1, y1], 0.13, { col: GREY, layer: "BJ-CUT" }); } }
  // ground
  const g0 = P(H0, 0), g1 = P(H1, 0); line([Math.min(g0[0], g1[0]) - 4, g0[1]], [Math.max(g0[0], g1[0]) + 4, g0[1]], 0.7, { layer: "BJ-GROUND" });
  for (let x = Math.min(g0[0], g1[0]); x < Math.max(g0[0], g1[0]); x += 3) line([x, g0[1]], [x - 2, g0[1] - 2], 0.13, { col: GREY, layer: "BJ-GROUND" });
  // grid lines that cross the plane: chain line with a bubble under the ground
  const grids = (model.data.grids || []).filter((g) => g.zone === (z0?.parent || z0?.code)); const yb = oy + zBot / s - 14;
  for (const g of grids) { const da = g.a[ax] - c.at, db = g.b[ax] - c.at; if (da * db > 0 || Math.abs(g.a[hx] - g.b[hx]) > 1) continue; const h = g.a[hx]; if (h < H0 - 1 || h > H1 + 1) continue; const x = P(h, 0)[0];
    line([x, yb + 4], [x, oy + zTop / s + 4], 0.18, { col: GREY, dash: "center", layer: "BJ-GRID" }); poly(circ([x, yb], 4), { w: 0.25, layer: "BJ-GRID" }); text([x, yb - 1.2], g.name, 3.5, { align: "middle", bold: true, layer: "BJ-GRID" }); hard.push({ x0: x - 4, y0: yb - 4, x1: x + 4, y1: yb + 4 }); }
  // levels on the right: FFL, the tops of racks and containment, the service zones crossing the plane, the roof
  const lv = new Map([[0, "FFL"]]); const rack = cuts.concat(vis).find((o) => /NVL72/.test(o.e?.family || "")); if (rack) lv.set(rack.e ? solidOf(rack.e).zmax : 2286, "TOP OF RACK");
  const hac = cuts.find((o) => o.kind === "hac"); if (hac) lv.set(hac.z1, "PLENUM / TOP OF CONTAINMENT");
  const slabs = cuts.filter((o) => o.kind === "struct" && /IfcSlab/.test(o.e?.ifc_class || "") && o.z0 > 2400); if (slabs.length) { const r = Math.min(...slabs.map((o) => o.z0)); lv.set(r, "U/S ROOF DECK"); lv.set(Math.max(...slabs.map((o) => o.z1)), "ROOF"); }
  const wallTop = Math.max(0, ...cuts.filter((o) => o.kind === "wall").map((o) => o.z1)); if (wallTop) lv.set(wallTop, "TOP OF PARAPET");
  const runs = new Map(); for (const o of cuts.filter((o) => o.kind === "pipe")) { const zc = Math.round((o.z0 + o.z1) / 200) * 100; const sys = (o.e?.system || "").replace(/-?[A-Z]?P?\d+[A-Z]?$/, "").replace(/-[A-D]$/, ""); if (!runs.has(zc)) runs.set(zc, new Set()); runs.get(zc).add(/busway/i.test(o.e?.name || "") ? "BUSWAY" : /ladder/i.test(o.e?.name || "") ? "LADDER" : sys || "SERVICE"); }
  for (const [zc, set] of [...runs].sort((a, b) => a[0] - b[0]).slice(0, 8)) if (![...lv.keys()].some((k) => Math.abs(k - zc) < 150)) lv.set(zc, [...set].slice(0, 2).join(" / ") + " CL");
  const xr = Math.max(g0[0], g1[0]) + 8; let lastY = -1e9;
  for (const [zz, nm] of [...lv].sort((a, b) => a[0] - b[0])) { const y = oy + zz / s; const yy = Math.max(y, lastY + 4.2); lastY = yy;
    line([xr - 3, y], [xr + 2, y], 0.25, { layer: "BJ-LEVEL" }); poly([[xr - 1.5, y], [xr, y + 1.5], [xr + 1.5, y]], { w: 0.25, fill: "#000000", layer: "BJ-LEVEL" }); if (yy !== y) line([xr + 2, y], [xr + 4, yy], 0.13, { layer: "BJ-LEVEL" });
    const t = `${zz >= 0 ? "+" : ""}${(zz / 1000).toFixed(2)} ${nm}`; text([xr + 4.5, yy - 0.8], t, 2.5, { layer: "BJ-LEVEL" }); placed.push(Object.assign(rectOfText([xr + 4.5, yy - 0.8], t, 2.5), { txt: t })); }
  // labels: equipment cut or seen, then spaces (rooms the plane passes through)
  const box = { x0: area.x0, y0: area.y0 + 16, x1: area.x1, y1: area.y1 };
  const place = (txt, cands, h = 2.5, bold = false) => { for (const cd of cands) { const r = rectOfText(cd.at, txt, h, cd.align || "middle", cd.rot || 0, bold); if (!hit(r, placed) && !hit(r, hard, 0.2) && inRect(r, box)) {
    items.push({ t: "poly", pts: [[r.x0 - 0.4, r.y0 - 0.3], [r.x1 + 0.4, r.y0 - 0.3], [r.x1 + 0.4, r.y1 + 0.3], [r.x0 - 0.4, r.y1 + 0.3]], fill: "#ffffff", w: 0, layer: "BJ-MASK" });
    text(cd.at, txt, h, { align: cd.align || "middle", rot: cd.rot || 0, bold, layer: "BJ-TAG" }); placed.push(Object.assign(r, { txt })); tags++; return true; } } return false; };
  const seen = new Set(); const eqs = [...cuts, ...vis].filter((o) => o.kind === "equip" && o.e?.mark && !/NVL72|Network rack|valve/i.test(o.e.family || ""));
  for (const o of eqs) { const k = o.e.mark; if (seen.has(k)) continue; seen.add(k); const [x0, y0, x1, y1] = R(o); const cx = (x0 + x1) / 2;
    const ok = place(k, [{ at: [cx, y1 + 2] }, { at: [cx, (y0 + y1) / 2 - 0.9] }, { at: [cx + 0.9, (y0 + y1) / 2], rot: 90 }, { at: [cx, y1 + 6] }, { at: [cx, y1 + 10] }, { at: [cx, y0 - 4] }]); if (!ok) missing.push(k); }
  const rowsSeen = new Map(); for (const o of [...cuts, ...vis].filter((o) => /NVL72/.test(o.e?.family || ""))) { const row = o.e.mark.replace(/-\d+$/, ""); const [x0, , x1, y1] = R(o); const r = rowsSeen.get(row) || { x0, x1, y1 }; rowsSeen.set(row, { x0: Math.min(r.x0, x0), x1: Math.max(r.x1, x1), y1 }); }
  if (rowsSeen.size <= 6) { for (const [row, r] of rowsSeen) if (!place(`ROW ${row}`, [{ at: [(r.x0 + r.x1) / 2, r.y1 + 2] }, { at: [(r.x0 + r.x1) / 2, r.y1 + 6] }])) missing.push(`ROW ${row}`); }
  else place(`${rowsSeen.size} RACK ROWS CUT (GB300 NVL72)`, [{ at: [(g0[0] + g1[0]) / 2, oy + 2600 / s] }, { at: [(g0[0] + g1[0]) / 2, oy + 6400 / s] }]);
  for (const r of model.elements.filter((e) => e.kind === "room")) { const xs = r.boundary.map((p) => p[ax]), hs = r.boundary.map((p) => p[hx]); if (Math.min(...xs) > c.at || Math.max(...xs) < c.at) continue;
    const h0 = Math.max(Math.min(...hs), H0), h1 = Math.min(Math.max(...hs), H1); if (h1 - h0 < 3000) continue; const xm = (P(h0, 0)[0] + P(h1, 0)[0]) / 2; const nm = r.name.toUpperCase();
    place(nm, [{ at: [xm, oy + 7000 / s] }, { at: [xm, oy + 6200 / s] }, { at: [xm, oy + 7800 / s] }, { at: [xm, oy + 1200 / s] }], 3.5, true); }
  // title, scale bar
  const ty = area.y0 + 14; const ttl = `SECTION ${c.name}-${c.name}`; poly(circ([area.x0 + 6, ty + 1.5], 5), { w: 0.5 }); text([area.x0 + 6, ty + 0.3], c.name, 3.5, { align: "middle", bold: true });
  text([area.x0 + 14, ty + 0.5], `${ttl} — ${(z0?.name || "").toUpperCase()}`, 5, { bold: true }); text([area.x0 + 14, ty - 5], `Scale 1:${s} at the sheet size shown. Cut at ${c.axis} = ${(c.at / 1000).toFixed(2)} m (site), looking ${c.axis === "x" ? (c.look > 0 ? "east" : "west") : c.look > 0 ? "north" : "south"}; elements within ${(c.depth / 1000).toFixed(1)} m beyond shown thin.`, 2.5);
  scaleBar(items, [area.x1 - 120, ty - 4], s, "BJ-SCALEBAR");
  return { items, scale: s, qa: { overlaps: qaOf(placed), missing, small: [], tags } };
}

// ---------------------------------------------------------------- site plan
export function draftSite(model, sh, area, docs = {}) {
  const items = []; const { line, poly, text, rect } = pen(items);
  const site = model.elements.find((e) => e.kind === "mass" && /EARTHWORKS|SITE/.test(e.layer || "") && e.outline); const zones = (model.data.zones || []).filter((z) => !z.parent);
  const pts = site ? site.outline : zones.flatMap((z) => z.outline); if (!pts.length) return { items, scale: 1000, qa: { overlaps: [], missing: [], small: [], tags: 0 } };
  const b = pts.reduce((q, p) => ({ x0: Math.min(q.x0, p[0]), y0: Math.min(q.y0, p[1]), x1: Math.max(q.x1, p[0]), y1: Math.max(q.y1, p[1]) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  let s = 500; for (const t of [500, 1000, 1250, 2000, 2500, 5000]) { s = t; if ((b.x1 - b.x0) / t + 60 <= area.x1 - area.x0 && (b.y1 - b.y0) / t + 80 <= area.y1 - area.y0) break; }
  const ox = area.x0 + 30 + ((area.x1 - area.x0 - 60) - (b.x1 - b.x0) / s) / 2, oy = area.y0 + 50 + Math.max(0, (area.y1 - area.y0 - 80 - (b.y1 - b.y0) / s) / 2); const P = (p) => [ox + (p[0] - b.x0) / s, oy + (p[1] - b.y0) / s];
  const placed = [], hard = [], missing = []; let tags = 0;
  for (const e of model.elements.filter((e) => e.kind === "mass" && /C-ROAD/.test(e.layer || "") && e.outline)) poly(e.outline.map(P), { w: 0.18, fill: "#e8e8e8", layer: "BJ-ROAD" });
  for (const e of model.elements.filter((e) => e.kind === "mass" && e.ifc_class === "IfcSlab" && e.outline)) { let bb; try { bb = solidOf(e); } catch { continue; } if (bb.zmin < 8000) continue; const q = e.outline.map(P); poly(q, { w: 0.5, fill: "#bdbdbd", layer: "BJ-BUILDING" }); }
  for (const e of model.elements.filter((e) => e.kind === "mass" && /A-BUILDING/.test(e.layer || "") && e.outline)) poly(e.outline.map(P), { w: 0.35, fill: "#d6d6d6", layer: "BJ-BUILDING" });
  for (const e of model.elements.filter((e) => e.family && /IfcTank|IfcTransformer|IfcElectricGenerator|IfcCoolingTower|IfcSwitchingDevice/.test(e.ifc_class || ""))) { let bb; try { bb = solidOf(e); } catch { continue; } if (bb.zmin > 8000) continue;
    const a = P([bb.xmin, bb.ymin]), c = P([bb.xmax, bb.ymax]); if (/IfcTank/.test(e.ifc_class)) poly(circ([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], Math.max(0.4, (c[0] - a[0]) / 2), 16), { w: 0.18 }); else rect(a[0], a[1], c[0], c[1], { w: 0.18 }); }
  for (const e of model.elements.filter((e) => e.shape === "sweep" && /FENCE/i.test(e.layer || e.name || ""))) for (let i = 0; i < e.path.length - 1; i++) line(P(e.path[i]), P(e.path[i + 1]), 0.35, { dash: "dash", layer: "BJ-FENCE" });
  if (site) { const q = site.outline.map(P); for (let i = 0; i < q.length; i++) line(q[i], q[(i + 1) % q.length], 0.7, { dash: "center", layer: "BJ-BOUNDARY" }); }
  for (const z of zones) { const q = z.outline.map(P); for (let i = 0; i < q.length; i++) line(q[i], q[(i + 1) % q.length], 0.25, { dash: "dash", col: GREY, layer: "BJ-ZONE" });
    const zb = q.reduce((r, p) => ({ x0: Math.min(r.x0, p[0]), y0: Math.min(r.y0, p[1]), x1: Math.max(r.x1, p[0]), y1: Math.max(r.y1, p[1]) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const nm = `${z.code} — ${z.name.toUpperCase()}`; let ok = false; for (const dy of [0, 8, -8, 16, -16, 24, -24]) { const at = [(zb.x0 + zb.x1) / 2, (zb.y0 + zb.y1) / 2 + dy]; const r = rectOfText(at, nm, 3.5, "middle", 0, true);
      if (!hit(r, placed) && inRect(r, area)) { items.push({ t: "poly", pts: [[r.x0 - 0.5, r.y0 - 0.4], [r.x1 + 0.5, r.y0 - 0.4], [r.x1 + 0.5, r.y1 + 0.4], [r.x0 - 0.5, r.y1 + 0.4]], fill: "#ffffff", w: 0, layer: "BJ-MASK" }); text(at, nm, 3.5, { align: "middle", bold: true, layer: "BJ-TAG" }); placed.push(Object.assign(r, { txt: nm })); tags++; ok = true; break; } }
    if (!ok) missing.push(z.code); }
  // overall dimensions of the plot
  const p0 = P([b.x0, b.y0]), p1 = P([b.x1, b.y1]); const yd = p0[1] - 10; line([p0[0], yd], [p1[0], yd], 0.25); for (const x of [p0[0], p1[0]]) { line([x, yd - 2], [x, yd + 2], 0.25); line([x - 1, yd - 1], [x + 1, yd + 1], 0.5); }
  text([(p0[0] + p1[0]) / 2, yd + 1.2], `${Math.round((b.x1 - b.x0) / 1000)} m`, 2.5, { align: "middle" }); const xd = p0[0] - 10; line([xd, p0[1]], [xd, p1[1]], 0.25); for (const y of [p0[1], p1[1]]) { line([xd - 2, y], [xd + 2, y], 0.25); line([xd - 1, y - 1], [xd + 1, y + 1], 0.5); }
  text([xd - 1.2, (p0[1] + p1[1]) / 2], `${Math.round((b.y1 - b.y0) / 1000)} m`, 2.5, { align: "middle", rot: 90 });
  north(items, [p1[0] + 14, p1[1] - 14], "BJ-NORTH");
  const ty = area.y0 + 18; text([area.x0 + 14, ty], `SITE PLAN — ${(docs.project_name || "").toUpperCase()}`, 5, { bold: true }); text([area.x0 + 14, ty - 5.5], `Scale 1:${s} at the sheet size shown. Plot ${(((b.x1 - b.x0) * (b.y1 - b.y0)) / 1e10).toFixed(1)} ha. Buildings solid grey, roads light grey, site boundary chain line, zones dashed.`, 2.5);
  scaleBar(items, [area.x1 - 130, ty - 4], s, "BJ-SCALEBAR");
  return { items, scale: s, qa: { overlaps: qaOf(placed), missing, small: [], tags } };
}
