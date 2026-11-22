// Drawing deliverables on the bus: set-up (standard + ISO 19650 fields), sheets, preview/render, publish
// (status, revision, register, zip of PDF + DXF + XLSX). Headless-safe. State: bus.extra.docs.
import { defaultDocs, composeSheet, sheetNumber, STANDARDS, STATUS, PAPER, zoned } from "./sheets.js";
import { PACKS, SHEET_KINDS, packSheets, penetrations, spools } from "./services.js";
import { toManifold, needKernel } from "../author/kernel.js";
import { triangulate } from "../author/geom.js";
import { toSVG, toPDF, toDXF } from "./render.js";
import { xlsx, toBase64 } from "../cost/xlsx.js";
import { zip } from "../coord/zip.js";
import { schedule } from "../author/model.js";
import { solidOf } from "../author/solids.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };
const KINDS = ["register", "ga", "elec", "mech", "site", "site_section", "plan", "elevations", "sections", "isometric", "schedule", "service", "coordinated", "piping_iso", "spool", "bwic", "plant", "containment", "sld", "whitespace", "equipment", "fire"];

export function installDocs(bus) {
  const D = () => (bus.extra.docs ||= defaultDocs());
  const withSite = (s) => (s.kind === "site" || s.kind === "site_section" ? Object.defineProperty({ ...s }, "__site", { value: bus.extra.site || {}, enumerable: false }) : s);
  const seqOf = (kind) => D().sheets.filter((s) => s.kind === kind).length + 1;

  bus.register("drawing_setup", (a) => {
    const d = D();
    if (a.standard != null) { if (!STANDARDS[a.standard]) fail(`standard must be one of ${Object.keys(STANDARDS).join(", ")}`); d.standard = a.standard; }
    for (const k of ["project_code", "originator", "volume", "role"]) if (a[k] != null) { const v = String(a[k]).toUpperCase(); if (!/^[A-Z0-9]{1,6}$/.test(v)) fail(`${k} must be 1–6 letters or digits (ISO 19650 field)`); d[k] = v; }
    for (const k of ["project_name", "client", "address", "author", "checker", "approver"]) if (a[k] != null) d[k] = String(a[k]).slice(0, 120);
    if (a.paper != null) { if (a.paper && !PAPER[a.paper]) fail(`paper must be one of ${Object.keys(PAPER).join(", ")} (or empty for automatic)`); d.paper = a.paper || null; }
    return { standard: d.standard, label: STANDARDS[d.standard].label, project_code: d.project_code, originator: d.originator };
  });

  bus.register("sheets_auto", (a) => {
    const d = D(); if (!a.keep) d.sheets = [];
    const m = bus.model; const add = (s) => { const id = `D${d.next++}`; d.sheets.push({ id, seq: seqOf(s.kind), ...s }); };
    add({ kind: "register", title: "Drawing register" });
    if (bus.extra.site?.points?.length) { add({ kind: "site", title: "Site plan and grading" }); add({ kind: "site_section", title: "Site section S-S" }); }
    const cuts = m.data.drawing_plans;
    if (cuts?.length) cuts.forEach((c) => add({ kind: "plan", level: m.data.levels[0].id, cut_z: c.cut_z, title: c.title, view_title: c.title }));
    else for (const l of [...m.data.levels].sort((x, y) => x.elevation - y.elevation)) if (m.elements.some((e) => e.level === l.id && e.kind !== "roof")) add({ kind: "plan", level: l.id, title: `${l.name} plan` });
    add({ kind: "elevations", title: "Elevations" }); add({ kind: "sections", title: "Sections A-A and B-B" }); add({ kind: "isometric", title: "Isometric views" });
    if (m.elements.some((e) => ["door", "window", "room", "wall", "mass"].includes(e.kind))) add({ kind: "schedule", title: "Schedules" });
    const pack = a.pack ?? bus.extra.brief?.type; if (pack && PACKS[pack]) for (const x of packSheets(m, PACKS[pack])) add(x);
    return { sheets: d.sheets.length };
  });

  bus.register("drawing_pack", (a) => {
    const d = D(); const pack = a.pack || bus.extra.brief?.type || "building";
    const kinds = PACKS[pack] || (SHEET_KINDS[pack] ? [pack] : fail(`pack must be a project type (${Object.keys(PACKS).join(", ")}) or a building block (${Object.keys(SHEET_KINDS).join(", ")})`));
    if (kinds.some((k) => ["bwic", "coordinated"].includes(k))) needKernel();
    if (a.replace !== false) d.sheets = d.sheets.filter((x) => !packKinds.includes(x.kind));
    const want = packSheets(bus.model, kinds, zoned); const added = [];
    for (const s of want) { const id = `D${d.next++}`; d.sheets.push({ id, seq: d.sheets.filter((x) => x.kind === s.kind).length + 1, ...s }); added.push({ id, kind: s.kind, title: s.title }); }
    const skipped = kinds.filter((k) => !want.some((w) => w.kind === (k === "equipment" ? "equipment" : k)) && k !== "as_built");
    return { pack, added, skipped: skipped.map((k) => `${SHEET_KINDS[k]}: nothing in the model to draw yet`) };
  });
  const packKinds = ["service", "coordinated", "piping_iso", "spool", "bwic", "plant", "containment", "sld", "whitespace", "equipment", "fire"];
  bus.register("bwic", () => { needKernel(); const list = penetrations(bus.model, { toManifold, triangulate }); return { count: list.length, openings: list }; }, { kind: "read" });
  bus.register("spools", (a) => { const max = a.max_mm != null ? +a.max_mm : 6000; if (!(max >= 1000 && max <= 12000)) fail("max_mm between 1000 and 12000 (transport length)"); const S = spools(bus.model, { max_mm: max, system: a.system || null }); return { count: S.length, spools: S.map((x) => ({ id: x.id, line: x.line, size: x.size, cuts: x.cuts, shop_welds: x.shop_welds, field_welds: x.field_welds })) }; }, { kind: "read" });
  bus.register("sheet", (a) => {
    const d = D(); const cur = a.id && d.sheets.find((s) => s.id === a.id);
    if (a.delete) { if (!cur) fail(`no sheet ${a.id}`, "no_such_element"); d.sheets = d.sheets.filter((s) => s !== cur); return { deleted: a.id }; }
    if (a.id && !cur) fail(`no sheet ${a.id}`, "no_such_element");
    const s = cur || { id: `D${d.next++}` };
    if (a.kind != null) { if (!KINDS.includes(a.kind)) fail(`kind must be one of ${KINDS.join(", ")}`); s.kind = a.kind; if ({ ga: 1, elec: 1, mech: 1 }[a.kind]) s.role = { ga: "A", elec: "E", mech: "M" }[a.kind]; }
    if (!s.kind) fail("a new sheet needs a kind");
    if (a.level != null) s.level = bus.model.level(a.level).id;
    if (a.cut_z != null) { s.cut_z = +a.cut_z; if (!Number.isFinite(s.cut_z)) fail("cut_z must be mm"); }
    if (a.scale != null) { s.scale = +a.scale; if (!(s.scale > 0)) fail("scale is the denominator, e.g. 100 for 1:100"); }
    if (a.paper != null) { if (a.paper && !PAPER[a.paper]) fail(`paper must be one of ${Object.keys(PAPER).join(", ")}`); s.paper = a.paper || undefined; }
    if (a.title != null) s.title = String(a.title).slice(0, 120);
    if (a.discipline != null) { if (!/^[MEPF]$/.test(a.discipline)) fail("discipline: M, E, P or F"); s.discipline = s.role = a.discipline; }
    if (a.zone != null) { if (a.zone && !(bus.model.data.zones || []).some((z) => z.code === a.zone)) fail(`no zone ${a.zone}`, "no_such_element"); s.zone = a.zone || undefined; }
    if (a.medium != null) s.medium = String(a.medium); if (a.system != null) s.system = String(a.system).slice(0, 40); if (a.page != null) s.page = Math.max(1, Math.round(+a.page) || 1);
    if (!s.title && { ga: 1, elec: 1, mech: 1 }[s.kind]) { const z = (bus.model.data.zones || []).find((x) => x.code === s.zone); s.title = `${z ? z.name + " " : ""}${{ ga: "general arrangement plan", elec: "electrical layout", mech: "mechanical layout" }[s.kind]}`; s.title = s.title[0].toUpperCase() + s.title.slice(1); }
    s.title ||= { site: "Site plan and grading", site_section: "Site section S-S", register: "Drawing register", plan: "Plan", elevations: "Elevations", sections: "Sections", isometric: "Isometric views", schedule: "Schedules", ...SHEET_KINDS }[s.kind];
    if (!cur) { s.seq = seqOf(s.kind); d.sheets.push(s); }
    return { id: s.id, number: sheetNumber(d, bus.model, s) };
  });

  const sheetById = (id) => D().sheets.find((s) => s.id === id) || fail(`no sheet ${id}: run sheets_auto or sheet first`, "no_such_element");
  bus.register("drawing", (a) => {
    const s = sheetById(a.sheet); const comp = composeSheet(bus.model, D(), withSite(s), { date: a.date || "" }); const f = a.format || "svg";
    const base = { sheet: s.id, number: comp.number, scale: comp.scale, nts: !!comp.nts, paper: comp.paper, ...(comp.qa ? { qa: { overlaps: comp.qa.overlaps.length, missing: comp.qa.missing, small: comp.qa.small, tags: comp.qa.tags } } : {}) };
    if (f === "svg") return { ...base, svg: toSVG(comp) };
    if (f === "dxf") return { ...base, dxf: toDXF(comp) };
    if (f === "pdf") return { ...base, base64: toBase64(toPDF([comp], { title: s.title })) };
    fail("format must be svg, pdf or dxf");
  }, { kind: "read" });

  bus.register("register", () => ({ standard: D().standard, sheets: D().sheets.map((s) => ({ id: s.id, kind: s.kind, title: s.title, ...sheetNumber(D(), bus.model, s) })), register: D().register }), { kind: "read" });

  bus.register("publish", (a) => {
    const d = D(); if (!d.sheets.length) fail("no sheets: run sheets_auto first");
    const status = a.status || "S2"; if (!STATUS[status]) fail(`status must be one of ${Object.keys(STATUS).join(", ")} (BS EN ISO 19650-2 UK NA)`);
    const date = a.date || "2026-01-01"; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("date must be YYYY-MM-DD"); a.date = date;
    const pick = a.sheets ? d.sheets.filter((s) => a.sheets.includes(s.id)) : d.sheets; if (!pick.length) fail("none of those sheets exist", "no_such_element");
    const prefix = STATUS[status].rev;
    for (const s of pick) { const n = d.register.filter((r) => r.sheet === s.id && r.rev.startsWith(prefix)).length + 1;
      d.register.push({ sheet: s.id, number: sheetNumber(d, bus.model, s).container, title: s.title, status, rev: `${prefix}${String(n).padStart(2, "0")}`, date, note: String(a.note || STATUS[status].text).slice(0, 80) }); }
    const formats = a.formats || ["pdf", "dxf", "xlsx"];
    const comps = pick.map((s) => ({ s, c: composeSheet(bus.model, d, withSite(s), { date }) })); const files = [];
    const revOf = (s) => [...d.register].reverse().find((r) => r.sheet === s.id).rev;
    if (formats.includes("pdf")) { files.push({ name: `${d.project_code}-${d.originator}-SET_${status}.pdf`, data: toPDF(comps.map((x) => x.c), { title: `${d.project_name || bus.model.data.name} drawing set` }) });
      for (const { s, c } of comps) files.push({ name: `pdf/${c.number.container}_${revOf(s)}_${status}.pdf`, data: toPDF([c], { title: s.title }) }); }
    if (formats.includes("dxf")) for (const { s, c } of comps) if (c.scale || c.nts) files.push({ name: `dxf/${c.number.container}_${revOf(s)}_${status}.dxf`, data: toDXF(c) });
    if (formats.includes("xlsx")) files.push({ name: `${d.project_code}-${d.originator}-ZZ-ZZ-SH-A-0002_${status}.xlsx`, data: workbook(bus.model, d) });
    files.push({ name: "README.txt", data: readme(d, bus.model, status, date) });
    const z = zip(files);
    return { status, date, files: files.map((f) => f.name), register: d.register.slice(-pick.length), filename: `${d.project_code}-${d.originator}_${status}_${date}.zip`, base64: toBase64(z) };
  });
  return bus;
}

