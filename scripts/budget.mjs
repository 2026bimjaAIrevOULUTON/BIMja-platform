// Load budget gate: gzip size of everything index.html loads up front (scripts, styles, modulepreloads).
// Lazy chunks, WASM and sample models are reported but not counted. Fails the build over the limit.
import fs from "fs"; import path from "path"; import zlib from "zlib";
const LIMIT = 600 * 1024; const dist = new URL("../dist/", import.meta.url).pathname;
const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const initial = new Set([...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map((m) => m[1]));
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dist, f)), { level: 9 }).length;
let total = gz("index.html"); const rows = [["index.html", total]];
for (const f of initial) { const s = gz(f); total += s; rows.push([f, s]); }
const lazy = fs.readdirSync(path.join(dist, "assets")).map((f) => `assets/${f}`).filter((f) => !initial.has(f));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
rows.forEach(([f, s]) => console.log(`  initial  ${kb(s).padStart(9)}  ${f}`));
lazy.forEach((f) => console.log(`  lazy     ${kb(gz(f)).padStart(9)}  ${f}`));
console.log(`first load ${kb(total)} gzipped / budget ${kb(LIMIT)}`);
if (total > LIMIT) { console.error("BUDGET FAIL"); process.exit(1); }
