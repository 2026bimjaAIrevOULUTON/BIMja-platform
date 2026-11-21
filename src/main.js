import { createApi, openModel, webifc } from "./ifc.js";
import { readIfcGeoref } from "./geo/geo.js";
import { installGeoTwin } from "./app/geotwin-ui.js";
import { installTime } from "./app/time-ui.js";
import { installCostUI } from "./app/cost-ui.js";
import { landmarkProject } from "./app/landmarks.js";
import { installDocsUI } from "./app/docs-ui.js";
import { siteForIfc } from "./site/commands.js";
import { installSiteUI } from "./app/site-ui.js";
import { DEFAULT_RULES, runCheck, quantities, toCSV } from "./rules.js";
import { Viewer } from "./viewer.js";
import { REGISTRY } from "./commands/registry.js";
import { Bus } from "./core/bus.js";
import { installCore, describeModel } from "./core/handlers.js";
import { buildAuthored } from "./author/build3d.js";
import { initSessionUI } from "./app/session-ui.js";
import { initPlan } from "./app/plan.js";
import { exportIFC } from "./author/ifc-export.js";
import { authoredRecords } from "./author/records.js";
import { installCoordination } from "./app/coord-ui.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BASE = new URL(".", location.href).href;

const state = { api: null, model: null, fileName: "", check: null, qto: null, selected: null, ruleFilter: null };
const viewer = new Viewer($("#canvas"));

// ---------- loading ----------
async function api() { return (state.api ||= await createApi(BASE + "wasm/")); }
function busy(msg) { $("#loading").hidden = !msg; if (msg) $("#loadingText").textContent = msg; }

async function loadBytes(bytes, name) {
  busy(`Opening ${name}…`);
  await new Promise((r) => setTimeout(r, 30));
  try {
    const a = await api();
    if (state.model) a.CloseModel(state.model.modelID);
    const t = performance.now();
    state.model = openModel(a, bytes, (p) => ($("#loadingText").textContent = `Opening ${name}… ${Math.round(p * 100)}%`));
    state.fileName = name;
    viewer.load(state.model, (id) => state.model.index.elements.get(id)?.ifcClass);
    state.check = runCheck(state.model.index.elements);
    state.qto = quantities(state.model.index.elements);
    const els = state.model.index.elements;
    $("#meta").innerHTML = `<b>${esc(name)}</b> · ${esc(state.model.schema)} · ${els.size} elements · ${state.model.index.storeys.length} storeys · ${Math.round(performance.now() - t)} ms`;
    renderTree(); renderCheck(); renderQto(); showProps(null); $("#welcome").hidden = true;
    document.title = `${name} — BIMja`;
    const gr = readIfcGeoref(a, state.model.modelID, webifc()); state.model.georef = gr;
    if (gr?.crs && !bus.extra.geo?.crs) { const r1 = await run("crs", { epsg: gr.crs }, { actor: "human" }); if (r1.ok) await run("anchor", gr.anchor, { actor: "human" }); else toast(`Model has CRS ${gr.crs}: ${r1.refusals[0].message}`); }
    window.dispatchEvent(new CustomEvent("bimja:loaded", { detail: summary() }));
  } catch (err) {
    console.error(err);
    $("#meta").textContent = `Could not open ${name}: ${err.message || err}`;
  } finally { busy(null); }
}
async function loadUrl(url) {
  busy("Downloading model…");
  const res = await fetch(url); if (!res.ok) { busy(null); throw new Error(`HTTP ${res.status} for ${url}`); }
  await loadBytes(await res.arrayBuffer(), decodeURIComponent(url.split("/").pop().split("?")[0]).replace(/\.txt$/i, ""));
}

