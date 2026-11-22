// Sample: a plant room and a small data hall with real services, for the drawing packs (and a seed for the data
// centre). Illustrative sizes and ratings, not a design. Every element on a discipline and layer; services carry a
// system name; equipment is placed from families; power and chilled water are connected for the schematics.
const W = (name, x0, y0, x1, y1, params) => ({ name: "mass", args: { name, outline: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], height: 5000, material: "Blockwork", color: "#d8d4cc", ifc_class: "IfcWall", discipline: "A", layer: "A-WALL", ...(params ? { params } : {}) } });
const ring = (r) => { const p = []; for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4 + Math.PI / 8; p.push([Math.round(r * Math.cos(a)), Math.round(r + r * Math.sin(a))]); } return p.map(([u, v]) => [u, v - r]); };
const pipe = (name, system, r, path, discipline, layer, color) => ({ name: "sweep", args: { name, system, profile: ring(r), path, material: "Steel", color, ifc_class: "IfcPipeSegment", discipline, layer } });
const fam = (name, ifc_class, discipline, layer, color, [dx, dy, dz], parameters) => ({ name: "family", args: { name, ifc_class, discipline, layer, material: "Steel", color, parameters, parts: [{ shape: "box", min: [-dx / 2, -dy / 2, 0], max: [dx / 2, dy / 2, dz] }] } });
const at = (family, x, y, mark, extra = {}) => ({ name: "place", as: mark.replace(/-/g, "_"), args: { family, at: [x, y, 0], mark, ...extra } });

