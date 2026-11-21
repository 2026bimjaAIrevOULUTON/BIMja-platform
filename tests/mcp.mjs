// MCP gate (headless): initialize, list tools (every registry command), call tools, refusals come back typed.
import { spawn } from "node:child_process"; import assert from "assert/strict"; import readline from "node:readline";
import { REGISTRY } from "../src/commands/registry.js";
const p = spawn(process.execPath, [new URL("../mcp/bimja-mcp.mjs", import.meta.url).pathname, "--headless"], { stdio: ["pipe", "pipe", "inherit"] });
const rl = readline.createInterface({ input: p.stdout }); const waiting = new Map(); let n = 0;
rl.on("line", (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); });
const call = (method, params) => new Promise((r) => { const id = ++n; waiting.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const init = await call("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "test-agent" }, capabilities: {} });
assert.equal(init.result.serverInfo.name, "bimja");
const list = (await call("tools/list", {})).result.tools;
assert.equal(list.length, REGISTRY.filter((r) => r.needs !== "viewer").length);
const tool = async (name, args) => JSON.parse((await call("tools/call", { name, arguments: args })).result.content[0].text);
const w = await tool("walls", { points: [[0,0],[8000,0],[8000,6000],[0,6000]], closed: true });
assert.ok(w.proposal, "agent write is a proposal by default");
const w2 = await tool("walls", { points: [[0,0],[8000,0],[8000,6000],[0,6000]], closed: true, apply: true });
assert.ok(w2.ok && w2.rev === 1);
assert.equal((await tool("door", { wall: "nope", offset: 1, apply: true })).refusals[0].code, "no_such_element");
assert.equal((await tool("render", {})).refusals[0].code, "unavailable"); // viewer tools need the browser
const d = await tool("describe", {}); assert.equal(d.data.authored.counts.wall, 4);
const logs = await tool("log", {}); assert.equal(logs.data[0].actor, "agent:test-agent");
p.kill(); console.log(`ok mcp: ${list.length} tools headless, attribution agent:test-agent`);
