// 5D: unit rates on quantities (estimate), an asset register for operations, and COBie 2.4 handover.
// Pure and headless; the element records come from the authored model or the open IFC (same shape, src/ifc.js).
import { xlsx } from "./xlsx.js";
import { pointInPolygon, add, mul, norm, sub, perp } from "../author/geom.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };
const r2 = (n) => Math.round(n * 100) / 100;

/** Sample rates in INR. They are placeholders to show the mechanism: replace them with your own schedule of rates. */
export const SAMPLE_RATES = {
  currency: "INR", label: "SAMPLE rates (replace with your schedule of rates)",
  rates: [
    { code: "C-01", description: "Brickwork 230 mm in CM 1:6, incl. plaster both faces", match: { ifc_class: "IfcWall", type: "230" }, basis: "NetVolume", unit: "m³", rate: 7800 },
    { code: "C-02", description: "Brick partition 115 mm, incl. plaster both faces", match: { ifc_class: "IfcWall", type: "115" }, basis: "NetSideArea", unit: "m²", rate: 1250 },
    { code: "C-07", description: "Walls, other types (area rate)", match: { ifc_class: "IfcWall" }, basis: "NetSideArea", unit: "m²", rate: 1600 },
    { code: "C-03", description: "RCC M25 slab incl. formwork and steel", match: { ifc_class: "IfcSlab" }, basis: "NetVolume", unit: "m³", rate: 14500 },
    { code: "C-04", description: "Flooring, vitrified tiles", match: { ifc_class: "IfcSpace" }, basis: "NetFloorArea", unit: "m²", rate: 1450 },
    { code: "C-05", description: "Doors, flush shutter with frame and hardware", match: { ifc_class: "IfcDoor" }, basis: "count", unit: "no.", rate: 14000 },
    { code: "C-06", description: "Windows, aluminium sliding with glazing", match: { ifc_class: "IfcWindow" }, basis: "Area", unit: "m²", rate: 6500 },
  ],
};

const qOf = (e, basis) => { if (basis === "count") return 1; for (const q of Object.values(e.quantities || {})) if (q[basis] != null && Number.isFinite(+q[basis])) return +q[basis]; return null; };
const baseClass = (c) => String(c).toLowerCase().replace(/(standardcase|elementedcase)$/, "");
export const matches = (e, m = {}) => (!m.ifc_class || [].concat(m.ifc_class).some((c) => baseClass(c) === baseClass(e.ifcClass)))
  && (!m.type || String(e.type || "").toLowerCase().includes(String(m.type).toLowerCase()))
  && (!m.name || String(e.name || "").toLowerCase().includes(String(m.name).toLowerCase()))
  && (!m.storey || e.storey === m.storey);

export function validateRates(rates) {
  if (!Array.isArray(rates)) fail("rates must be a list of {code, description, match, basis, unit, rate}");
  rates.forEach((r, i) => { if (!r || !Number.isFinite(+r.rate) || +r.rate < 0) fail(`rate ${i}: rate must be a number ≥ 0`); if (!r.basis) fail(`rate ${i}: basis is required (count, NetVolume, NetSideArea, NetArea, NetFloorArea, Area, Length…)`); });
  return rates.map((r, i) => ({ code: String(r.code || `R${i + 1}`), description: String(r.description || ""), match: r.match || {}, basis: String(r.basis), unit: String(r.unit || (r.basis === "count" ? "no." : "")), rate: +r.rate, factor: r.factor != null ? +r.factor : 1 }));
}

