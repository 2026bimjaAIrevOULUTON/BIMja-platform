// The delivery team: BIMja agents named by job title, one per delivery stage, plus a design team led by the
// Architect and specialists that depend on the project type. Pure data and functions (headless, deterministic).

/** Delivery stages, in order (concept to handover). */
export const STAGES = [
  { id: "brief", title: "Brief", lead: "planner", does: "Project set-up, location, client and information requirements (LOIN), team and responsibility matrix" },
  { id: "site", title: "Site", lead: "surveyor", does: "Survey, terrain, city context, sun and climate" },
  { id: "design", title: "Design", lead: "architect", does: "Concept to detailed model, discipline by discipline" },
  { id: "coordinate", title: "Coordinate", lead: "coordinator", does: "Federation, clash detection, issues and approvals" },
  { id: "document", title: "Document", lead: "draftsman", does: "Drawing packs, schedules and deliverables" },
  { id: "construct", title: "Construct", lead: "estimator", does: "4D sequence and 5D cost" },
  { id: "handover", title: "Handover", lead: "asset_manager", does: "Asset information, O&M data and the live twin" },
];

/** Role library. discipline: ISO 19650 role code (A S M E P C L F). stage: where the role works. */
export const ROLES = {
  planner: { title: "Planner", stage: "brief", discipline: null, does: "Sets up the project, location and information requirements; assembles the team" },
  surveyor: { title: "Surveyor", stage: "site", discipline: "L", does: "Survey import, terrain, city context, sun and climate" },
  architect: { title: "Architect", stage: "design", discipline: "A", lead: true, does: "Leads design; architecture, envelope and fit-out" },
  coordinator: { title: "Coordinator", stage: "coordinate", discipline: null, does: "Federates discipline models, runs clashes, manages issues" },
  draftsman: { title: "Draftsman", stage: "document", discipline: null, does: "Produces drawing packs and schedules to the drawing standard" },
  estimator: { title: "Estimator", stage: "construct", discipline: null, does: "Quantities, cost estimate and construction sequence" },
  asset_manager: { title: "Asset Manager", stage: "handover", discipline: null, does: "Asset data (COBie), O&M information and the operational twin" },
  // design team
  structural_engineer: { title: "Structural Engineer", stage: "design", discipline: "S", parent: "architect", does: "Frame, foundations, slabs and stability" },
  mep_engineer: { title: "MEP Engineer", stage: "design", discipline: "M", parent: "architect", does: "Leads building services design" },
  hvac_consultant: { title: "HVAC Consultant", stage: "design", discipline: "M", parent: "mep_engineer", does: "Heating, ventilation, air conditioning and ductwork" },
  plumbing_engineer: { title: "Plumbing Engineer", stage: "design", discipline: "P", parent: "mep_engineer", does: "Water, drainage and public health" },
  electrical_engineer: { title: "Electrical Engineer", stage: "design", discipline: "E", parent: "mep_engineer", does: "Power, lighting, containment and earthing" },
  fire_engineer: { title: "Fire Engineer", stage: "design", discipline: "F", parent: "architect", does: "Fire strategy, compartments, detection and suppression" },
  civil_engineer: { title: "Civil Engineer", stage: "design", discipline: "C", parent: "architect", does: "Roads, kerbs, external drainage and utilities" },
  landscape_architect: { title: "Landscape Architect", stage: "design", discipline: "L", parent: "architect", does: "Landscape, planting and external works" },
  // specialists
  conservation_architect: { title: "Conservation Architect", stage: "design", discipline: "A", parent: "architect", does: "Heritage fabric, ornament and conservation records" },
  process_cooling_engineer: { title: "Process Cooling Engineer", stage: "design", discipline: "M", parent: "mep_engineer", does: "Chilled water, CRAH/CDU and heat rejection for IT load" },
  power_distribution_engineer: { title: "Power Distribution Engineer", stage: "design", discipline: "E", parent: "electrical_engineer", does: "HV/LV, UPS, busways and the single-line diagram" },
  it_whitespace_designer: { title: "IT Whitespace Designer", stage: "design", discipline: "E", parent: "architect", does: "Racks, aisles, containment and cabling routes" },
  fuel_generator_engineer: { title: "Fuel and Generator Engineer", stage: "design", discipline: "M", parent: "mep_engineer", does: "Standby generators, fuel storage and day tanks" },
  controls_engineer: { title: "Controls and BMS Engineer", stage: "design", discipline: "E", parent: "mep_engineer", does: "BMS/EPMS points, sensors and control sequences" },
  commissioning_manager: { title: "Commissioning Manager", stage: "handover", discipline: null, parent: "asset_manager", does: "Integrated systems testing and handover evidence" },
  geotechnical_engineer: { title: "Geotechnical Engineer", stage: "site", discipline: "C", parent: "surveyor", does: "Ground investigation, rock and soil parameters" },
  earthworks_engineer: { title: "Earthworks Engineer", stage: "design", discipline: "C", parent: "civil_engineer", does: "Cut and fill, mass haul and benching" },
  slope_stability_engineer: { title: "Slope Stability Engineer", stage: "design", discipline: "C", parent: "civil_engineer", does: "Slope design, rock bolts and monitoring" },
  drainage_engineer: { title: "Drainage Engineer", stage: "design", discipline: "C", parent: "civil_engineer", does: "Surface water, culverts and attenuation" },
  blasting_specialist: { title: "Blasting Specialist", stage: "construct", discipline: "C", parent: "estimator", does: "Blast design, vibration limits and sequencing" },
  airside_planner: { title: "Airside Planner", stage: "design", discipline: "C", parent: "architect", does: "Stands, taxiways and apron layout" },
  baggage_engineer: { title: "Baggage Handling Engineer", stage: "design", discipline: "M", parent: "mep_engineer", does: "Baggage system routes and plant" },
  wayfinding_designer: { title: "Wayfinding Designer", stage: "design", discipline: "A", parent: "architect", does: "Signage, sightlines and passenger flow" },
  security_planner: { title: "Security Screening Planner", stage: "design", discipline: "A", parent: "architect", does: "Screening zones and segregation" },
  process_engineer: { title: "Process Engineer", stage: "design", discipline: "M", parent: "mep_engineer", does: "Process flow, P&IDs and equipment duties" },
  piping_designer: { title: "Piping Designer", stage: "design", discipline: "M", parent: "process_engineer", does: "Pipe routing, isometrics and spools" },
  instrumentation_engineer: { title: "Instrumentation Engineer", stage: "design", discipline: "E", parent: "process_engineer", does: "Instruments, loops and control panels" },
  lab_services_engineer: { title: "Laboratory Services Engineer", stage: "design", discipline: "M", parent: "mep_engineer", does: "Fume cupboards, gases and lab drainage" },
  acoustic_consultant: { title: "Acoustic Consultant", stage: "design", discipline: "A", parent: "architect", does: "Room acoustics and sound insulation" },
  highway_engineer: { title: "Highway Engineer", stage: "design", discipline: "C", parent: "civil_engineer", does: "Alignment, pavement and junctions" },
};