// ---------- model tree ----------
function renderTree(filter = "") {
  const els = [...state.model.index.elements.values()];
  const f = filter.trim().toLowerCase();
  const match = (e) => !f || [e.name, e.ifcClass, e.globalId, e.storey, e.type].some((x) => String(x || "").toLowerCase().includes(f));
  const storeys = [...state.model.index.storeys.map((s) => s.name), null];
  let html = "";
  for (const st of storeys) {
    const inSt = els.filter((e) => (e.storey || null) === st && match(e)); if (!inSt.length) continue;
    const byClass = {}; inSt.forEach((e) => (byClass[e.ifcClass] ||= []).push(e));
    html += `<details ${f ? "open" : ""} open><summary>${esc(st || "Not on a storey")}<span class="count">${inSt.length}</span></summary>`;
    for (const [cls, list] of Object.entries(byClass).sort()) {
      html += `<details ${f ? "open" : ""} style="margin-left:10px"><summary>${esc(cls)}<span class="count">${list.length}</span></summary>`;
      html += list.map((e) => `<div class="item${state.selected === e.id ? " sel" : ""}" data-id="${e.id}" title="${esc(e.globalId)}">${esc(e.name || "(no name)")}</div>`).join("");
      html += `</details>`;
    }
    html += `</details>`;
  }
  $("#tree").innerHTML = html || `<p class="note">Nothing matches.</p>`;
}
$("#search").addEventListener("input", (e) => state.model && renderTree(e.target.value));
$("#tree").addEventListener("click", (e) => { const it = e.target.closest(".item"); if (it) select(+it.dataset.id, true); });

// ---------- selection & properties ----------
function select(id, fly = false) {
  if (typeof id === "string" && !id.includes("#")) return selectAuthored(id, fly);
  window.__bimjaSelectedAuthored = null; window.__bimjaSelectedIfc = typeof id === "number" ? id : null;
  if (typeof id === "string" && id.includes("#")) { viewer.highlight([id], fly); if (fly) viewer.fit([id]); return; } // federated element
  state.selected = id;
  viewer.highlight(id ? [id] : [], fly);
  if (id && fly) viewer.fit([id]);
  showProps(id);
  document.querySelectorAll("#tree .item.sel").forEach((n) => n.classList.remove("sel"));
  if (id) document.querySelector(`#tree .item[data-id="${id}"]`)?.classList.add("sel");
}
viewer.onPick = (id) => select(id);
function selectAuthored(id, fly) {
  window.__bimjaSelectedAuthored = id; state.selected = null;
  viewer.highlight([id], fly); if (fly) viewer.fit([id]);
  bus.lock([id], "human"); // a person touching an element soft-locks it for 3 s against agent writes
  const e = bus.model.data.elements[id]; const box = $("#props"); if (!e) { box.hidden = true; return; }
  const kv = (o) => `<div class="kv">${Object.entries(o).map(([k, v]) => `<b>${esc(k)}</b><span>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</span>`).join("")}</div>`;
  const level = bus.model.data.levels.find((l) => l.id === e.level);
  box.innerHTML = `<span class="x" id="closeProps">✕</span><div class="cls">${esc(e.kind)} · authored</div><h3>${esc(e.name || e.mark || e.id)}</h3>
    ${kv({ Id: e.id, Level: level ? level.name : e.level, ...(e.type ? { Type: e.type } : {}), ...(e.mark ? { Mark: e.mark } : {}), ...(e.host ? { Host: e.host } : {}), ...(e.number ? { Number: e.number } : {}) })}
    <div class="row"><button class="btn" id="propEdit">Edit (set)</button><button class="btn" id="propDelete">Delete</button></div>`;
  box.hidden = false;
  $("#closeProps").onclick = () => select(null);
  $("#propDelete").onclick = () => run("delete", { ids: [id] });
  $("#propEdit").onclick = () => ui.openPalette("set") || setTimeout(() => ($("#palArgs").value = JSON.stringify({ id, name: e.name }, null, 2)), 0);
}
function showProps(id) {
  const e = id && state.model?.index.elements.get(id); const box = $("#props");
  if (!e) { box.hidden = true; return; }
  const issues = state.check.issues.filter((i) => i.expressID === id);
  const kv = (o) => `<div class="kv">${Object.entries(o).map(([k, v]) => `<b title="${esc(k)}">${esc(k)}</b><span>${esc(typeof v === "number" ? +v.toFixed(4) : v)}</span>`).join("")}</div>`;
  box.innerHTML = `<span class="x" id="closeProps">✕</span><div class="cls">${esc(e.ifcClass)}</div><h3>${esc(e.name || "(no name)")}</h3>
    ${kv({ GlobalId: e.globalId, Storey: e.storey || "—", Type: e.type || "—", Material: e.materials.join(", ") || "—", "Express ID": e.id })}
    ${issues.length ? `<div class="set">Handover issues</div>${issues.map((i) => `<div class="chip ${i.severity}" style="margin:3px 0;display:block">${i.rule} · ${esc(i.title)}</div>`).join("")}` : ""}
    ${Object.entries(e.psets).map(([n, p]) => `<div class="set">${esc(n)}</div>${kv(p)}`).join("")}
    ${Object.entries(e.quantities).map(([n, p]) => `<div class="set">${esc(n)}</div>${kv(p)}`).join("")}`;
  box.hidden = false;
  $("#closeProps").onclick = () => select(null);
}

