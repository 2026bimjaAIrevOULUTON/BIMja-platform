// Session UI: command palette, Create tools, schedules, log with proposals, agent ghost cursors, keyboard,
// project save/open and the attached-agent bridge. Every control emits a bus command; nothing mutates state directly.
import { REGISTRY, byName } from "../commands/registry.js";
import { SAMPLE_HOUSE } from "./sample-house.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function initSessionUI({ bus, viewer, run, toast, download, onAuthoredChange }) {
  // ---------- palette ----------
  const dlg = $("#palette"); let current = null, active = 0;
  const list = () => REGISTRY.filter((r) => r.status === "live" || r.status === "stub");
  function openPalette(name) {
    $("#paletteSearch").value = ""; renderList(""); $("#paletteEdit").hidden = true; $("#paletteList").hidden = false;
    if (!dlg.open) dlg.showModal();
    if (name) pick(name); else $("#paletteSearch").focus();
  }
  function renderList(q) {
    const f = q.toLowerCase(); const items = list().filter((r) => !f || r.name.includes(f) || r.help.toLowerCase().includes(f) || r.domain.includes(f));
    active = Math.min(active, Math.max(0, items.length - 1));
    $("#paletteList").innerHTML = items.map((r, i) => `<div class="pal-item${i === active ? " on" : ""}" data-name="${r.name}"><span><b>${r.name}</b> <small>${esc(r.help)}</small></span><span class="st">${r.domain}${r.status === "stub" ? " · soon" : ""}</span></div>`).join("");
  }
  function pick(name) {
    current = byName[name]; $("#paletteList").hidden = true; $("#paletteEdit").hidden = false;
    $("#palName").textContent = name; $("#palHelp").textContent = current.help;
    $("#palArgs").value = JSON.stringify(current.example || {}, null, 2); $("#palOut").textContent = ""; $("#palArgs").focus();
  }
  $("#paletteSearch").addEventListener("input", (e) => { active = 0; renderList(e.target.value); });
  $("#paletteSearch").addEventListener("keydown", (e) => {
    const items = [...document.querySelectorAll(".pal-item")];
    if (e.key === "ArrowDown") { active = Math.min(active + 1, items.length - 1); renderList(e.target.value); e.preventDefault(); }
    if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); renderList(e.target.value); e.preventDefault(); }
    if (e.key === "Enter") { e.preventDefault(); if (items[active]) pick(items[active].dataset.name); }
  });
  $("#paletteList").addEventListener("click", (e) => { const it = e.target.closest(".pal-item"); if (it) pick(it.dataset.name); });
  $("#paletteForm").addEventListener("submit", async (e) => {
    const how = e.submitter?.value; if (how === "cancel") return; e.preventDefault();
    let args; try { args = JSON.parse($("#palArgs").value || "{}"); } catch (err) { $("#palOut").textContent = `Arguments are not valid JSON: ${err.message}`; return; }
    const r = await run(current.name, args, { dry_run: how === "dry" });
    $("#palOut").textContent = JSON.stringify(r.ok ? { ok: true, rev: r.rev, changed: r.changed, dry_run: r.dry_run, data: summarise(r.data) } : r, null, 2);
    if (r.ok && how === "run" && current.kind !== "read") setTimeout(() => dlg.close(), 350);
  });
  const summarise = (d) => (typeof d === "string" && d.length > 300 ? `${d.slice(0, 80)}… (${d.length} chars)` : d);
  $("#paletteBtn").onclick = () => openPalette();
  document.querySelectorAll("[data-cmd]").forEach((b) => (b.onclick = () => openPalette(b.dataset.cmd)));

  // ---------- session controls ----------
  $("#undo").onclick = () => run("undo", {});
  $("#redo").onclick = () => run("redo", {});
  $("#pauseAgents").onclick = () => run("pause_agents", {});
  $("#saveProject").onclick = async () => { const r = await run("save", {}); if (r.ok) download("project.bimja.json", JSON.stringify(r.data, null, 1), "application/json"); };
  $("#projectFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return; e.target.value = "";
    try { const r = await run("load_project", { project: JSON.parse(await f.text()) }); toast(r.ok ? `Opened ${f.name}` : r.refusals[0].message); } catch (err) { toast(`Not a project file: ${err.message}`); }
  };
  $("#deleteSel").onclick = () => { const id = window.__bimjaSelectedAuthored; if (id) run("delete", { ids: [id] }); else toast("Select an authored element first"); };
  $("#demoHouse").onclick = () => run("script", { commands: SAMPLE_HOUSE });

  // ---------- schedules ----------
  const renderSchedule = async () => {
    const r = await run("schedule", { kind: $("#scheduleKind").value }, { quiet: true }); const rows = r.data || [];
    $("#schedule").innerHTML = rows.length ? `<table><tr>${Object.keys(rows[0]).map((k) => `<th>${esc(k)}</th>`).join("")}</tr>${rows.map((row) => `<tr>${Object.values(row).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>` : `<p class="note">Nothing yet.</p>`;
  };
  $("#scheduleKind").onchange = renderSchedule;

  // ---------- log & proposals ----------
  const renderLog = () => {
    const props = [...bus.proposals.values()];
    $("#propCount").hidden = !props.length; $("#propCount").textContent = props.length;
    $("#proposals").innerHTML = props.map((p) => `<div class="prop"><div class="prop-head"><span class="who">${esc(p.cmd.actor)}</span> wants to run <b>${esc(p.cmd.name)}</b></div>
      <code class="args">${esc(JSON.stringify(p.cmd.args).slice(0, 220))}</code>
      <div class="note">${p.diff.added.length + p.diff.modified.length + p.diff.removed.length ? `Adds ${p.diff.added.length} · changes ${p.diff.modified.length} · removes ${p.diff.removed.length} elements` : "No element changes (schedule, cost or settings data)"}. Nothing changes until you apply.</div>
      <div class="row"><button class="btn primary" data-apply="${p.id}">Apply</button><button class="btn" data-reject="${p.id}">Reject</button></div></div>`).join("");
    $("#log").innerHTML = bus.log.slice(-200).reverse().map((e) => `<div class="logrow ${e.actor.startsWith("agent") ? "agent" : "human"}"><b>${esc(e.name)}</b> · ${esc(e.actor)}${e.approvedBy ? ` (applied by ${esc(e.approvedBy)})` : ""} <small>rev ${e.rev} · ${e.changed.length} changed</small><br><small>${esc(JSON.stringify(e.args).slice(0, 200))}</small></div>`).join("") || `<p class="note">No changes yet.</p>`;
    $("#rev").textContent = `rev ${bus.rev}`;
    $("#pauseAgents").textContent = bus.paused ? "Agents: paused" : "Agents: on"; $("#pauseAgents").classList.toggle("on", bus.paused);
  };
  $("#proposals").addEventListener("click", (e) => {
    const a = e.target.closest("[data-apply]"), r = e.target.closest("[data-reject]");
    if (a) run("apply_proposal", { id: a.dataset.apply }); if (r) run("reject_proposal", { id: r.dataset.reject });
  });
  $("#exportLog").onclick = () => download("bimja-log.json", JSON.stringify(bus.log, null, 1), "application/json");

  // ---------- agent ghost cursors ----------
  const ghosts = new Map();
  function ghost(actor, ids) {
    const id = ids.find((x) => viewer.byId.has(x)); if (!id) return; const p = viewer.screenPos(id); if (!p) return;
    let el = ghosts.get(actor); if (!el) { el = document.createElement("div"); el.className = "ghost-cursor"; $("#ghosts").appendChild(el); ghosts.set(actor, el); }
    el.textContent = actor.replace(/^agent:/, "🤖 "); el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.opacity = 1;
    clearTimeout(el._t); el._t = setTimeout(() => (el.style.opacity = 0), 4000);
  }

  bus.on((ev) => {
    if (ev.type === "applied") { onAuthoredChange(); renderSchedule(); if (ev.entry.actor.startsWith("agent")) setTimeout(() => ghost(ev.entry.actor, ev.entry.changed), 50); }
    if (ev.type === "proposal") { toast(`${ev.cmd.actor} proposed ${ev.cmd.name}. Review it in Activity.`); }
    if (ev.type === "refused" && ev.cmd?.actor === "human") toast(ev.result.refusals[0].message);
    renderLog();
  });
  renderLog(); renderSchedule();

  // ---------- keyboard: every pointer action has a key ----------
  addEventListener("keydown", (e) => {
    const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
    if (typing) return;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); run("undo", {}); }
    else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); run("redo", {}); }
    else if (e.key === "p" || e.key === "P") run("pause_agents", {});
    else if ((e.key === "Delete" || e.key === "Backspace") && window.__bimjaSelectedAuthored) run("delete", { ids: [window.__bimjaSelectedAuthored] });
  });

  // ---------- attached agent bridge (ws://127.0.0.1, token in the URL fragment) ----------
  connectAgent({ bus, toast });
  return { openPalette, renderLog };
}

function connectAgent({ bus, toast }) {
  const m = location.hash.match(/bimja=(ws:\/\/(?:127\.0\.0\.1|localhost):\d+\/[\w-]+)/); if (!m) return;
  history.replaceState(null, "", location.pathname + location.search); // drop the token from the address bar
  let actor = "agent:mcp"; const bar = document.createElement("div"); bar.id = "agentBar"; bar.textContent = "Connecting agent…"; document.querySelector("#view").appendChild(bar);
  let ws;
  try { ws = new WebSocket(m[1]); } catch (e) { bar.textContent = `Agent connection blocked: ${e.message}`; return; }
  ws.onopen = () => (bar.textContent = "Agent connected");
  ws.onerror = () => (bar.textContent = "Agent connection failed (is bimja-mcp running? Allow local network access if the browser asks)");
  ws.onclose = () => (bar.textContent = "Agent disconnected");
  ws.onmessage = async (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "hello") { actor = String(msg.actor || "agent:mcp").slice(0, 48); bar.textContent = `🤖 ${actor.replace("agent:", "")} connected`; toast(`${actor} connected`); return; }
    if (msg.type === "execute") {
      const c = msg.cmd || {}; // actor is assigned by the server; the page never trusts an actor from elsewhere
      let result = await window.bimja.run(c.name, c.args || {}, { actor, dry_run: c.dry_run, apply: c.apply, rev: c.rev, session: c.session, id: c.id });
      ws.send(JSON.stringify({ id: msg.id, result }));
    }
  };
}

