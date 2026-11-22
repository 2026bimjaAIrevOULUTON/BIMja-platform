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
  { name: "Thermax adiabatic dry cooler 1.5 MW", ifc_class: "IfcCoolingTower", discipline: "M", layer: "M-HEATREJECTION", color: "#9aa7b4", material: "Galvanised steel",
    parameters: lod({ Manufacturer: "Thermax", Model: "Adiabatic dry cooling tower (to confirm)", Capacity_kW: 1500, Facility_water: "40/50 °C", Adiabatic_above_C: 32 }),
    parts: [box(2400, 12000, 400), box(300, 11600, 1800, -900, 0, 400), box(300, 11600, 1800, 900, 0, 400), box(2400, 12000, 120, 0, 0, 2200),
      ...[-4500, -1500, 1500, 4500].map((y) => cyl(900, 450, 0, y, 2320))] },
  { name: "Blue Star air-cooled free-cooling chiller 1 MW", ifc_class: "IfcChiller", discipline: "M", layer: "M-PLANT", color: "#8fb8cf", material: "Steel",
    parameters: lod({ Manufacturer: "Blue Star", Model: "Air-cooled screw chiller with free cooling (to confirm)", Cooling_kW: 1000, CHW: "18/26 °C" }),
    parts: [box(5000, 2300, 2300), ...[-1700, -550, 550, 1700].map((x) => cyl(500, 250, x, 0, 2300))] },
  { name: "Fan wall 750 kW", ifc_class: "IfcUnitaryEquipment", discipline: "M", layer: "M-AIR", color: "#a8c5da", material: "Steel",
    parameters: lod({ Manufacturer: "Blue Star", Model: "Chilled-water fan wall (to confirm)", Cooling_kW: 750 }), parts: [box(800, 3600, 3400)] },
  { name: "Voltamp 3150 kVA cast resin transformer", ifc_class: "IfcTransformer", discipline: "E", layer: "E-POWERBLOCK", color: "#f2c27a", material: "Steel",
    parameters: lod({ Manufacturer: "Voltamp", Model: "Cast resin 33/0.415 kV", Rating_kVA: 3150 }), parts: [box(2400, 1600, 2400), box(2200, 200, 300, 0, 0, 2400)] },
  { name: "Schneider Galaxy VXL 1250 kW UPS", ifc_class: "IfcElectricFlowStorageDevice", discipline: "E", layer: "E-POWERBLOCK", color: "#d9a54a", material: "Steel",
    parameters: lod({ Manufacturer: "Schneider Electric", Model: "Galaxy VXL with lithium-ion", Rating_kW: 1250, Overload: "150% for 60 s at 40 °C" }), parts: [box(3600, 900, 2000), box(2400, 900, 2000, 0, 1100, 0)] },
  { name: "LV main switchboard 4000 A", ifc_class: "IfcElectricDistributionBoard", discipline: "E", layer: "E-POWERBLOCK", color: "#e8b86a", material: "Steel",
    parameters: lod({ Manufacturer: "Schneider Electric", Model: "Okken (to confirm)", Rating_A: 4000 }), parts: [box(6000, 1000, 2200)] },
  { name: "33 kV switchboard", ifc_class: "IfcElectricDistributionBoard", discipline: "E", layer: "E-MV", color: "#e0a040", material: "Steel",
    parameters: lod({ Manufacturer: "Schneider Electric", Model: "SF6-free 33 kV switchgear", Panels: 24 }), parts: [box(16000, 1600, 2400)] },
  { name: "Cummins 3250 kVA containerised generator", ifc_class: "IfcElectricGenerator", discipline: "E", layer: "E-GENERATOR", color: "#c4c9cf", material: "Steel",
    parameters: lod({ Manufacturer: "Cummins India", Model: "QSK95-class 3250 kVA (to confirm)", Rating_kVA: 3250, Emissions: "CPCB IV+" }),
    parts: [box(2500, 12200, 600), box(2500, 12200, 2900, 0, 0, 600), box(2300, 2200, 900, 0, 4800, 3500), cyl(250, 2600, 0, -4500, 3500)] },
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
  const W = 500000, H = 330000;
  mass("Site hardstanding and fill", rect(0, 0, W, H), -600, 450, "IfcSlab", "C", "C-EARTHWORKS", "#cbbf9f", { material: "Compacted murrum" }, "civil_engineer");
  const road = (name, x0, y0, x1, y1) => { mass(name, rect(x0, y0, x1, y1), -150, 150, "IfcSlab", "C", "C-ROAD", "#55585c", { material: "Asphalt" }, "civil_engineer");
    const kerb = (p) => sweep(`${name} kerb`, "", [[-75, 0], [75, 0], [75, 150], [-75, 150]], p, "IfcBuildingElementProxy", "C", "C-KERB", "#bdbdbd", "civil_engineer", "Concrete");
    if (x1 - x0 > y1 - y0) { kerb([[x0, y0, 0], [x1, y0, 0]]); kerb([[x0, y1, 0], [x1, y1, 0]]); } else { kerb([[x0, y0, 0], [x0, y1, 0]]); kerb([[x1, y0, 0], [x1, y1, 0]]); } };
  road("Spine road", 0, 130000, 490000, 138000); road("Ring road south", 10000, 10000, 490000, 18000); road("Ring road north", 10000, 312000, 490000, 320000);
  road("Ring road west", 10000, 18000, 18000, 312000); road("Ring road east", 482000, 18000, 490000, 312000);
  road("Hall link A–B", 160000, 106000, 384000, 114000); road("Hall link C–D", 160000, 152000, 384000, 160000);
  road("Access road from the west", -40000, 128000, 0, 140000);
  mass("Gatehouse", rect(4000, 142000, 14000, 150000), 0, 3500, "IfcBuildingElementProxy", "A", "A-BUILDING", "#e4e1da", {}, "architect");
  const fence = (p) => sweep("Boundary fence 3 m", "", [[-40, 0], [40, 0], [40, 3000], [-40, 3000]], p, "IfcRailing", "C", "C-FENCE", "#6b6b6b", "civil_engineer");
  fence([[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], [0, 142000, 0]]); fence([[0, 126000, 0], [0, 0, 0]]);
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
  mass("Operations and NOC building", rect(30000, 145000, 72000, 165000), 0, 12000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#e9e6df", {}, "architect");
  const trench = (name, path) => sweep(name, "MV-33", [[-600, -600], [600, -600], [600, 0], [-600, 0]], path, "IfcCableCarrierSegment", "E", "E-CONTAINMENT", "#e0a428", "power_distribution_engineer", "Concrete");
  trench("33 kV cable trench, campus", [[400000, 238000, -300], [400000, 134000, -300], [165000, 134000, -300]]);
  for (let i = 0; i < 4; i++) { connect("GIS-220", `TX-${i + 1}`, "power", "220 kV"); connect(`TX-${i + 1}`, "MSB-33", "power", "63 MVA"); }

  // ---- utilities (E): fuel farm, water plant, fire pumps
  for (let i = 0; i < 4; i++) place("Fuel tank 300 kL", 430000 + (i % 2) * 14000, 150000 + Math.floor(i / 2) * 14000, 0, `FT-${i + 1}`, "fuel_generator_engineer");
  mass("Fuel farm bund", rect(420000, 140000, 454000, 174000), 0, 1200, "IfcWall", "C", "C-BUND", "#c9c3b4", {}, "civil_engineer");
  pipe("Fuel ring main", "FUEL-01", 60, [[437000, 140000, -800], [437000, 104000, -800], [150000, 104000, -800], [150000, 26000, -800], [400000, 26000, -800]], "M", "M-FUEL", "#8a6d2b", "fuel_generator_engineer");
  for (let i = 0; i < 2; i++) place("Treated water tank 1 ML", 430000 + i * 20000, 60000, 0, `WT-${i + 1}`, "plumbing_engineer");
  mass("Water treatment and pump house", rect(420000, 30000, 470000, 44000), 0, 6000, "IfcBuildingElementProxy", "A", "A-BUILDING", "#ddd8cf", {}, "architect");
  for (let i = 0; i < 3; i++) place("Kirloskar fire pump set", 426000 + i * 5000, 37000, 0, `FP-${i + 1}`, "fire_engineer");
  pipe("Fire main ring", "FH-01", 110, [[425000, 46000, -900], [425000, 104000, -900], [155000, 104000, -900], [155000, 260000, -900], [400000, 260000, -900]], "F", "F-HYDRANT", "#d0021b", "fire_engineer");
  pipe("Treated water main", "TW-01", 160, [[440000, 52000, -1100], [400000, 112000, -1100], [160000, 112000, -1100]], "P", "P-WATER", "#2f7fd8", "plumbing_engineer");

  // ---- four data halls
  const HALLS = [{ k: "A", ox: 170000, oy: 54000, yard: -1 }, { k: "B", ox: 290000, oy: 54000, yard: -1 }, { k: "C", ox: 170000, oy: 166000, yard: 1 }, { k: "D", ox: 290000, oy: 166000, yard: 1 }];
  c.push({ name: "type", owner: "architect", args: { kind: "wall", name: "Precast 300", thickness: 300, isExternal: true, loadBearing: false, material: "Insulated precast concrete" } });
  c.push({ name: "type", owner: "fire_engineer", args: { kind: "wall", name: "Fire wall 300 EI120", thickness: 300, isExternal: false, loadBearing: false, fireRating: "EI 120", material: "Precast concrete" } });
  c.push({ name: "type", owner: "architect", args: { kind: "door", name: "Double 1800x2400", width: 1800, height: 2400, fireRating: "None", operation: "DOUBLE_DOOR_SINGLE_SWING", material: "Steel" } });
  c.push({ name: "type", owner: "fire_engineer", args: { kind: "door", name: "Fire door double 1800x2400", width: 1800, height: 2400, fireRating: "120 min", operation: "DOUBLE_DOOR_SINGLE_SWING", material: "Steel" } });
  for (const h of HALLS) hall(h);
  function hall({ k, ox, oy, yard }) {
    const X = (x) => ox + x, Y = (y) => oy + y, L = 84000, D = 48000, HT = 9000;
    const A = "architect", S = "structural_engineer";
    c.push({ name: "zone", owner: "planner", args: { name: `Hall ${k}`, code: `H${k}`, outline: yard < 0 ? rect(X(-3000), Y(-36000), X(L + 3000), Y(D + 3000)) : rect(X(-3000), Y(-3000), X(L + 3000), Y(D + 28000)) } });
    // structure and envelope
    mass(`Hall ${k} ground slab`, rect(X(0), Y(0), X(L), Y(D)), -300, 300, "IfcSlab", "S", "S-SLAB", "#c9c6bf", {}, S);
    mass(`Hall ${k} roof slab`, rect(X(0), Y(0), X(L), Y(D)), HT, 300, "IfcSlab", "S", "S-SLAB", "#c9c6bf", {}, S);
    // envelope and fire walls as real walls (they host the doors and bound the rooms); centrelines 150 in from the slab edge
    const wall = (name, a, b, type, ref) => c.push({ name: "wall", owner: ref.includes("FW") ? "fire_engineer" : A, as: `${k}_${ref}`, args: { name: `Hall ${k} ${name}`, start: [X(a[0]), Y(a[1])], end: [X(b[0]), Y(b[1])], type, height: HT } });
    wall("wall south", [150, 150], [L - 150, 150], "Precast 300", "WS"); wall("wall east", [L - 150, 150], [L - 150, D - 150], "Precast 300", "WE");
    wall("wall north", [L - 150, D - 150], [150, D - 150], "Precast 300", "WN"); wall("wall west", [150, D - 150], [150, 150], "Precast 300", "WW");
    wall("fire wall, south electrical room", [150, 9150], [L - 150, 9150], "Fire wall 300 EI120", "FWS"); wall("fire wall, north electrical room", [150, 38850], [L - 150, 38850], "Fire wall 300 EI120", "FWN");
    const door = (ref, offset, type, mark) => c.push({ name: "door", owner: A, args: { wall: `$${k}_${ref}`, offset, type, mark: `${k}-${mark}` } });
    door("WW", 23850, "Double 1800x2400", "D01"); door("WE", 23850, "Double 1800x2400", "D02");                          // white space: equipment route east-west
    door("WS", 36850, "Double 1800x2400", "D03"); door("WN", 46850, "Double 1800x2400", "D04");                          // electrical rooms from the MV rooms, in the gap between blocks 4 and 5
    for (const [i, x] of [8000, 30000, 60000, 76000].entries()) { door("FWS", x, "Fire door double 1800x2400", `D1${i}`); door("FWN", x, "Fire door double 1800x2400", `D2${i}`); }
    c.push({ name: "room", owner: A, args: { name: "White space", number: `${k}.01`, boundary: rect(X(300), Y(9300), X(L - 300), Y(38700)) } });
    c.push({ name: "room", owner: A, args: { name: "Electrical room south", number: `${k}.02`, boundary: rect(X(300), Y(300), X(L - 300), Y(9000)) } });
    c.push({ name: "room", owner: A, args: { name: "Electrical room north", number: `${k}.03`, boundary: rect(X(300), Y(39000), X(L - 300), Y(D - 300)) } });
    // structural grid: numbers along x at the column lines, letters along y at the wall and fire-wall lines
    for (let i = 0; i <= 9; i++) { const x = Math.min(L - 300, Math.max(300, i * 9300 + 300)); c.push({ name: "grid", owner: S, args: { name: String(i + 1), zone: `H${k}`, start: [X(x), Y(yard < 0 ? -7500 : -3500)], end: [X(x), Y(yard < 0 ? D + 3500 : D + 7500)] } }); } // clear of the MV room
    for (const [n, y] of [["A", 150], ["B", 9150], ["C", 38850], ["D", D - 150]]) c.push({ name: "grid", owner: S, args: { name: n, zone: `H${k}`, start: [X(-4000), Y(y)], end: [X(L + 4000), Y(y)] } });
    for (let i = 0; i <= 9; i++) for (const y of [150, 9150, 38850, D - 150]) { const x = Math.min(L - 300, Math.max(300, i * 9300 + 300));
      mass(`Hall ${k} column ${i + 1}/${y}`, rect(X(x - 250), Y(y - 250), X(x + 250), Y(y + 250)), 0, HT, "IfcColumn", "S", "S-COLUMN", "#b7b2a8", { material: "Steel" }, S); }
    for (let i = 0; i <= 9; i++) { const x = Math.min(L - 300, Math.max(300, i * 9300 + 300)); mass(`Hall ${k} roof girder ${i + 1}`, rect(X(x - 200), Y(150), X(x + 200), Y(D - 150)), HT - 1200, 1200, "IfcBeam", "S", "S-BEAM", "#a9a39a", { material: "Steel" }, S); }
    // electrical bays: 9 blocks per side; south: IT blocks 1–9, north: IT 10–14 + mechanical M1–M4
    const blocks = []; for (let i = 0; i < 9; i++) blocks.push({ side: "S", i, id: `${k}${String(i + 1).padStart(2, "0")}`, it: true });
    for (let i = 0; i < 9; i++) blocks.push({ side: "N", i, id: i < 5 ? `${k}${String(i + 10).padStart(2, "0")}` : `${k}M${i - 4}`, it: i < 5 });
    place("33 kV switchboard", X(L / 2), Y(yard < 0 ? -3750 : D + 3750), 0, `MV-${k}`, "power_distribution_engineer"); // in its own MV room outside the hall, plant-yard side
    mass(`Hall ${k} MV room`, rect(X(L / 2 - 10000), Y(yard < 0 ? -6000 : D + 1500), X(L / 2 + 10000), Y(yard < 0 ? -1500 : D + 6000)), 0, 4500, "IfcBuildingElementProxy", "A", "A-BUILDING", "#ddd8cf", {}, A);
    connect("MSB-33", `MV-${k}`, "power", "33 kV ring");
    for (const b of blocks) { const cx = X(4950 + b.i * 9300), yb = b.side === "S" ? Y(4500) : Y(43500), f = b.side === "S" ? 1 : -1;
      place("Voltamp 3150 kVA cast resin transformer", cx - 2600, yb - f * 2400, 0, `T-${b.id}`, "power_distribution_engineer");
      place("LV main switchboard 4000 A", cx, yb + f * 600, 0, `LV-${b.id}`, "power_distribution_engineer");
      if (b.it) { place("Schneider Galaxy VXL 1250 kW UPS", cx + 1000, yb - f * 2300, 0, `UPS-${b.id}a`, "electrical_engineer"); }
      if (k === "A") { connect(`MV-${k}`, `T-${b.id}`, "power", "3150 kVA"); }
    }
    // white space: two pods × 4 rows × 28 racks; CDU gallery at the north end of the rows
    const WS = "it_whitespace_designer", PC = "process_cooling_engineer";
    for (let pod = 0; pod < 2; pod++) { const px = pod ? 46000 : 12000;
      for (let row = 0; row < 4; row++) { const rx = px + [600, 3000, 6000, 8400][row]; const rn = pod * 4 + row + 1;
        for (let r = 0; r < 28; r++) place("NVIDIA GB300 NVL72 rack", X(rx), Y(12000 + 300 + r * 600), 0, `R-${k}${rn}-${String(r + 1).padStart(2, "0")}`, WS, row % 2 ? 180 : 0);
        sweep(`Hall ${k} busway row ${rn}`, `LV-${k}${String(rn).padStart(2, "0")}`, [[-100, 0], [100, 0], [100, 160], [-100, 160]], [[X(rx), Y(11600), 3200], [X(rx), Y(29600), 3200]], "IfcCableCarrierSegment", "E", "E-BUSWAY", "#e0a428", "electrical_engineer");
        pipe(`Hall ${k} TCS supply row ${rn}`, `TCS-${k}${rn}`, 84, [[X(rx - 450), Y(33000), 2700], [X(rx - 450), Y(11800), 2700]], "M", "M-TCS", "#2f7fd8", PC);
        pipe(`Hall ${k} TCS return row ${rn}`, `TCS-${k}${rn}`, 84, [[X(rx + 450), Y(11800), 2950], [X(rx + 450), Y(33000), 2950]], "M", "M-TCS", "#6aa8e8", PC);
      }
      mass(`Hall ${k} hot aisle containment pod ${pod + 1}a`, rect(X(px + 1200), Y(12000), X(px + 2400), Y(28800)), 2236, 1200, "IfcCovering", "A", "A-CONTAINMENT", "#9fb3c2", { material: "Polycarbonate" }, WS);
      mass(`Hall ${k} hot aisle containment pod ${pod + 1}b`, rect(X(px + 7200), Y(12000), X(px + 8400), Y(28800)), 2236, 1200, "IfcCovering", "A", "A-CONTAINMENT", "#9fb3c2", { material: "Polycarbonate" }, WS);
    }
    for (let i = 0; i < 13; i++) { const cx = i < 7 ? 12600 + i * 1500 : 46600 + (i - 7) * 1500, tag = `${k}${String(i + 1).padStart(2, "0")}`; place("Vertiv CoolChip CDU 2300kW", X(cx), Y(33800), 0, `CDU-${tag}`, PC);
      // facility water branches: supply from the header to the CDU's primary inlet, return from its outlet, each with an isolating valve
      pipe(`Hall ${k} FW supply branch CDU-${tag}`, `FW-S-${k}`, 110, [[X(cx - 350), Y(35400), 4200], [X(cx - 350), Y(34400), 4200], [X(cx - 350), Y(34400), 2700]], "M", "M-FW", "#1f5fa8", PC);
      pipe(`Hall ${k} FW return branch CDU-${tag}`, `FW-R-${k}`, 110, [[X(cx + 350), Y(34400), 2700], [X(cx + 350), Y(34400), 4800], [X(cx + 350), Y(36600), 4800]], "M", "M-FW", "#5f9be0", PC);
      place("Butterfly valve DN200", X(cx - 350), Y(34900), 4200 - 150, `V-${tag}S`, PC); place("Butterfly valve DN200", X(cx + 350), Y(35400), 4800 - 150, `V-${tag}R`, PC); }
    // facility water: headers along the CDU gallery, riser at the east end, roof headers to the dry coolers
    pipe(`Hall ${k} facility water supply header`, `FW-S-${k}`, 240, [[X(12000), Y(35400), 4200], [X(80000), Y(35400), 4200], [X(80000), Y(35400), HT + 1500], [X(80000), Y(24000), HT + 1500], [X(4000), Y(24000), HT + 1500]], "M", "M-FW", "#1f5fa8", PC);
    pipe(`Hall ${k} facility water return header`, `FW-R-${k}`, 240, [[X(4000), Y(25200), HT + 1900], [X(81200), Y(25200), HT + 1900], [X(81200), Y(36600), HT + 1900], [X(81200), Y(36600), 4800], [X(12000), Y(36600), 4800]], "M", "M-FW", "#5f9be0", PC);
    for (let i = 0; i < 22; i++) { const row = i < 11 ? 0 : 1, j = i % 11; place("Thermax adiabatic dry cooler 1.5 MW", X(6000 + j * 4000), Y(row ? 32000 : 16000), HT + 300, `DC-${k}${String(i + 1).padStart(2, "0")}`, PC); }
    for (let i = 0; i < 6; i++) place("Blue Star air-cooled free-cooling chiller 1 MW", X(56000 + (i % 3) * 8000), Y(i < 3 ? 13000 : 35000), HT + 300, `CH-${k}${i + 1}`, "hvac_consultant");
    for (let i = 0; i < 6; i++) place("Fan wall 750 kW", X(i < 3 ? 1200 : L - 1200), Y(15000 + (i % 3) * 6000), 0, `FW-${k}${i + 1}`, "hvac_consultant");
    pipe(`Hall ${k} chilled water to fan walls`, `CHW-${k}`, 110, [[X(60000), Y(13000), HT + 300], [X(60000), Y(13000), 6500], [X(1200), Y(13000), 6500], [X(1200), Y(27000), 6500]], "M", "M-CHW", "#36a3c9", "hvac_consultant");
    // fire: pre-action main over the white space; MV cable tray along the electrical bays
    pipe(`Hall ${k} pre-action sprinkler main`, `SPR-${k}`, 57, [[X(1000), Y(10500), HT - 1600], [X(L - 1000), Y(10500), HT - 1600], [X(L - 1000), Y(37500), HT - 1600]], "F", "F-SPRINKLER", "#d0021b", "fire_engineer");
    sweep(`Hall ${k} MV cable tray`, `MV-${k}`, [[-300, 0], [300, 0], [300, 100], [-300, 100]], yard < 0 ? [[X(L / 2), Y(-1500), 4200], [X(L / 2), Y(1500), 4200], [X(1000), Y(1500), 4200]] : [[X(L / 2), Y(D + 1500), 4200], [X(L / 2), Y(D - 1500), 4200], [X(1000), Y(D - 1500), 4200]], "IfcCableCarrierSegment", "E", "E-CONTAINMENT", "#e0a428", "power_distribution_engineer");
    // generator yard: 18 containerised gensets on the plant-yard side
    const gy = yard < 0 ? Y(-26000) : Y(D + 18000);
    mass(`Hall ${k} generator yard slab`, rect(X(-2000), gy - 8000, X(L + 2000), gy + 8000), -300, 300, "IfcSlab", "S", "S-SLAB", "#bdb8ae", {}, S);
    for (let i = 0; i < 18; i++) { const id = i < 14 ? `${k}${String(i + 1).padStart(2, "0")}` : `${k}M${i - 13}`; place("Cummins 3250 kVA containerised generator", X(2200 + i * 4600), gy, 0, `G-${id}`, "fuel_generator_engineer");
      if (k === "A" && i === 0) { connect(`G-${id}`, `LV-${id}`, "power", "3250 kVA standby"); connect(`T-${id}`, `LV-${id}`, "power", "4000 A"); connect(`LV-${id}`, `UPS-${id}a`, "power", "1250 kW"); } }
    if (k === "A") for (let i = 0; i < 13; i++) connect(`CDU-${k}${String(i + 1).padStart(2, "0")}`, `DC-${k}${String(i + 1).padStart(2, "0")}`, "chw", null, "W45 facility water");
  }
  return c;
}

