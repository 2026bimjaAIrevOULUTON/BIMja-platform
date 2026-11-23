// BIMja pilot: a 120 MW (IT) AI factory on a hypothetical 41-acre plot near Shadnagar, Telangana, India.
// Concept sizing and assumed vendors from the site-selection study (22 Nov 2026); LOD 400 geometry (fabrication-level
// families, connections, supports) with LOD 500 data fields carried but marked "Assumed – not field-verified", because
// nothing has been built or surveyed. Not a design for construction.
//
// Layout (site origin = plot SW corner, x east, y north, mm): plot 500 × 330 m. Four 30 MW halls (84 × 48 m), two south
// of the spine road and two north; each hall has 14 IT power blocks (13 + 1 catcher, 2.5 MW) and 4 mechanical blocks in
// electrical bays along its long sides, two GB300 NVL72 pods (4 rows × 28 racks) in the white space, a CDU gallery,
// roof-mounted adiabatic dry coolers and chillers, and an 18-generator yard. 220 kV GIS substation NE (towards the existing
// Shadnagar substation), fuel farm and
// water plant E, operations building at the gate on the west access road.

const AS_BUILT = "Assumed – not field-verified (LOD 500 field)";
const lod = (o) => ({ LOD: 400, AsBuiltStatus: AS_BUILT, ...o });
const box = (dx, dy, dz, x = 0, y = 0, z = 0) => ({ shape: "box", min: [x - dx / 2, y - dy / 2, z], max: [x + dx / 2, y + dy / 2, z + dz] });
const cyl = (r, h, x = 0, y = 0, z = 0) => ({ shape: "revolve", center: [x, y], profile: [[0, z], [r, z], [r, z + h], [0, z + h]] });
const ring = (r, n = 8) => Array.from({ length: n }, (_, k) => { const a = (k * 2 * Math.PI) / n + Math.PI / n; return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]; });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// ---------------------------------------------------------------- families (assumed vendors, see the study)
const FAMILIES = [
  { name: "NVIDIA GB300 NVL72 rack", ifc_class: "IfcFurniture", discipline: "E", layer: "E-WHITESPACE", color: "#2b2f36", material: "Steel",
    parameters: lod({ Manufacturer: "NVIDIA (rack integrator Dell)", Model: "GB300 NVL72", GPUs: 72, Nameplate_kW: 136, Liquid_kW: 116, Air_kW: 19.3 }),
    parts: [box(1200, 600, 60, 0, 0, 0), box(60, 60, 2236, -570, -270, 0), box(60, 60, 2236, 570, -270, 0), box(60, 60, 2236, -570, 270, 0), box(60, 60, 2236, 570, 270, 0),
      box(1080, 540, 820, 0, 0, 120), box(1080, 540, 300, 0, 0, 960), box(1080, 540, 820, 0, 0, 1280), box(1080, 540, 120, 0, 0, 2116),
      box(20, 560, 2100, -615, 0, 80), box(70, 70, 2050, 560, -200, 100), box(70, 70, 2050, 560, 200, 100), box(1200, 600, 40, 0, 0, 2236)] },
  { name: "Vertiv CoolChip CDU 2300kW", ifc_class: "IfcHeatExchanger", discipline: "M", layer: "M-CDU", color: "#7fb4d9", material: "Steel",
    parameters: lod({ Manufacturer: "Vertiv", Model: "CoolChip CDU 2300kW", Capacity_kW: 2300, Approach_K: 4, Facility_class: "ASHRAE W45" }),
    parts: [box(1200, 1200, 2400), box(400, 20, 500, 0, -610, 1500), cyl(120, 300, -350, 0, 2400), cyl(120, 300, 350, 0, 2400), cyl(80, 300, -350, 400, 2400), cyl(80, 300, 350, 400, 2400)] },
  { name: "Pre-action valve set DN150", ifc_class: "IfcValve", discipline: "F", layer: "F-SPRINKLER", color: "#c8102e", material: "Ductile iron",
    parameters: lod({ Manufacturer: "to confirm (UL / FM listed)", Model: "Double-interlock pre-action valve set DN150" }), parts: [box(1600, 1200, 1800)] },
  { name: "Network rack 14 kW", ifc_class: "IfcFurniture", discipline: "E", layer: "E-WHITESPACE", color: "#3b4048", material: "Steel",
    parameters: lod({ Manufacturer: "to confirm", Model: "42U network / storage rack, air-cooled", Nameplate_kW: 14, Feed: "2N from busways A/C or B/D" }), parts: [box(1200, 600, 2286)] },
  { name: "Thermax adiabatic dry cooler 1.4 MW", ifc_class: "IfcCoolingTower", discipline: "M", layer: "M-HEATREJECTION", color: "#9aa7b4", material: "Galvanised steel",
    parameters: lod({ Manufacturer: "Thermax", Model: "Adiabatic dry cooler (to confirm)", Capacity_kW: 1400, Facility_water: "36/46 °C", Note: "Capacity at 42 °C DB / 24 °C WB to be confirmed by the vendor" }),
    parts: [box(2400, 11000, 400), box(300, 10600, 1800, -900, 0, 400), box(300, 10600, 1800, 900, 0, 400), box(2400, 11000, 120, 0, 0, 2200),
      ...[-4100, -1400, 1400, 4100].map((y) => cyl(900, 450, 0, y, 2320))] },
  { name: "Air-cooled free-cooling chiller 1500 kW", ifc_class: "IfcChiller", discipline: "M", layer: "M-PLANT", color: "#8fb8cf", material: "Steel",
    parameters: lod({ Manufacturer: "Blue Star", Model: "Air-cooled screw chiller with free cooling (to confirm)", Cooling_kW: 1500, CHW: "23/33 °C" }),
    parts: [box(2400, 11000, 2500), ...[-4000, -1350, 1350, 4000].map((y) => cyl(900, 250, 0, y, 2500))] },
  { name: "Fan wall 450 kW", ifc_class: "IfcUnitaryEquipment", discipline: "M", layer: "M-AIR", color: "#a8c5da", material: "Steel",
    parameters: lod({ Manufacturer: "to confirm", Model: "Chilled-water fan wall module", Cooling_kW: 450, Supply_air_C: 28 }), parts: [box(5000, 2000, 4000)] },
  { name: "FWS pump 160 L/s", ifc_class: "IfcPump", discipline: "M", layer: "M-PUMP", color: "#5a7fa8", material: "Cast iron",
    parameters: lod({ Manufacturer: "Kirloskar Brothers (to confirm)", Model: "End-suction, VFD", Flow_Ls: 160 }), parts: [box(1100, 2600, 1400)] },
  { name: "CHW pump 82 L/s", ifc_class: "IfcPump", discipline: "M", layer: "M-PUMP", color: "#5a9fb8", material: "Cast iron",
    parameters: lod({ Manufacturer: "Kirloskar Brothers (to confirm)", Model: "End-suction, VFD", Flow_Ls: 82 }), parts: [box(900, 2000, 1200)] },
  { name: "Buffer tank 100 m³", ifc_class: "IfcTank", discipline: "M", layer: "M-PLANT", color: "#9fb4c4", material: "Steel", parameters: lod({ Capacity_m3: 100, Fluid: "Facility water", Purpose: "5 min ride-through" }), parts: [cyl(2700, 4500)] },
  { name: "Buffer tank 25 m³", ifc_class: "IfcTank", discipline: "M", layer: "M-PLANT", color: "#9fb4c4", material: "Steel", parameters: lod({ Capacity_m3: 25, Fluid: "Chilled water" }), parts: [cyl(1600, 3200)] },
  { name: "Voltamp 2500 kVA ONAN transformer", ifc_class: "IfcTransformer", discipline: "E", layer: "E-POWERBLOCK", color: "#f2c27a", material: "Steel",
    parameters: lod({ Manufacturer: "Voltamp", Model: "Oil-immersed ONAN 33/0.433 kV Dyn11 (to confirm)", Rating_kVA: 2500, Impedance_pct: 6 }), parts: [box(2400, 2600, 2400), box(2200, 600, 500, 0, 600, 2400)] },
  { name: "UPS 2000 kVA lithium-ion", ifc_class: "IfcElectricFlowStorageDevice", discipline: "E", layer: "E-POWERBLOCK", color: "#d9a54a", material: "Steel",
    parameters: lod({ Manufacturer: "to confirm (Schneider Electric / Vertiv)", Model: "Modular UPS with Li-ion, ≥ 5 min", Rating_kVA: 2000 }), parts: [box(1200, 4800, 2000)] },
  { name: "UPS 1000 kVA lithium-ion", ifc_class: "IfcElectricFlowStorageDevice", discipline: "E", layer: "E-POWERBLOCK", color: "#d9a54a", material: "Steel",
    parameters: lod({ Manufacturer: "to confirm", Model: "Mechanical-load UPS, Li-ion", Rating_kVA: 1000 }), parts: [box(1200, 3600, 2000)] },
  { name: "Li-ion battery cabinets", ifc_class: "IfcElectricFlowStorageDevice", discipline: "E", layer: "E-POWERBLOCK", color: "#c98f3a", material: "Steel",
    parameters: lod({ Manufacturer: "to confirm", Model: "Li-ion battery string for a 2000 kVA UPS", Runtime_min: 5 }), parts: [box(600, 5400, 2000)] },
  { name: "LV main switchboard 4000 A", ifc_class: "IfcElectricDistributionBoard", discipline: "E", layer: "E-POWERBLOCK", color: "#e8b86a", material: "Steel",
    parameters: lod({ Manufacturer: "Schneider Electric", Model: "Okken (to confirm)", Rating_A: 4000, Fault_kA: 65 }), parts: [box(1200, 6400, 2200)] },
  { name: "Output board 3200 A", ifc_class: "IfcElectricDistributionBoard", discipline: "E", layer: "E-POWERBLOCK", color: "#e8b86a", material: "Steel",
    parameters: lod({ Manufacturer: "to confirm", Model: "UPS output board, 4 × 800 A busway feeders + 2 spare", Rating_A: 3200 }), parts: [box(1200, 3200, 2200)] },
  { name: "33 kV switchboard", ifc_class: "IfcElectricDistributionBoard", discipline: "E", layer: "E-MV", color: "#e0a040", material: "Steel",
    parameters: lod({ Manufacturer: "Schneider Electric", Model: "SF6-free 33 kV switchgear", Panels: 24 }), parts: [box(16000, 1600, 2400)] },
  { name: "Cummins 2500 kVA containerised generator", ifc_class: "IfcElectricGenerator", discipline: "E", layer: "E-GENERATOR", color: "#c4c9cf", material: "Steel",
    parameters: lod({ Manufacturer: "Cummins India", Model: "2500 kVA, 415 V containerised (to confirm)", Rating_kVA: 2500, Emissions: "CPCB IV+", Belly_tank_m3: 12 }),
    parts: [box(2900, 12200, 600), box(2900, 12200, 2900, 0, 0, 600), box(2300, 2200, 900, 0, 4800, 3500), cyl(250, 2600, 0, -4500, 3500)] },
  { name: "CG Power 63 MVA 220/33 kV transformer", ifc_class: "IfcTransformer", discipline: "E", layer: "E-HV", color: "#8d9aa6", material: "Steel",
    parameters: lod({ Manufacturer: "CG Power", Model: "ONAN/ONAF 220/33 kV", Rating_MVA: 63 }),
    parts: [box(7000, 4000, 4500), box(1200, 4000, 3800, -4400, 0, 300), box(1200, 4000, 3800, 4400, 0, 300), box(5000, 1000, 1000, 0, -1500, 5200),
      ...[-1500, 0, 1500].map((x) => cyl(220, 2600, x, 800, 4500))] },
  { name: "Hyosung 220 kV GIS bay", ifc_class: "IfcSwitchingDevice", discipline: "E", layer: "E-HV", color: "#9bb0c1", material: "Aluminium",
    parameters: lod({ Manufacturer: "Hyosung T&D India", Model: "220 kV GIS bay (to confirm)" }), parts: [box(2200, 6000, 4200), cyl(350, 1500, 0, -2000, 4200)] },
  { name: "Butterfly valve DN200", ifc_class: "IfcValve", discipline: "M", layer: "M-VALVE", color: "#24486e", material: "Ductile iron",
    parameters: lod({ Manufacturer: "to confirm", Model: "Lugged butterfly valve, gear operated", DN: 200, PN: 16 }), parts: [box(300, 300, 300), cyl(60, 250, 0, 0, 300)] },
  { name: "Fuel tank 300 kL", ifc_class: "IfcTank", discipline: "M", layer: "M-FUEL", color: "#b9b39a", material: "Steel",
    parameters: lod({ Capacity_kL: 300, Fluid: "HSD diesel" }), parts: [cyl(4200, 6000), cyl(4400, 300, 0, 0, -300)] },
  { name: "Treated water tank 1 ML", ifc_class: "IfcTank", discipline: "P", layer: "P-WATER", color: "#a9c7d6", material: "Concrete",
    parameters: lod({ Capacity_kL: 1000, Fluid: "Recycled (treated) water" }), parts: [cyl(7500, 6000)] },
  { name: "Kirloskar fire pump set", ifc_class: "IfcPump", discipline: "F", layer: "F-PUMP", color: "#d0021b", material: "Cast iron",
    parameters: lod({ Manufacturer: "Kirloskar Brothers", Model: "Fire pump set (to confirm)", Flow_m3h: 410 }), parts: [box(3000, 1200, 1300)] },
  { name: "Tree, native", ifc_class: "IfcGeographicElement", discipline: "L", layer: "L-PLANT", color: "#4f7f3a", material: "Vegetation",
    parameters: { Species: "Neem / Pongamia (to confirm)" }, parts: [cyl(180, 2500), { shape: "revolve", center: [0, 0], profile: [[0, 2000], [2600, 3400], [2200, 5200], [0, 6600]] }] },
];

