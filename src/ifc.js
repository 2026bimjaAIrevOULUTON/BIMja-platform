// IFC loading + indexing on top of web-ifc (MPL-2.0). Pure data layer: no DOM, so agents and tests can use it too.
let WebIFC = null; // loaded lazily so the first page load stays small

const v = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);
const ids = (arr) => (arr || []).map((r) => v(r));

export async function createApi(wasmPath) {
  WebIFC ||= await import("web-ifc");
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(wasmPath, true);
  await api.Init(undefined, true); // single-threaded: no COOP/COEP headers needed (works on GitHub Pages)
  return api;
}

/** Open a model and build an index of elements, storeys, psets, quantities, types and materials. */
export function openModel(api, bytes, onProgress = () => {}, { coordinateToOrigin = false } = {}) {
  // Real coordinates by default, so federated models line up; the viewer re-centres far-away models itself.
  const modelID = api.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: coordinateToOrigin });
  const schema = api.GetModelSchema(modelID);
  const meshes = []; // {expressID, geometries:[{positions, normals, index, matrix, color}]}
  api.StreamAllMeshes(modelID, (mesh, i, total) => {
    const geoms = [];
    const n = mesh.geometries.size();
    for (let g = 0; g < n; g++) {
      const pg = mesh.geometries.get(g);
      const geo = api.GetGeometry(modelID, pg.geometryExpressID);
      const vd = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
      const id = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
      const positions = new Float32Array(vd.length / 2), normals = new Float32Array(vd.length / 2);
      for (let k = 0, j = 0; k < vd.length; k += 6, j += 3) {
        positions[j] = vd[k]; positions[j + 1] = vd[k + 1]; positions[j + 2] = vd[k + 2];
        normals[j] = vd[k + 3]; normals[j + 1] = vd[k + 4]; normals[j + 2] = vd[k + 5];
      }
      geoms.push({ positions, normals, index: new Uint32Array(id), matrix: Array.from(pg.flatTransformation), color: { ...pg.color } });
      geo.delete();
    }
    meshes.push({ expressID: mesh.expressID, geometries: geoms });
    if (i % 50 === 0) onProgress(i / total);
  });

  const index = buildIndex(api, modelID, meshes.map((m) => m.expressID));
  return { modelID, schema, meshes, index };
}

function line(api, m, id, flat = false) {
  try { return api.GetLine(m, id, flat); } catch { return null; }
}

