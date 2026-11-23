// Drawings workspace: set-up, sheet list, live sheet preview (SVG), publish zip, register.
import { STATUS } from "../docs/sheets.js";
import { SAMPLE_SERVICES } from "./sample-services.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function installDocsUI({ bus, run, toast, download, downloadBlob }) {
  let current = null;
  $("#publishStatus").innerHTML = Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === "S2" ? " selected" : ""}>${k} · ${esc(v.text)}</option>`).join("");
  const today = () => new Date().toISOString().slice(0, 10);
  async function render() {
    const r = await run("register", {}); if (!r.ok) return; const d = r.data;
    $("#dwgStandard").value = d.standard;
    $("#sheetList").innerHTML = d.sheets.length ? d.sheets.map((s) => { const last = [...d.register].reverse().find((x) => x.sheet === s.id);
      return `<div class="sheet-row${s.id === current ? " on" : ""}" data-sheet="${esc(s.id)}"><span class="grow"><b>${esc(s.title)}</b><br><span class="num">${esc(s.shown)}${s.shown !== s.container ? " · " + esc(s.container) : ""}</span></span><span class="st">${last ? `${esc(last.status)} ${esc(last.rev)}` : "not issued"}</span></div>`; }).join("")
      : `<p class="note">No sheets yet. Create the sheet set from the model, or add a sheet.</p>`;
    $("#registerList").innerHTML = d.register.length ? `<table><tr><th>Container</th><th>Status</th><th>Rev</th><th>Date</th></tr>${d.register.slice(-30).reverse().map((x) => `<tr><td>${esc(x.number)}</td><td>${esc(x.status)}</td><td>${esc(x.rev)}</td><td>${esc(x.date)}</td></tr>`).join("")}</table>` : "";
  }
  async function preview(id) {
    current = id; const r = await run("drawing", { sheet: id, format: "svg", date: today() }); if (!r.ok) return toast(r.refusals?.[0]?.message || "Could not draw the sheet");
    $("#spTitle").textContent = `${r.data.number.shown} · ${r.data.scale ? `1:${r.data.scale}` : r.data.nts ? "NTS" : "as shown"} @ ${r.data.paper}`; $("#spBody").innerHTML = r.data.svg; $("#sheetPreview").hidden = false; render();
  }
  $("#sheetList").addEventListener("click", (e) => { const row = e.target.closest("[data-sheet]"); if (row) preview(row.dataset.sheet); });
  $("#spClose").onclick = () => { $("#sheetPreview").hidden = true; current = null; render(); };
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  $("#spPdf").onclick = async () => { const r = await run("drawing", { sheet: current, format: "pdf", date: today() }); if (r.ok) downloadBlob(`${r.data.number.container}.pdf`, new Blob([b64(r.data.base64)], { type: "application/pdf" })); };
  $("#spDxf").onclick = async () => { const r = await run("drawing", { sheet: current, format: "dxf" }); if (r.ok) download(`${r.data.number.container}.dxf`, r.data.dxf, "application/dxf"); };
  $("#dwgSetup").onclick = () => run("drawing_setup", { standard: $("#dwgStandard").value, ...($("#dwgProject").value ? { project_code: $("#dwgProject").value } : {}), ...($("#dwgOriginator").value ? { originator: $("#dwgOriginator").value } : {}), ...($("#dwgName").value ? { project_name: $("#dwgName").value } : {}), ...($("#dwgClient").value ? { client: $("#dwgClient").value } : {}) }).then(() => { render(); if (current) preview(current); });
  $("#dwgStandard").onchange = () => $("#dwgSetup").click();
  $("#sheetsAuto").onclick = async () => { const r = await run("sheets_auto", {}); if (r.ok) { toast(`${r.data.sheets} sheets created`); await render(); const first = document.querySelector("[data-sheet]:nth-child(2)") || document.querySelector("[data-sheet]"); if (first) preview(first.dataset.sheet); } };
  const zones = () => { const sel = $("#sheetZone"); const cur = sel.value; sel.innerHTML = '<option value="">Whole site</option>' + (bus.model.data.zones || []).map((z) => `<option value="${z.code}">${z.name.replace(/[<>&"]/g, "")}</option>`).join(""); sel.value = cur; };
  $("#sheetKind").onfocus = zones; $("#sheetZone").onfocus = zones;
  $("#sheetAdd").onclick = async () => { const k = $("#sheetKind").value; const cut = $("#sheetCut").value; const z = $("#sheetZone").value; const drafted = ["ga", "elec", "mech", "roof", "fire_plan", "block_sld", "hall_section"].includes(k);
    const r = await run("sheet", { kind: k, ...(drafted && z ? { zone: z } : {}), ...(k === "plan" && cut ? { cut_z: +cut, title: `Plan at +${(+cut / 1000).toFixed(2)} m` } : {}) }); if (r.ok) { await render(); preview(r.data.id); } else toast(r.refusals?.[0]?.message || "Could not add the sheet"); };
  $("#publishBtn").onclick = async () => { toast("Publishing… drawing every sheet"); const r = await run("publish", { status: $("#publishStatus").value, date: today() });
    if (!r.ok) return toast(r.refusals?.[0]?.message || "Publish failed");
    downloadBlob(r.data.filename, new Blob([b64(r.data.base64)], { type: "application/zip" })); toast(`Published ${r.data.register.length} sheets as ${r.data.status}: ${r.data.files.length} files`); render(); if (current) preview(current); };
  $("#packAdd").onclick = async () => { const r = await run("drawing_pack", { pack: $("#packKind").value }); if (!r.ok) return toast(r.refusals?.[0]?.message || "Could not add the pack");
    toast(r.data.added.length ? `Added ${r.data.added.length} sheets from the ${$("#packKind").selectedOptions[0].text.toLowerCase()} pack` : "Nothing in this model for that pack yet: add services first"); await render(); if (r.data.added[0]) preview(r.data.added[0].id); };
  $("#sampleServices").onclick = async () => { try { await window.__bimjaKernel; } catch {} const r = await run("script", { commands: SAMPLE_SERVICES }); toast(r.ok ? "Services sample built: plant room, data hall, chilled water, power, sprinklers" : r.refusals?.[0]?.message || "Sample failed"); };
  $("#asBuilt").onclick = async () => { toast("Issuing as-built (CR)…"); const r = await run("publish", { status: "CR", date: today(), note: "As-built" });
    if (!r.ok) return toast(r.refusals?.[0]?.message || "As-built issue failed");
    downloadBlob(r.data.filename, new Blob([b64(r.data.base64)], { type: "application/zip" })); toast(`As-built issued: ${r.data.register.length} sheets`); render(); if (current) preview(current); };
  document.querySelector('button[data-tab="docs"]').addEventListener("click", () => setTimeout(render));
  bus.on((ev) => { if (ev.type !== "applied") return; // agents and MCP change the set too: keep the list and the preview current
    if (["drawing_setup", "sheets_auto", "drawing_pack", "sheet", "sheet_remove", "publish", "load_project", "undo", "redo"].includes(ev.entry?.name)) { clearTimeout(window.__dwgR); window.__dwgR = setTimeout(render, 150); }
    if (!$("#sheetPreview").hidden && current) { clearTimeout(window.__dwgT); window.__dwgT = setTimeout(() => preview(current), 400); } });
  return { render, preview };
}