export const SAMPLE_SERVICES = [
  // structure and architecture
  { name: "mass", args: { name: "Ground slab", outline: [[0, 0], [30000, 0], [30000, 20000], [0, 20000]], base: -300, height: 300, material: "Concrete", color: "#c9c6bf", ifc_class: "IfcSlab", discipline: "S", layer: "S-SLAB" } },
  { name: "mass", args: { name: "Roof slab", outline: [[0, 0], [30000, 0], [30000, 20000], [0, 20000]], base: 5000, height: 300, material: "Concrete", color: "#c9c6bf", ifc_class: "IfcSlab", discipline: "S", layer: "S-SLAB" } },
  W("External wall south", 0, 0, 30000, 300), W("External wall north", 0, 19700, 30000, 20000), W("External wall west", 0, 300, 300, 19700), W("External wall east", 29700, 300, 30000, 19700),
  W("Fire wall: plant room / data hall", 12000, 300, 12300, 19700, { FireRating: 120 }),
  // equipment families
  fam("Air-cooled chiller 500 kW", "IfcChiller", "M", "M-PLANT", "#7fb4d9", [4000, 1500, 2000], { Cooling_kW: 500, Refrigerant: "R1234ze" }),
  fam("CHW pump", "IfcPump", "M", "M-PLANT", "#7fb4d9", [900, 600, 900], { Flow_l_s: 24, Head_kPa: 250 }),
  fam("CRAH unit 150 kW", "IfcUnitaryEquipment", "M", "M-PLANT", "#9ccbe8", [900, 2500, 2000], { Cooling_kW: 150 }),
  fam("Transformer 2500 kVA", "IfcTransformer", "E", "E-PLANT", "#f2c27a", [2500, 2000, 2200], { Rating_kVA: 2500, Voltage: "11 kV / 415 V" }),
  fam("LV main switchboard", "IfcElectricDistributionBoard", "E", "E-PLANT", "#f2c27a", [4000, 800, 2200], { Rating_A: 4000 }),
  fam("UPS 1200 kVA", "IfcElectricFlowStorageDevice", "E", "E-PLANT", "#f2c27a", [3000, 900, 2000], { Rating_kVA: 1200, Autonomy_min: 10 }),
  fam("PDU 400 kW", "IfcElectricDistributionBoard", "E", "E-WHITESPACE", "#f2c27a", [800, 1200, 2000], { Rating_kW: 400 }),
  fam("Server rack 42U", "IfcFurniture", "E", "E-WHITESPACE", "#3a3d44", [600, 1200, 2200], { Height_U: 42 }),
  at("Air-cooled chiller 500 kW", 3000, 4000, "CH-01"), at("Air-cooled chiller 500 kW", 3000, 8000, "CH-02"),
  at("CHW pump", 8000, 4000, "P-01"), at("CHW pump", 8000, 6000, "P-02"),
  at("Transformer 2500 kVA", 2500, 16000, "TX-01"), at("LV main switchboard", 6500, 16500, "MSB-01"), at("UPS 1200 kVA", 10000, 16500, "UPS-01"),
  at("CRAH unit 150 kW", 13500, 5000, "CRAH-01"), at("CRAH unit 150 kW", 13500, 10000, "CRAH-02"), at("CRAH unit 150 kW", 13500, 15000, "CRAH-03"),
  at("PDU 400 kW", 28000, 6000, "PDU-A"), at("PDU 400 kW", 28000, 12000, "PDU-B"),
  // racks: rows A, B, C (cold aisle A|B, hot aisle B|C)
  ...[["A", 7600], ["B", 10400], ["C", 13200]].flatMap(([row, y]) => Array.from({ length: 14 }, (_, i) => ({ name: "place", args: { family: "Server rack 42U", at: [16500 + i * 600, y, 0], mark: `R-${row}${String(i + 1).padStart(2, "0")}`, params: { Power_kW: 8 } } }))),
  // chilled water flow and return (cross the fire wall: builder's work)
  pipe("CHW flow", "CHW-F-01", 110, [[4000, 4750, 1000], [4000, 4750, 3900], [14000, 4750, 3900], [14000, 15500, 3900], [14000, 15500, 2200]], "M", "M-CHW", "#2f7fd8"),
  pipe("CHW return", "CHW-R-01", 110, [[14400, 15900, 2200], [14400, 15900, 3500], [14400, 5150, 3500], [4400, 5150, 3500], [4400, 5150, 1000]], "M", "M-CHW", "#6aa8e8"),
  // supply duct crossing the pipes in the hall (an unresolved clash for coordination)
  { name: "sweep", args: { name: "Supply air duct", system: "SA-01", profile: [[-500, -250], [500, -250], [500, 250], [-500, 250]], path: [[12500, 9000, 3850], [29000, 9000, 3850]], material: "Galvanised steel", color: "#bcd3e0", ifc_class: "IfcDuctSegment", discipline: "M", layer: "M-DUCT" } },
  // cable tray from the switchboard into the hall, over the rack rows
  { name: "sweep", args: { name: "Cable tray 600", system: "LV-A", profile: [[-300, 0], [300, 0], [300, 100], [-300, 100]], path: [[6500, 17500, 4500], [16000, 17500, 4500], [16000, 8200, 4500], [26000, 8200, 4500]], material: "Galvanised steel", color: "#e0a428", ifc_class: "IfcCableCarrierSegment", discipline: "E", layer: "E-CONTAINMENT" } },
  // sprinkler main and drainage
  pipe("Sprinkler main", "SPR-01", 57, [[12600, 1500, 4700], [29200, 1500, 4700], [29200, 18500, 4700]], "F", "F-SPRINKLER", "#d0021b"),
  pipe("Plant room drain", "DR-01", 80, [[1000, 1000, 300], [11800, 1000, 300], [11800, 19000, 300]], "P", "P-DRAIN", "#8a5a2b"),
  // connections for the single-line diagram and the chilled water schematic
  { name: "connect", args: { from: "$TX_01", to: "$MSB_01", medium: "power", rating: "2500 kVA" } },
  { name: "connect", args: { from: "$MSB_01", to: "$UPS_01", medium: "power", rating: "1200 kVA" } },
  { name: "connect", args: { from: "$UPS_01", to: "$PDU_A", medium: "power", rating: "400 kW" } }, { name: "connect", args: { from: "$UPS_01", to: "$PDU_B", medium: "power", rating: "400 kW" } },
  { name: "connect", args: { from: "$MSB_01", to: "$CH_01", medium: "power", rating: "250 kW" } }, { name: "connect", args: { from: "$MSB_01", to: "$CH_02", medium: "power", rating: "250 kW" } },
  { name: "connect", args: { from: "$CH_01", to: "$P_01", medium: "chw" } }, { name: "connect", args: { from: "$CH_02", to: "$P_02", medium: "chw" } },
  ...["CRAH_01", "CRAH_02", "CRAH_03"].flatMap((c) => [{ name: "connect", args: { from: "$P_01", to: `$${c}`, medium: "chw", label: "DN200" } }]),
];