function buildIndex(api, m, geomIds) {
  const elements = new Map(); // id -> element record
  const typeName = (id) => api.GetNameFromTypeCode(api.GetLineType(m, id));
  const add = (id) => {
    if (elements.has(id)) return elements.get(id);
    const L = line(api, m, id);
    if (!L) return null;
    const e = { id, ifcClass: typeName(id), globalId: v(L.GlobalId) || "", name: v(L.Name) || "", objectType: v(L.ObjectType) || "", longName: v(L.LongName) || "",
      storey: null, type: null, materials: [], psets: {}, quantities: {} };
    elements.set(id, e);
    return e;
  };
  geomIds.forEach(add);
  for (const id of api.GetLineIDsWithType(m, WebIFC.IFCSPACE, true) ? vecToArr(api.GetLineIDsWithType(m, WebIFC.IFCSPACE, true)) : []) add(id);

  // storeys + containment
  const storeys = vecToArr(api.GetLineIDsWithType(m, WebIFC.IFCBUILDINGSTOREY)).map((id) => {
    const L = line(api, m, id); return { id, name: v(L?.Name) || `Storey ${id}`, elevation: Number(v(L?.Elevation) ?? 0) };
  }).sort((a, b) => a.elevation - b.elevation);
  const storeyById = new Map(storeys.map((s) => [s.id, s]));
  const storeyOf = new Map(); // any product id -> storey name (incl. containers without geometry, e.g. curtain walls)
  const assignStorey = (rel, relatedKey, structKey) => {
    for (const rid of vecToArr(api.GetLineIDsWithType(m, rel))) {
      const R = line(api, m, rid); if (!R) continue;
      const s = storeyById.get(v(R[structKey]));
      if (!s) continue;
      for (const oid of ids(R[relatedKey])) if (!storeyOf.has(oid)) storeyOf.set(oid, s.name);
    }
  };
  assignStorey(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, "RelatedElements", "RelatingStructure");
  assignStorey(WebIFC.IFCRELAGGREGATES, "RelatedObjects", "RelatingObject"); // spaces aggregated into storeys
  // parts of an assembly (curtain-wall panels, stair flights...) inherit the parent's storey; repeat until stable
  const aggs = vecToArr(api.GetLineIDsWithType(m, WebIFC.IFCRELAGGREGATES)).map((rid) => line(api, m, rid)).filter(Boolean)
    .map((R) => ({ parent: v(R.RelatingObject), children: ids(R.RelatedObjects) }));
  for (let pass = 0, changed = true; changed && pass < 6; pass++) {
    changed = false;
    for (const a of aggs) { const st = storeyOf.get(a.parent); if (!st) continue;
      for (const c of a.children) if (!storeyOf.has(c)) { storeyOf.set(c, st); changed = true; } }
  }
  const parentOf = new Map(); for (const a of aggs) for (const c of a.children) if (!storeyById.has(c)) parentOf.set(c, a.parent);
  for (const e of elements.values()) { e.storey = storeyOf.get(e.id) || null; e.isPart = parentOf.has(e.id) && !storeyById.has(parentOf.get(e.id)) && api.GetLineType(m, parentOf.get(e.id)) !== WebIFC.IFCBUILDING; }

  // property sets & quantity sets
  for (const rid of vecToArr(api.GetLineIDsWithType(m, WebIFC.IFCRELDEFINESBYPROPERTIES))) {
    const R = line(api, m, rid); if (!R) continue;
    const def = line(api, m, v(R.RelatingPropertyDefinition), true); if (!def) continue;
    const targets = ids(R.RelatedObjects).map((i) => elements.get(i)).filter(Boolean);
    if (!targets.length) continue;
    const setName = v(def.Name) || "Unnamed";
    if (def.HasProperties) {
      const props = {};
      for (const p of def.HasProperties || []) if (p) props[v(p.Name)] = v(p.NominalValue) ?? (p.EnumerationValues ? ids(p.EnumerationValues).join(", ") : null);
      targets.forEach((e) => (e.psets[setName] = { ...(e.psets[setName] || {}), ...props }));
    } else if (def.Quantities) {
      const q = {};
      for (const x of def.Quantities || []) if (x) q[v(x.Name)] = Number(v(x.AreaValue) ?? v(x.VolumeValue) ?? v(x.LengthValue) ?? v(x.CountValue) ?? v(x.WeightValue) ?? 0);
      targets.forEach((e) => (e.quantities[setName] = { ...(e.quantities[setName] || {}), ...q }));
    }
  }

  // types
  const typeOf = new Map();
  for (const rid of vecToArr(api.GetLineIDsWithType(m, WebIFC.IFCRELDEFINESBYTYPE))) {
    const R = line(api, m, rid); if (!R) continue;
    const tid = v(R.RelatingType); const T = line(api, m, tid); const tName = T ? `${typeName(tid)}: ${v(T.Name) || ""}` : null;
    for (const oid of ids(R.RelatedObjects)) { typeOf.set(oid, tid); const e = elements.get(oid); if (e) e.type = tName; }
  }
  // materials (on the element, or inherited from its type)
  const matOf = new Map();
  for (const rid of vecToArr(api.GetLineIDsWithType(m, WebIFC.IFCRELASSOCIATESMATERIAL))) {
    const R = line(api, m, rid); if (!R) continue;
    const names = materialNames(api, m, v(R.RelatingMaterial));
    for (const oid of ids(R.RelatedObjects)) matOf.set(oid, [...(matOf.get(oid) || []), ...names]);
  }
  for (const e of elements.values()) e.materials = [...(matOf.get(e.id) || []), ...(matOf.get(typeOf.get(e.id)) || [])];
  for (const e of elements.values()) e.materials = [...new Set(e.materials)];
  return { elements, storeys };
}

function materialNames(api, m, id) {
  const L = line(api, m, id, true); if (!L) return [];
  if (L.Name && !L.MaterialLayers && !L.Materials && !L.ForLayerSet && !L.MaterialConstituents) return [v(L.Name)];
  const out = [];
  const walk = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
    if (o.Material && o.Material.Name) out.push(v(o.Material.Name));
    for (const k of ["MaterialLayers", "Materials", "ForLayerSet", "MaterialConstituents", "MaterialProfiles"]) walk(o[k]); };
  walk(L);
  if (!out.length && L.Name) out.push(v(L.Name));
  return out;
}

function vecToArr(vec) { const a = []; if (!vec) return a; for (let i = 0; i < vec.size(); i++) a.push(vec.get(i)); return a; }
