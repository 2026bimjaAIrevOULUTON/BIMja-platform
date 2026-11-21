// Authored model as element records in the same shape the IFC reader produces (src/ifc.js), so the handover check
// can run on the model before export. The round-trip gate compares this with the exported, re-opened IFC.
import { ifcGuid } from "./ifc-export.js";
import { dist, polygonArea, polygonPerimeter } from "./geom.js";
import { solidOf } from "./solids.js";
export function authoredRecords(model) {
  const pid = model.data.name || "BIMja project"; const recs = new Map(); const lv = (id) => model.level(id).name;
  const rec = (e, ifcClass, extra) => recs.set(e.id, { id: e.id, ifcClass, globalId: ifcGuid(`${pid}/el/${e.id}`), name: e.name || e.mark || e.id, objectType: "", longName: "", storey: lv(e.level), type: null, materials: [], psets: {}, quantities: {}, isPart: false, ...extra });
  for (const w of model.elements.filter((e) => e.kind === "wall")) {
    const t = model.type("wall", w.type), H = model.wallHeight(w), Lw = model.wallBuiltLength(w);
    const open = model.hosted(w.id).reduce((s, o) => { const sp = model.openingSpan(o); return s + (sp.width * sp.height) / 1e6; }, 0);
    rec(w, "IfcWall", { type: `IfcWallType: ${w.type}`, materials: t.layers?.length ? t.layers.map((l) => l.material) : t.material ? [t.material] : [],
      psets: { Pset_WallCommon: { Reference: w.type, IsExternal: !!t.isExternal, LoadBearing: !!t.loadBearing } },
      quantities: { Qto_WallBaseQuantities: { Length: Lw / 1000, Height: H / 1000, Width: t.thickness / 1000, GrossSideArea: (Lw * H) / 1e6, NetSideArea: (Lw * H) / 1e6 - open, NetVolume: ((Lw * H) / 1e6 - open) * t.thickness / 1000 } } });
    for (const o of model.hosted(w.id)) { const ot = model.type(o.kind, o.type);
      rec(o, o.kind === "door" ? "IfcDoor" : "IfcWindow", { name: o.name || o.mark, type: `${o.kind === "door" ? "IfcDoorType" : "IfcWindowType"}: ${o.type}`, materials: ot.material ? [ot.material] : [],
        psets: o.kind === "door" ? { Pset_DoorCommon: { Reference: o.type, ...(ot.fireRating ? { FireRating: ot.fireRating } : {}), IsExternal: !!t.isExternal } } : { Pset_WindowCommon: { Reference: o.type, IsExternal: !!t.isExternal } },
        quantities: { [o.kind === "door" ? "Qto_DoorBaseQuantities" : "Qto_WindowBaseQuantities"]: (() => { const sp = model.openingSpan(o); return { Width: sp.width / 1000, Height: sp.height / 1000, Area: (sp.width * sp.height) / 1e6 }; })() } }); }
  }
  for (const s of model.elements.filter((e) => e.kind === "floor" || e.kind === "roof")) { const t = model.type(s.kind, s.type);
    rec(s, "IfcSlab", { type: `IfcSlabType: ${s.type}`, materials: t.material ? [t.material] : [], psets: { Pset_SlabCommon: { Reference: s.type } }, quantities: { Qto_SlabBaseQuantities: { NetArea: Math.abs(polygonArea(s.boundary)) / 1e6, Perimeter: polygonPerimeter(s.boundary) / 1000, NetVolume: Math.abs(polygonArea(s.boundary)) / 1e6 * t.thickness / 1000 } } }); }
  for (const r of model.elements.filter((e) => e.kind === "room"))
    { const A = Math.abs(polygonArea(r.boundary)) / 1e6, H = (model.levelAbove(r.level) ? model.levelAbove(r.level).elevation - model.level(r.level).elevation : 3000) / 1000;
      rec(r, "IfcSpace", { name: r.number, longName: r.name, quantities: { Qto_SpaceBaseQuantities: { Height: H, NetFloorArea: A, GrossFloorArea: A, NetPerimeter: polygonPerimeter(r.boundary) / 1000, NetVolume: A * H } } }); }
  for (const e of model.elements.filter((x) => x.kind === "mass")) { const sol = solidOf(e); const cls = e.ifc_class || "IfcBuildingElementProxy";
    rec(e, cls, { type: e.family ? `Family: ${e.family}` : null, materials: e.material ? [e.material] : [], psets: e.family ? { BIMja_Family: { Family: e.family, ...(model.data.families?.[e.family]?.parameters || {}) }, ...(model.data.families?.[e.family]?.psets || {}) } : {}, quantities: { [cls === "IfcBuildingElementProxy" ? "Qto_BuildingElementProxyQuantities" : `Qto_${cls.slice(3)}BaseQuantities`]: { Height: (sol.zmax - sol.zmin) / 1000, NetSurfaceArea: sol.area / 1e6, NetVolume: sol.volume / 1e9 } } }); }
  return recs;
}
