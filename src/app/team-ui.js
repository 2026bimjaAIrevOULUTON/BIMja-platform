// Brief workspace and the agent team: the brief, the team assembled from the project type, the responsibility
// matrix, the delivery progress bar, and "Run with the team", where every agent works its own stage and
// discipline at the same time and every command is logged under that agent's name.
import { STAGES, ROLES, PROJECT_TYPES, ownerOf } from "../agents/team.js";
import { disciplineOf } from "../coord/model-clash.js";
import { landmarkProject, landmarkStages } from "./landmarks.js";
import { DATACENTRE, DC_STAGES, dcProject, dcStages } from "./datacentre.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LANDMARK_TYPE = { taj: "heritage", pisa: "heritage", fallingwater: "heritage", vitra: "building", burj: "building", [DATACENTRE.id]: "data_centre" };

export function installTeamUI({ bus, run, toast, sim }) {
  const busy = new Map(); // actor -> last activity time
  const team = () => bus.extra.team?.members || [];
  $("#briefType").innerHTML = Object.entries(PROJECT_TYPES).map(([k, v]) => `<option value="${k}">${esc(v.title)}</option>`).join("");

  function renderBrief() { const b = bus.extra.brief || {}; if (["briefName", "briefClient", "briefType", "briefLod"].includes(document.activeElement?.id)) return;
    $("#briefName").value = b.name || ""; $("#briefClient").value = b.client || ""; if (b.type) $("#briefType").value = b.type; if (b.lod_target) $("#briefLod").value = b.lod_target; }
  function renderTeam() {
    const ms = team(); const t = bus.extra.team; const now = Date.now();
    $("#teamAddRole").innerHTML = `<option value="">Add a specialist…</option>${Object.entries(ROLES).filter(([id]) => !ms.some((m) => m.id === id)).map(([id, r]) => `<option value="${id}">${esc(r.title)}</option>`).join("")}`;
    if (!ms.length) { $("#teamList").innerHTML = '<div class="note">No team yet. Choose the project type and assemble.</div>'; $("#raci").innerHTML = ""; return; }
    const depth = (m) => { let d = 0, p = m.parent; while (p && d < 3) { d++; p = ROLES[p]?.parent; } return d; };
    $("#teamList").innerHTML = `<div class="note">${esc(PROJECT_TYPES[t.type].title)} · ${ms.length} agents</div>` + STAGES.map((s) => { const here = ms.filter((m) => m.stage === s.id); if (!here.length) return "";
      return `<div class="team-stage">${esc(s.title)}</div>` + here.map((m) => { const d = depth(m), w = now - (busy.get(m.actor) || 0) < 2500;
        return `<div class="member ${d === 1 ? "sub" : d > 1 ? "sub2" : ""}" style="--who:${m.colour}"><span class="dot"></span><span class="t">${esc(m.title)}${m.discipline ? ` <span class="num">${m.discipline}</span>` : ""}<small>${esc(m.does)}</small></span>${w ? '<span class="busy">working</span>' : ""}${ROLES[m.id] && !["planner", "surveyor", "architect", "coordinator", "draftsman", "estimator", "asset_manager"].includes(m.id) ? `<button class="x" data-remove="${m.id}" title="Remove">✕</button>` : ""}</div>`; }).join(""); }).join("");
    run("responsibility_matrix", {}, { quiet: true }).then((r) => { if (!r.ok) return; const R = r.data; const cols = R.roles;
      $("#raci").innerHTML = `<table><tr><th></th>${cols.map((c) => `<th>${esc(c.title)}</th>`).join("")}</tr>${R.rows.map((row) => `<tr><td>${esc(row.deliverable)}</td>${cols.map((c) => `<td class="${row.raci[c.id] || ""}">${row.raci[c.id] || ""}</td>`).join("")}</tr>`).join("")}</table><div class="note">R responsible · A accountable · C consulted · I informed</div>`; });
  }
  async function renderStages() {
    const r = await run("delivery_status", {}, { quiet: true }); if (!r.ok) return; const cur = document.body.dataset.stage;
    $("#stageBar").innerHTML = r.data.stages.map((s, i) => `<button data-goto="${s.id}" data-status="${s.status}" class="${s.id === cur ? "on" : ""}" title="${esc(s.title)}: ${s.status.replace("_", " ")} · lead: ${esc(s.lead)}"><b>${i + 1}. ${esc(s.title)}</b><small>${esc(s.lead)}</small></button>`).join("");
    for (const s of r.data.stages) document.querySelector(`#tabs i.st[data-st="${s.id}"]`)?.setAttribute("data-status", s.status);
  }
  $("#stageBar").onclick = (e) => { const b = e.target.closest("[data-goto]"); if (b) window.__bimjaShowStage(b.dataset.goto); };
  $("#briefSave").onclick = async () => { const r = await run("project_brief", { name: $("#briefName").value || undefined, client: $("#briefClient").value || undefined, type: $("#briefType").value, ...($("#briefLod").value ? { lod_target: +$("#briefLod").value } : {}) }); toast(r.ok ? "Brief saved" : r.refusals[0].message); };
  $("#teamAssemble").onclick = async () => { const r = await run("team_assemble", { type: $("#briefType").value }); toast(r.ok ? `${r.data.size} agents assembled for ${PROJECT_TYPES[r.data.type].title.toLowerCase()}` : r.refusals[0].message); };
  $("#teamAdd").onclick = async () => { const id = $("#teamAddRole").value; if (!id) return; const r = await run("team_assemble", { type: bus.extra.team?.type || $("#briefType").value, add: [id] }); if (!r.ok) toast(r.refusals[0].message); };
  $("#teamList").onclick = async (e) => { const x = e.target.closest("[data-remove]"); if (x) await run("team_assemble", { type: bus.extra.team.type, remove: [x.dataset.remove] }); };

  // ---------- run the delivery with the team ----------
  async function runDelivery(id) {
    const dc = id === DATACENTRE.id; const lp = dc ? dcProject() : landmarkProject(id); const st = dc ? dcStages() : landmarkStages(id); if (!lp) return; await window.__bimjaKernel;
    const gap = dc ? 60 : 30; // the pilot is ~1,900 commands: the team works faster so the build plays in minutes
    const status = (t) => ($("#runStatus").textContent = t);
    const as = (m, name, args) => run(name, args, { actor: m.actor, apply: true }); // team mode: the person has let the team apply; every step is attributed and undoable
    const P = { actor: "agent:planner" };
    status("Planner: setting up the project and assembling the team…");
    await as(P, "load_project", { project: lp.project });
    await as(P, "project_brief", { name: dc ? `${lp.landmark.name} (pilot)` : `${lp.landmark.name} LOD 350 study`, type: LANDMARK_TYPE[id], lod_target: dc ? 400 : 350, description: lp.landmark.credit.slice(0, 500) });
    await as(P, "team_assemble", { type: LANDMARK_TYPE[id], reset: true }); const T = team(); const M = (rid) => T.find((m) => m.id === rid);
    // design queues: each command goes to the agent that owns its discipline; cuts and copies stay with the owner of what they change
    const refOwner = {}; const famOwner = {}; const queues = new Map(); const push = (m, c) => { if (!queues.has(m)) queues.set(m, []); queues.get(m).push(c); };
    const ownerFor = (c) => { const a = c.args; if (c.owner && M(c.owner)) return M(c.owner); if (c.name === "family") return M("architect");
      if (["boolean", "opening", "array"].includes(c.name)) return refOwner[String(a.base || a.target || a.source).slice(1)] || M("architect");
      if (c.name === "place") return famOwner[a.family] || M("architect");
      return ownerOf(T, a.discipline || disciplineOf({ ifc_class: a.ifc_class, kind: "mass" })) || M("architect"); };
    const fams = lp.landmark.commands.filter((c) => c.name === "family");
    for (const f of fams) famOwner[f.args.name] = ownerOf(T, f.args.discipline || disciplineOf({ ifc_class: f.args.ifc_class, kind: "mass" })) || M("architect");
    const zones = lp.landmark.commands.filter((c) => c.name === "zone"); // the Planner splits the site into zones first (each becomes an ISO 19650 volume)
    const links = lp.landmark.commands.filter((c) => c.name === "connect"); // connections run once both ends exist
    for (const c of lp.landmark.commands) { if (c.name === "family" || c.name === "zone" || c.name === "connect") continue; const m = ownerFor(c); if (c.as) refOwner[c.as] = m; push(m, c); }
    const refs = {}; const R = (v) => (typeof v === "string" && /^\$[A-Za-z_][\w-]*$/.test(v) ? refs[v.slice(1)] ?? v : Array.isArray(v) ? v.map(R) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, R(x)])) : v);
    const exec = async (m, c) => { const r = await as(m, c.name, R(c.args)); if (c.as) refs[c.as] = r.data?.id; if (!r.ok) throw new Error(`${m.title}: ${c.name} refused: ${r.refusals?.[0]?.message}`); return r; };
    // a large project is delivered in work packages: each agent applies a batch (a rack row, a plant line-up) as one atomic,
    // attributed step, so the scene redraws once per package rather than once per element
    const chunk = dc ? 28 : 1;
    const execBatch = async (m, list) => { if (list.length === 1) return exec(m, list[0]); const r = await as(m, "script", { commands: list.map((c) => ({ name: c.name, args: R(c.args), ...(c.as ? { as: c.as } : {}) })) });
      if (!r.ok) throw new Error(`${m.title}: work package refused: ${r.refusals?.[0]?.message}`); r.data.results.forEach((x, i) => { if (list[i].as) refs[list[i].as] = x.data?.id; }); return r; };
    const lane = async (m, list, gap) => { for (let i = 0; i < list.length; i += chunk) { await execBatch(m, list.slice(i, i + chunk)); await window.__bimjaOnPackage?.(m.title); await sleep(gap); } }; // the hook lets a screen recorder grab a frame per work package
    for (const z of zones) await exec(P, z);
    // stage 2 + 3 in parallel: Surveyor locates and reads the context while the design team models
    status(`Surveyor locating the site · Architect leading ${queues.size} designers in parallel…`);
    const geo = st.find((x) => x.name === "geolocate");
    const surveyor = (async () => { await as(M("surveyor"), "geolocate", geo.args); await sim.mapContext({ imagery: true, radius_m: id === "burj" ? 900 : dc ? 700 : 500 }); })();
    for (const f of fams) await exec(M("architect"), f);
    await Promise.all([surveyor, ...[...queues].map(([m, list]) => lane(m, list, gap))]);
    if (links.length) { const pe = M("power_distribution_engineer") || M("electrical_engineer") || M("architect"); status(`${pe.title}: connecting ${links.length} feeders and loops for the single-line diagram and schematics…`); await lane(pe, links, gap); }
    window.__bimjaViewer.fit();
    // stage 4: the Coordinator federates and clashes
    status(dc ? "Coordinator: splitting the discipline models and clash-checking services against structure and each other…" : "Coordinator: clash-checking structure against architecture…");
    if (dc) await run("federation", {}, { actor: M("coordinator").actor });
    const cl = await run("clash_model", dc ? { a: ["M", "E", "F", "P"], b: ["M", "E", "F", "P", "S"], min_volume_m3: 0.001 } : { a: "S", b: "A", min_volume_m3: 0.01 }, { actor: M("coordinator").actor });
    // stages 5 + 6 in parallel: Draftsman draws while the Estimator costs and programmes
    status(`Coordinator: ${cl.ok ? cl.data.total : "?"} clashes logged · Draftsman drawing the set while the Estimator costs and programmes…`);
    const D = M("draftsman"), E = M("estimator"); const ds = st.find((x) => x.name === "drawing_setup"), cost = st.find((x) => x.name === "cost"), seq = st.find((x) => x.name === "auto_sequence");
    await Promise.all([(async () => { await as(D, "drawing_setup", ds.args); await sleep(60); await as(D, "sheets_auto", {}); if (dc) { await sleep(60); await as(D, "drawing_pack", { pack: "data_centre" }); } })(), (async () => { await as(E, "cost", cost.args); await sleep(60); await as(E, "auto_sequence", seq.args); })()]);
    // stage 7: the Asset Manager checks the asset data and hands over
    status("Asset Manager: checking the asset data and handing over…"); const A = M("asset_manager");
    if (dc) for (const a of DC_STAGES.assets) { await as(A, "asset", { ...a, installed: "2028-12-29" }); await sleep(40); } // LOD 500 fields: planned dates and assumed makes, not field-verified
    await run("check_handover", {}, { actor: A.actor }); await as(A, "handover_mark", { note: `${lp.landmark.name}: model, drawings, programme and cost issued` });
    status(`Done: ${T.length} agents took ${lp.landmark.name} from brief to handover · ${bus.log.length} logged steps. Filter Activity by agent to see who did what.`);
    sim.setSun(true);
  }
  $("#runDelivery").onclick = async () => { $("#runDelivery").disabled = true; try { await runDelivery($("#runLandmark").value); } catch (e) { $("#runStatus").textContent = e.message; } finally { $("#runDelivery").disabled = false; } };
  window.__bimjaRunDelivery = runDelivery;

  let pend = null; const refresh = () => { clearTimeout(pend); pend = setTimeout(() => { renderBrief(); renderTeam(); renderStages(); }, 80); };
  bus.on((ev) => { if (ev.type === "applied") { if (ev.entry?.actor?.startsWith("agent:")) { busy.set(ev.entry.actor, Date.now()); setTimeout(refresh, 2600); } refresh(); } });
  document.addEventListener("click", (e) => { if (e.target.closest("#tabs, #subtabs, #stageBar")) setTimeout(renderStages, 0); });
  refresh();
  return { runDelivery, renderStages };
}
