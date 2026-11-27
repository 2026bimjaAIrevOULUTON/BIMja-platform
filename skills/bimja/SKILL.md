---
name: bimja
description: Operate the BIMja platform (open-source web BIM) end to end from any agent app — Claude, Codex, Cursor or GitHub Copilot — through its MCP server, its headless runner or window.bimja. Covers connecting, authoring buildings and families, zones and grids, coordination and clash, 4D schedules, 5D cost, assets and COBie, geolocation, site, city context and digital twin, agent teams, and drawing sets (drafted plans, sections, single lines, ISO 19650 numbering, PDF/DXF/IFC export) with label QA. Use this whenever the user mentions BIMja, wants a BIM model, IFC, drawings, a drawing register, clash check, schedule, cost plan or handover data produced by an agent, or asks to drive, script, automate or test BIMja — even if they don't say "skill".
---

# Operating BIMja

BIMja is a static web app that runs locally (`npm run dev` → http://localhost:5173; private repo `2026bimjaAIrevOULUTON/BIMja-platform`, setup in `docs/SETUP.md`) with one command layer. People (UI), agents (MCP) and scripts call **the same commands with the same arguments**, and every change lands in an attributed, undoable command log. If you can describe the work as commands, BIMja can do it; this skill is how to do that well.

Read `references/commands.md` (all ~105 commands, args, examples, generated from the code) before your first call, and `references/workflows.md` for the recipe that matches the task. For drawings, also read `references/drawings.md`.

## 1. Pick how to connect

| Situation | Use | Writes |
|---|---|---|
| User has BIMja open and wants to watch / approve | MCP **attached**: `node mcp/bimja-mcp.mjs --open` | Proposals the person applies |
| Agent in an IDE/CLI (Codex, Cursor, Claude Code) without a browser, or CI / GitHub Copilot cloud agent | MCP **headless**: `node mcp/bimja-mcp.mjs --headless --apply` | Applied (without `--apply`, or `apply:true` per call, writes stay proposals nobody can approve) |
| No MCP client, batch job, tests, or you just need files | **Runner**: `node skills/bimja/scripts/bimja.mjs plan.json --out dir` | Applied; files written |
| In the browser console | `await bimja.run("describe")` | Proposals unless `{apply:true}` |

Setup and per-app config snippets (Claude, Codex `config.toml`, Cursor `.cursor/mcp.json`, Copilot repo settings): `references/connect.md`. Needs Node 20+, `git clone` the repo, `npm ci`.

Commands marked *needs viewer* (render, camera, isolate, clash, BCF, sensors, basemap…) only work **attached**. Everything else — authoring, families, schedules, cost, IFC, drawings, clash_model — works headless.

## 2. How to work (the habits that make results correct)

1. **Start with `describe`** (and `commands` if your client doesn't list tools). A new project already has a ground level; don't add another level at elevation 0 — walls would get zero height. Add levels above it.
2. **Units are millimetres** in local project coordinates (x east, y north, z up). Levels and plan cut heights are mm; `geolocate` maps the local origin to lat/lon. Wall points are **centre lines**: for a 6 × 4 m outside size with 230 mm walls, inset the points by 115 mm.
3. **Batch with `script`**: `{commands:[...], atomic:true}` runs as one step and one undo, all-or-nothing. Tag a step `{"as":"core"}` and refer to its id later as `"$core"` (works for `place`, `wall`, `mass`, `family`…; `walls` returns `ids`, so host doors by position with `door {at:[x,y]}`). Group large builds in packages of ~25–50 commands so a refusal is easy to locate.
4. **Respect the human loop.** In attached mode your writes become proposals; tell the user what to approve or ask before `--apply`. Typed refusals never change anything: on `stale_rev` re-read and retry (≤3 times); on `locked` work elsewhere; on `paused` stop and say so; on `bad_arg`/`out_of_bounds`/`would_overlap` fix the arguments — the message says what is wrong.
5. **Check your own work.** `query`/`describe` after writes; `clash_model` before calling a model coordinated; `render` (attached) to look at it; for drawings read the `qa` returned by `drawing` (see §4).
6. **Be honest about data.** Families carry `parameters`; mark anything not verified (vendor, rating, as-built status) as assumed, and say so in the drawing notes. BIMja output is concept design unless a qualified engineer checks it.
7. **Files and persistence.** Over MCP, commands return content (IFC text, base64 PDF/XLSX/zip, DXF text) — write it to disk yourself; the runner does this automatically. Only write commands go inside `script` (reads like `export_ifc`, `drawing`, `register` run on their own). A headless session lives in memory: **save** before it ends.
8. **Save.** `save` returns the whole project JSON (model, coordination, schedule, twin, log); `load_project` restores it. The runner's `--save out.bimja.json` does this for you.

## 3. Command families (what to reach for)

- **Model**: `level`, `walls`/`wall`, `door`, `window`, `floor`, `room`, `roof`, `type`, `set`, `move`, `delete`, `query`, `schedule`.
- **Free-form geometry**: `mass` (extrude with taper, shift, twist, lean), `revolve`, `sweep` (profiles along paths: pipes, busways, trays, kerbs, mouldings), `boolean`, `opening` (arches), `array`.
- **Families (equipment, furniture, anything repeated)**: `family {name, ifc_class, uniclass, parameters, parts}` then `place {family, at:[x,y,z], rotation_deg, mark}`. Parts are `{shape:"box", min:[x,y,z], max:[x,y,z]}` or `{shape:"revolve", center:[x,y], profile:[[r,z],...]}`. Give equipment a `mark` (its tag) — drawings, schedules and assets use it. `connect {from, to, medium, rating}` links equipment into systems (feeds single lines).
- **Organisation**: `project_brief` (type sets the team and stages), `zone` (code = ISO 19650 volume; `parent` makes sheet parts), `grid` (with `zone`).
- **Coordination**: `federation` (discipline models), `export_ifc {discipline}`, `clash_model {a, b}` headless; attached: `federate`, `clash`, `issue`, `viewpoint`, BCF import/export.
- **Time (4D)**: `activity`, `link`, `auto_sequence`, `schedule_import` (P6/MSPDI), `timeline`, `animate`.
- **Cost (5D) and handover**: `cost {rates|sample}`, `estimate`, `asset`, `cobie`, `check_handover`, `quantity`.
- **Place**: `geolocate`, `location`, `site_pin`, `survey_import`, `site_grade`, `site_report`, `city_plan` (OSM → layered commands), `sun`, `solar_study`, `live_data`; attached: `map_context`, `basemap`, `overlay`, `crs`, `anchor`.
- **Digital twin** (attached): `sensor`, `bind`, `feed`, `history`.
- **Team of agents**: `project_brief` → `team_assemble` → `team`, `responsibility_matrix`, `delivery_status`, `handover_mark`.
- **Documents**: `drawing_setup`, `sheets_auto`, `sheet`, `drawing_pack`, `drawing`, `publish`, `register`, `bwic`, `spools`.
- **Session**: `log`, `proposals`, `apply_proposal`/`reject_proposal` (people), `undo`/`redo`, `pause_agents`, `save`/`load_project`.

## 4. Drawings that are worth issuing

BIMja has two kinds of sheet. Generic sheets (`plan`, `elevations`, `sections`, `schedule`, `register`, `sheets_auto`) are quick. **Drafted** sheets (`ga`, `elec`, `mech`, `roof`, `fire_plan`, `block_sld`, `hall_section`, `site_plan`) are composed on paper at a fixed scale — poché walls, door swings and marks, grids with bubbles, dimension chains, tagged equipment, single-line services with size and level, legend, general notes, key plan, north point, scale bar — and every label is placed by a collision-avoiding placer.

The rule: **a drafted sheet is only done when `drawing` returns `qa.overlaps: 0` and `qa.missing: []`.** If not, fix the cause (zone too big for 1:100 → split it with child zones and `parent`; too many labels → shorter marks; equipment hidden → check `cut_z`/levels) rather than accepting a crowded sheet. Details, the split/matchline pattern, notes and single-line inputs: `references/drawings.md`.

Numbering follows ISO 19650 (`Project-Originator-Volume-Level-Type-Role-Number`, e.g. `HSD-BJA-HA1-00-DR-E-5251`); `publish {status, date}` bumps revisions and zips PDF + DXF + XLSX register.

## 5. Delivering to the user

- Name files by their sheet number; send PDFs (and DXF when CAD is wanted), IFC per discipline, the XLSX register, COBie.
- Report what was assumed, what QA showed, and what is not yet drawn — briefly.
- Never put API keys in chats or commits; the MCP server binds 127.0.0.1 with a one-time token and sends no telemetry.