// ---------- handover check ----------
function renderCheck() {
  const c = state.check;
  $("#score").innerHTML = `<div class="big" style="color:${c.score >= 90 ? "var(--ok)" : c.score >= 70 ? "var(--med)" : "var(--hi)"}">${c.score}%</div>
    <div><div class="note">${c.passed}/${c.checks} checks passed on ${c.elementsChecked} elements</div>
    <div class="chips"><span class="chip high">${c.high} high</span><span class="chip medium">${c.medium} medium</span><span class="chip low">${c.low} low</span></div></div>`;
  $("#rules").innerHTML = Object.entries(c.byRule).map(([id, r]) => `<div class="rule ${r.failed ? "" : "pass"} ${state.ruleFilter === id ? "on" : ""}" data-rule="${id}">
    <span><b>${id}</b> ${esc(r.title)}</span><span class="chip ${r.failed ? r.severity : "ok"}">${r.failed ? r.failed + " fail" : "pass"}</span></div>`).join("");
  const list = c.issues.filter((i) => !state.ruleFilter || i.rule === state.ruleFilter);
  $("#issues").innerHTML = list.slice(0, 500).map((i) => `<div class="issue ${i.severity}" data-id="${i.expressID}">${esc(i.title)}<small>${esc(i.ifcClass)} · ${esc(i.name || "(no name)")} · ${esc(i.storey || "no storey")}</small></div>`).join("")
    + (list.length > 500 ? `<p class="note">…and ${list.length - 500} more (see CSV)</p>` : "");
}
$("#rules").addEventListener("click", (e) => {
  const r = e.target.closest(".rule"); if (!r) return;
  state.ruleFilter = state.ruleFilter === r.dataset.rule ? null : r.dataset.rule; renderCheck();
  const ids = state.check.issues.filter((i) => !state.ruleFilter || i.rule === state.ruleFilter).map((i) => i.expressID);
  viewer.highlight(state.ruleFilter ? ids : [], !!state.ruleFilter);
});
$("#issues").addEventListener("click", (e) => { const it = e.target.closest(".issue"); if (it) select(+it.dataset.id, true); });
$("#runCheck").onclick = () => run("check_handover", {});

// ---------- quantities ----------
function renderQto() {
  $("#qto").innerHTML = `<table><tr><th>Class</th><th>Count</th><th>Area m²</th><th>Volume m³</th><th>Length m</th></tr>${state.qto.map((r) =>
    `<tr class="click" data-cls="${esc(r.ifcClass)}"><td>${esc(r.ifcClass)}</td><td>${r.count}</td><td>${r.area_m2 || "—"}</td><td>${r.volume_m3 || "—"}</td><td>${r.length_m || "—"}</td></tr>`).join("")}</table>`;
}
$("#qto").addEventListener("click", (e) => { const tr = e.target.closest("tr.click"); if (!tr) return;
  const ids = [...state.model.index.elements.values()].filter((x) => x.ifcClass === tr.dataset.cls).map((x) => x.id); viewer.highlight(ids, true); viewer.fit(ids); });