export const DATACENTRE = {
  id: "dc_shadnagar", name: "Shadnagar AI factory, 120 MW",
  credit: "Hypothetical 120 MW (IT) AI factory near Shadnagar, Telangana: 4 halls × 224 NVIDIA GB300 NVL72 racks, direct-to-chip liquid cooling through Vertiv CDU 2300 units, adiabatic dry coolers, 56 IT + 16 mechanical 2.5 MW power blocks, 72 generators, 2 × 220 kV feeds to an on-site GIS. Concept sizing and assumed vendors from BIMja's site-selection study; LOD 400 geometry with LOD 500 fields marked assumed. Not a design for construction.",
  plans: [{ title: "Ground floor plan", cut_z: 1500 }, { title: "Roof plant plan", cut_z: 12500 }],
  commands: build(),
};

/** Location, cost, programme and drawings for the pilot (the stages after modelling). */
const R = (code, description, ifc_class, basis, unit, rate) => ({ code, description, match: { ifc_class }, basis, unit, rate });
export const DC_STAGES = {
  site: { lat: 17.0885, lon: 78.205, height_m: 640, timezone: 5.5, orient_deg: 0, label: "Hypothetical plot beside the Shadnagar substation, Rangareddy, Telangana (not a surveyed parcel)" },
  program: ["2027-01-04", "2028-12-29"], code: "HSD", currency: "INR",
  rates: [R("D-01", "GB300 NVL72 rack position fit-out (excl. IT)", "IfcFurniture", "count", "no.", 1800000), R("D-02", "CDU 2300 kW supplied and installed", "IfcHeatExchanger", "count", "no.", 32000000),
    R("D-03", "Adiabatic dry cooler 1.5 MW", "IfcCoolingTower", "count", "no.", 24000000), R("D-04", "Containerised generator 3250 kVA", "IfcElectricGenerator", "count", "no.", 38000000),
    R("D-05", "Transformers (block and grid)", "IfcTransformer", "count", "no.", 9000000), R("D-06", "UPS 1250 kW lithium-ion", "IfcElectricFlowStorageDevice", "count", "no.", 52000000),
    R("D-07", "Switchboards LV and MV", "IfcElectricDistributionBoard", "count", "no.", 14000000), R("D-08", "Precast walls and fire walls", "IfcWall", "NetVolume", "m³", 18000),
    R("D-09", "Slabs and hardstanding", "IfcSlab", "NetVolume", "m³", 9500), R("D-10", "Structural steel", "IfcBeam", "NetVolume", "m³", 820000), R("D-11", "Pipework", "IfcPipeSegment", "count", "no.", 2600000),
    R("D-12", "Chillers 1 MW", "IfcChiller", "count", "no.", 21000000)],
  assets: [{ rule: { ifc_class: "IfcHeatExchanger" }, tag_prefix: "CDU-", manufacturer: "Vertiv", model_number: "CoolChip CDU 2300kW", warranty_years: 2, maintenance_days: 90 },
    { rule: { ifc_class: "IfcCoolingTower" }, tag_prefix: "DC-", manufacturer: "Thermax", model_number: "Adiabatic dry cooling tower", warranty_years: 2, maintenance_days: 90 },
    { rule: { ifc_class: "IfcElectricGenerator" }, tag_prefix: "G-", manufacturer: "Cummins India", model_number: "3250 kVA containerised", warranty_years: 2, maintenance_days: 30 },
    { rule: { ifc_class: "IfcElectricFlowStorageDevice" }, tag_prefix: "UPS-", manufacturer: "Schneider Electric", model_number: "Galaxy VXL 1250 kW", warranty_years: 3, maintenance_days: 180 },
    { rule: { ifc_class: "IfcTransformer" }, tag_prefix: "T-", manufacturer: "Voltamp / CG Power", model_number: "see family", warranty_years: 5, maintenance_days: 365 },
    { rule: { ifc_class: "IfcChiller" }, tag_prefix: "CH-", manufacturer: "Blue Star", model_number: "1 MW free-cooling chiller", warranty_years: 2, maintenance_days: 90 }],
};

