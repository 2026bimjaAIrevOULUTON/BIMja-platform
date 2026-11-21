// MQTT feed against a real broker (aedes, test-only dev dependency) over WebSocket: connect, subscribe,
// QoS 0 and QoS 1 messages, JSON and bare-number payloads; bad packets don't crash.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket, createWebSocketStream } from "ws";
import { Aedes } from "aedes";
import { mqttFeed, readPackets, readingsFrom } from "../src/twin/mqtt.js";

const broker = await Aedes.createBroker(); const http = createServer(); const wss = new WebSocketServer({ server: http });
wss.on("connection", (ws) => broker.handle(createWebSocketStream(ws)));
await new Promise((r) => http.listen(0, "127.0.0.1", r)); const url = `ws://127.0.0.1:${http.address().port}`;
const got = []; const status = [];
const feed = mqttFeed({ url, topic: "bimja/#", onReading: (r) => got.push(r), onStatus: (s) => status.push(s), WebSocketImpl: WebSocket });
await new Promise((r) => { const t = setInterval(() => { if (status.includes("subscribed")) { clearInterval(t); r(); } }, 20); });
const pub = (topic, payload, qos = 0) => new Promise((r) => broker.publish({ cmd: "publish", topic, payload: Buffer.from(payload), qos, retain: false, dup: false }, r));
await pub("bimja/T1", "24.5"); await pub("bimja/batch", JSON.stringify([{ sensor: "C1", value: 900 }, { sensor: "T1", value: 27 }]), 1); await pub("other/x", "1");
await new Promise((r) => setTimeout(r, 200));
assert.deepEqual(got.map((g) => [g.sensor, g.value]), [["T1", 24.5], ["C1", 900], ["T1", 27]]);
feed.close(); await new Promise((r) => setTimeout(r, 100)); assert.ok(status.includes("closed"));
// robustness
assert.deepEqual(readingsFrom("bimja/x", "not json"), []); assert.deepEqual(readingsFrom("a/b", "{\"sensor\":\"s\",\"value\":\"nan\"}"), []);
for (let i = 0; i < 200; i++) { const b = Uint8Array.from({ length: 1 + (i % 40) }, (_, k) => (k * 97 + i * 31) & 255); try { readPackets(b); } catch (e) { assert.match(e.message, /MQTT/); } }
assert.throws(() => mqttFeed({ url: "http://x", onReading() {} }), /ws:\/\//);
await new Promise((r) => broker.close(r)); http.close(); wss.close();
console.log(`ok mqtt: ${got.length} readings from a real broker (aedes) over WebSocket, QoS 0+1, JSON and number payloads`);
process.exit(0);
