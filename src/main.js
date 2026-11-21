import { createApi, openModel } from "./ifc.js";
import { DEFAULT_RULES, runCheck, quantities, toCSV } from "./rules.js";
import { Viewer } from "./viewer.js";
import { commandsSummary } from "./commands/registry.js";

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
  state.selected = id;
  viewer.highlight(id ? [id] : [], fly);
  if (id && fly) viewer.fit([id]);
  showProps(id);
  document.querySelectorAll("#tree .item.sel").forEach((n) => n.classList.remove("sel"));
  if (id) document.querySelector(`#tree .item[data-id="${id}"]`)?.classList.add("sel");
}
viewer.onPick = (id) => select(id);
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
$("#runCheck").onclick = () => { if (!state.model) return; state.check = runCheck(state.model.index.elements); renderCheck(); };

// ---------- quantities ----------
function renderQto() {
  $("#qto").innerHTML = `<table><tr><th>Class</th><th>Count</th><th>Area m²</th><th>Volume m³</th><th>Length m</th></tr>${state.qto.map((r) =>
    `<tr class="click" data-cls="${esc(r.ifcClass)}"><td>${esc(r.ifcClass)}</td><td>${r.count}</td><td>${r.area_m2 || "—"}</td><td>${r.volume_m3 || "—"}</td><td>${r.length_m || "—"}</td></tr>`).join("")}</table>`;
}
$("#qto").addEventListener("click", (e) => { const tr = e.target.closest("tr.click"); if (!tr) return;
  const ids = [...state.model.index.elements.values()].filter((x) => x.ifcClass === tr.dataset.cls).map((x) => x.id); viewer.highlight(ids, true); viewer.fit(ids); });

// ---------- exports ----------
function toast(msg) { let n = document.getElementById("toast"); if (!n) { n = document.createElement("div"); n.id = "toast"; document.body.appendChild(n); }
  n.textContent = msg; n.className = "show"; clearTimeout(n._t); n._t = setTimeout(() => (n.className = ""), 2600); }
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
async function download(name, text, type = "text/plain") {
  if (embedded) { // sandboxed previews block downloads: copy instead
    try { await navigator.clipboard.writeText(text); toast(`${name} copied to clipboard (downloads are blocked in this preview)`); }
    catch { toast("Downloads are blocked in this preview. Open the GitHub/Cloudflare link to export."); }
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
$("#fit").onclick = () => viewer.fit();
$("#xray").onclick = (e) => { xr = !xr; viewer.xray(xr); e.target.classList.toggle("on", xr); };
$("#spaces").onclick = (e) => { spaces = !spaces; viewer.setVisible((u) => !u.isSpace || spaces); e.target.classList.toggle("on", spaces); };
$("#showAll").onclick = () => { viewer.setVisible((u) => !u.isSpace || spaces); viewer.highlight([]); state.ruleFilter = null; state.check && renderCheck(); viewer.fit(); };
$("#section").oninput = (e) => viewer.setSection(+e.target.value);
$("#shot").onclick = () => { if (embedded) return toast("Screenshots download from the GitHub/Cloudflare version"); const a = document.createElement("a"); a.href = viewer.screenshot(); a.download = `${stem()}.png`; a.click(); };
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === b.dataset.tab)); });
$("#file").onchange = async (e) => { const f = e.target.files[0]; if (f) await loadBytes(await f.arrayBuffer(), f.name); e.target.value = ""; };
$("#sample").onchange = (e) => e.target.value && loadUrl(BASE + e.target.value);
document.querySelectorAll("[data-sample]").forEach((b) => (b.onclick = () => loadUrl(BASE + b.dataset.sample)));
let dragDepth = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("#drop").hidden = false; });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop").hidden = true; } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", async (e) => { e.preventDefault(); dragDepth = 0; $("#drop").hidden = true; const f = e.dataTransfer.files[0]; if (f) await loadBytes(await f.arrayBuffer(), f.name); });

// ---------- agent API ----------
// Names follow the command registry (src/commands/registry.js). M1 replaces these with one command bus.
function describe() {
  if (!state.model) return { loaded: false, note: "No model loaded. Call load({url}) or ask the user to open an IFC." };
  const b = viewer.modelBox; const r = (v) => +v.toFixed(3);
  return { loaded: true, ...summary(), issues: { high: state.check.high, medium: state.check.medium, low: state.check.low },
    classes: Object.fromEntries(state.qto.map((q) => [q.ifcClass, q.count])),
    bbox: b ? { min: [r(b.min.x), r(b.min.y), r(b.min.z)], max: [r(b.max.x), r(b.max.y), r(b.max.z)] } : null,
    crs: null, crs_note: "Georeferencing arrives in M5; models load at a local origin." };
}
window.bimja = {
  version: "0.2.0-m0",
  commands: commandsSummary,
  describe,
  load: (src, name = "model.ifc") => (typeof src === "string" ? loadUrl(src) : loadBytes(src, name)),
  summary,
  elements: (filter = {}) => [...(state.model?.index.elements.values() || [])].filter((e) => Object.entries(filter).every(([k, v]) => e[k] === v)),
  get: (idOrGuid) => [...(state.model?.index.elements.values() || [])].find((e) => e.id === idOrGuid || e.globalId === idOrGuid) || null,
  check_handover: (rules) => { state.check = runCheck(state.model.index.elements, rules || DEFAULT_RULES); renderCheck(); return state.check; },
  quantity: () => state.qto,
  select: (idOrGuid) => { const e = window.bimja.get(idOrGuid); select(e ? e.id : null, true); return e; },
  export_report: () => report(),
  export_issues: () => toCSV(state.check?.issues || []),
  isolate: (ids = []) => { viewer.highlight(ids, ids.length > 0); if (ids.length) viewer.fit(ids); return { isolated: ids.length }; },
  section: (height = 1) => { const t = Math.max(0, Math.min(1, Number(height))); $("#section").value = t; viewer.setSection(t); return { section: t }; },
  camera: ({ fit } = {}) => { viewer.fit(fit); return { ok: true }; },
  render: () => viewer.screenshot(),
};
// older names kept for anything already scripted against v0
Object.assign(window.bimja, { check: window.bimja.check_handover, quantities: window.bimja.quantity, report: window.bimja.export_report, screenshot: window.bimja.render });

const q = new URLSearchParams(location.search).get("model");
if (q) loadUrl(q).catch((err) => ($("#meta").textContent = err.message));