/** First matching rate wins for each element (put specific rates before general ones). */
export function estimate(records, cost) {
  const rates = cost?.rates || []; const lines = rates.map((r) => ({ ...r, qty: 0, elements: [], missing: [] }));
  const unpriced = {};
  for (const e of [...records.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (e.isPart || /Opening|Annotation|Grid|VirtualElement/i.test(e.ifcClass)) continue;
    const i = rates.findIndex((r) => matches(e, r.match));
    if (i < 0) { unpriced[e.ifcClass] = (unpriced[e.ifcClass] || 0) + 1; continue; }
    const q = qOf(e, rates[i].basis); if (q == null) { lines[i].missing.push(e.globalId || e.id); continue; }
    lines[i].qty += q * (rates[i].factor ?? 1); lines[i].elements.push(e.globalId || e.id);
  }
  const out = lines.map((l) => ({ code: l.code, description: l.description, unit: l.unit, qty: r2(l.qty), rate: l.rate, amount: r2(r2(l.qty) * l.rate), elements: l.elements.length, missing_quantity: l.missing }));
  const total = r2(out.reduce((s, l) => s + l.amount, 0));
  return { currency: cost?.currency || "INR", lines: out, total, unpriced, warnings: out.filter((l) => l.missing_quantity.length).map((l) => `${l.code}: ${l.missing_quantity.length} elements have no ${rates.find((r) => r.code === l.code).basis} quantity`) };
}
export const estimateCSV = (est) => [["Code", "Description", "Unit", "Quantity", `Rate (${est.currency})`, `Amount (${est.currency})`].join(","),
  ...est.lines.map((l) => [l.code, `"${l.description.replace(/"/g, '""')}"`, l.unit, l.qty, l.rate, l.amount].join(",")), `,,,,Total,${est.total}`].join("\n");

// ---------- assets ----------
export const ASSET_FIELDS = ["tag", "name", "manufacturer", "model_number", "serial", "installed", "warranty_years", "maintenance_days", "expected_life_years", "replacement_cost"];

// ---------- COBie 2.4 ----------
export const COBIE_SHEETS = {
  Contact: ["Email", "CreatedBy", "CreatedOn", "Category", "Company", "Phone", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Department", "OrganizationCode", "GivenName", "FamilyName", "Street", "PostalBox", "Town", "StateRegion", "PostalCode", "Country"],
  Facility: ["Name", "CreatedBy", "CreatedOn", "Category", "ProjectName", "SiteName", "LinearUnits", "AreaUnits", "VolumeUnits", "CurrencyUnit", "AreaMeasurement", "ExternalSystem", "ExternalProjectObject", "ExternalProjectIdentifier", "ExternalSiteObject", "ExternalSiteIdentifier", "ExternalFacilityObject", "ExternalFacilityIdentifier", "Description", "ProjectDescription", "SiteDescription", "Phase"],
  Floor: ["Name", "CreatedBy", "CreatedOn", "Category", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description", "Elevation", "Height"],
  Space: ["Name", "CreatedBy", "CreatedOn", "Category", "FloorName", "Description", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "RoomTag", "UsableHeight", "GrossArea", "NetArea"],
  Zone: ["Name", "CreatedBy", "CreatedOn", "Category", "SpaceNames", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description"],
  Type: ["Name", "CreatedBy", "CreatedOn", "Category", "Description", "AssetType", "Manufacturer", "ModelNumber", "WarrantyGuarantorParts", "WarrantyDurationParts", "WarrantyGuarantorLabor", "WarrantyDurationLabor", "WarrantyDurationUnit", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "ReplacementCost", "ExpectedLife", "DurationUnit", "WarrantyDescription", "NominalLength", "NominalWidth", "NominalHeight", "ModelReference", "Shape", "Size", "Color", "Finish", "Grade", "Material", "Constituents", "Features", "AccessibilityPerformance", "CodePerformance", "SustainabilityPerformance"],
  Component: ["Name", "CreatedBy", "CreatedOn", "TypeName", "Space", "Description", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "SerialNumber", "InstallationDate", "WarrantyStartDate", "TagNumber", "BarCode", "AssetIdentifier"],
  System: ["Name", "CreatedBy", "CreatedOn", "Category", "ComponentNames", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description"],
  Assembly: ["Name", "CreatedBy", "CreatedOn", "SheetName", "ParentName", "ChildNames", "AssemblyType", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description"],
  Connection: ["Name", "CreatedBy", "CreatedOn", "ConnectionType", "SheetName", "RowName1", "RowName2", "RealizingElement", "PortName1", "PortName2", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description"],
  Spare: ["Name", "CreatedBy", "CreatedOn", "Category", "TypeName", "Suppliers", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description", "SetNumber", "PartNumber"],
  Resource: ["Name", "CreatedBy", "CreatedOn", "Category", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description"],
  Job: ["Name", "CreatedBy", "CreatedOn", "Category", "Status", "TypeName", "Description", "Duration", "DurationUnit", "Start", "TaskStartUnit", "Frequency", "FrequencyUnit", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "TaskNumber", "Priors", "ResourceNames"],
  Impact: ["Name", "CreatedBy", "CreatedOn", "ImpactType", "ImpactStage", "SheetName", "RowName", "Value", "ImpactUnit", "LeadInTime", "Duration", "LeadOutTime", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description"],
  Document: ["Name", "CreatedBy", "CreatedOn", "Category", "ApprovalBy", "Stage", "SheetName", "RowName", "Directory", "File", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description", "Reference"],
  Attribute: ["Name", "CreatedBy", "CreatedOn", "Category", "SheetName", "RowName", "Value", "Unit", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "Description", "AllowedValues"],
  Coordinate: ["Name", "CreatedBy", "CreatedOn", "Category", "SheetName", "RowName", "CoordinateXAxis", "CoordinateYAxis", "CoordinateZAxis", "ExternalSystem", "ExternalObject", "ExternalIdentifier", "ClockwiseRotation", "ElevationalRotation", "YawRotation"],
  Issue: ["Name", "CreatedBy", "CreatedOn", "Type", "Risk", "Chance", "Impact", "SheetName1", "RowName1", "SheetName2", "RowName2", "Description", "Owner", "Mitigation", "ExternalSystem", "ExternalObject", "ExternalIdentifier"],
};
const COMPONENT_CLASSES = /^Ifc(Door|Window|FlowTerminal|FlowController|FlowMovingDevice|EnergyConversionDevice|FlowStorageDevice|FlowTreatmentDevice|DistributionControlElement|FurnishingElement|Furniture|SanitaryTerminal|LightFixture|AirTerminal|Boiler|Chiller|Pump|Fan|Valve|ElectricAppliance|Transport(Element)?|Alarm|Sensor|Actuator|UnitaryEquipment|SpaceHeater|Outlet|SwitchingDevice|ProtectiveDevice|Lamp|FireSuppressionTerminal|WasteTerminal|StackTerminal)/i;
const CATEGORY = { IfcDoor: "Doors", IfcWindow: "Windows" };

/**
 * COBie 2.4 sheets from element records. ctx: { project, createdBy (email), createdOn (ISO, fixed for determinism),
 * levels [{name, elevation_m, height_m}], spaceOf(record) -> [space names], assets {elementRef: {...}}, currency }.
 */
export function cobieSheets(records, ctx) {
  const by = ctx.createdBy || "bim@example.com", on = ctx.createdOn || "2026-01-01T00:00:00";
  const na = (v) => (v == null || v === "" ? "n/a" : v);
  const rows = Object.fromEntries(Object.keys(COBIE_SHEETS).map((k) => [k, []]));
  const row = (sheet, o) => rows[sheet].push(COBIE_SHEETS[sheet].map((c) => na(o[c])));
  const ext = (e) => ({ ExternalSystem: "BIMja", ExternalObject: e.ifcClass, ExternalIdentifier: e.globalId });
  row("Contact", { Email: by, CreatedBy: by, CreatedOn: on, Category: "Information Manager", Company: ctx.company || "BIMja", Phone: ctx.phone });
  row("Facility", { Name: ctx.project || "BIMja project", CreatedBy: by, CreatedOn: on, Category: ctx.facilityCategory || "Building", ProjectName: ctx.project || "BIMja project", SiteName: ctx.site || "Default site",
    LinearUnits: "meters", AreaUnits: "square meters", VolumeUnits: "cubic meters", CurrencyUnit: ctx.currency || "INR", AreaMeasurement: "Qto_SpaceBaseQuantities NetFloorArea", ExternalSystem: "BIMja", ExternalProjectObject: "IfcProject", ExternalSiteObject: "IfcSite", ExternalFacilityObject: "IfcBuilding", Phase: ctx.phase || "Handover" });
  const all = [...records.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const floors = new Map(); for (const l of ctx.levels || []) floors.set(l.name, l);
  for (const e of all) if (e.storey && !floors.has(e.storey)) floors.set(e.storey, { name: e.storey });
  for (const f of floors.values()) row("Floor", { Name: f.name, CreatedBy: by, CreatedOn: on, Category: "Floor", ExternalSystem: "BIMja", ExternalObject: "IfcBuildingStorey", Elevation: f.elevation_m, Height: f.height_m });
  const spaces = all.filter((e) => e.ifcClass === "IfcSpace"); const spaceName = (e) => String(e.name || e.id);
  for (const s of spaces) { const q = s.quantities?.Qto_SpaceBaseQuantities || {};
    row("Space", { Name: spaceName(s), CreatedBy: by, CreatedOn: on, Category: s.category || "Room", FloorName: s.storey, Description: s.longName || spaceName(s), ...ext(s), RoomTag: s.longName, UsableHeight: q.Height, GrossArea: q.GrossFloorArea ?? q.NetFloorArea, NetArea: q.NetFloorArea }); }
  const assets = ctx.assets || {};
  const comps = all.filter((e) => !e.isPart && (COMPONENT_CLASSES.test(e.ifcClass) || assets[e.id] || assets[e.globalId]));
  const types = new Map();
  for (const c of comps) {
    const a = assets[c.id] || assets[c.globalId] || {}; const tname = (c.type || `${c.ifcClass}: (untyped)`).replace(/^Ifc\w+Type: /, "");
    if (!types.has(tname)) {
      const q = Object.values(c.quantities || {})[0] || {};
      types.set(tname, true);
      row("Type", { Name: tname, CreatedBy: by, CreatedOn: on, Category: CATEGORY[c.ifcClass] || c.ifcClass.replace(/^Ifc/, ""), Description: tname, AssetType: a.asset_type || "Fixed", Manufacturer: a.manufacturer || by,
        ModelNumber: a.model_number, WarrantyGuarantorParts: by, WarrantyDurationParts: a.warranty_years ?? 1, WarrantyGuarantorLabor: by, WarrantyDurationLabor: a.warranty_years ?? 1, WarrantyDurationUnit: "year",
        ExternalSystem: "BIMja", ExternalObject: `${c.ifcClass}Type`, ReplacementCost: a.replacement_cost, ExpectedLife: a.expected_life_years ?? 25, DurationUnit: "year", NominalLength: q.Depth, NominalWidth: q.Width, NominalHeight: q.Height, Material: (c.materials || []).join(", ") || undefined });
      if (a.maintenance_days) row("Job", { Name: `PM ${tname}`, CreatedBy: by, CreatedOn: on, Category: "PM", Status: "Not Yet Started", TypeName: tname, Description: `Planned maintenance of ${tname}`, Duration: 1, DurationUnit: "hour", Start: 0, TaskStartUnit: "day", Frequency: +a.maintenance_days, FrequencyUnit: "day", TaskNumber: 1, ResourceNames: "n/a" });
    }
    const sp = (ctx.spaceOf?.(c) || []).join(",");
    row("Component", { Name: a.tag || c.name || c.id, CreatedBy: by, CreatedOn: on, TypeName: tname, Space: sp || undefined, Description: c.name || tname, ...ext(c), SerialNumber: a.serial, InstallationDate: a.installed, WarrantyStartDate: a.installed, TagNumber: a.tag, BarCode: a.barcode, AssetIdentifier: a.asset_id || c.globalId });
  }
  // keep names unique per sheet (COBie keys): suffix duplicates deterministically
  for (const k of ["Floor", "Space", "Type", "Component"]) { const seen = new Map(); for (const r of rows[k]) { const n = r[0]; const c = seen.get(n) || 0; seen.set(n, c + 1); if (c) r[0] = `${n} (${c + 1})`; } }
  return rows;
}
export function cobieXlsx(rows) { return xlsx(Object.entries(COBIE_SHEETS).map(([name, cols]) => ({ name, rows: [cols, ...rows[name]] }))); }

/** For the authored model: the rooms each door/window opens into (probe 150 mm past each wall face). */
export function authoredSpaceOf(model) {
  return (rec) => {
    const o = model.data.elements[rec.id]; if (!o || !o.host) return [];
    const w = model.data.elements[o.host]; if (!w) return [];
    const dir = norm(sub(w.b, w.a)), n = perp(dir), t = model.type("wall", w.type).thickness / 2 + 150; const c = add(w.a, mul(dir, o.offset));
    const rooms = model.elements.filter((e) => e.kind === "room" && e.level === o.level);
    const hit = [add(c, mul(n, t)), add(c, mul(n, -t))].map((p) => rooms.find((r) => pointInPolygon(p, r.boundary))).filter(Boolean);
    return [...new Set(hit.map((r) => String(r.number)))].sort();
  };
}
