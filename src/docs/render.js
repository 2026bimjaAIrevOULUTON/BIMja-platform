// Sheet -> SVG (preview), PDF (vector, multi-page), DXF (R12, layers, 1 unit = 1 mm at true scale).
// No dependencies; deterministic output (no clocks).
import { triangulate } from "./mesh.js";

const tw = (s, h) => String(s).length * h * 0.52; // Helvetica average advance
const ax = (it) => (it.align === "middle" ? -tw(it.text, it.h) / 2 : it.align === "end" ? -tw(it.text, it.h) : 0);
const r3 = (n) => Math.round(n * 1000) / 1000;

export function toSVG(sheet) {
  const { w, h } = sheet; const Y = (y) => r3(h - y); const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm" font-family="Helvetica, Arial, sans-serif"><rect width="${w}" height="${h}" fill="#fff"/>`];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  for (const it of sheet.items) {
    if (it.t === "poly") out.push(`<polygon points="${it.pts.map((p) => `${r3(p[0])},${Y(p[1])}`).join(" ")}" fill="${it.fill || "none"}" stroke="${it.w ? "#000" : "none"}" stroke-width="${it.w || 0}"/>`);
    else if (it.t === "line") out.push(`<line x1="${r3(it.p[0][0])}" y1="${Y(it.p[0][1])}" x2="${r3(it.p[1][0])}" y2="${Y(it.p[1][1])}" stroke="#000" stroke-width="${it.w}"${it.dash ? ' stroke-dasharray="3 1.5"' : ""} stroke-linecap="round"/>`);
    else if (it.t === "text") { const x = r3(it.at[0]), y = Y(it.at[1]); const anchor = it.align === "middle" ? "middle" : it.align === "end" ? "end" : "start";
      out.push(`<text x="${x}" y="${y}" font-size="${it.h}" text-anchor="${anchor}"${it.bold ? ' font-weight="700"' : ""}${it.rot ? ` transform="rotate(${-it.rot} ${x} ${y})"` : ""}>${esc(it.text)}</text>`); }
  }
  out.push("</svg>"); return out.join("\n");
}

