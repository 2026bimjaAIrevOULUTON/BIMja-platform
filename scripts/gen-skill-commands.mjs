// Regenerates skills/bimja/references/commands.md from the command registry, so the skill never drifts from the code.
import { writeFileSync } from "node:fs";
import { REGISTRY } from "../src/commands/registry.js";
const fmt = (o) => Object.entries(o || {}).map(([k, v]) => `\`${k}\`: ${String(v).replace(/\|/g, "\\|")}`).join("; ") || "—";
const by = new Map(); for (const r of REGISTRY) { if (!by.has(r.domain)) by.set(r.domain, []); by.get(r.domain).push(r); }
let md = `# BIMja command catalogue\n\nGenerated from \`src/commands/registry.js\` by \`node scripts/gen-skill-commands.mjs\` — do not edit by hand.\n${REGISTRY.length} commands. Each is an MCP tool of the same name and \`window.bimja.run(name, args)\` in the browser.\nKinds: **read** (no change), **control** (session state), otherwise a **write** (logged, attributable, undoable; agents' writes become proposals unless applied).\n"needs viewer" = only in attached mode (a browser tab), not headless.\n\nDomains: ${[...by.keys()].map((d) => `[${d}](#${d})`).join(" · ")}\n`;
for (const [d, list] of by) { md += `\n## ${d}\n\n| Command | What it does | Args | Kind |\n|---|---|---|---|\n`;
  for (const r of list) md += `| \`${r.name}\` | ${r.help.replace(/\|/g, "\\|")}${r.needs ? " *(needs viewer)*" : ""}${r.status === "stub" ? " **(not implemented yet)**" : ""} | ${fmt(r.args)}${r.example ? `<br>e.g. \`${JSON.stringify(r.example).replace(/\|/g, "\\|")}\`` : ""} | ${r.kind || "write"} |\n`; }
writeFileSync(new URL("../skills/bimja/references/commands.md", import.meta.url), md); console.log(`wrote ${REGISTRY.length} commands`);