const CORE = ["planner", "surveyor", "architect", "coordinator", "draftsman", "estimator", "asset_manager"];
const DESIGN = ["structural_engineer", "mep_engineer", "hvac_consultant", "plumbing_engineer", "electrical_engineer", "fire_engineer", "civil_engineer", "landscape_architect"];
/** Project types: the team = core + design team (with exclusions) + specialists. */
export const PROJECT_TYPES = {
  building: { title: "Building", specialists: [] },
  data_centre: { title: "Data centre", specialists: ["process_cooling_engineer", "power_distribution_engineer", "it_whitespace_designer", "fuel_generator_engineer", "controls_engineer", "commissioning_manager"] },
  excavation: { title: "Excavation and earthworks", exclude: ["hvac_consultant", "plumbing_engineer", "mep_engineer", "electrical_engineer", "fire_engineer", "landscape_architect"], specialists: ["geotechnical_engineer", "earthworks_engineer", "slope_stability_engineer", "drainage_engineer", "blasting_specialist"] },
  airport: { title: "Airport", specialists: ["airside_planner", "baggage_engineer", "wayfinding_designer", "security_planner", "commissioning_manager"] },
  process_plant: { title: "Process plant", specialists: ["process_engineer", "piping_designer", "instrumentation_engineer", "commissioning_manager"] },
  institute: { title: "Institute / laboratory", specialists: ["lab_services_engineer", "acoustic_consultant"] },
  infrastructure: { title: "Roads and infrastructure", exclude: ["hvac_consultant", "fire_engineer"], specialists: ["highway_engineer", "drainage_engineer", "geotechnical_engineer"] },
  heritage: { title: "Heritage / landmark study", exclude: ["hvac_consultant", "plumbing_engineer", "electrical_engineer", "fire_engineer"], specialists: ["conservation_architect"] },
};

