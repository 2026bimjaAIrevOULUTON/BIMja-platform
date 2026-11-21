// Deterministic sample survey of a sloping site with a shallow gully (map coordinates, metres), in three formats.
import { writeFileSync } from "node:fs";
const E0 = 482150, N0 = 2047320; // UTM-like coordinates
const z = (x, y) => 512 + 0.065 * x + 0.025 * y + 1.6 * Math.sin(x / 23) * Math.cos(y / 31) - 2.2 * Math.exp(-(((x - 20) / 9) ** 2));
let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pts = []; for (let i = 0; i < 900; i++) { const x = -60 + rnd() * 120, y = -45 + rnd() * 90; pts.push([E0 + x, N0 + y, z(x, y)]); }
for (let x = -60; x <= 60; x += 20) for (let y = -45; y <= 45; y += 15) pts.push([E0 + x, N0 + y, z(x, y)]);
writeFileSync("public/survey/sample-site.csv", "Point,Easting,Northing,Level,Code\n" + pts.map((p, i) => `${i + 1},${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)},GS`).join("\n") + "\n");
// DXF: spot levels as POINT + TEXT, plus a 3D boundary polyline
const d = ["0", "SECTION", "2", "ENTITIES"];
pts.slice(0, 500).forEach((p) => { d.push("0", "POINT", "8", "SPOT", "10", p[0].toFixed(3), "20", p[1].toFixed(3), "30", p[2].toFixed(3)); });
pts.slice(500, 700).forEach((p) => { d.push("0", "TEXT", "8", "LEVELS", "10", p[0].toFixed(3), "20", p[1].toFixed(3), "30", "0", "40", "0.5", "1", p[2].toFixed(2)); });
d.push("0", "POLYLINE", "8", "BOUNDARY", "66", "1", "70", "8", "10", "0", "20", "0", "30", "0");
for (const [x, y] of [[-60, -45], [60, -45], [60, 45], [-60, 45], [-60, -45]]) d.push("0", "VERTEX", "8", "BOUNDARY", "10", (E0 + x).toFixed(3), "20", (N0 + y).toFixed(3), "30", z(x, y).toFixed(3), "70", "32");
d.push("0", "SEQEND", "0", "ENDSEC", "0", "EOF"); writeFileSync("public/survey/sample-site.dxf", d.join("\n") + "\n");
// LandXML: points as a surface definition (northing easting elevation)
const P = pts.slice(0, 600).map((p, i) => `<P id="${i + 1}">${p[1].toFixed(3)} ${p[0].toFixed(3)} ${p[2].toFixed(3)}</P>`).join("");
writeFileSync("public/survey/sample-site.xml", `<?xml version="1.0"?>\n<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2"><Units><Metric linearUnit="meter" areaUnit="squareMeter" volumeUnit="cubicMeter"/></Units><Surfaces><Surface name="Existing ground"><Definition surfType="TIN"><Pnts>${P}</Pnts></Definition></Surface></Surfaces></LandXML>\n`);
console.log("samples", pts.length);