function workbook(model, d) {
  const sheets = [{ name: "Register (MIDP)", rows: [["Container name (ISO 19650)", "Sheet", "Title", "Status", "Status meaning", "Revision", "Date", "Note"],
    ...d.register.map((r) => { const s = d.sheets.find((x) => x.id === r.sheet); return [r.number, s ? sheetNumber(d, model, s).shown : "", r.title, r.status, STATUS[r.status]?.text || "", r.rev, r.date, r.note]; })] }];
  for (const k of ["door", "window", "room", "wall", "floor"]) { const rows = schedule(model, k); if (rows.length) sheets.push({ name: `${k[0].toUpperCase()}${k.slice(1)} schedule`, rows: [Object.keys(rows[0]), ...rows.map((r) => Object.values(r))] }); }
  const masses = model.elements.filter((e) => e.kind === "mass");
  if (masses.length) sheets.push({ name: "Element schedule", rows: [["id", "name", "IFC class", "material", "volume m3", "surface m2", "height m"], ...masses.map((e) => { const s = solidOf(e); return [e.id, e.name, e.ifc_class, e.material || "", +(s.volume / 1e9).toFixed(3), +(s.area / 1e6).toFixed(2), +((s.zmax - s.zmin) / 1000).toFixed(3)]; })] });
  return xlsx(sheets);
}
function readme(d, model, status, date) {
  return [`${d.project_name || model.data.name}: drawing issue ${date}, status ${status} (${STATUS[status].text}).`, `Standard: ${STANDARDS[d.standard].label}.`,
    "Files: SET pdf = all sheets; pdf/ = one file per information container; dxf/ = CAD at true scale (1 unit = 1 mm; title block drawn at the plot scale; diagrams not to scale are in paper millimetres); xlsx = register (MIDP) and schedules.",
    "DWG: open a DXF in AutoCAD and use Save As > DWG, or batch-convert with the free ODA File Converter.",
    "Generated by BIMja from the model; drawings and schedules come from the same model, so they agree.", model.data.description ? `Credit: ${model.data.description}` : ""].filter(Boolean).join("\n") + "\n";
}