// Distinct, readable on black; crimson stays the UI accent and is not used for an agent.
const PALETTE = ["#5adcff", "#c8ff3d", "#ffb84d", "#a98bff", "#4dffa6", "#ff7ad9", "#7aa8ff", "#ffd84d", "#59e0c5", "#ff9e7a", "#b7f171", "#c49bff", "#6fd3ff", "#ffc685", "#8df0b0", "#f29bd8", "#9fb8ff", "#e6e07a", "#7fe3e0", "#ffab9c", "#d2ff8a", "#bfa6ff", "#88e6ff", "#ffcf99", "#a3f5c4"];

/** Assemble the team for a project type (deterministic order: stages, then design hierarchy). */
export function assembleTeam(type, { add = [], remove = [] } = {}) {
  const T = PROJECT_TYPES[type]; if (!T) throw Object.assign(new Error(`project type must be one of ${Object.keys(PROJECT_TYPES).join(", ")}`), { code: "bad_arg" });
  for (const r of [...add, ...remove]) if (!ROLES[r]) throw Object.assign(new Error(`unknown role "${r}"; see team {library: true}`), { code: "bad_arg" });
  for (const r of remove) if (CORE.includes(r)) throw Object.assign(new Error(`${ROLES[r].title} leads a delivery stage and cannot be removed`), { code: "bad_arg" });
  const ids = [...new Set([...CORE, ...DESIGN.filter((r) => !(T.exclude || []).includes(r)), ...T.specialists, ...add])].filter((r) => !remove.includes(r));
  const order = STAGES.map((s) => s.id); ids.sort((a, b) => order.indexOf(ROLES[a].stage) - order.indexOf(ROLES[b].stage) || (CORE.includes(b) - CORE.includes(a)) || 0);
  return ids.map((id, i) => ({ id, actor: `agent:${id}`, ...ROLES[id], colour: PALETTE[i % PALETTE.length] }));
}

/** Who models what: an element's discipline -> the team member that owns it (most specific role present). */
export function ownerOf(team, discipline) {
  const by = (d, prefer) => prefer.map((p) => team.find((m) => m.id === p)).find(Boolean) || team.find((m) => m.discipline === d && m.stage === "design");
  switch (discipline) {
    case "S": return by("S", ["structural_engineer"]); case "P": return by("P", ["plumbing_engineer", "mep_engineer"]); case "E": return by("E", ["electrical_engineer", "mep_engineer"]);
    case "M": return by("M", ["hvac_consultant", "mep_engineer"]); case "F": return by("F", ["fire_engineer"]); case "C": return by("C", ["civil_engineer", "earthworks_engineer", "highway_engineer"]);
    case "L": return by("L", ["landscape_architect", "civil_engineer"]); default: return by("A", ["conservation_architect", "architect"]);
  }
}

/** Responsibility matrix (RACI) for the deliverables, from the team. */
export function responsibilityMatrix(team) {
  const has = (id) => team.some((m) => m.id === id); const designers = team.filter((m) => m.stage === "design" && m.discipline);
  const rows = [
    ["Project brief and information requirements (EIR/LOIN)", { planner: "R", architect: "C", asset_manager: "C", coordinator: "I" }],
    ["Survey, terrain and site context", { surveyor: "R", planner: "A", civil_engineer: "C", geotechnical_engineer: "C" }],
    ...[...new Set(designers.map((m) => m.discipline))].sort().map((d) => { const o = designers.filter((m) => m.discipline === d); return [`Discipline model ${d}`, Object.fromEntries([...o.map((m, i) => [m.id, i ? "C" : "R"]), ["architect", d === "A" ? "R" : "A"], ["coordinator", "C"]])]; }),
    ["Federated model and clash resolution", { coordinator: "R", architect: "A", ...Object.fromEntries(designers.map((m) => [m.id, "C"])) }],
    ["Drawing packs and registers", { draftsman: "R", architect: "A", coordinator: "C" }],
    ["4D programme and 5D cost plan", { estimator: "R", planner: "A", coordinator: "C" }],
    ["Asset information model (COBie), O&M and twin", { asset_manager: "R", planner: "A", ...(has("commissioning_manager") ? { commissioning_manager: "C" } : {}), coordinator: "C" }],
  ];
  return { roles: team.map((m) => ({ id: m.id, title: m.title })), rows: rows.map(([deliverable, raci]) => ({ deliverable, raci: Object.fromEntries(Object.entries(raci).filter(([id]) => has(id))) })), legend: { R: "Responsible", A: "Accountable", C: "Consulted", I: "Informed" } };
}