// ---------- exports ----------
function downloadBlob(name, blob) {
  if (embedded) return toast("Downloads are blocked in this preview. Use the GitHub Pages link.");
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name.replace(/[^\w.-]+/g, "_"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast(`Downloaded ${name}`);
}
function toast(msg) { let n = document.getElementById("toast"); if (!n) { n = document.createElement("div"); n.id = "toast"; document.body.appendChild(n); }
  n.textContent = msg; n.className = "show"; clearTimeout(n._t); n._t = setTimeout(() => (n.className = ""), 2600); }
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
async function download(name, text, type = "text/plain") {
  if (embedded) { // sandboxed previews block downloads: copy instead
    try { await navigator.clipboard.writeText(text); toast(`${name} copied to clipboard (downloads are blocked in this preview)`); }
    catch { toast("Downloads are blocked in this preview. Open the GitHub/Cloudflare link to export."); }
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name.replace(/[^\w.-]+/g, "_"); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Downloaded ${name}`);
}
const stem = () => (state.fileName || "model").replace(/\.ifc$/i, "");
$("#csvIssues").onclick = () => state.check && download(`${stem()}-handover-issues.csv`, toCSV(state.check.issues), "text/csv");
$("#csvQto").onclick = () => state.qto && download(`${stem()}-quantities.csv`, toCSV(state.qto), "text/csv");
$("#jsonReport").onclick = () => state.check && download(`${stem()}-handover-report.json`, JSON.stringify(report(), null, 2), "application/json");
$("#htmlReport").onclick = () => state.check && download(`${stem()}-handover-report.html`, clientReport(), "text/html");
function summary() { return state.model && { file: state.fileName, schema: state.model.schema, elements: state.model.index.elements.size, storeys: state.model.index.storeys.map((s) => s.name), score: state.check.score }; }
function report() { const { issues, ...rest } = state.check; return { generatedAt: new Date().toISOString(), tool: "BIMja v0", model: summary(), check: rest, issues, quantities: state.qto }; }
function clientReport() {
  const c = state.check, img = viewer.screenshot();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Handover review — ${esc(state.fileName)}</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#111;max-width:900px}h1{margin:0}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.high{color:#c62828}.medium{color:#b26a00}.low{color:#00838f}img{max-width:100%;border:1px solid #ddd;border-radius:8px}</style></head><body>
  <h1>BIM Model Handover Review</h1><p>Model: <b>${esc(state.fileName)}</b> (${esc(state.model.schema)}) · ${new Date().toLocaleDateString()} · Rule set: ${esc(c.ruleSet)}</p>
  <h2>Result: ${c.score}% of ${c.checks} checks passed</h2><p><span class="high">${c.high} high</span> · <span class="medium">${c.medium} medium</span> · <span class="low">${c.low} low</span> issues across ${c.elementsChecked} elements.</p>
  <img src="${img}" alt="Model view">
  <h2>Checks</h2><table><tr><th>Rule</th><th>Check</th><th>Severity</th><th>Failed</th></tr>${Object.entries(c.byRule).map(([id, r]) => `<tr><td>${id}</td><td>${esc(r.title)}</td><td class="${r.severity}">${r.severity}</td><td>${r.failed}</td></tr>`).join("")}</table>
  <h2>Issue log</h2><table><tr><th>#</th><th>Rule</th><th>Class</th><th>Element</th><th>Storey</th><th>GlobalId</th></tr>${c.issues.map((i, n) => `<tr><td>${n + 1}</td><td class="${i.severity}">${i.rule}</td><td>${esc(i.ifcClass)}</td><td>${esc(i.name)}</td><td>${esc(i.storey)}</td><td><code>${esc(i.globalId)}</code></td></tr>`).join("")}</table>
  <p style="color:#666">Prepared with BIMja. Automated checks support, and do not replace, review by the project's information manager.</p></body></html>`;
}

// ---------- tools ----------
let xr = false, spaces = false;
$("#fit").onclick = () => run("camera", {});
$("#xray").onclick = (e) => { xr = !xr; viewer.xray(xr); e.target.classList.toggle("on", xr); };
$("#spaces").onclick = (e) => { spaces = !spaces; viewer.setVisible((u) => !u.isSpace || spaces); e.target.classList.toggle("on", spaces); };
$("#showAll").onclick = () => { viewer.setVisible((u) => !u.isSpace || spaces); viewer.highlight([]); state.ruleFilter = null; state.check && renderCheck(); viewer.fit(); };
$("#section").oninput = (e) => run("section", { height: +e.target.value });
$("#shot").onclick = () => { if (embedded) return toast("Screenshots download from the GitHub/Cloudflare version"); const a = document.createElement("a"); a.href = viewer.screenshot(); a.download = `${stem()}.png`; a.click(); };
document.body.dataset.ws = "model";
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
  // clicking the open workspace again folds the panel away (more room for the model); any other opens it
  if (e.isTrusted && b.classList.contains("on") && document.body.dataset.ws === b.dataset.tab) { document.body.classList.toggle("panel-off"); return; }
  document.body.classList.remove("panel-off");
  if (document.body.dataset.ws === "4d" && b.dataset.tab !== "4d" && timeUI.date) timeUI.off(); // the 4D view belongs to the 4D workspace
  document.body.dataset.ws = b.dataset.tab; if (b.dataset.tab !== "docs") $("#sheetPreview").hidden = true;
  document.querySelectorAll("#tabs button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-current", x === b ? "page" : "false"); });
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === b.dataset.tab)); });
$("#file").onchange = async (e) => { const f = e.target.files[0]; if (f) await loadBytes(await f.arrayBuffer(), f.name); e.target.value = ""; };
async function buildLandmark(id) {
  const lp = landmarkProject(id); if (!lp) return;
  if (state.model) { viewer.clear(); state.model = null; state.selected = null; $("#meta").textContent = "No model loaded."; $("#tree").innerHTML = ""; $("#props").hidden = true; }
  await run("load_project", { project: lp.project });
  const r = await run("script", { commands: lp.landmark.commands });
  if (!r.ok) return toast(`Could not build ${lp.landmark.name}: ${r.refusals?.[0]?.message || "error"}`);
  $("#welcome").hidden = true; refreshAuthored(); viewer.fit(); setTimeout(() => viewer.fit(), 150);
  const counts = {}; for (const e of Object.values(bus.model.data.elements)) counts[e.ifc_class || e.kind] = (counts[e.ifc_class || e.kind] || 0) + 1;
  $("#meta").innerHTML = `<b>${esc(lp.landmark.name)}</b> · authored · ${Object.keys(bus.model.data.elements).length} elements<br>${Object.entries(counts).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}<br><span class="note">Export IFC4 or GLB from Create; run Check, 4D or 5D on it like any model.</span>`;
  $("#credit").innerHTML = `<b>${esc(lp.landmark.name)}</b>${esc(lp.landmark.credit)} Built from ${lp.landmark.commands.length} BIMja commands.`; $("#credit").hidden = false;
  toast(`${lp.landmark.name}: ${lp.landmark.commands.length} commands, one undo step`);
}
$("#sample").onchange = (e) => { const v = e.target.value; e.target.value = ""; if (!v) return; if (v.startsWith("landmark:")) buildLandmark(v.slice(9)); else { $("#credit").hidden = true; loadUrl(BASE + v); } };
document.querySelectorAll("[data-landmark]").forEach((b) => (b.onclick = () => buildLandmark(b.dataset.landmark)));
window.__bimjaBuildLandmark = buildLandmark; window.__bimjaLandmark = landmarkProject;
document.querySelectorAll("[data-sample]").forEach((b) => (b.onclick = () => loadUrl(BASE + b.dataset.sample)));
let dragDepth = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("#drop").hidden = false; });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop").hidden = true; } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => { e.preventDefault(); dragDepth = 0; $("#drop").hidden = true; const f = e.dataTransfer.files[0]; if (f) await loadBytes(await f.arrayBuffer(), f.name); });

