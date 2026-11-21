// Authored model -> IFC4 (STEP text). Deterministic: GlobalIds are derived from element ids, no clock in geometry.
// Units: metres, m², m³ (so quantity sets read the same everywhere). Writes walls (+ layer sets, openings, doors,
// windows), slabs (floor/roof), spaces, storeys, types, materials, Pset_*Common and Qto_*BaseQuantities,
// and the georeference (IfcMapConversion + IfcProjectedCRS) when the project has a CRS.
import { dist, norm, sub, polygonArea, polygonPerimeter } from "./geom.js";

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function hash128(s) { // four FNV-1a variants -> 16 bytes
  const out = []; for (let k = 0; k < 4; k++) { let h = 0x811c9dc5 ^ (k * 0x9e3779b1); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; out.push(h >>> 0); }
  return out;
}
export function ifcGuid(seed) {
  const w = hash128(seed); let n = 0n; for (const x of w) n = (n << 32n) | BigInt(x);
  let s = ""; for (let i = 0; i < 22; i++) { s = B64[Number(n & 63n)] + s; n >>= 6n; } // 128 bits -> 22 chars (first char uses 2 bits)
  return B64[Number(BigInt(B64.indexOf(s[0])) & 3n)] + s.slice(1);
}
const str = (s) => (s == null ? "$" : `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\`)}'`);
const f = (x) => { const v = Math.round(x * 1e6) / 1e6; return Number.isInteger(v) ? `${v}.` : String(v); };

