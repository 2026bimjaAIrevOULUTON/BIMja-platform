// 4D in the browser: Gantt, date slider, play, import, auto sequence, link the selection; the view shows each
// linked element as hidden / active (orange) / built / existing / removed at the chosen date.
import * as THREE from "three";
import { stateAt, span, toMs, isoDate, DAY } from "../time/schedule.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function installTime({ bus, viewer, run, toast, resolveElement, selectIds }) {
  const T = () => bus.extra.time;
  const activeMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0x3a1a00 });
  let current = null; // ISO date shown, or null = 4D off
  let timer = null;

  // ---- visuals on top of the headless commands ----
  const coreTimeline = bus.handlers.get("timeline").run, coreAnimate = bus.handlers.get("animate").run;
  bus.register("timeline", (a, cmd, b) => { stop(); const r = coreTimeline(a, cmd, b); show(r.date); return r; }, { kind: "view" });
  bus.register("animate", (a, cmd, b) => {
    const r = coreAnimate(a, cmd, b); stop();
    if (a.play) { let i = 0; const f = r.frames; timer = setInterval(() => { if (i >= f.length) return stop(); show(f[i++].date); }, Math.max(60, +a.interval_ms || 250)); setPlaying(true); }
    return r;
  }, { kind: "view" });

  function apply() {
    const s = T(); if (!current || !s) return;
    const st = stateAt(s, current); const seen = new Set();
    for (const [ref, status] of st.elements) {
      const v = resolveElement(ref); if (v == null) continue; seen.add(v);
      for (const m of viewer.byId.get(v) || []) {
        if (m.userData.isSpace) continue;
        m.visible = status !== "hidden" && status !== "removed";
        m.material = status === "active" ? activeMat : m.userData.baseMat;
      }
    }
    renderGantt(st);
  }
  function show(date) {
    current = date; apply(); const sp = T() && span(T());
    if (sp) { const sl = $("#timeSlider"); sl.max = Math.round((toMs(sp.finish) - toMs(sp.start)) / DAY); sl.value = Math.round((toMs(date) - toMs(sp.start)) / DAY); }
    $("#timeLabel").textContent = date ? date.slice(0, 10) : "";
  }
  function off() { stop(); current = null; viewer.meshes().forEach((m) => { if (!m.userData.isSpace) { m.visible = true; m.material = m.userData.baseMat; } }); renderGantt(); $("#timeLabel").textContent = "4D off"; }
  function stop() { if (timer) clearInterval(timer); timer = null; setPlaying(false); }
  const setPlaying = (on) => { $("#playTime").textContent = on ? "■ Stop" : "▶ Play"; $("#playTime").classList.toggle("on", on); };

  // ---- Gantt ----
  function renderGantt(st) {
    const s = T(); const box = $("#ganttList"); const acts = s ? Object.values(s.activities).sort((a, b) => toMs(a.start) - toMs(b.start) || (a.id < b.id ? -1 : 1)) : [];
    $("#schedSummary").textContent = s && acts.length ? `${s.name || "Schedule"} · ${acts.length} activities · ${s.links.length} links · ${span(s).start.slice(0, 10)} → ${span(s).finish.slice(0, 10)}` : "No schedule yet.";
    $("#actPick").innerHTML = acts.map((a) => `<option value="${esc(a.id)}">${esc(a.code || a.id)} · ${esc(a.name)}</option>`).join("");
    if (!acts.length) { box.innerHTML = ""; return; }
    const sp = span(s), t0 = toMs(sp.start), len = Math.max(DAY, toMs(sp.finish) - t0); const pct = (t) => (((t - t0) / len) * 100).toFixed(2);
    const active = new Set(st?.active || []); const now = current ? toMs(current) : null;
    box.innerHTML = acts.map((a) => {
      const l = pct(toMs(a.start)), w = Math.max(0.6, pct(toMs(a.finish)) - l); const done = now != null && now >= toMs(a.finish);
      return `<div class="g-row${active.has(a.id) ? " act" : ""}${done ? " done" : ""}" data-id="${esc(a.id)}" title="${esc(a.start.slice(0, 10))} → ${esc(a.finish.slice(0, 10))} · ${a.elements.length} elements">
        <span class="g-name">${esc(a.name)} <small>${a.elements.length || "—"}</small></span><span class="g-track"><i style="left:${l}%;width:${w}%"></i>${now != null ? `<b class="g-now" style="left:${pct(now)}%"></b>` : ""}</span></div>`;
    }).join("");
    box.querySelectorAll(".g-row").forEach((r) => (r.onclick = () => { const a = s.activities[r.dataset.id]; $("#actPick").value = a.id;
      const ids = a.elements.map(resolveElement).filter((x) => x != null); run("timeline", { date: isoDate(Math.min(toMs(a.finish) - 1, toMs(a.start) + DAY / 2)) }); if (ids.length) selectIds(ids, false); }));
  }

  // ---- controls ----
  $("#schedFile").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const r = await run("schedule_import", { xml: await f.text() }); e.target.value = "";
    if (r.ok) { toast(`Imported ${r.data.activities} activities, ${r.data.links} links (${r.data.source})`); run("timeline", {}); } };
  $("#sampleSched").onclick = async () => { const xml = await (await fetch("schedules/sample-house.p6.xml")).text(); const r = await run("schedule_import", { xml }); if (r.ok) { toast("Sample P6 schedule imported: link activities to elements, or use Auto sequence"); run("timeline", {}); } };
  $("#auto4d").onclick = async () => { const r = await run("auto_sequence", { start: $("#actStart").value || "2026-01-05" }); if (r.ok) { toast(`Built ${r.data.activities} activities from the model`); run("timeline", {}); } };
  $("#actAdd").onclick = () => run("activity", { name: $("#actName").value || "New activity", start: $("#actStart").value, duration_days: +$("#actDays").value || 5, after: $("#actAfter").checked && $("#actPick").value ? $("#actPick").value : undefined });
  $("#linkSel").onclick = () => {
    const el = window.__bimjaSelectedAuthored || (window.__bimjaSelectedIfc != null ? window.bimja.get(window.__bimjaSelectedIfc)?.globalId : null);
    if (!$("#actPick").value) return toast("Add or import an activity first"); if (!el) return toast("Select an element in the view first");
    run("link", { activity: $("#actPick").value, elements: [el] });
  };
  $("#linkRule").onclick = () => { const v = $("#linkRuleText").value.trim(); if (!$("#actPick").value || !v) return toast("Pick an activity and type a rule, e.g. wall@Level 1 or IfcWall");
    const [what, where] = v.split("@"); const rule = /^Ifc/i.test(what) ? { ifc_class: what } : { kind: what }; if (where) rule[/^Ifc/i.test(what) ? "storey" : "level"] = where;
    run("link", { activity: $("#actPick").value, rule }); };
  $("#timeSlider").oninput = (e) => { const sp = T() && span(T()); if (sp) run("timeline", { date: isoDate(toMs(sp.start) + +e.target.value * DAY) }); };
  $("#playTime").onclick = () => (timer ? stop() : run("animate", { step_days: +$("#timeStep").value || 3, play: true }));
  $("#time4dOff").onclick = off;

  bus.on((ev) => { if (ev.type === "applied") { if (current) setTimeout(apply); else renderGantt(); } });
  renderGantt();
  return { apply, off, get date() { return current; } };
}