// ---------- command bus: the one path for people, agents and replays ----------
const bus = installCore(new Bus());
window.__bimjaBus = bus; window.__bimjaViewer = viewer;
const ifcSummary = () => state.model && (() => { const b = viewer.modelBox; const r = (v) => +v.toFixed(3);
  return { ...summary(), issues: { high: state.check.high, medium: state.check.medium, low: state.check.low },
    classes: Object.fromEntries(state.qto.map((q) => [q.ifcClass, q.count])),
    bbox: b ? { min: [r(b.min.x), r(b.min.y), r(b.min.z)], max: [r(b.max.x), r(b.max.y), r(b.max.z)] } : null }; })();
const need = () => { if (!state.model) throw Object.assign(new Error("No IFC model is open. Use load first."), { code: "bad_arg" }); };
bus.register("describe", () => ({ ...describeModel(bus), ifc: ifcSummary() || null, anchor: bus.extra.geo?.anchor || null,
  ...(bus.extra.geo?.crs && bus.extra.geo?.anchor ? {} : { crs_warning: "NO CRS: the model is at a local origin, not on a real location. Use crs + anchor to georeference it." }),
  twin: { sensors: Object.keys(bus.extra.twin?.sensors || {}).length, alerts: twinUI?.alerts.length || 0 } }), { kind: "read" });
