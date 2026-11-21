#!/usr/bin/env node
// BIMja MCP server (stdio). One command layer, two modes:
//   attached (default): bridges to the BIMja tab open in your browser over ws://127.0.0.1 (token-protected),
//                       so you and the agent work on the same model, with attribution, proposals and locks.
//   --headless:         runs the same engine in Node, no browser (authoring, schedules, scripts).
// Usage in an MCP client config:  { "command": "node", "args": ["mcp/bimja-mcp.mjs"] }
// Options: --headless  --app <url>  --port <n>  --open  --apply (agent writes apply directly, for headless batch runs)
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { REGISTRY, byName } from "../src/commands/registry.js";
import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true; };
const HEADLESS = !!opt("headless", false);
const APP = String(opt("app", process.env.BIMJA_APP || "https://2026bimjaairevouluton.github.io/BIMja-platform/"));
const PORT = Number(opt("port", process.env.BIMJA_PORT || 0));
const APPLY = !!opt("apply", false);
const ALLOWED_ORIGINS = new Set([new URL(APP).origin, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8099"]);
const log = (...a) => process.stderr.write(`[bimja-mcp] ${a.join(" ")}\n`); // stdout is the MCP channel

let clientName = "agent";
let bus = null, ws = null, tab = null, pending = new Map(), nextId = 1, connectUrl = null;

if (HEADLESS) {
  bus = installCore(new Bus());
  for (const r of REGISTRY) if (r.needs === "viewer") bus.register(r.name, () => { throw Object.assign(new Error(`${r.name} needs the browser view; run attached (without --headless) and open the BIMja tab`), { code: "unavailable" }); }, { kind: "read" });
  log("headless mode: engine running in Node");
} else {
  const { WebSocketServer } = await import("ws");
  const token = randomBytes(18).toString("base64url");
  const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT, verifyClient: ({ origin, req }) => ALLOWED_ORIGINS.has(origin) && req.url === `/${token}` });
  await new Promise((r) => wss.once("listening", r));
  const port = wss.address().port;
  connectUrl = `${APP}#bimja=ws://127.0.0.1:${port}/${token}`;
  wss.on("connection", (sock) => {
    if (tab) tab.close(4000, "another tab connected");
    tab = sock; log("BIMja tab connected");
    sock.send(JSON.stringify({ type: "hello", actor: `agent:${clientName}` }));
    sock.on("message", (buf) => { let m; try { m = JSON.parse(buf); } catch { return; } const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result); } });
    sock.on("close", () => { if (tab === sock) tab = null; log("BIMja tab disconnected"); });
  });
  log(`attached mode. Open BIMja with this link (it carries a one-time token):\n  ${connectUrl}`);
  if (opt("open", false)) openBrowser(connectUrl);
}

function openBrowser(url) {
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref(); } catch (e) { log("could not open a browser:", e.message); }
}

async function run(name, args) {
  const { dry_run, apply, rev, session, ...rest } = args || {};
  const cmd = { name, args: rest, dry_run, apply: apply ?? APPLY, rev, session: session || `mcp-${clientName}-${Date.now().toString(36)}`, actor: `agent:${clientName}` };
  if (HEADLESS) return bus.execute(cmd);
  if (!tab) return { ok: false, rev: null, changed: [], refusals: [{ code: "unavailable", message: `No BIMja tab is connected. Ask the user to open: ${connectUrl}` }] };
  const id = nextId++;
  return await new Promise((resolve) => {
    pending.set(id, resolve); tab.send(JSON.stringify({ id, type: "execute", cmd }));
    setTimeout(() => { if (pending.delete(id)) resolve({ ok: false, refusals: [{ code: "unavailable", message: "the tab did not answer in 15 s" }] }); }, 15000);
  });
}

const META = { dry_run: { type: "boolean", description: "Validate and return the diff without changing anything" },
  apply: { type: "boolean", description: "Apply directly instead of proposing (headless/batch runs; a person may still be asked)" },
  rev: { type: "number", description: "The model rev you read; a newer model refuses with stale_rev plus a diff" },
  session: { type: "string", description: "Group several calls so they undo as one step" } };
function tools() {
  return REGISTRY.filter((r) => !(HEADLESS && r.needs === "viewer")).map((r) => ({
    name: r.name,
    description: `${r.help}${r.status === "stub" ? "" : ""}. Domain: ${r.domain}. Refusals: ${(r.refusals || []).join(", ")}.${r.example ? ` Example args: ${JSON.stringify(r.example)}` : ""}`,
    inputSchema: { type: "object", additionalProperties: true,
      properties: { ...Object.fromEntries(Object.entries(r.args || {}).map(([k, v]) => [k, { description: String(v) }])), ...(r.kind === "read" || r.kind === "view" ? {} : META) } },
  }));
}

function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"); }
function error(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"); }

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      clientName = String(params?.clientInfo?.name || "agent").replace(/[^\w.-]/g, "").slice(0, 32) || "agent";
      reply(id, { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "bimja", version: "0.3.0" },
        instructions: `BIMja: open BIM in the browser. Call "commands" to learn the surface and "describe" for the model. Your writes are proposals a person applies unless you pass apply:true. Units: mm.${HEADLESS ? " Headless mode." : ` If no tab is connected, ask the user to open ${connectUrl}`}` });
    } else if (method === "notifications/initialized" || method?.startsWith("notifications/")) { /* no reply */ }
    else if (method === "ping") reply(id, {});
    else if (method === "tools/list") reply(id, { tools: tools() });
    else if (method === "tools/call") {
      const name = params?.name; if (!byName[name]) return reply(id, { isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] });
      const r = await run(name, params.arguments || {});
      if (name === "render" && r.ok && typeof r.data === "string" && r.data.startsWith("data:image/png;base64,"))
        return reply(id, { content: [{ type: "image", data: r.data.split(",")[1], mimeType: "image/png" }, { type: "text", text: JSON.stringify({ ok: true, rev: r.rev }) }] });
      reply(id, { isError: !r.ok, content: [{ type: "text", text: JSON.stringify(r) }] });
    } else if (id !== undefined) error(id, -32601, `method not found: ${method}`);
  } catch (e) { if (id !== undefined) error(id, -32603, e.message); }
});