// ---------------------------------------------------------------- helpers that emit commands
function build() {
  const c = []; const fam = (f) => c.push({ name: "family", args: f });
  const mass = (name, outline, base, height, ifc_class, discipline, layer, color, extra = {}, owner) => c.push({ name: "mass", owner, args: { name, outline, base, height, ifc_class, discipline, layer, color, material: extra.material || "Concrete", ...extra } });
  const place = (family, x, y, z, mark, owner, rot = 0, extra = {}) => c.push({ name: "place", owner, as: mark.replace(/[^\w]/g, "_"), args: { family, at: [x, y, z], mark, ...(rot ? { rotation_deg: rot } : {}), ...extra } });
  const sweep = (name, system, profile, path, ifc_class, discipline, layer, color, owner, material = "Steel") => c.push({ name: "sweep", owner, args: { name, ...(system ? { system } : {}), profile, path, ifc_class, discipline, layer, color, material } });
  const pipe = (name, system, r, path, discipline, layer, color, owner) => sweep(name, system, ring(r), path, "IfcPipeSegment", discipline, layer, color, owner);
  const connect = (from, to, medium, rating, label) => c.push({ name: "connect", args: { from: `$${from.replace(/[^\w]/g, "_")}`, to: `$${to.replace(/[^\w]/g, "_")}`, medium, ...(rating ? { rating } : {}), ...(label ? { label } : {}) } });
  FAMILIES.forEach(fam);

  // ---- civil: plot, roads, kerbs, fence, landscape
  const W = 520000, H = 330000;
  mass("Site hardstanding and fill", rect(0, 0, W, H), -600, 450, "IfcSlab", "C", "C-EARTHWORKS", "#cbbf9f", { material: "Compacted murrum" }, "civil_engineer");
  const road = (name, x0, y0, x1, y1) => { mass(name, rect(x0, y0, x1, y1), -150, 150, "IfcSlab", "C", "C-ROAD", "#55585c", { material: "Asphalt" }, "civil_engineer");
    const kerb = (p) => sweep(`${name} kerb`, "", [[-75, 0], [75, 0], [75, 150], [-75, 150]], p, "IfcBuildingElementProxy", "C", "C-KERB", "#bdbdbd", "civil_engineer", "Concrete");
    if (x1 - x0 > y1 - y0) { kerb([[x0, y0, 0], [x1, y0, 0]]); kerb([[x0, y1, 0], [x1, y1, 0]]); } else { kerb([[x0, y0, 0], [x0, y1, 0]]); kerb([[x1, y0, 0], [x1, y1, 0]]); } };
  road("Spine road", 0, 158000, 510000, 166000); road("Ring road south", 10000, 10000, 510000, 18000); road("Ring road north", 10000, 312000, 510000, 320000);
  road("Ring road west", 10000, 18000, 18000, 312000); road("Ring road east", 502000, 18000, 510000, 312000);
  road("Hall link road", 194000, 18000, 202000, 312000);
  road("Access road from the west", -40000, 156000, 0, 168000);
  mass("Gatehouse", rect(4000, 170000, 14000, 178000), 0, 3500, "IfcBuildingElementProxy", "A", "A-BUILDING", "#e4e1da", {}, "architect");
  const fence = (p) => sweep("Boundary fence 3 m", "", [[-40, 0], [40, 0], [40, 3000], [-40, 3000]], p, "IfcRailing", "C", "C-FENCE", "#6b6b6b", "civil_engineer");
  fence([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], [0, 170000, 0]]); fence([[0, 154000, 0], [0, 0, 0]]);
  for (let i = 0; i < 14; i++) place("Tree, native", 4000, 20000 + i * 8000 + (i >= 13 ? 0 : 0), 0, `TR-${String(i + 1).padStart(2, "0")}`, "landscape_architect");
  for (let i = 0; i < 12; i++) place("Tree, native", 30000 + i * 38000, 4000, 0, `TR-${String(i + 15).padStart(2, "0")}`, "landscape_architect");
  pipe("Storm drain trunk", "SW-01", 450, [[20000, 24000, -1200], [480000, 24000, -1500]], "P", "P-STORM", "#4d7a96", "drainage_engineer");

  // ---- 220 kV substation (NE corner, facing the existing Shadnagar substation ~400 m north-east) and campus MV
  c.push({ name: "zone", owner: "planner", args: { name: "220 kV substation", code: "SS", outline: rect(390000, 232000, 488000, 322000) } });
  c.push({ name: "zone", owner: "planner", args: { name: "Utilities yard", code: "UT", outline: rect(415000, 25000, 490000, 180000) } });
  mass("220 kV GIS building", rect(442000, 278000, 482000, 296000), 0, 13000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#d7d3cb", {}, "architect");
  for (let i = 0; i < 7; i++) place("Hyosung 220 kV GIS bay", 446500 + i * 5000, 287000, 0, i ? `GIS-${i + 1}` : "GIS-220", "power_distribution_engineer");
  for (let i = 0; i < 4; i++) { place("CG Power 63 MVA 220/33 kV transformer", 402000 + i * 16000, 264000, 0, `TX-${i + 1}`, "power_distribution_engineer");
    if (i < 3) mass(`Transformer fire wall ${i + 1}`, rect(409500 + i * 16000, 259000, 410000 + i * 16000, 269000), 0, 7000, "IfcWall", "A", "A-FIREWALL", "#cfcac0", { params: { FireRating: 120 } }, "fire_engineer"); }
  for (let i = 0; i < 4; i++) sweep(`220 kV line gantry ${i + 1}`, "HV", [[-200, -200], [200, -200], [200, 200], [-200, 200]], [[449000 + i * 9000, 298000, 0], [449000 + i * 9000, 298000, 14000], [449000 + i * 9000, 318000, 14000]], "IfcMember", "E", "E-HV", "#9aa3ad", "power_distribution_engineer");
  mass("33 kV main switchroom", rect(396000, 238000, 456000, 250000), 0, 6000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#ddd8cf", {}, "architect");
  place("33 kV switchboard", 426000, 244000, 0, "MSB-33", "power_distribution_engineer");
  mass("Operations and NOC building", rect(380000, 186000, 410000, 206000), 0, 12000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#e9e6df", {}, "architect");
  const trench = (name, path) => sweep(name, "MV-33", [[-600, -600], [600, -600], [600, 0], [-600, 0]], path, "IfcCableCarrierSegment", "E", "E-CONTAINMENT", "#e0a428", "power_distribution_engineer", "Concrete");
  trench("33 kV cable trench, campus", [[400000, 238000, -300], [400000, 162000, -300], [30000, 162000, -300]]);
  for (let i = 0; i < 4; i++) { connect("GIS-220", `TX-${i + 1}`, "power", "220 kV"); connect(`TX-${i + 1}`, "MSB-33", "power", "63 MVA"); }

  // ---- utilities (E): fuel farm, water plant, fire pumps
  for (let i = 0; i < 4; i++) place("Fuel tank 300 kL", 430000 + (i % 2) * 14000, 150000 + Math.floor(i / 2) * 14000, 0, `FT-${i + 1}`, "fuel_generator_engineer");
  mass("Fuel farm bund", rect(420000, 140000, 454000, 174000), 0, 1200, "IfcWall", "C", "C-BUND", "#c9c3b4", {}, "civil_engineer");
  pipe("Fuel ring main", "FUEL-01", 60, [[437000, 140000, -800], [437000, 152000, -800], [22000, 152000, -800], [22000, 24000, -800], [400000, 24000, -800]], "M", "M-FUEL", "#8a6d2b", "fuel_generator_engineer");
  for (let i = 0; i < 2; i++) place("Treated water tank 1 ML", 430000 + i * 20000, 60000, 0, `WT-${i + 1}`, "plumbing_engineer");
  mass("Water treatment and pump house", rect(420000, 30000, 470000, 44000), 0, 6000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#ddd8cf", {}, "architect");
  for (let i = 0; i < 3; i++) place("Kirloskar fire pump set", 426000 + i * 5000, 37000, 0, `FP-${i + 1}`, "fire_engineer");
  pipe("Fire main ring", "FH-01", 110, [[425000, 46000, -900], [425000, 154000, -900], [24000, 154000, -900], [24000, 304000, -900], [380000, 304000, -900]], "F", "F-HYDRANT", "#d0021b", "fire_engineer");
  pipe("Treated water main", "TW-01", 160, [[440000, 52000, -1100], [400000, 156000, -1100], [60000, 156000, -1100]], "P", "P-WATER", "#2f7fd8", "plumbing_engineer");

  // ---- four data halls, each a single-bank hall between an electrical gallery (south) and a mechanical gallery (north).
  // Planning rules from the AI data hall study (NVIDIA DSX / GB300 reference designs, Vertiv RD028/RD030, Schneider RD108,
  // OCP ODC 0.7): ≤ 8 GPU racks per row, two rows per pod around a contained hot aisle, pods at a 7.3 m pitch, 4N/3 power
  // (4 × 800 A busways per row), CDUs 1 + 1 per pod in the gallery, pipes sized from flow (1.5 L/min/kW, ≤ 2.1 m/s).
  // Hall frame: u along the hall (site x, grids 1–20 every 7.3 m), v across it (site y, grids A–G).
  const HALLS = [{ k: "A", ox: 50000, oy: 80000 }, { k: "B", ox: 230000, oy: 80000 }, { k: "C", ox: 50000, oy: 228000 }, { k: "D", ox: 230000, oy: 228000 }];
  c.push({ name: "type", owner: "architect", args: { kind: "wall", name: "Precast 300", thickness: 300, isExternal: true, loadBearing: false, material: "Insulated precast concrete" } });
  c.push({ name: "type", owner: "fire_engineer", args: { kind: "wall", name: "Fire wall 300 EI120", thickness: 300, isExternal: false, loadBearing: false, fireRating: "EI 120", material: "Precast concrete" } });
  c.push({ name: "type", owner: "fire_engineer", args: { kind: "wall", name: "Blockwork 200 EI120", thickness: 200, isExternal: false, loadBearing: false, fireRating: "EI 120", material: "Concrete blockwork" } });
  c.push({ name: "type", owner: "architect", args: { kind: "door", name: "Double 1800x2400", width: 1800, height: 2400, fireRating: "None", operation: "DOUBLE_DOOR_SINGLE_SWING", material: "Steel" } });
  c.push({ name: "type", owner: "fire_engineer", args: { kind: "door", name: "Fire door double 1800x2400", width: 1800, height: 2400, fireRating: "120 min", operation: "DOUBLE_DOOR_SINGLE_SWING", material: "Steel" } });
  c.push({ name: "type", owner: "fire_engineer", args: { kind: "door", name: "Fire door 1200x2400", width: 1200, height: 2400, fireRating: "120 min", operation: "SINGLE_SWING_LEFT", material: "Steel" } });
  c.push({ name: "type", owner: "architect", args: { kind: "door", name: "Equipment door 2400x3000", width: 2400, height: 3000, fireRating: "120 min", operation: "DOUBLE_DOOR_SINGLE_SWING", material: "Steel" } });
  c.push({ name: "type", owner: "architect", args: { kind: "door", name: "Roller shutter 3000x3600", width: 3000, height: 3600, fireRating: "None", operation: "ROLLINGUP", material: "Steel" } });
  for (const h of HALLS) hall(h);
  function hall({ k, ox, oy }) {
    const X = (u) => ox + u, Y = (v) => oy + v, P2 = (u, v) => [X(u), Y(v)], R = (u0, v0, u1, v1) => rect(X(u0), Y(v0), X(u1), Y(v1));
    const L = 138700, D = 55600, MID = 69350, PIT = 7300, HT = 10500, ROOF = 9000;
    const A = "architect", S = "structural_engineer", EE = "power_distribution_engineer", EL = "electrical_engineer", PC = "process_cooling_engineer", HV = "hvac_consultant", WS = "it_whitespace_designer";
    const gU = (n) => (n - 1) * PIT; const yk = (p) => 14600 + PIT * p; // grid n; pod p (1–14) hot-aisle centreline, on grid p + 3
    const z2 = (n) => String(n).padStart(2, "0");
    // zones: the hall with its yards, and the two halves its 1:100 plans are split into (matchline in the cold aisle between pods 7 and 8)
    c.push({ name: "zone", owner: "planner", args: { name: `Hall ${k}`, code: `H${k}`, outline: R(-26000, -55000, 142000, 72000) } });
    c.push({ name: "zone", owner: "planner", args: { name: `Hall ${k} part 1 (grids 1–10)`, code: `H${k}1`, parent: `H${k}`, outline: R(-3000, -3000, MID, 58600) } });
    c.push({ name: "zone", owner: "planner", args: { name: `Hall ${k} part 2 (grids 11–20)`, code: `H${k}2`, parent: `H${k}`, outline: R(MID, -3000, 141700, 58600) } });
    c.push({ name: "zone", owner: "planner", args: { name: `Hall ${k} yards`, code: `H${k}Y`, parent: `H${k}`, outline: R(-26000, -55000, 142000, 0) } });
    // structure: slab on grade, roof deck at +9.00, columns on the numbered grids at lines A, C, E, F, G
    mass(`Hall ${k} ground slab`, R(-150, -150, L + 150, D + 150), -300, 300, "IfcSlab", "S", "S-SLAB", "#c9c6bf", {}, S);
    mass(`Hall ${k} roof deck`, R(-150, -150, L + 150, D + 150), ROOF, 300, "IfcSlab", "S", "S-SLAB", "#c9c6bf", {}, S);
    for (let n = 1; n <= 20; n++) c.push({ name: "grid", owner: S, args: { name: String(n), zone: `H${k}`, start: P2(gU(n), -3000), end: P2(gU(n), D + 3000) } });
    const LET = [["A", 0], ["B", 10000], ["C", 20000], ["D", 26000], ["E", 29000], ["F", 43600], ["G", D]];
    for (const [n, v] of LET) c.push({ name: "grid", owner: S, args: { name: n, zone: `H${k}`, start: P2(-3000, v), end: P2(L + 3000, v) } });
    for (let n = 1; n <= 20; n++) for (const v of [0, 20000, 29000, 43600, D]) { const u = gU(n); mass(`Hall ${k} column ${n}/${LET.find((q) => q[1] === v)[0]}`, R(u - 250, v - 250, u + 250, v + 250), 0, ROOF, "IfcColumn", "S", "S-COLUMN", "#b7b2a8", { material: "Steel" }, S); }
    // walls (centrelines on the grids); long walls break at the matchline so each sheet part holds whole walls
    let wn = 0; const wall = (name, a, b, type = "Fire wall 300 EI120", as = null) => { const id = as || `W${++wn}`; c.push({ name: "wall", owner: /Fire|Block/.test(type) ? "fire_engineer" : A, as: `${k}_${id}`, args: { name: `Hall ${k} ${name}`, start: P2(...a), end: P2(...b), type, height: HT } }); return id; };
    let dn = 0; const door = (w, offset, type) => c.push({ name: "door", owner: A, args: { wall: `$${k}_${w}`, offset, type, mark: `${k}-D${String(++dn).padStart(3, "0")}` } });
    const room = (name, number, u0, v0, u1, v1) => c.push({ name: "room", owner: A, args: { name, number, boundary: R(u0, v0, u1, v1) } });
    const ext = "Precast 300";
    const WS1 = wall("south facade 1", [0, 0], [MID, 0], ext, "WS1"), WS2 = wall("south facade 2", [MID, 0], [L, 0], ext, "WS2");
    const WN1 = wall("north facade 1", [0, D], [MID, D], ext, "WN1"), WN2 = wall("north facade 2", [MID, D], [L, D], ext, "WN2");
    wall("west facade", [0, 0], [0, D], ext, "WW"); wall("east facade", [L, 0], [L, D], ext, "WE");
    // south service block (grids 1–3): mechanical switchrooms, fire and water, pump room; south corridor
    wall("south corridor", [11600, 0], [11600, D], "Fire wall 300 EI120", "SC");
    for (const v of [14500, 29000, 43600]) wall(`south block divider ${v / 1000}`, [0, v], [11600, v], "Blockwork 200 EI120");
    wall("hall end south, gallery E", [14600, 0], [14600, 29000], "Fire wall 300 EI120", "S1"); wall("hall end south", [14600, 29000], [14600, 43600], "Fire wall 300 EI120", "SH"); wall("hall end south, gallery M", [14600, 43600], [14600, D], "Fire wall 300 EI120", "SM");
    // north back-of-house block (grids 18–20)
    wall("hall end north, gallery E", [124100, 0], [124100, 29000], "Fire wall 300 EI120", "N1"); wall("hall end north", [124100, 29000], [124100, 43600], "Fire wall 300 EI120", "NH"); wall("hall end north, gallery M", [124100, 43600], [124100, D], "Fire wall 300 EI120", "NM");
    wall("back-of-house corridor", [128100, 0], [128100, D], "Blockwork 200 EI120", "BC");
    for (const v of [7300, 14600, 22000, 37000]) wall(`north block divider ${v / 1000}`, [128100, v], [L, v], "Blockwork 200 EI120");
    // electrical gallery: corridor and hall wall, 28 line rooms (3.65 m slots) with their battery rooms
    wall("data hall, gallery side 1", [14600, 29000], [MID, 29000], "Fire wall 300 EI120", "EH1"); wall("data hall, gallery side 2", [MID, 29000], [124100, 29000], "Fire wall 300 EI120", "EH2");
    wall("gallery corridor 1", [14600, 26000], [MID, 26000], "Blockwork 200 EI120", "EC1"); wall("gallery corridor 2", [MID, 26000], [124100, 26000], "Blockwork 200 EI120", "EC2");
    for (let j = 0; j <= 28; j++) { const u = 18250 + 3650 * j; wall(`line room wall ${j}`, [u, 0], [u, 26000], "Blockwork 200 EI120"); }
    // mechanical gallery wall: 2.3 m panels on the grid lines between the fan walls; exit passages at grids 6, 10, 14
    for (let n = 3; n <= 18; n++) { const u = gU(n); const id = wall(`mechanical gallery panel ${n}`, [Math.max(14600, u - 1150), 43600], [Math.min(124100, u + 1150), 43600], "Fire wall 300 EI120", `MP${n}`);
      if ([6, 10, 14].includes(n)) door(id, 1150, "Fire door 1200x2400"); }
    for (const n of [6, 10, 14]) { const u = gU(n); wall(`exit passage ${n} west`, [u - 1300, 43600], [u - 1300, D], "Blockwork 200 EI120"); wall(`exit passage ${n} east`, [u + 1300, 43600], [u + 1300, D], "Blockwork 200 EI120"); // 2.4 m clear; the pod's TCS headers run overhead
      door(u < MID ? WN1 : WN2, u < MID ? u : u - MID, "Fire door 1200x2400"); }
    // rooms
    room("Mech switchroom MA", `${k}.01`, 150, 150, 11450, 14400); room("Mech switchroom MB", `${k}.02`, 150, 14600, 11450, 28900); room("Fire and water services", `${k}.03`, 150, 29100, 11450, 43500); room("FWS and CHW pumps", `${k}.04`, 150, 43700, 11450, D - 150);
    room("South corridor", `${k}.05`, 11750, 150, 14450, D - 150); room("Data hall", `${k}.10`, 14750, 29150, 123950, 43450); room("Gallery corridor", `${k}.13`, 14750, 26100, 123950, 28850);
    room("Mechanical gallery", `${k}.20`, 14750, 43750, 123950, D - 150);
    room("Back-of-house corridor", `${k}.30`, 124250, 150, 128000, D - 150); room("MMR A", `${k}.31`, 128200, 150, L - 150, 7200); room("MMR B", `${k}.32`, 128200, 7400, L - 150, 14500);
    room("NOC and security", `${k}.33`, 128200, 14700, L - 150, 21900); room("Receiving and dock", `${k}.34`, 128200, 22100, L - 150, 36900); room("Staging and unpack", `${k}.35`, 128200, 37100, L - 150, D - 150);
    room("Gallery stair", `${k}.11`, 14750, 150, 18150, 25900); room("Gallery spare", `${k}.12`, 120550, 150, 123950, 25900);
    // doors: exits, equipment route, dock
    door(WS1, 13100, "Double 1800x2400"); door(WN1, 13100, "Double 1800x2400"); door(WS2, 126100 - MID, "Double 1800x2400"); door(WN2, 126100 - MID, "Double 1800x2400");
    door("SH", 2000, "Fire door 1200x2400"); door("SH", 12600, "Fire door 1200x2400");            // data hall exits to the south corridor
    door("NH", 2075, "Equipment door 2400x3000"); door("NH", 12525, "Equipment door 2400x3000"); // equipment route from receiving, at both end zones
    door("S1", 27500, "Fire door 1200x2400"); door("N1", 27500, "Fire door 1200x2400"); door("SM", 4500, "Fire door 1200x2400"); door("NM", 4500, "Fire door 1200x2400");
    for (const v of [7250, 21750, 36300, 49600]) door("SC", v, "Double 1800x2400");
    for (const v of [3650, 10950, 18300, 29500, 46300]) door("BC", v, "Double 1800x2400");
    door("WE", 25000, "Roller shutter 3000x3600"); door("WE", 32000, "Roller shutter 3000x3600");

    // ---- electrical: 7 blocks × lines A–D (4N/3). Line room: MSB, UPS, output board along the west wall, battery room at the inboard end
    const SRC = ["A", "B", "C", "D"];
    for (let b = 1; b <= 7; b++) SRC.forEach((s, si) => { const s0 = 18250 + 3650 * (4 * (b - 1) + si), id = `L${b}${s}`, uc = s0 + 1825;
      room("Line room", id, s0 + 100, 100, s0 + 3550, 19900); room("Battery", `${id}.B`, s0 + 100, 20100, s0 + 2150, 25900);
      const bw = wall(`battery room ${id}`, [s0, 20000], [s0 + 2250, 20000], "Blockwork 200 EI120"); const bs = wall(`battery room ${id} side`, [s0 + 2250, 20000], [s0 + 2250, 26000], "Blockwork 200 EI120");
      door(bs, 3000, "Fire door 1200x2400"); door(s0 + 2450 < MID ? WS1 : WS2, s0 + 2450 < MID ? s0 + 2450 : s0 + 2450 - MID, "Double 1800x2400"); door(s0 + 2950 < MID ? "EC1" : "EC2", s0 + 2950 < MID ? s0 + 2950 - 14600 : s0 + 2950 - MID, "Fire door 1200x2400");
      place("LV main switchboard 4000 A", X(s0 + 750), Y(4400), 0, `${k}-MSB-${id}`, EE);
      place("UPS 2000 kVA lithium-ion", X(s0 + 750), Y(11200), 0, `${k}-UPS-${id}`, EL);
      place("Output board 3200 A", X(s0 + 750), Y(16400), 0, `${k}-OB-${id}`, EL);
      place("Li-ion battery cabinets", X(s0 + 450), Y(23000), 0, `${k}-BAT-${id}`, EL);
      // yard: transformer on its bunded plinth between fire walls, generator in the yard columns (A/B west column, C/D east)
      place("Voltamp 2500 kVA ONAN transformer", X(uc), Y(-5000), 0, `${k}-TX-${id}`, EE);
      const gcol = si === 0 || si === 1 ? -22100 : -40300, gn = 4 + 2 * (b - 1) + (si === 1 || si === 3 ? 1 : 0);
      place("Cummins 2500 kVA containerised generator", X(gU(gn)), Y(gcol), 0, `${k}-GEN-${id}`, "fuel_generator_engineer");
      if (k === "A" && b === 1) { connect(`${k}-TX-${id}`, `${k}-MSB-${id}`, "power", "2.5 MVA"); connect(`${k}-GEN-${id}`, `${k}-MSB-${id}`, "power", "2.5 MVA standby"); connect(`${k}-MSB-${id}`, `${k}-UPS-${id}`, "power", "2000 kVA"); connect(`${k}-UPS-${id}`, `${k}-OB-${id}`, "power", "3200 A"); } });
    for (let j = 0; j <= 28; j++) mass(`Hall ${k} transformer fire wall ${j}`, R(18250 + 3650 * j - 125, -10000, 18250 + 3650 * j + 125, -500), 0, 4000, "IfcWall", "A", "A-FIREWALL", "#cfcac0", { params: { FireRating: 120 } }, "fire_engineer");
    // mechanical power, 2N (MA / MB): switchboards and UPS in the south block, transformers and generators in the yard
    for (const [i, side] of ["MA", "MB"].entries()) { const v0 = i ? 14500 : 0;
      for (const n of [1, 2]) { place("LV main switchboard 4000 A", X(1050), Y(v0 + (n === 1 ? 4000 : 10600)), 0, `${k}-MSB-${side}${n}`, EE); place("UPS 1000 kVA lithium-ion", X(5000), Y(v0 + (n === 1 ? 3500 : 10100)), 0, `${k}-UPS-${side}${n}`, EL);
        place("Voltamp 2500 kVA ONAN transformer", X([1825, 5475, 9125, 12775][2 * i + n - 1]), Y(-5000), 0, `${k}-TX-${side}${n}`, EE); }
      for (let n = 1; n <= 3; n++) place("Cummins 2500 kVA containerised generator", X(gU(n)), Y(i ? -40300 : -22100), 0, `${k}-GEN-${side}${n}`, "fuel_generator_engineer"); }
    for (const [v0, v1] of [[-16000, -10000], [-34200, -28200], [-52400, -46400]]) mass(`Hall ${k} yard road ${-v0 / 1000}`, R(0, v0, L, v1), -150, 150, "IfcSlab", "C", "C-ROAD", "#55585c", { material: "Asphalt" }, "civil_engineer");
    mass(`Hall ${k} 33 kV substation`, R(-24000, -52400, -12000, -22400), 0, 6000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#ddd8cf", {}, A);
    place("33 kV switchboard", X(-18000), Y(-37400), 0, `${k}-MV`, EE, 90); connect("MSB-33", `${k}-MV`, "power", "33 kV feeders");

    // ---- data hall: 14 pods × 2 rows × (8 GB300 NVL72 + 2 network racks), contained hot aisle, 4 busways per row
    for (let p = 1; p <= 14; p++) { const y = yk(p);
      for (const [ri, side] of [[2 * p - 1, -1], [2 * p, 1]]) { const front = y + side * 2600, rc = y + side * 2000, row = `${k}${z2(ri)}`;
        for (let i = 1; i <= 10; i++) place(i === 1 || i === 10 ? "Network rack 14 kW" : "NVIDIA GB300 NVL72 rack", X(rc), Y(33600 + 600 * (i - 1)), 0, `${row}-${z2(i)}`, WS, side < 0 ? 0 : 180);
        for (const [s, off, zb] of [["A", 150, 2900], ["C", 450, 3400], ["B", 750, 2900], ["D", 1050, 3400]]) { const u = front - side * off;
          sweep(`Hall ${k} busway ${row}-${s} 800 A`, `BW-${row}`, [[-100, 0], [100, 0], [100, 160], [-100, 160]], [[X(u), Y(32600), zb], [X(u), Y(39300), zb]], "IfcCableCarrierSegment", "E", "E-BUSWAY", "#e0a428", EL); } }
      mass(`Hall ${k} hot aisle containment P${z2(p)}`, R(y - 1400, 33150, y + 1400, 39450), 2286, 3214, "IfcCovering", "A", "A-CONTAINMENT", "#9fb3c2", { material: "Polycarbonate" }, WS);
      // CDUs 1 + 1 in the mechanical gallery; TCS pod mains in the front aisle, row headers in the hot aisle (DN200, +2.60)
      const sys = `TCS-${k}P${z2(p)}`, T = (pts) => pts.map(([u, v, z]) => [X(u), Y(v), z]);
      for (const [cu, ab] of [[y - 2200, "A"], [y + 2200, "B"]]) { const tg = `${k}-CDU-P${z2(p)}${ab}`; place("Vertiv CoolChip CDU 2300kW", X(cu), Y(47600), 0, tg, PC);
        pipe(`Hall ${k} FWS supply branch ${tg}`, `FWS-S-${k}`, 118, T([[cu - 300, 49800, 4800], [cu - 300, 47900, 4800], [cu - 300, 47900, 2500]]), "M", "M-FW", "#1f5fa8", PC);
        pipe(`Hall ${k} FWS return branch ${tg}`, `FWS-R-${k}`, 118, T([[cu + 300, 47900, 2500], [cu + 300, 47900, 5700], [cu + 300, 50800, 5700], [cu + 300, 50800, 5220]]), "M", "M-FW", "#5f9be0", PC);
        place("Butterfly valve DN200", X(cu - 300), Y(48800), 4650, `${tg}-VS`, PC); place("Butterfly valve DN200", X(cu + 300), Y(49300), 4650, `${tg}-VR`, PC);
      }
      pipe(`Hall ${k} TCS supply main P${z2(p)}`, sys, 118, T([[y - 2200, 47000, 2600], [y - 2200, 46300, 2600], [y + 2200, 46300, 2600], [y + 2200, 47000, 2600]]), "M", "M-TCS", "#2f7fd8", PC);
      pipe(`Hall ${k} TCS return main P${z2(p)}`, sys, 118, T([[y + 2000, 47000, 2700], [y + 2000, 46700, 2700], [y - 2000, 46700, 2700], [y - 2000, 47000, 2700]]), "M", "M-TCS", "#6aa8e8", PC);
      for (const sd of [-1, 1]) { pipe(`Hall ${k} TCS supply header P${z2(p)}${sd < 0 ? "S" : "N"}`, sys, 118, T([[y + sd * 1100, 46300, 2600], [y + sd * 1100, 33300, 2600]]), "M", "M-TCS", "#2f7fd8", PC);
        pipe(`Hall ${k} TCS return header P${z2(p)}${sd < 0 ? "S" : "N"}`, sys, 118, T([[y + sd * 700, 33300, 2700], [y + sd * 700, 46700, 2700]]), "M", "M-TCS", "#6aa8e8", PC); } }
    // busway feeders: one cable ladder per block from the output boards, over the battery rooms, into the hall's west end zone
    for (let b = 1; b <= 7; b++) { const ub = 18250 + 3650 * (4 * (b - 1) + 1) + 2900; /* in line room B's passage, over its battery room */ const lad = (nm, pts) => sweep(`Hall ${k} feeder ladder B${b} ${nm}`, `FDR-${k}${b}`, [[-600, 0], [600, 0], [600, 100], [-600, 100]], pts.map(([u, v]) => [X(u), Y(v), 4700]), "IfcCableCarrierSegment", "E", "E-CONTAINMENT", "#e0a428", EE);
      lad("west", [[ub, 17000], [ub, 30600], [yk(2 * b - 1) - 2600, 30600]]); lad("east", [[ub, 30600], [yk(2 * b) + 2600, 30600]]); }
    // fan walls (15, on the cold aisles) and chilled water from the roof chillers
    for (let m = 0; m < 15; m++) { const u = 18250 + PIT * m; place("Fan wall 450 kW", X(u), Y(44600), 0, `${k}-FWU-${z2(m + 1)}`, HV);
      pipe(`Hall ${k} CHW branch FWU-${z2(m + 1)}`, `CHW-S-${k}`, 60, [[X(u), Y(51600), 5050], [X(u), Y(51600), 5700], [X(u), Y(45600), 5700], [X(u), Y(45600), 4000]], "M", "M-CHW", "#36a3c9", HV); }
    // facility water (FWS, DN700) mains in the gallery, risers at grid 3 and between grids 14 and 15, roof headers to the dry coolers
    const loopMain = (name, sys, vG, vR, zR, u0, u1, col) => pipe(`Hall ${k} ${name}`, sys, 420, [[124100, vG, 4800], [u0, vG, 4800], [u0, vG, zR], [u0, vR, zR], [u1, vR, zR], [u1, vG, zR], [u1, vG, 4800]].map(([u, v, z]) => [X(u), Y(v), z]), "M", "M-FW", col, PC);
    loopMain("FWS supply main", `FWS-S-${k}`, 49800, 42000, 9900, 14600, 98550, "#1f5fa8"); loopMain("FWS return main", `FWS-R-${k}`, 50800, 43200, 10900, 15400, 99350, "#5f9be0");
    pipe(`Hall ${k} CHW supply main`, `CHW-S-${k}`, 245, [[14600, 51600, 4800], [120450, 51600, 4800], [120450, 51600, 9900], [120450, 42200, 9900], [99800, 42200, 9900]].map(([u, v, z]) => [X(u), Y(v), z]), "M", "M-CHW", "#36a3c9", HV);
    pipe(`Hall ${k} CHW return main`, `CHW-R-${k}`, 245, [[99800, 43000, 10900], [121200, 43000, 10900], [121200, 52300, 10900], [121200, 52300, 4800], [14600, 52300, 4800]].map(([u, v, z]) => [X(u), Y(v), z]), "M", "M-CHW", "#7cc4dc", HV);
    // pre-action sprinklers: valve set in the fire and water services room, DN150 main along the hall, DN50 branches on the cold aisles
    place("Pre-action valve set DN150", X(5800), Y(36300), 0, `${k}-PAV-01`, "fire_engineer");
    pipe(`Hall ${k} sprinkler main`, `SPR-${k}`, 85, [[X(5800), Y(36300), 1500], [X(5800), Y(36300), 6200], [X(124100), Y(36300), 6200]], "F", "F-SPRINKLER", "#c8102e", "fire_engineer");
    for (let m = 0; m < 15; m++) { const u = 18250 + PIT * m; pipe(`Hall ${k} sprinkler branch ${z2(m + 1)}`, `SPR-${k}`, 30, [[X(u), Y(29500), 6000], [X(u), Y(43100), 6000]], "F", "F-SPRINKLER", "#c8102e", "fire_engineer"); }
    // pumps (south block): FWS 4 + 1, CHW 2 + 1; buffer tanks in the north yard
    for (let i = 0; i < 5; i++) place("FWS pump 160 L/s", X(1500 + 2100 * i), Y(46200), 0, `${k}-P-FWS-${z2(i + 1)}`, PC);
    for (let i = 0; i < 3; i++) place("CHW pump 82 L/s", X(1500 + 2100 * i), Y(52200), 0, `${k}-P-CHW-${z2(i + 1)}`, HV);
    for (const [i, u] of [20000, 30000].entries()) place("Buffer tank 100 m³", X(u), Y(64000), 0, `${k}-BT-FWS-${i + 1}`, PC);
    for (const [i, u] of [40000, 46000].entries()) place("Buffer tank 25 m³", X(u), Y(64000), 0, `${k}-BT-CHW-${i + 1}`, HV);
    // roof: adiabatic dry coolers in pairs on grids 4–14, chillers on grids 15–17, each pair branched off the headers
    let dc = 0, ch = 0;
    for (let n = 4; n <= 17; n++) { const u = gU(n), isCh = n >= 15;
      for (const [vc, vConn] of [[35700, 41000], [49500, 44200]]) { const tg = isCh ? `${k}-CH-${z2(++ch)}` : `${k}-DC-${z2(++dc)}`;
        place(isCh ? "Air-cooled free-cooling chiller 1500 kW" : "Thermax adiabatic dry cooler 1.4 MW", X(u), Y(vc), ROOF + 1000, tg, isCh ? HV : PC);
        const [sS, sR, zS, zR, sysS, sysR] = isCh ? [42200, 43000, 9900, 10900, `CHW-S-${k}`, `CHW-R-${k}`] : [42000, 43200, 9900, 10900, `FWS-S-${k}`, `FWS-R-${k}`];
        pipe(`Hall ${k} ${tg} supply`, sysS, 85, [[X(u - 600), Y(sS), zS], [X(u - 600), Y(vConn), zS]], "M", isCh ? "M-CHW" : "M-FW", "#1f5fa8", PC);
        pipe(`Hall ${k} ${tg} return`, sysR, 85, [[X(u + 600), Y(vConn), zR], [X(u + 600), Y(sR), zR]], "M", isCh ? "M-CHW" : "M-FW", "#5f9be0", PC); } }
    if (k === "A") for (const ab of ["A", "B"]) connect(`${k}-CDU-P01${ab}`, `${k}-DC-${ab === "A" ? "01" : "02"}`, "chw", null, "FWS 36/46 °C");
  }
  return c;
}

export const DATACENTRE = {
  id: "dc_shadnagar", name: "Shadnagar AI factory, 120 MW",
  credit: "Hypothetical 120 MW (IT) AI factory near Shadnagar, Telangana: 4 single-bank halls, each 224 NVIDIA GB300 NVL72 racks in 14 pods (2 rows × 8 around a contained hot aisle, 7.3 m pitch), 4N/3 distributed redundant power (28 lines of 2.5 MVA transformer, 2000 kVA UPS, 2.5 MVA generator; 4 × 800 A busways per row), 28 Vertiv CDU 2300 (1 + 1 per pod), 15 fan walls, 22 adiabatic dry coolers and 6 chillers on the roof; 2 × 220 kV feeds to an on-site GIS. Layout rules from published GB300 reference designs (NVIDIA DSX, Vertiv, Schneider, OCP); LOD 400 geometry with LOD 500 fields marked assumed. Not a design for construction.",
  plans: [{ title: "Ground floor plan", cut_z: 1500 }, { title: "Roof plant plan", cut_z: 12500 }],
  commands: build(),
};

/** Location, cost, programme and drawings for the pilot (the stages after modelling). */
const R = (code, description, ifc_class, basis, unit, rate) => ({ code, description, match: { ifc_class }, basis, unit, rate });
export const DC_STAGES = {
  site: { lat: 17.0885, lon: 78.205, height_m: 640, timezone: 5.5, orient_deg: 0, label: "Hypothetical plot beside the Shadnagar substation, Rangareddy, Telangana (not a surveyed parcel)" },
  program: ["2027-01-04", "2028-12-29"], code: "HSD", currency: "INR",
  rates: [R("D-01", "GB300 NVL72 rack position fit-out (excl. IT)", "IfcFurniture", "count", "no.", 1800000), R("D-02", "CDU 2300 kW supplied and installed", "IfcHeatExchanger", "count", "no.", 32000000),
    R("D-03", "Adiabatic dry cooler 1.4 MW", "IfcCoolingTower", "count", "no.", 23000000), R("D-04", "Containerised generator 2500 kVA", "IfcElectricGenerator", "count", "no.", 30000000),
    R("D-05", "Transformers (block and grid)", "IfcTransformer", "count", "no.", 9000000), R("D-06", "UPS and Li-ion batteries (per unit)", "IfcElectricFlowStorageDevice", "count", "no.", 40000000),
    R("D-07", "Switchboards LV and MV", "IfcElectricDistributionBoard", "count", "no.", 14000000), R("D-08", "Precast walls and fire walls", "IfcWall", "NetVolume", "m³", 18000),
    R("D-09", "Slabs and hardstanding", "IfcSlab", "NetVolume", "m³", 9500), R("D-10", "Structural steel", "IfcBeam", "NetVolume", "m³", 820000), R("D-11", "Pipework", "IfcPipeSegment", "count", "no.", 2600000),
    R("D-12", "Chillers 1.5 MW", "IfcChiller", "count", "no.", 28000000)],
  assets: [{ rule: { ifc_class: "IfcHeatExchanger" }, tag_prefix: "CDU-", manufacturer: "Vertiv", model_number: "CoolChip CDU 2300kW", warranty_years: 2, maintenance_days: 90 },
    { rule: { ifc_class: "IfcCoolingTower" }, tag_prefix: "DC-", manufacturer: "Thermax", model_number: "Adiabatic dry cooling tower", warranty_years: 2, maintenance_days: 90 },
    { rule: { ifc_class: "IfcElectricGenerator" }, tag_prefix: "GEN-", manufacturer: "Cummins India", model_number: "2500 kVA containerised", warranty_years: 2, maintenance_days: 30 },
    { rule: { ifc_class: "IfcElectricFlowStorageDevice" }, tag_prefix: "UPS-", manufacturer: "to confirm", model_number: "UPS 2000 kVA / Li-ion", warranty_years: 3, maintenance_days: 180 },
    { rule: { ifc_class: "IfcTransformer" }, tag_prefix: "TX-", manufacturer: "Voltamp / CG Power", model_number: "see family", warranty_years: 5, maintenance_days: 365 },
    { rule: { ifc_class: "IfcChiller" }, tag_prefix: "CH-", manufacturer: "Blue Star", model_number: "1500 kW free-cooling chiller", warranty_years: 2, maintenance_days: 90 }],
};

/** Project notes per discipline and the typical power block, as drawn on the drafted plans. */
export const DC_NOTES = {
  GA: ["Data hall: 14 pods of 2 rows × (8 NVIDIA GB300 NVL72 + 2 network racks), pods at 7.3 m on grids 4–17, hot aisle contained and ducted to the plenum (+5.50).",
    "Aisles: cold 2.1 m, hot 2.8 m (1.6 m with 1.8 m deep racks); rack fronts 2.6 m off the pod grid line; 4.15 m end zones (transport aisle west).",
    "Electrical gallery: 28 line rooms (7 blocks × sources A–D) with 2 h walls and enclosed Li-ion battery rooms; mechanical gallery: 28 CDUs and 15 fan walls.",
    "Slab on grade, no raised floor; 25 kN/m² with a 3.6 t rack point load (OCP); clear height to structure 8.0 m.",
    "Exit distances and fire ratings are assumed and must be checked against NBC 2016 Part 4 by the fire engineer."],
  E: ["Power is 4N/3 distributed redundant: 7 blocks × 4 lines (A–D). Each line: 2.5 MVA 33/0.433 kV Dyn11 transformer, 4000 A MSB, 2000 kVA Li-ion UPS (≥ 5 min), 3200 A output board, 2.5 MVA generator.",
    "Each row: 4 × 800 A busways (A, C over the front half; B, D over the rear; A/B at +2.90, C/D at +3.40 BOB). Each GPU rack: 8 × 63 A tap-offs, 2 per source; network racks 2N.",
    "Line load 1,116 kW normal, 1,488 kW with one line out, about 1,700 kW at the 155 kW rack peak (85 % of the UPS).",
    "Transformers (bunded, fire walls between) and generators stand in the south yards; mechanical loads on 2N supplies MA / MB in the south block."],
  M: ["Technology cooling (TCS) 40 / 50 °C, PG25, 1.5 L/min per kW: 2.89 L/s per rack, 46.3 L/s per pod. Pod mains and row headers DN200 at +2.60 / +2.70 CL, ring per pod.",
    "Facility water (FWS) 36 / 46 °C, 638 L/s: DN700 mains at +4.80 in the gallery, risers at grid 3 and grid 14–15 to the roof dry coolers.",
    "Chilled water 23 / 33 °C, DN400 mains to 15 fan walls (13 duty + 2), branches DN100 over the mains at +5.70; supply air 28 °C.",
    "CDUs 2300 kW at 4 K approach, 1 duty + 1 standby per pod, isolating valves on every branch; rack hoses (DN50) not shown. No automatic air vents above IT.",
    "Pipe sizes from flow at ≤ 2.1 m/s (ASHRAE TC 9.6)."],
  F: ["Compartments (assumed): data hall, each line room, each Li-ion battery room, mechanical gallery, pump room, MMRs; 2 h walls, 2 h doors (FD120).",
    "Data hall: pre-action double-interlock sprinklers, DN150 main at +6.20 CL, DN50 branches on the cold aisles at +6.00; heads below the plenum and inside each contained hot aisle.",
    "Very early smoke detection (aspirating) in the hall and galleries; leak detection under every TCS header and CDU; Li-ion rooms to the battery vendor's large-scale fire test.",
    "Exits: data hall 2 to the south corridor, 2 equipment doors to back-of-house, 3 through the mechanical-gallery passages; every line room has a door to the yard and to the gallery corridor.",
    "Travel distances, exit widths and ratings are assumptions to be checked against NBC 2016 Part 4 and NFPA 75/76 by the fire engineer."],
  R: ["22 adiabatic dry coolers (20 duty + 2) on grids 4–14; duty at 42 °C DB / 24 °C WB to be confirmed by the vendor (monsoon wet bulb to be verified).",
    "6 free-cooling chillers (5 + 1) on grids 15–17 serve the 23 / 33 °C loop for the fan walls and the electrical gallery.",
    "Plant on dunnage at +10.00 over the roof deck (+9.30); headers in the 2.8 m zone between the unit rows; FWS supply +9.90, return +10.90 CL."],
};
export const DC_SLD = { title: "Typical power block B1 — 4N/3, lines A–D", sources: ["A", "B", "C", "D"], mv: "33 kV from MV-A", tx: "TX-L1{s} 2.5 MVA Dyn11", msb: "MSB-L1{s} 4000 A", gen: "GEN-L1{s} 2.5 MVA",
  ups: "UPS-L1{s} 2000 kVA Li-ion", ob: "OB-L1{s} 3200 A", busway: "4 × 800 A busways to rows 1–4", load: "Every GPU rack: 8 × 63 A tap-offs, 2 from each source",
  note: "Line load 1,116 kW normal; 1,488 kW with one line out (4 make 3)." };
export function dcStages() {
  const s = DC_STAGES;
  return [{ name: "geolocate", args: { ...s.site } },
    { name: "cost", args: { rates: s.rates, currency: s.currency, label: "Illustrative rates for a pilot estimate, excluding IT hardware; not a cost plan" } },
    { name: "auto_sequence", args: { start: s.program[0], finish: s.program[1] } },
    { name: "drawing_setup", args: { project_code: s.code, project_name: "Shadnagar AI factory, 120 MW (pilot)", client: "Hypothetical pilot client", author: "BIMja Draftsman (agent)", checker: "—", approver: "—", notes: DC_NOTES, sld: DC_SLD } },
    // the drawing set: Hall A's 1:100 plans on A0, split at the matchline between pods 7 and 8 (general arrangement, electrical, mechanical, roof)
    { name: "sheet", args: { kind: "register" } },
    { name: "sheet", args: { kind: "site_plan" } },
    ...["HA1", "HA2"].flatMap((zone) => ["ga", "elec", "mech", "roof", "fire_plan"].map((kind) => ({ name: "sheet", args: { kind, zone } }))),
    { name: "sheet", args: { kind: "elec", zone: "HAY" } },
    { name: "sheet", args: { kind: "hall_section", zone: "HA", cut: { axis: "x", at: 116300, look: -1, depth: 3000, from: 68000, to: 140000, name: "A" } } },
    { name: "sheet", args: { kind: "hall_section", zone: "HA", cut: { axis: "y", at: 116300, look: 1, depth: 3000, from: 47000, to: 191700, name: "B" } } },
    ...[1, 2, 3, 4, 5, 6, 7].map((block) => ({ name: "sheet", args: { kind: "block_sld", zone: "HA", block } })),
    // halls B–D repeat Hall A (typical); their plans are issued so every hall has its own setting-out
    ...["HB", "HC", "HD"].flatMap((h) => [`${h}1`, `${h}2`].flatMap((zone) => ["ga", "elec", "mech", "roof"].map((kind) => ({ name: "sheet", args: { kind, zone } }))))];
}

import { newProject } from "../author/model.js";
/** A fresh project for the pilot, shaped like a landmark project so the team runner can deliver it. */
export function dcProject() {
  const model = newProject("Shadnagar AI factory, 120 MW (BIMja pilot)"); model.description = DATACENTRE.credit; model.drawing_plans = DATACENTRE.plans;
  return { landmark: DATACENTRE, project: { format: "bimja-project", version: 1, model, extra: {} } };
}
