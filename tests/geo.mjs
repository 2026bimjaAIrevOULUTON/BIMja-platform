// Georef gate: proj4js agrees with PROJ (pyproj) within 1 mm for known points; the CRS and anchor survive an IFC round trip.
import assert from "assert/strict"; import { execFileSync } from "child_process";
import * as WebIFC from "web-ifc";
import { definitionFor, localToMap, mapToLocal, mapToWgs84, wgs84ToMap, readIfcGeoref } from "../src/geo/geo.js";
import { Bus } from "../src/core/bus.js"; import { installCore } from "../src/core/handlers.js"; import { exportIFC } from "../src/author/ifc-export.js";
import { createApi, openModel } from "../src/ifc.js";
const cases = [["EPSG:32643", [73.8567, 18.5204]], ["EPSG:27700", [-0.1276, 51.5072]], ["EPSG:7755", [77.209, 28.6139]], ["EPSG:2263", [-73.9857, 40.7484]], ["EPSG:25832", [9.9937, 53.5511]], ["EPSG:2154", [2.3522, 48.8566]], ["EPSG:32755", [151.2093, -33.8688]]];
const inv = {}; const ours = []; for (const [code, ll] of cases) { const crs = definitionFor(code); const m = await wgs84ToMap(ll, crs); const back = await mapToWgs84(m, crs); ours.push({ code, def: crs.def, ll, m }); const dm = Math.hypot((back[0] - ll[0]) * 111320 * Math.cos((ll[1] * Math.PI) / 180), (back[1] - ll[1]) * 110540); inv[code] = dm; }
const py = JSON.parse(execFileSync("python3", ["-c", `
import json,sys,pyproj
cs=json.loads(sys.argv[1]); out=[]
for c in cs:
  t=pyproj.Transformer.from_crs(pyproj.CRS.from_proj4("+proj=longlat +datum=WGS84 +no_defs"), pyproj.CRS.from_proj4(c["def"]), always_xy=True)
  out.append(list(t.transform(*c["ll"])))
print(json.dumps(out))`, JSON.stringify(ours)]).toString());
let worst = 0; ours.forEach((o, i) => { const d = Math.hypot(o.m[0] - py[i][0], o.m[1] - py[i][1]); worst = Math.max(worst, d); assert.ok(d < 0.001, `${o.code}: proj4js vs PROJ differ by ${(d * 1000).toFixed(3)} mm`); });
// IfcMapConversion maths round-trips
const anchor = { easting: 374000.25, northing: 2048000.75, height: 560, rotation_deg: 17.5, scale: 1 };
for (const p of [[0, 0, 0], [12.5, -3.2, 4], [-100, 250, 0]]) { const back = mapToLocal(localToMap(p, anchor), anchor); assert.ok(Math.hypot(back[0] - p[0], back[1] - p[1], back[2] - p[2]) < 1e-9); }
// CRS survives the IFC round trip
const b = installCore(new Bus()); b.execute({ name: "walls", args: { points: [[0,0],[5000,0],[5000,5000],[0,5000]], closed: true } });
const geo = { crs: "EPSG:32643", anchor }; const ifc = exportIFC(b.model, { geo });
const api = await createApi(new URL("../node_modules/web-ifc/", import.meta.url).pathname); const m = openModel(api, new TextEncoder().encode(ifc));
const g = readIfcGeoref(api, m.modelID, WebIFC); assert.equal(g.crs, "EPSG:32643");
for (const k of ["easting", "northing", "height", "scale"]) assert.ok(Math.abs(g.anchor[k] - anchor[k]) < 1e-6, k); assert.ok(Math.abs(g.anchor.rotation_deg - anchor.rotation_deg) < 1e-6);
assert.equal(readIfcGeoref(api, openModel(api, new TextEncoder().encode(exportIFC(b.model))).modelID, WebIFC), null, "no CRS stays no CRS");
const worstInv = Math.max(...Object.values(inv));
// proj4js's inverse datum shift (7-parameter Helmert, iterative geodetic) closes to ~1 mm; forward must match PROJ within 1 mm.
assert.ok(worstInv < 0.002, `inverse round trip off by ${(worstInv * 1000).toFixed(3)} mm`);
console.log(`inverse round trip worst ${(worstInv * 1000).toFixed(3)} mm (${Object.entries(inv).sort((a, b) => b[1] - a[1])[0][0]})`);
console.log(`ok geo: ${cases.length} CRSs agree with PROJ ${py.length ? "(worst " + (worst * 1000).toFixed(4) + " mm)" : ""}; map conversion exact; CRS + anchor survive IFC round trip`);