export function exportIFC(model, { projectName, geo } = {}) {
  const L = []; let n = 0; const add = (s) => { L.push(`#${++n}=${s};`); return `#${n}`; };
  const pid = model.data.name || "BIMja project"; const g = (k) => str(ifcGuid(`${pid}/${k}`));
  const m = (mm) => mm / 1000;
  // context, units
  const origin = add("IFCCARTESIANPOINT((0.,0.,0.))"), zDir = add("IFCDIRECTION((0.,0.,1.))"), xDir = add("IFCDIRECTION((1.,0.,0.))");
  const wcs = add(`IFCAXIS2PLACEMENT3D(${origin},${zDir},${xDir})`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${wcs},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const units = add(`IFCUNITASSIGNMENT((${add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")},${add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")},${add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")},${add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")}))`);
  const project = add(`IFCPROJECT(${g("project")},$,${str(projectName || pid)},$,$,$,$,(${ctx}),${units})`);
  if (geo?.crs) {
    const crs = add(`IFCPROJECTEDCRS(${str(geo.crs)},${str(geo.description || null)},$,$,$,$,$)`);
    const a = geo.anchor || {}; const rot = ((a.rotation_deg || 0) * Math.PI) / 180;
    add(`IFCMAPCONVERSION(${ctx},${crs},${f(a.easting || 0)},${f(a.northing || 0)},${f(a.height || 0)},${f(Math.cos(rot))},${f(Math.sin(rot))},${f(a.scale || 1)})`);
  }
  const place = (rel, x = 0, y = 0, z = 0, dir = null) => {
    const p = add(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`);
    const ax = add(`IFCAXIS2PLACEMENT3D(${p},${zDir},${dir ? add(`IFCDIRECTION((${f(dir[0])},${f(dir[1])},0.))`) : xDir})`);
    return add(`IFCLOCALPLACEMENT(${rel || "$"},${ax})`);
  };
  const sitePl = place(null), site = add(`IFCSITE(${g("site")},$,'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldPl = place(sitePl), bld = add(`IFCBUILDING(${g("building")},$,${str(pid)},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES(${g("agg-project")},$,$,$,${project},(${site}))`);
  add(`IFCRELAGGREGATES(${g("agg-site")},$,$,$,${site},(${bld}))`);
  const storeys = {}; for (const lv of model.data.levels) {
    const pl = place(bldPl, 0, 0, m(lv.elevation));
    storeys[lv.id] = { ref: add(`IFCBUILDINGSTOREY(${g(`storey/${lv.id}`)},$,${str(lv.name)},$,$,${pl},$,$,.ELEMENT.,${f(m(lv.elevation))})`), pl, contained: [], spaces: [] };
  }
  add(`IFCRELAGGREGATES(${g("agg-building")},$,$,$,${bld},(${Object.values(storeys).map((s) => s.ref).join(",")}))`);

  const shape = (items, kind = "SweptSolid") => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body',${str(kind)},(${items.join(",")}))`)}))`);
  const rectSolid = (cx, cy, xd, yd, h, z0 = 0) => {
    const c2 = add(`IFCAXIS2PLACEMENT2D(${add(`IFCCARTESIANPOINT((${f(cx)},${f(cy)}))`)},$)`);
    const prof = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${c2},${f(xd)},${f(yd)})`);
    const pos = add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((0.,0.,${f(z0)}))`)},$,$)`);
    return add(`IFCEXTRUDEDAREASOLID(${prof},${pos},${zDir},${f(h)})`);
  };
  const polySolid = (pts, h, z0 = 0) => {
    const ps = pts.map((p) => add(`IFCCARTESIANPOINT((${f(m(p[0]))},${f(m(p[1]))}))`));
    const prof = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${add(`IFCPOLYLINE((${[...ps, ps[0]].join(",")}))`)})`);
    const pos = add(`IFCAXIS2PLACEMENT3D(${add(`IFCCARTESIANPOINT((0.,0.,${f(z0)}))`)},$,$)`);
    return add(`IFCEXTRUDEDAREASOLID(${prof},${pos},${zDir},${f(h)})`);
  };
  // materials (shared by name)
  const matRef = {}; const material = (name) => (matRef[name] ||= add(`IFCMATERIAL(${str(name)},$,$)`));
  const assocMat = {}; const associate = (key, matRefId, objs) => { (assocMat[key] ||= { mat: matRefId, objs: [] }).objs.push(...objs); };
  const psets = []; const pset = (owner, name, props) => psets.push({ owner, name, props });
  const qtos = []; const qto = (owner, name, qs) => qtos.push({ owner, name, qs });
  const typeRefs = {}; const typeOf = {}; // kind/name -> ref ; ref -> [objects]
  const typeRef = (kind, name, ifcType, extra = "") => {
    const k = `${kind}/${name}`; if (typeRefs[k]) return typeRefs[k];
    const r = add(`${ifcType}(${g(`type/${k}`)},$,${str(name)},$,$,$,$,$,$${extra})`); typeRefs[k] = r; typeOf[r] = [];
    const t = model.type(kind, name);
    if (kind === "wall" && (t.layers?.length || t.material)) { const layers = (t.layers?.length ? t.layers : [{ material: t.material, thickness: t.thickness }]).map((ly) => add(`IFCMATERIALLAYER(${material(ly.material)},${f(m(ly.thickness))},$,${str(ly.material)},$,$,$)`)); associate(`ls/${name}`, add(`IFCMATERIALLAYERSET((${layers.join(",")}),${str(name)},$)`), [r]); }
    else if (t.material) associate(`m/${t.material}`, material(t.material), [r]);
    return r;
  };
  const bool = (b) => `IFCBOOLEAN(${b ? ".T." : ".F."})`;

  for (const w of model.elements.filter((e) => e.kind === "wall")) {
    const t = model.type("wall", w.type), H = model.wallHeight(w), dir = norm(sub(w.b, w.a)), Lw = dist(w.a, w.b);
    const { ea, eb } = model.wallExtents(w); const st = storeys[w.level];
    const pl = place(st.pl, m(w.a[0]), m(w.a[1]), 0, dir);
    const solid = rectSolid(m((Lw + eb - ea) / 2), 0, m(Lw + ea + eb), m(t.thickness), m(H));
    const wall = add(`IFCWALL(${g(`el/${w.id}`)},$,${str(w.name || w.id)},$,$,${pl},${shape([solid])},${str(w.id)},.STANDARD.)`);
    st.contained.push(wall); typeOf[typeRef("wall", w.type, "IFCWALLTYPE", ",.STANDARD.")].push(wall);
    pset(wall, "Pset_WallCommon", [["Reference", `IFCIDENTIFIER(${str(w.type)})`], ["IsExternal", bool(t.isExternal)], ["LoadBearing", bool(t.loadBearing)]]);
    let openArea = 0;
    for (const o of model.hosted(w.id)) {
      const sp = model.openingSpan(o); openArea += (sp.width * sp.height) / 1e6;
      const opl = place(pl, m(sp.from), 0, m(sp.sill));
      const op = add(`IFCOPENINGELEMENT(${g(`op/${o.id}`)},$,${str(`Opening ${o.mark}`)},$,$,${opl},${shape([rectSolid(m(sp.width / 2), 0, m(sp.width), m(t.thickness + 20), m(sp.height))])},$,.OPENING.)`);
      add(`IFCRELVOIDSELEMENT(${g(`void/${o.id}`)},$,$,$,${wall},${op})`);
      const ot = model.type(o.kind, o.type);
      const fpl = place(opl, 0, 0, 0);
      const panel = shape([rectSolid(m(sp.width / 2), 0, m(sp.width), m(o.kind === "door" ? 50 : 30), m(sp.height))]);
      const el = o.kind === "door"
        ? add(`IFCDOOR(${g(`el/${o.id}`)},$,${str(o.name || o.mark)},$,$,${fpl},${panel},${str(o.mark)},${f(m(sp.height))},${f(m(sp.width))},.DOOR.,.${ot.operation || "SINGLE_SWING_LEFT"}.,$)`)
        : add(`IFCWINDOW(${g(`el/${o.id}`)},$,${str(o.name || o.mark)},$,$,${fpl},${panel},${str(o.mark)},${f(m(sp.height))},${f(m(sp.width))},.WINDOW.,.SINGLE_PANEL.,$)`);
      add(`IFCRELFILLSELEMENT(${g(`fill/${o.id}`)},$,$,$,${op},${el})`);
      st.contained.push(el);
      typeOf[o.kind === "door" ? typeRef("door", o.type, "IFCDOORTYPE", `,.DOOR.,.${ot.operation || "SINGLE_SWING_LEFT"}.,.F.,$`) : typeRef("window", o.type, "IFCWINDOWTYPE", ",.WINDOW.,.SINGLE_PANEL.,.F.,$")].push(el);
      if (o.kind === "door") pset(el, "Pset_DoorCommon", [["Reference", `IFCIDENTIFIER(${str(o.type)})`], ...(ot.fireRating ? [["FireRating", `IFCLABEL(${str(ot.fireRating)})`]] : []), ["IsExternal", bool(t.isExternal)]]); // never invent data the model doesn't have
      else pset(el, "Pset_WindowCommon", [["Reference", `IFCIDENTIFIER(${str(o.type)})`], ["IsExternal", bool(t.isExternal)]]);
      qto(el, o.kind === "door" ? "Qto_DoorBaseQuantities" : "Qto_WindowBaseQuantities", [["Width", "LENGTH", m(sp.width)], ["Height", "LENGTH", m(sp.height)], ["Area", "AREA", (sp.width * sp.height) / 1e6]]);
    }
    const gross = (Lw * H) / 1e6;
    qto(wall, "Qto_WallBaseQuantities", [["Length", "LENGTH", m(Lw)], ["Height", "LENGTH", m(H)], ["Width", "LENGTH", m(t.thickness)], ["GrossSideArea", "AREA", gross], ["NetSideArea", "AREA", gross - openArea], ["NetVolume", "VOLUME", (gross - openArea) * m(t.thickness)]]);
  }
  for (const s of model.elements.filter((e) => e.kind === "floor" || e.kind === "roof")) {
    const t = model.type(s.kind, s.type), st = storeys[s.level], A = Math.abs(polygonArea(s.boundary)) / 1e6, P = polygonPerimeter(s.boundary) / 1000;
    const top = s.kind === "floor" ? m(s.offset || 0) : m(t.thickness);
    const b = s.kind === "roof" && s.overhang ? s.boundary : s.boundary; // overhang is shown in 3D; IFC keeps the outline (documented loss)
    const slab = add(`IFCSLAB(${g(`el/${s.id}`)},$,${str(s.name || s.id)},$,$,${place(st.pl)},${shape([polySolid(b, m(t.thickness), top - m(t.thickness))])},${str(s.id)},.${s.kind === "roof" ? "ROOF" : "FLOOR"}.)`);
    st.contained.push(slab); typeOf[typeRef(s.kind, s.type, "IFCSLABTYPE", `,.${s.kind === "roof" ? "ROOF" : "FLOOR"}.`)].push(slab);
    pset(slab, "Pset_SlabCommon", [["Reference", `IFCIDENTIFIER(${str(s.type)})`], ["IsExternal", bool(s.kind === "roof")], ["LoadBearing", bool(true)]]);
    qto(slab, "Qto_SlabBaseQuantities", [["Width", "LENGTH", m(t.thickness)], ["Perimeter", "LENGTH", P], ["NetArea", "AREA", A], ["NetVolume", "VOLUME", A * m(t.thickness)]]);
  }
  for (const r of model.elements.filter((e) => e.kind === "room")) {
    const st = storeys[r.level]; const up = model.levelAbove(r.level); const H = up ? up.elevation - model.level(r.level).elevation : 3000;
    const A = Math.abs(polygonArea(r.boundary)) / 1e6, P = polygonPerimeter(r.boundary) / 1000;
    const sp = add(`IFCSPACE(${g(`el/${r.id}`)},$,${str(r.number)},$,$,${place(st.pl)},${shape([polySolid(r.boundary, m(H))])},${str(r.name)},.ELEMENT.,.SPACE.,$)`);
    st.spaces.push(sp);
    qto(sp, "Qto_SpaceBaseQuantities", [["Height", "LENGTH", m(H)], ["NetPerimeter", "LENGTH", P], ["NetFloorArea", "AREA", A], ["GrossFloorArea", "AREA", A], ["NetVolume", "VOLUME", A * m(H)]]);
  }
  // relationships
  for (const [lid, st] of Object.entries(storeys)) {
    if (st.contained.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${g(`contain/${lid}`)},$,$,$,(${st.contained.join(",")}),${st.ref})`);
    if (st.spaces.length) add(`IFCRELAGGREGATES(${g(`spaces/${lid}`)},$,$,$,${st.ref},(${st.spaces.join(",")}))`);
  }
  for (const [tref, objs] of Object.entries(typeOf)) if (objs.length) add(`IFCRELDEFINESBYTYPE(${g(`deftype/${tref}`)},$,$,$,(${objs.join(",")}),${tref})`);
  for (const [k, a] of Object.entries(assocMat)) add(`IFCRELASSOCIATESMATERIAL(${g(`mat/${k}`)},$,$,$,(${a.objs.join(",")}),${a.mat})`);
  psets.forEach((p, i) => {
    const props = p.props.map(([name, val]) => add(`IFCPROPERTYSINGLEVALUE(${str(name)},$,${val},$)`));
    const ps = add(`IFCPROPERTYSET(${g(`pset/${i}/${p.owner}`)},$,${str(p.name)},$,(${props.join(",")}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${g(`defpset/${i}/${p.owner}`)},$,$,$,(${p.owner}),${ps})`);
  });
  qtos.forEach((q, i) => {
    const qs = q.qs.map(([name, kind, v]) => add(kind === "LENGTH" ? `IFCQUANTITYLENGTH(${str(name)},$,$,${f(v)},$)` : kind === "AREA" ? `IFCQUANTITYAREA(${str(name)},$,$,${f(v)},$)` : `IFCQUANTITYVOLUME(${str(name)},$,$,${f(v)},$)`));
    const eq = add(`IFCELEMENTQUANTITY(${g(`qto/${i}/${q.owner}`)},$,${str(q.name)},$,$,(${qs.join(",")}))`);
    add(`IFCRELDEFINESBYPROPERTIES(${g(`defqto/${i}/${q.owner}`)},$,$,$,(${q.owner}),${eq})`);
  });
  const header = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(`${pid}.ifc`)},'1970-01-01T00:00:00',(''),('BIMja'),'BIMja','BIMja 0.4','');`, "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"];
  return [...header, ...L, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
}

/** Documented export losses (the round-trip gate checks everything else). */
export const EXPORT_LOSSES = [
  "Roof overhang is drawn in 3D but the IFC roof slab follows the wall outline.",
  "Wall joins are written as overlapping extrusions at corners (no IfcRelConnectsPathElements yet).",
  "Wall layers are written as a material layer set on the wall type (no per-layer geometry).",
];