bus.register("load", (a) => (a.url ? loadUrl(new URL(a.url, BASE).href) : loadBytes(a.bytes, a.name || "model.ifc")).then(() => ifcSummary()), { kind: "view" });
bus.register("check_handover", (a) => {
  const authoredOnly = !state.model; const els = authoredOnly ? authoredRecords(bus.model) : state.model.index.elements;
  const res = runCheck(els, a.rules || DEFAULT_RULES); if (!authoredOnly) { state.check = res; renderCheck(); } else renderAuthoredCheck(res); return res;
}, { kind: "read" });
bus.register("export_ifc", () => {
  if (Object.keys(bus.model.data.elements).length || !state.model) return exportIFC(bus.model, { geo: bus.extra.geo, site: siteForIfc(bus) });
  return new TextDecoder().decode(state.api.SaveModel(state.model.modelID)); // re-save the open IFC unchanged
}, { kind: "read" });
bus.register("export_gltf", async () => {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const glb = await new GLTFExporter().parseAsync(viewer.scene, { binary: true, onlyVisible: true });
  let s = ""; const b = new Uint8Array(glb); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return { mime: "model/gltf-binary", bytes: b.length, base64: btoa(s) };
}, { kind: "read" });
function renderAuthoredCheck(c) {
  $("#score").innerHTML = `<div class="big" style="color:${c.score >= 90 ? "var(--ok)" : c.score >= 70 ? "var(--med)" : "var(--hi)"}">${c.score}%</div><div><div class="note">Authored model: ${c.passed}/${c.checks} checks on ${c.elementsChecked} elements</div><div class="chips"><span class="chip high">${c.high} high</span><span class="chip medium">${c.medium} medium</span><span class="chip low">${c.low} low</span></div></div>`;
  $("#rules").innerHTML = Object.entries(c.byRule).map(([id, r]) => `<div class="rule ${r.failed ? "" : "pass"}"><span><b>${id}</b> ${esc(r.title)}</span><span class="chip ${r.failed ? r.severity : "ok"}">${r.failed ? r.failed + " fail" : "pass"}</span></div>`).join("");
  $("#issues").innerHTML = c.issues.map((i) => `<div class="issue ${i.severity}" data-aid="${esc(i.expressID)}">${esc(i.title)}<small>${esc(i.ifcClass)} · ${esc(i.name)} · ${esc(i.storey)}</small></div>`).join("");
}
bus.register("export_issues", () => { need(); return toCSV(state.check.issues); }, { kind: "read" });
bus.register("export_report", (a) => { need(); return a.format === "html" ? clientReport() : report(); }, { kind: "read" });
bus.register("quantity", () => { need(); return state.qto; }, { kind: "read" });
bus.register("select", (a) => { const e = typeof a.id === "string" && bus.model.data.elements[a.id] ? a.id : window.bimja.get(a.id)?.id; select(e ?? null, true); return { selected: e ?? null }; }, { kind: "view" });
bus.register("isolate", (a) => { const ids = a.ids || []; viewer.highlight(ids, ids.length > 0); if (ids.length) viewer.fit(ids); return { isolated: ids.length }; }, { kind: "view" });
bus.register("section", (a) => { const t = Math.max(0, Math.min(1, Number(a.height ?? 1))); $("#section").value = t; viewer.setSection(t); return { section: t }; }, { kind: "view" });
bus.register("camera", (a) => { viewer.fit(a.fit); return { ok: true }; }, { kind: "view" });
bus.register("render", (a) => viewer.screenshot(Math.min(1600, a.width || 1600)), { kind: "view" });