export function dcStages() {
  const s = DC_STAGES;
  return [{ name: "geolocate", args: { ...s.site } },
    { name: "cost", args: { rates: s.rates, currency: s.currency, label: "Illustrative rates for a pilot estimate, excluding IT hardware; not a cost plan" } },
    { name: "auto_sequence", args: { start: s.program[0], finish: s.program[1] } },
    { name: "drawing_setup", args: { project_code: s.code, project_name: "Shadnagar AI factory, 120 MW (pilot)", client: "Hypothetical pilot client", author: "BIMja Draftsman (agent)", checker: "—", approver: "—" } },
    // the drawing set: drafted plans per hall (general arrangement, electrical, mechanical) at 1:100 on A0
    ...["HA", "HB", "HC", "HD"].flatMap((zone) => ["ga", "elec", "mech"].map((kind) => ({ name: "sheet", args: { kind, zone } })))];
}

import { newProject } from "../author/model.js";
/** A fresh project for the pilot, shaped like a landmark project so the team runner can deliver it. */
export function dcProject() {
  const model = newProject("Shadnagar AI factory, 120 MW (BIMja pilot)"); model.description = DATACENTRE.credit; model.drawing_plans = DATACENTRE.plans;
  return { landmark: DATACENTRE, project: { format: "bimja-project", version: 1, model, extra: {} } };
}