// ---------- PDF ----------
const WIN = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "™": 0x99 };
const winAnsi = (s) => { let o = ""; for (const ch of String(s)) { const c = ch.codePointAt(0); const b = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : WIN[ch] ?? 0x3f; const x = String.fromCharCode(b); o += x === "(" || x === ")" || x === "\\" ? "\\" + x : x; } return o; };
export function toPDF(sheets, { title = "BIMja drawings" } = {}) {
  const pt = (mm) => r3((mm * 72) / 25.4); const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null), pages = add(null), f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const sh of sheets) {
    const c = ["1 J 1 j"];
    for (const it of sh.items) {
      if (it.t === "poly") {
        const path = it.pts.map((p, i) => `${pt(p[0])} ${pt(p[1])} ${i ? "l" : "m"}`).join(" ") + " h";
        if (it.fill) { const [r, g, b] = [1, 3, 5].map((k) => r3(parseInt(it.fill.slice(k, k + 2), 16) / 255)); c.push(`${r} ${g} ${b} rg ${path} f`); }
        if (it.w) c.push(`0 G ${pt(it.w)} w [] 0 d ${path} S`);
      } else if (it.t === "line") c.push(`0 G ${pt(it.w)} w ${it.dash ? "[8.5 4.25] 0 d" : "[] 0 d"} ${pt(it.p[0][0])} ${pt(it.p[0][1])} m ${pt(it.p[1][0])} ${pt(it.p[1][1])} l S`);
      else if (it.t === "text") {
        const a = ((it.rot || 0) * Math.PI) / 180, cs = r3(Math.cos(a)), sn = r3(Math.sin(a)); const dx = ax(it);
        const x = it.at[0] + dx * Math.cos(a), y = it.at[1] + dx * Math.sin(a);
        c.push(`0 g BT /${it.bold ? "F2" : "F1"} ${pt(it.h)} Tf ${cs} ${sn} ${-sn} ${cs} ${pt(x)} ${pt(y)} Tm (${winAnsi(it.text)}) Tj ET`);
      }
    }
    const content = c.join("\n"); const cs = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${pt(sh.w)} ${pt(sh.h)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cs} 0 R >>`));
  }
  objs[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  const info = add(`<< /Title (${winAnsi(title)}) /Producer (BIMja) /Creator (BIMja drawing engine) >>`);
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const u8 = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 0xff; return u8;
}

// ---------- DXF (R12) ----------
const ACI = { cut: 8, cutline: 7, beyond: 7, door: 30, window: 4, room: 2, slab: 9, dims: 1, text: 7, tag: 3, level: 5, ground: 7, frame: 7, grid: 1 };
export function toDXF(sheet) {
  const k = sheet.scale || 1; const S = (p) => [r3(p[0] * k), r3(p[1] * k)];
  const layers = [...new Set(["0", ...sheet.items.map((i) => i.layer)])];
  const colorOf = (name) => { const key = Object.keys(ACI).find((x) => name.toLowerCase().includes(x)); return ACI[key] || 7; };
  const L = []; const g = (code, v) => L.push(String(code), String(v));
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$INSBASE"); g(10, 0); g(20, 0); g(30, 0); g(9, "$EXTMIN"); g(10, 0); g(20, 0); g(30, 0); g(9, "$EXTMAX"); g(10, r3(sheet.w * k)); g(20, r3(sheet.h * k)); g(30, 0); g(9, "$LUNITS"); g(70, 2); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 2);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0);
  g(0, "LTYPE"); g(2, "DASHED"); g(70, 0); g(3, "__ __ __"); g(72, 65); g(73, 2); g(40, r3(4.5 * k)); g(49, r3(3 * k)); g(49, r3(-1.5 * k)); g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length);
  for (const n of layers) { g(0, "LAYER"); g(2, n); g(70, 0); g(62, colorOf(n)); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB"); g(0, "TABLE"); g(2, "STYLE"); g(70, 1); g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, "txt"); g(4, ""); g(0, "ENDTAB");
  g(0, "ENDSEC"); g(0, "SECTION"); g(2, "ENTITIES");
  const clean = (s) => String(s).replace(/[\r\n]/g, " ").replace(/²/g, "%%178").replace(/°/g, "%%d").replace(/[^\x20-\x7e%]/g, "?");
  for (const it of sheet.items) {
    if (it.t === "line") { const a = S(it.p[0]), b = S(it.p[1]); g(0, "LINE"); g(8, it.layer); if (it.dash) g(6, "DASHED"); g(10, a[0]); g(20, a[1]); g(30, 0); g(11, b[0]); g(21, b[1]); g(31, 0); }
    else if (it.t === "poly") {
      if (it.fill) for (const [i, j, m] of triangulate(it.pts)) { const a = S(it.pts[i]), b = S(it.pts[j]), c = S(it.pts[m]); g(0, "SOLID"); g(8, it.layer); g(10, a[0]); g(20, a[1]); g(30, 0); g(11, b[0]); g(21, b[1]); g(31, 0); g(12, c[0]); g(22, c[1]); g(32, 0); g(13, c[0]); g(23, c[1]); g(33, 0); }
      if (it.w || !it.fill) { g(0, "POLYLINE"); g(8, it.layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
        for (const p of it.pts) { const q = S(p); g(0, "VERTEX"); g(8, it.layer); g(10, q[0]); g(20, q[1]); g(30, 0); } g(0, "SEQEND"); g(8, it.layer); }
    } else if (it.t === "text") {
      const a = S(it.at); g(0, "TEXT"); g(8, it.layer); g(10, a[0]); g(20, a[1]); g(30, 0); g(40, r3(it.h * k)); g(1, clean(it.text)); if (it.rot) g(50, it.rot);
      if (it.align === "middle" || it.align === "end") { g(72, it.align === "middle" ? 1 : 2); g(11, a[0]); g(21, a[1]); g(31, 0); }
    }
  }
  g(0, "ENDSEC"); g(0, "EOF"); return L.join("\n") + "\n";
}
