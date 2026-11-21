# BIMja: handover (18–21 Nov 2026)

What has been built, where it lives, what was decided, and what is still open. Written so a new person (or a new Claude session) can pick up without the chat history.

---

## 1. Goal

**BIMja** is one online platform that opens from a single HTML link. Modelling, coordination and clash detection, IFC export, 4D with construction animation, 5D with asset management, and a full digital twin all live in one place. Both people and AI agents can use it. It should match BIMCraft's feature set while being lighter, sleeker and faster, and it runs in the browser.

A services business funds it: **BIMja Services** offers drafting, permit sets, CD sets, BIM, coordination, 4D and animation to US/UK firms. **Money Maker** is the operator skill that runs the sales loop.

---

## 2. What exists today

| # | Item | Status | Where |
|---|---|---|---|
| 1 | **BIMja web app v0** (viewer + handover check) | Live as a private Claude artifact; committed locally; **not on GitHub yet** | Artifact: https://claude.ai/artifact/C9gfLCp8jcN4Qugg6Djfxi · code: `bimja-platform/` (in zip) |
| 2 | **Authoring core (WIP)**: walls, doors, windows, floors, rooms, roof | Code + tests pass; **not yet in the UI**; IFC writer not started | `bimja-platform/src/author/` |
| 3 | **BIMja Services** website + lead system | Built and tested locally; **not deployed** (needs repo + Cloudflare token) | `bimja-services/` (in zip) |
| 4 | **Money Maker** skill | Saved to Claude; engine + state in Google Drive | Drive folder `Money Maker` (`1eeMfddOA1TvVpBwE4lfrhvLx86QYSTLU`) |
| 5 | Research: open-source web BIM stack | Done | `reports/Open source web BIM stack.md` (in zip) |
| 6 | Research: BIMCraft evaluation | Done | `reports/BIMCraft repo evaluation.md` (in zip) |

### 2.1 BIMja web app v0 (`bimja-platform`)

**Features:**
- Opens IFC in the browser by button, drag-and-drop, or `?model=<url>`. Two open sample models are bundled: KIT AC20-FZK-Haus and the IFC4 Sample House.
- 3D view with a storey/class tree, search, properties and quantity sets, x-ray, horizontal section and PNG export.
- **Handover check:** 9 rules (Name, storey, Type/COBie, material, door FireRating, IsExternal, wall LoadBearing, space LongName, base quantities). It gives a score and an issue list, and clicking an issue shows a ghosted focus view of that element.
- **Exports:** issues CSV, report JSON, and a client-ready HTML report with a screenshot. Inside the Claude artifact preview, downloads become clipboard copies.
- **5D seed:** count, area, volume and length per IFC class, read from `Qto_*` sets, with CSV export.
- **Agent API `window.bimja`:** `load, summary, elements, get, check, quantities, select, report, screenshot`.
- Coordination, 4D and Twin tabs are placeholders only.

**Stack:**
- Vite static build.
- **web-ifc 0.0.79** (MPL-2.0), single-threaded WASM, so no COOP/COEP headers are needed.
- **three.js** (MIT).
- BIMja code is MIT.

**Tests:** `npm test`. Both sample models pass: FZK-Haus scores 87% (53 issues), Sample House 89% (23 issues). The flagged issues are genuine data gaps, e.g. FZK walls lack `IsExternal`/`LoadBearing`. Headless Chrome QA on desktop and mobile found 0 console errors.

**CI:** `.github/workflows/deploy.yml` runs test → build → GitHub Pages. It also deploys to Cloudflare Pages (project `bimja-platform`) if the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist.

**Git:** 2 local commits (`f6d6186`, `4ce1dfd`). Push both to the new repo.

**Main files:**
```
index.html                 app shell (tabs: Model, Handover check, 5D, Coordination, 4D, Twin)
src/ifc.js                 web-ifc loading + index (elements, storeys, psets, qtos, types, materials)
src/rules.js               handover rules, runCheck(), quantities(), CSV
src/viewer.js              three.js viewer (pick, ghost focus, x-ray, section, fit)
src/main.js                UI wiring, exports, window.bimja
src/author/model.js        authoring model + JSON commands (WIP, not in UI)
src/author/geom.js         2D geometry: planar faces (rooms), polygon ops
tests/run.mjs              viewer/check regression tests
tests/author.mjs           authoring tests
public/wasm, public/models WASM + sample IFCs (.ifc.txt so the artifact host serves them)
```

