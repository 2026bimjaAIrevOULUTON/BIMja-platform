import { matches } from "../cost/cost.js";
// 5D in the browser: rates, estimate table (click a line to see its elements), CSV, asset register, COBie download.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function installCostUI({ bus, run, toast, download, downloadBlob, resolveElement, selectIds }) {
  const money = (n, cur) => `${cur} ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  async function render() {
    if (!bus.extra.cost?.rates?.length) { $("#costTable").innerHTML = `<div class="note">No rates yet: load the sample rates or add your own.</div>`; return; }
    const r = await run("estimate", {}); if (!r.ok) return; const e = r.data; lastLines = e.lines;
    $("#costTable").innerHTML = (e.label ? `<div class="warnbox">${esc(e.label)}</div>` : "") +
      `<table><tr><th>Code</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>${e.lines.map((l, i) => `<tr class="click" data-i="${i}" title="${l.elements} elements"><td>${esc(l.code)}</td><td>${esc(l.description)}</td><td>${l.qty} ${esc(l.unit)}</td><td>${l.rate}</td><td>${l.amount.toLocaleString("en-IN")}</td></tr>`).join("")}
      <tr><th></th><th>Total</th><th></th><th></th><th>${esc(money(e.total, e.currency))}</th></tr></table>` +
      (Object.keys(e.unpriced).length ? `<div class="note">Not priced: ${Object.entries(e.unpriced).map(([k, v]) => `${esc(k)} ×${v}`).join(", ")}</div>` : "") +
      e.warnings.map((w) => `<div class="note">⚠ ${esc(w)}</div>`).join("");
  }
  let lastLines = [];
  $("#costTable").addEventListener("click", (ev) => { const tr = ev.target.closest("tr.click"); if (!tr) return; const l = lastLines[+tr.dataset.i]; if (!l) return;
    const rates = bus.extra.cost.rates; const ids = [...bus.cost.elements().values()].filter((e) => { const i = rates.findIndex((r) => matches(e, r.match)); return i >= 0 && rates[i].code === l.code; })
      .map((e) => resolveElement(e.id) ?? resolveElement(e.globalId)).filter((x) => x != null); if (ids.length) selectIds(ids); });
  $("#costSample").onclick = () => run("cost", { sample: true }).then(render);
  $("#costRun").onclick = render;
  $("#costCsv").onclick = async () => { const r = await run("estimate", { format: "csv" }); if (r.ok) download("estimate.csv", r.data.csv, "text/csv"); };
  $("#rateAdd").onclick = () => { const rate = +$("#rateValue").value; if (!(rate >= 0) || $("#rateValue").value === "") return toast("Give a rate");
    run("cost", { mode: "add", rates: [{ description: $("#rateDesc").value || $("#rateClass").value || "Item", match: { ...($("#rateClass").value ? { ifc_class: $("#rateClass").value } : {}), ...($("#rateType").value ? { type: $("#rateType").value } : {}) }, basis: $("#rateBasis").value, unit: $("#rateUnit").value, rate, code: `U${(bus.extra.cost?.rates?.length || 0) + 1}` }] }).then(render); };
  const fields = () => ({ ...($("#assetMaker").value ? { manufacturer: $("#assetMaker").value } : {}), ...($("#assetWarranty").value ? { warranty_years: +$("#assetWarranty").value } : {}), ...($("#assetPm").value ? { maintenance_days: +$("#assetPm").value } : {}) });
  $("#assetAdd").onclick = () => { const el = window.__bimjaSelectedAuthored || (window.__bimjaSelectedIfc != null ? window.bimja.get(window.__bimjaSelectedIfc)?.globalId : null);
    if (!el) return toast("Select an element in the view first"); run("asset", { element: el, ...fields() }).then(summary); };
  $("#assetDoors").onclick = async () => { await run("asset", { rule: { ifc_class: "IfcDoor" }, tag_prefix: "DR-", ...fields() }); await run("asset", { rule: { ifc_class: "IfcWindow" }, tag_prefix: "WN-", ...fields() }); summary(); };
  $("#cobieExport").onclick = async () => { const r = await run("cobie", {}); if (!r.ok) return;
    const bin = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0)); downloadBlob(r.data.filename, new Blob([bin], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    toast(`COBie: ${r.data.summary.Component} components, ${r.data.summary.Space} spaces, ${r.data.summary.Type} types`); };
  function summary() { const n = Object.keys(bus.extra.assets || {}).length; $("#assetSummary").textContent = n ? `${n} registered assets` : ""; }
  bus.on((ev) => { if (ev.type === "applied" && bus.extra.cost?.rates?.length) setTimeout(render); });
  render(); summary();
  return { render };
}