async function run(name, args = {}, opts = {}) {
  const r = bus.execute({ name, args, actor: opts.actor || "human", dry_run: opts.dry_run, apply: opts.apply, rev: opts.rev, session: opts.session, id: opts.id });
  if (r.ok && r.data && typeof r.data.then === "function") { try { r.data = await r.data; } catch (e) { return { ok: false, rev: bus.rev, changed: [], refusals: [{ code: "bad_arg", message: e.message }] }; } }
  return r;
}
let authoredDirty = true;
function refreshAuthored() {
  const g = buildAuthored(bus.model); const hasAuth = g.children.length > 0;
  viewer.setAuthored(g);
  if (hasAuth) $("#welcome").hidden = true;
  if (hasAuth && authoredDirty && !state.model) { viewer.fit(); authoredDirty = false; }
}
const ui = initSessionUI({ bus, viewer, run, toast, download, onAuthoredChange: () => { refreshAuthored(); fillPlanSelects(); } });
const plan = initPlan({ bus, run, toast, container: $("#view"), onSelect: (id) => (id ? selectAuthored(id, false) : select(null)) });
function fillPlanSelects() {
  const ls = $("#planLevel"), cur = ls.value; ls.innerHTML = bus.model.data.levels.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${l.elevation} mm)</option>`).join(""); if (cur) ls.value = cur;
  const wt = $("#planWallType"), cw = wt.value; wt.innerHTML = Object.keys(bus.model.data.types.wall).map((n) => `<option>${esc(n)}</option>`).join(""); if (cw) wt.value = cw;
}
fillPlanSelects();
$("#planLevel").onchange = (e) => plan.setLevel(e.target.value);
const setPlan = (on) => { plan.show(on); $("#viewMode").textContent = on ? "Back to 3D" : "Draw in plan"; $("#tools").hidden = on; if (on) $("#welcome").hidden = true; else refreshAuthored(); };
$("#viewMode").onclick = () => setPlan(!plan.on);
$("#exportIfc").onclick = async () => { const r = await run("export_ifc", {}); if (r.ok) download(`${(bus.model.data.name || "bimja").replace(/[^\w.-]+/g, "_")}.ifc`, r.data, "application/x-step"); };
$("#exportGlb").onclick = async () => { const r = await run("export_gltf", {}); if (r.ok) { const bin = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0)); downloadBlob("bimja.glb", new Blob([bin], { type: "model/gltf-binary" })); } };
$("#checkAuthored").onclick = async () => { await run("check_handover", {}); document.querySelector('button[data-tab="check"]').click(); };
$("#issues").addEventListener("click", (e) => { const it = e.target.closest("[data-aid]"); if (it) selectAuthored(it.dataset.aid, true); });

const coordUI = installCoordination({ bus, viewer, run, toast, download, downloadBlob,
  getMain: () => (state.model ? { model: state.model, name: state.fileName } : null),
  openIfcBytes: async (bytes) => openModel(await api(), bytes),
  selectIds: (ids, fly = true) => { viewer.highlight(ids, true); if (fly) viewer.fit(ids); } });
addEventListener("bimja:loaded", () => coordUI.renderModels());
const twinUI = installGeoTwin({ bus, viewer, run, toast, download, selectIds: (ids) => { viewer.highlight(ids, false); viewer.fit(ids); },
  resolveElement: (ref) => { if (!ref) return null; if (bus.model.data.elements[ref]) return ref; if (viewer.byId.has(ref)) return ref; return coordUI.guidToViewId(ref) ?? (state.model ? window.bimja.get(ref)?.id : null); } });

// 4D: elements are authored ids or IFC GlobalIds; rules reach the open IFC by class and storey too
const resolveEl = (ref) => { if (!ref) return null; if (bus.model.data.elements[ref]) return ref; if (viewer.byId.has(ref)) return ref; return coordUI.guidToViewId(ref) ?? (state.model ? window.bimja.get(ref)?.id : null); };
{ const hasA = bus.time.has, ruleA = bus.time.resolveRule;
  bus.time.has = (id) => hasA(id) || !!(state.model && window.bimja.get(id)) || coordUI.guidToViewId(id) != null;
  bus.time.resolveRule = (rule) => {
    if (!(rule.ifc_class || rule.storey) || !state.model) return ruleA(rule);
    const cls = rule.ifc_class && [].concat(rule.ifc_class).map((c) => c.toLowerCase());
    return [...state.model.index.elements.values()].filter((e) => !e.isPart && (!cls || cls.includes(String(e.ifcClass).toLowerCase())) && (!rule.storey || e.storey === rule.storey)).map((e) => e.globalId).sort();
  }; }
const timeUI = installTime({ bus, viewer, run, toast, resolveElement: resolveEl, selectIds: (ids, fly) => { viewer.highlight(ids, false); if (fly) viewer.fit(ids); } });

// 5D prices the open IFC (its quantity sets) or, with no IFC open, the authored model
{ const elA = bus.cost.elements, spA = bus.cost.spaceOf, lvA = bus.cost.levels, prA = bus.cost.project;
  bus.cost.elements = () => (state.model ? state.model.index.elements : elA());
  bus.cost.spaceOf = () => (state.model ? () => [] : spA());
  bus.cost.levels = () => (state.model ? [...new Set([...state.model.index.elements.values()].map((e) => e.storey).filter(Boolean))].map((name) => ({ name })) : lvA());
  bus.cost.project = () => (state.model ? state.fileName.replace(/\.ifc.*$/i, "") || "IFC model" : prA()); }
installCostUI({ bus, run, toast, download, downloadBlob, resolveElement: resolveEl, selectIds: (ids) => { viewer.highlight(ids, true); viewer.fit(ids); } });

bus.register("walkthrough", (a) => { const on = viewer.walkthrough(a.on !== false, { eyeHeight: +a.eye_height || 1.6, speed: +a.speed || 1.4 }); return { walking: on }; }, { kind: "view" });
viewer.onWalk = (on) => { $("#walkBtn").classList.toggle("on", on); $("#walkBtn").textContent = on ? "Exit walk" : "Walk"; if (on) toast("Walk: WASD or arrows, drag to look, Q/E up/down, Shift to run, Esc to leave"); };
$("#walkBtn").onclick = () => run("walkthrough", { on: !viewer.walk });

installDocsUI({ bus, run, toast, download, downloadBlob });
const siteUI = installSiteUI({ bus, viewer, run, toast, BASE });
// window.bimja: one function per registered command (same names, args, refusals as MCP), plus run() and helpers
window.bimja = { version: "0.3.0", run: (name, args, opts = {}) => run(name, args, { actor: "agent:console", ...opts }) };
for (const r of REGISTRY) window.bimja[r.name] = (args = {}, opts = {}) => window.bimja.run(r.name, args, opts);
Object.assign(window.bimja, {
  summary,
  elements: (filter = {}) => [...(state.model?.index.elements.values() || [])].filter((e) => Object.entries(filter).every(([k, v]) => e[k] === v)),
  get: (idOrGuid) => [...(state.model?.index.elements.values() || [])].find((e) => e.id === idOrGuid || e.globalId === idOrGuid) || null,
});

const q = new URLSearchParams(location.search).get("model");
if (q) loadUrl(q).catch((err) => ($("#meta").textContent = err.message));