### 2.2 Authoring core (WIP)

All edits go through one JSON command interface, so the UI and agents share the same code:
- **Writing commands:** `level`, `wall`, `walls` (chains), `door`/`window` (hosted, auto marks D01/W01, refused if they don't fit or overlap), `floor` (boundary or `from_walls`), `room` (from a point inside walls, or a boundary), `roof` (flat), `delete` (a wall takes its openings), `move`, `set`, `type`.
- **Read commands:** `list_commands`, `inspect`, `query`, `schedule` (wall/door/window/room/floor/roof).
- `dry_run`, atomic `script` (all or nothing), undo/redo, and refusals that change nothing.
- Tests: a 10×8 m house with one partition gives rooms of 48 m² and 32 m² and an 80 m² floor. Overlap and fit refusals, atomic rollback, dry-run and undo/redo all pass.
- **Next:** IFC4 writer (export → reopen → handover check), plan-drawing tools, live 3D.

### 2.3 BIMja Services (`bimja-services`)

**Website:**
- 8 services, each with 3 tiers. The USD prices are **drafts** in `site/services.json`.
- Live estimate, 50% deposit, and a quote form.

**Lead system (Cloudflare Worker):**
- Leads are stored in the D1 database `bimja-leads` (id `69959f81-e74f-478e-9e75-04f4037534c7`, already created).
- Each lead gets a 0–100 score.
- Owner alert and client auto-reply by email via Resend, plus follow-ups on day 2 and day 5.
- `/admin` dashboard (password) and CSV export.

**Deploy:** GitHub Actions deploys to Cloudflare. The README has the step-by-step for the secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_PASSWORD`, `OWNER_EMAIL`, `RESEND_API_KEY`, `FROM_EMAIL`).

**Not built:** payment button (no Razorpay/PayPal/Stripe account yet) and marketing automation (needs Instagram Business, LinkedIn Page and X accounts).

### 2.4 Money Maker skill

- **Commands:** "Run Money Maker" and "Money Maker status".
- **Loop:** evidence → one priced INR offer → leads → approvals → cash → learn.
- **Engine:** `mm-engine-v1.py` in the Drive folder. It deduplicates by content hash, records payments only from verified records or the user's confirmation, and holds every external action (messages, posts, spend) for approval.
- **First offer (hypothesis):**
  - BIM Model Handover Review pilot at ₹15,000 with a ₹7,500 deposit, 3-day delivery.
  - Continue if there is at least 1 deposit from 3 qualified conversations in 14 days.
  - Stop if there are 0 deposits after 6.
- **Current Drive state:**
  - No real enquiries ingested yet.
  - One open experiment from another session: a Venice "Room Redesigner" Mind.
- **OpenAI clustering:** dry-run until `OPENAI_API_KEY` and `MM_OPENAI_BUDGET_USD` are set on the user's PC. Never paste the key in chat.

---

## 3. Architecture decision (21 Nov)

**Rust engine compiled to WebAssembly, with a TypeScript interface, delivered as one static HTML link.**

| Layer | Tech | Responsibility |
|---|---|---|
| Engine | Rust → WASM | Model and commands, geometry (joins, openings, booleans), IFC read/write, clash (BVH), quantities/5D, 4D data |
| UI | TypeScript + three.js (WebGPU later) | Plan/3D/section views, tools, panels, timeline, dashboards |
| Background work | Web Workers | Heavy jobs off the main thread |
| Storage | OPFS / IndexedDB | Large models kept on the device; nothing uploaded |
| Agents | `window.bimja` + MCP (same engine, native) | People and AI use the same JSON commands |
| Digital twin | Cloudflare Workers + WebSocket/MQTT | Live sensor data mapped to IFC GlobalIds |
| Hosting | Cloudflare Pages | One link; can set COOP/COEP headers for multi-threaded WASM |

**Reuse candidates:**
- **BIMCraft core** (Rust, MIT OR Apache-2.0) for modelling.
- **ifc-lite** (Rust/WASM, MPL-2.0), which already has IDS, BCF, clash and MCP.
- **IfcOpenShell** (LGPL-3.0), run in CI for authoritative clash checks, 4D (`ifc4d`) and 5D (`ifc5d`).
- **DHTMLX Gantt** v10+ Community Edition (MIT) for 4D.
- **Avoid:** xeokit and BIMserver (both AGPL).

The current JS model is the **spec**: the Rust engine must pass the same command tests.

**Roadmap** (each step ships on the live link before the next starts):
1. Repo setup: Rust workspace + TS app + CI (test → Cloudflare deploy).
2. Modelling engine in WASM (port from BIMCraft core).
3. Coordination: clash + BCF issues.
4. IFC export, then 4D timeline and construction animation.
5. 5D cost and asset management.
6. Digital twin.

---

## 4. Third-party code and legal notes (for the user and Jacobs to review)

Recorded so the review has the facts. No decisions were taken here.

- **BIMCraft** (`IPedrax/BIMCraft`, commit `81ebe7f2`, 19 Nov 2026):
  - About 420k lines of Rust, desktop (egui), v0.12.0, about 5 weeks old, with heavy single-author or AI-generated output (inferred).
  - **Licence:** MIT OR Apache-2.0. Keep its copyright notices and NOTICE file if code is reused.
  - **Exceptions:**
    - `crates/rvt` (Revit `.rvt` reader, ported from rvt-rs) is **Apache-2.0 only**. Its own provenance note says nobody verified the legality of reading the format.
    - DWG support uses acadrust (MPL-2.0).
  - **Has:** clash/BCF only on its roadmap; no 4D; no twin; 5D is structural quantities only, with no cost.
  - Read only; nothing was built or run. An attempt to build and run its code was blocked by this session's permissions.
- **Autodesk General Terms (updated 30 Mar 2026):**
  - §13 restricts decompiling and reverse engineering "except as expressly permitted under applicable law".
  - §8.3 limits tools built on Autodesk APIs to internal use without a developer licence.
  - The RVT format is closed. ODA's paid BimRv SDK is the established commercial reader.
- **What Claude will and won't do:**
  - Will: read `.rvt` files the user owns with the existing open-source reader.
  - Won't: decompile Revit itself or copy its code or assets.
  - The user plans to submit this to **Jacobs**, who will choose the route and coordinate with Autodesk.
- **`morluto/rea`:** an MIT reverse-engineering MCP tool with no BIM features. Not used.
- **Sample IFC models:** for testing only; they keep their original terms.
  - KIT AC20-FZK-Haus, from the web-ifc test files.
  - Ifc4_SampleHouse, from `youshengCode/IfcSampleFiles`.

---

## 5. Open items: who needs to do what

| Item | Owner | Notes |
|---|---|---|
| Create the GitHub repo for the platform | **User** | Claude cannot create repos from here. Public allows free GitHub Pages; private needs Cloudflare Pages. Then push `bimja-platform` (2 commits). |
| Create the `bimja-services` repo | **User** | Then push and add the Cloudflare/Resend secrets (see its README). |
| Cloudflare API token + Account ID | **User** | Needed for both deploys. |
| Payment account (Razorpay / PayPal / Stripe) | **User** | For the deposit button. |
| Confirm prices | **User** | The USD service prices and the ₹15,000 pilot are drafts, not market-checked. |
| A test `.rvt` file the user owns | **User** | For the RVT → BIMja milestone. |
| Venice subscription | **User** | On 18 Nov Venice showed a failed payment with 5 days of grace. |
| `OPENAI_API_KEY` + budget on the user's PC | **User** | Only for Money Maker's live clustering. |
| IFC writer → plan tools → 3D | Claude | Next authoring steps. |
| Rust/WASM repo setup | Claude | After the repo exists. |
| Borrow BIMCraft ideas into `window.bimja` | Claude | `dry_run` (already in the authoring core), read-only mode, `render()`, and handover rules as JSON with cited sources. |

---

## 6. How to pick up in a new session

1. Unzip `bimja-handover.zip`. Then:
   ```
   cd bimja-platform && npm ci && npm test && npm run dev
   ```
2. Push to the new repo:
   ```
   git remote add origin <url> && git push -u origin main
   ```
   Then turn on Pages (Settings → Pages → GitHub Actions) or add the Cloudflare secrets.
3. Tell Claude: "Continue BIMja from docs/HANDOVER.md, next step: IFC writer for the authoring core" (or the Rust/WASM setup).
4. Money Maker: say "Money Maker status". The engine and state load from Drive.
