// Coordination: federate models, run clashes (in a worker), issues with viewpoints, BCF in and out.
// Registers the coord commands on the bus and wires the Coordination tab. Issues live in bus.extra.coord.
import * as THREE from "three";
import { exportBCF, importBCF } from "../coord/bcf.js";
import { trianglesFromModel } from "../coord/clash.js";
import { ifcGuid } from "../author/ifc-export.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const err = (msg, code = "bad_arg") => Object.assign(new Error(msg), { code });
// deterministic UUID (BCF needs xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx) from a seed such as the command id
export function uuidFrom(seed) {
  let h = [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b];
  for (let i = 0; i < seed.length; i++) h = h.map((x, k) => Math.imul(x ^ seed.charCodeAt(i), 0x01000193 + k * 2654435761) >>> 0);
  const hex = h.map((x) => x.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function installCoordination({ bus, viewer, getMain, openIfcBytes, run, toast, download, downloadBlob, selectIds }) {
  const fed = new Map(); // fid -> {fid, name, model}
  let lastClash = null, worker = null;
  const coord = () => (bus.extra.coord ||= { issues: [], models: [] });

  // ---------- federation ----------
  bus.register("federate", async (a) => {
    let bytes = a.bytes, name = a.name || "model.ifc";
    if (a.url) { const r = await fetch(new URL(a.url, location.href)); if (!r.ok) throw err(`HTTP ${r.status} for ${a.url}`); bytes = new Uint8Array(await r.arrayBuffer()); name = a.name || decodeURIComponent(a.url.split("/").pop()).replace(/\.txt$/, ""); }
    if (!bytes) throw err("give url or bytes");
    const model = await openIfcBytes(bytes);
    const fid = `F${fed.size + 1}`; fed.set(fid, { fid, name, model });
    viewer.addModel(fid, model, (id) => model.index.elements.get(id)?.ifcClass, [0x7fb3ff, 0xffb27a, 0x9cff7f, 0xd38cff][fed.size % 4]);
    coord().models = [...fed.values()].map((f) => ({ fid: f.fid, name: f.name })); renderModels(); viewer.fit();
    return { fid, name, elements: model.index.elements.size };
  }, { kind: "view" });

  // every element in the scene, with world triangles for the clash worker
  function collect() {
    const out = [];
    const fromModel = (model, tag, label) => { const tris = trianglesFromModel(model);
      for (const e of model.index.elements.values()) if (tris.has(e.id) && e.ifcClass !== "IfcSpace" && e.ifcClass !== "IfcOpeningElement") out.push({ key: `${tag}#${e.id}`, viewId: tag === "main" ? e.id : `${tag}#${e.id}`, globalId: e.globalId, ifcClass: e.ifcClass, name: e.name, model: label, tris: tris.get(e.id) }); };
    const main = getMain(); if (main) fromModel(main.model, "main", main.name);
    for (const f of fed.values()) fromModel(f.model, f.fid, f.name);
    // authored elements: triangles from their meshes (world space)
    const pid = bus.model.data.name || "BIMja project"; const byId = new Map();
    for (const m of viewer.auth.children) { if (m.userData.isSpace) continue; (byId.get(m.userData.authoredId) || byId.set(m.userData.authoredId, []).get(m.userData.authoredId)).push(m); }
    for (const [id, meshes] of byId) {
      const parts = meshes.map((m) => { m.updateMatrixWorld(true); const g = m.geometry, pos = g.attributes.position, idx = g.index; const v = new THREE.Vector3(); const n = idx ? idx.count : pos.count; const arr = new Float64Array(n * 3);
        for (let k = 0; k < n; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(m.matrixWorld); arr[k * 3] = v.x; arr[k * 3 + 1] = v.y; arr[k * 3 + 2] = v.z; } return arr; });
      const tris = new Float64Array(parts.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of parts) { tris.set(a, p); p += a.length; }
      const e = bus.model.data.elements[id]; out.push({ key: `auth#${id}`, viewId: id, globalId: ifcGuid(`${pid}/el/${id}`), ifcClass: { wall: "IfcWall", door: "IfcDoor", window: "IfcWindow", floor: "IfcSlab", roof: "IfcSlab" }[e?.kind] || e?.kind, name: e?.name || id, model: "authored", tris });
    }
    return out;
  }
  const pick = (all, sel) => {
    if (!sel || sel === "all") return all;
    const sels = [].concat(sel); return all.filter((e) => sels.some((s) => e.model === s || e.ifcClass === s || e.key.startsWith(s + "#")));
  };
  bus.register("clash", async (a) => {
    const all = collect(); if (!all.length) throw err("nothing to clash: load or federate models, or author some");
    const A = pick(all, a.a), same = !a.b || a.b === a.a, B = same ? A : pick(all, a.b);
    const options = { tolerance: a.tolerance ?? 0.01, clearance: a.clearance ?? 0, ignoreSameClass: a.ignore_same_class ?? same };
    const strip = (e) => ({ key: e.key, globalId: e.globalId, ifcClass: e.ifcClass, name: e.name, model: e.model, tris: e.tris });
    // hosted openings (doors/windows in their walls) are never clashes: they sit in voids by design
    const hosts = []; for (const e of all) if (/IfcDoor|IfcWindow/.test(e.ifcClass)) for (const w of all) if (/IfcWall/.test(w.ifcClass) && w.model === e.model) hosts.push(`${e.key}|${w.key}`);
    options.ignorePairs = hosts;
    const res = await new Promise((resolve) => {
      worker ||= new Worker(new URL("../coord/clash.worker.js", import.meta.url), { type: "module" });
      worker.onmessage = (ev) => resolve(ev.data);
      worker.postMessage({ A: A.map(strip), B: same ? [] : B.map(strip), same, options });
    });
    if (!res.ok) throw err(res.error);
    const view = new Map(all.map((e) => [e.key, e.viewId]));
    lastClash = { ...res, options, clashes: res.clashes.map((c, i) => ({ index: i, ...c, a: { ...c.a, viewId: view.get(c.a.key) }, b: { ...c.b, viewId: view.get(c.b.key) } })) };
    renderClashes();
    return { stats: res.stats, total: res.clashes.length, hard: res.clashes.filter((c) => c.type === "hard").length, clashes: lastClash.clashes.slice(0, a.limit || 200) };
  }, { kind: "read" });

  // ---------- issues & viewpoints (state changes: logged, undoable, attributed) ----------
  bus.register("viewpoint", (a, cmd) => {
    a.guid ||= uuidFrom(`vp/${cmd.id}`); a.camera ||= viewer.getCameraBCF(); a.selection ||= currentSelectionGuids();
    if (a.snapshot === undefined && typeof document !== "undefined") a.snapshot = viewer.screenshot(640).split(",")[1];
    (coord().viewpoints ||= {})[a.guid] = { guid: a.guid, camera: a.camera, selection: a.selection, snapshot: a.snapshot };
    return { guid: a.guid };
  });
  bus.register("issue", (a, cmd) => {
    const c = coord();
    if (a.id) { // update
      const t = c.issues.find((x) => x.guid === a.id); if (!t) throw err(`no issue ${a.id}`, "no_such_element");
      a.modified ||= new Date().toISOString().replace(/\.\d+Z$/, "Z");
      for (const k of ["title", "status", "priority", "assigned", "description"]) if (a[k] !== undefined) t[k] = a[k];
      if (a.comment) (t.comments ||= []).push({ guid: uuidFrom(`c/${cmd.id}`), date: a.modified, author: cmd.actor, text: String(a.comment) });
      t.modified = a.modified; t.modifiedBy = cmd.actor; renderIssues(); return { guid: t.guid };
    }
    if (!a.title) throw err("an issue needs a title");
    a.created ||= new Date().toISOString().replace(/\.\d+Z$/, "Z");
    let elements = a.elements || [], vps = [];
    if (a.clash_index != null) { const cl = lastClash?.clashes[a.clash_index]; if (!cl) throw err(`no clash #${a.clash_index} in the last run`, "no_such_element"); elements = [cl.a.globalId, cl.b.globalId]; a.description ||= `${cl.type} clash (${cl.severity}), ${Math.round(cl.penetration * 1000)} mm: ${cl.a.ifcClass} "${cl.a.name}" × ${cl.b.ifcClass} "${cl.b.name}"`; a.point = cl.point; }
    if (a.viewpoint) { const vp = coord().viewpoints?.[a.viewpoint]; if (vp) vps.push(vp); }
    const t = { guid: uuidFrom(`issue/${cmd.id}`), title: String(a.title), type: a.type || (a.clash_index != null ? "Clash" : "Issue"), status: a.status || "Open", priority: a.priority || "Normal",
      labels: a.labels || [], created: a.created, author: cmd.actor, ...(a.assigned ? { assigned: a.assigned } : {}), ...(a.description ? { description: a.description } : {}),
      comments: [], viewpoints: vps, elements };
    if (!vps.length && elements.length) t.viewpoints.push({ guid: uuidFrom(`issue-vp/${cmd.id}`), selection: elements, camera: a.camera || viewer.getCameraBCF() });
    c.issues.push(t); renderIssues(); return { guid: t.guid };
  });
  bus.register("bcf_export", () => { const bytes = exportBCF(coord().issues.map(({ elements, ...t }) => t)); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return { bytes: bytes.length, base64: btoa(s), topics: coord().issues.length }; }, { kind: "read" });
  bus.register("bcf_import", async (a, cmd) => {
    const bin = Uint8Array.from(atob(a.base64 || ""), (ch) => ch.charCodeAt(0)); const r = await importBCF(bin);
    if (!r.ok) throw err(r.errors?.join("; ") || "not a BCF file");
    // importing changes state, so it goes back through the bus as an atomic, attributed write
    const m = await run("bcf_merge", { topics: r.topics }, { actor: cmd.actor, apply: cmd.apply, session: cmd.session });
    return { topics: r.topics.length, errors: r.errors, merged: m.ok, ...(m.proposal ? { proposal: m.proposal } : {}) };
  }, { kind: "view" });
  bus.register("bcf_merge", (a) => { const c = coord(); let added = 0; for (const t of a.topics || []) { if (c.issues.some((x) => x.guid === t.guid)) continue; c.issues.push({ ...t, elements: t.viewpoints?.[0]?.selection || [] }); added++; } renderIssues(); return { added }; });

  function currentSelectionGuids() { const id = window.__bimjaSelectedAuthored; const pid = bus.model.data.name || "BIMja project"; if (id) return [ifcGuid(`${pid}/el/${id}`)]; const g = window.bimja?.get?.(window.__bimjaSelectedIfc)?.globalId; return g ? [g] : []; }

  // ---------- UI ----------
  function renderModels() {
    const main = getMain();
    $("#fedModels").innerHTML = [main ? { fid: "main", name: main.name } : null, ...fed.values()].filter(Boolean).map((m) => `<label class="check"><input type="checkbox" checked data-fid="${m.fid}"> ${esc(m.name)} <small class="note">${m.fid}</small></label>`).join("") || `<p class="note">Open a model, then federate others (structure, MEP…) to clash them.</p>`;
  }
  $("#fedModels").addEventListener("change", (e) => { const f = e.target.dataset.fid; if (f) viewer.setModelVisible(f, e.target.checked); });
  $("#fedSplit").onclick = async () => { const r = await run("federation", {}); if (!r.ok) return toast(r.refusals[0].message); const box = $("#fedList"); box.textContent = "";
    for (const m of r.data) { const row = document.createElement("div"); row.className = "row"; const b = document.createElement("button"); b.className = "btn"; b.textContent = "IFC"; b.title = `Download ${m.container}.ifc`;
      b.onclick = async () => { const x = await run("export_ifc", { discipline: m.discipline }); if (!x.ok) return toast(x.refusals[0].message); download(`${m.container}.ifc`, x.data, "application/x-step"); };
      const t = document.createElement("span"); t.textContent = `${m.title} · ${m.elements} elements · ${m.container}`; row.append(b, t); box.append(row); } };
  $("#fedFile").onchange = async (e) => { for (const f of e.target.files) { const r = await run("federate", { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name }); if (!r.ok) toast(r.refusals[0].message); } e.target.value = ""; };
  $("#runClash").onclick = async () => {
    $("#clashList").innerHTML = `<p class="note">Running…</p>`;
    const r = await run("clash", { tolerance: (+$("#clashTol").value || 10) / 1000, clearance: (+$("#clashClear").value || 0) / 1000, a: $("#clashA").value || "all", b: $("#clashB").value || undefined });
    if (!r.ok) { $("#clashList").innerHTML = `<p class="note">${esc(r.refusals[0].message)}</p>`; }
  };
  function renderClashes() {
    const c = lastClash; if (!c) return;
    $("#clashSummary").textContent = `${c.clashes.length} clashes (${c.clashes.filter((x) => x.type === "hard").length} hard) · ${c.stats.a} × ${c.stats.b || c.stats.a} elements · ${c.stats.narrow} narrow tests · ${c.stats.ms} ms`;
    $("#clashList").innerHTML = c.clashes.slice(0, 300).map((x) => `<div class="issue ${x.severity === "critical" || x.severity === "high" ? "high" : x.severity === "medium" ? "medium" : "low"}" data-ci="${x.index}">
      <b>${esc(x.severity)}</b> ${x.type === "hard" ? `${Math.round(x.penetration * 1000)} mm` : `${Math.round((x.gap || 0) * 1000)} mm gap`} · ${esc(x.a.ifcClass)} × ${esc(x.b.ifcClass)}
      <small>${esc(x.a.name)} (${esc(x.a.model)}) × ${esc(x.b.name)} (${esc(x.b.model)})</small><button class="btn mini" data-issue="${x.index}">Create issue</button></div>`).join("") || `<p class="note">No clashes. 🎉</p>`;
  }
  $("#clashList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-issue]"); if (b) { e.stopPropagation(); const cl = lastClash.clashes[+b.dataset.issue];
      const r = await run("issue", { title: `Clash: ${cl.a.ifcClass} × ${cl.b.ifcClass}`, clash_index: +b.dataset.issue, priority: cl.severity === "critical" ? "Critical" : cl.severity === "high" ? "High" : "Normal" }); if (r.ok) toast("Issue created"); return; }
    const row = e.target.closest("[data-ci]"); if (row) { const cl = lastClash.clashes[+row.dataset.ci]; selectIds([cl.a.viewId, cl.b.viewId]); }
  });
  function renderIssues() {
    const list = coord().issues;
    $("#issueList").innerHTML = list.map((t) => `<div class="prop" data-guid="${t.guid}"><b>${esc(t.title)}</b> <small class="note">${esc(t.type)} · ${esc(t.priority || "")} · by ${esc(t.author)}</small>
      <div class="row"><select data-status="${t.guid}">${["Open", "In progress", "Resolved", "Closed"].map((s) => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select><button class="btn mini" data-show="${t.guid}">Show</button></div>
      ${t.description ? `<small class="note">${esc(t.description)}</small>` : ""}${(t.comments || []).map((c) => `<div class="note">💬 ${esc(c.author)}: ${esc(c.text)}</div>`).join("")}</div>`).join("") || `<p class="note">No issues yet. Create them from clashes, or with the issue command.</p>`;
  }
  $("#issueList").addEventListener("change", (e) => { const g = e.target.dataset.status; if (g) run("issue", { id: g, status: e.target.value }); });
  $("#issueList").addEventListener("click", (e) => {
    const g = e.target.closest("[data-show]")?.dataset.show; if (!g) return; const t = coord().issues.find((x) => x.guid === g); const vp = t?.viewpoints?.[0];
    if (vp?.camera) viewer.setCameraBCF(vp.camera); const sel = vp?.selection?.length ? vp.selection : t.elements || []; selectIds(sel.map(guidToViewId).filter(Boolean), !vp?.camera);
  });
  function guidToViewId(g) {
    const main = getMain(); if (main) for (const e of main.model.index.elements.values()) if (e.globalId === g) return e.id;
    for (const f of fed.values()) for (const e of f.model.index.elements.values()) if (e.globalId === g) return `${f.fid}#${e.id}`;
    const pid = bus.model.data.name || "BIMja project"; for (const id of Object.keys(bus.model.data.elements)) if (ifcGuid(`${pid}/el/${id}`) === g) return id;
    return null;
  }
  $("#saveViewpoint").onclick = async () => { const r = await run("viewpoint", {}); if (r.ok) { const t = await run("issue", { title: $("#vpTitle").value || "Viewpoint", viewpoint: r.data.guid }); if (t.ok) toast("Issue with viewpoint saved"); } };
  $("#bcfExport").onclick = async () => { const r = await run("bcf_export", {}); if (r.ok) downloadBlob("bimja-issues.bcfzip", new Blob([Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0))], { type: "application/zip" })); };
  $("#bcfFile").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; e.target.value = ""; const u = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    const r = await run("bcf_import", { base64: btoa(s) }); toast(r.ok ? `Imported ${r.data.topics} topics` : r.refusals[0].message); };
  bus.on((ev) => { if (ev.type === "applied") renderIssues(); });
  renderModels(); renderIssues();
  return { renderModels, fed, guidToViewId };
}
