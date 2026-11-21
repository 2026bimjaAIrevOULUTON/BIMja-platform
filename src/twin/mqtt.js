// Minimal MQTT 3.1.1 client over WebSocket (subprotocol "mqtt"): CONNECT, SUBSCRIBE, PUBLISH QoS 0/1 in, PINGREQ.
// Enough to read sensor topics from any broker (Mosquitto, EMQX, HiveMQ, AWS IoT via wss). No dependencies.
const enc = new TextEncoder(), dec = new TextDecoder();
const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const remLen = (n) => { const out = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return out; };
const packet = (type, flags, body) => new Uint8Array([(type << 4) | flags, ...remLen(body.length), ...body]);

export function connectPacket({ clientId, username, password, keepalive = 30 }) {
  let flags = 0x02; if (username) flags |= 0x80; if (password) flags |= 0x40;
  return packet(1, 0, [...str("MQTT"), 4, flags, keepalive >> 8, keepalive & 255, ...str(clientId), ...(username ? str(username) : []), ...(password ? str(password) : [])]);
}
export const subscribePacket = (id, topics) => packet(8, 2, [id >> 8, id & 255, ...topics.flatMap((t) => [...str(t), 1])]);
export const pingPacket = () => new Uint8Array([0xc0, 0]);

/** Split a byte stream into MQTT packets. Returns { packets, rest }. */
export function readPackets(buf) {
  const packets = []; let i = 0;
  while (i < buf.length) {
    let mult = 1, len = 0, j = i + 1, b;
    do { if (j >= buf.length) return { packets, rest: buf.slice(i) }; b = buf[j++]; len += (b & 127) * mult; mult *= 128; if (mult > 128 ** 4) throw new Error("bad MQTT length"); } while (b & 128);
    if (j + len > buf.length) break;
    packets.push({ type: buf[i] >> 4, flags: buf[i] & 15, body: buf.slice(j, j + len) }); i = j + len;
  }
  return { packets, rest: buf.slice(i) };
}
export function parsePublish(p) {
  const tl = (p.body[0] << 8) | p.body[1]; const topic = dec.decode(p.body.slice(2, 2 + tl)); const qos = (p.flags >> 1) & 3;
  const off = 2 + tl + (qos ? 2 : 0); const id = qos ? (p.body[2 + tl] << 8) | p.body[3 + tl] : null;
  return { topic, qos, id, payload: dec.decode(p.body.slice(off)) };
}

/** Readings from a message: JSON {sensor, value} or a list of them, or a bare number on topic .../<sensorId>. */
export function readingsFrom(topic, payload) {
  const t = payload.trim();
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return [{ sensor: topic.split("/").pop(), value: +t }];
  try { const j = JSON.parse(t); return [].concat(j).filter((r) => r && r.sensor != null && Number.isFinite(+r.value)).map((r) => ({ sensor: String(r.sensor), value: +r.value, tick: r.tick })); } catch { return []; }
}

/** Connect, subscribe, and call onReading for each reading. Returns { close }. WebSocketImpl lets Node tests pass `ws`. */
export function mqttFeed({ url, topic = "bimja/#", clientId = `bimja-${Math.random().toString(16).slice(2, 10)}`, username, password, onReading, onStatus = () => {}, WebSocketImpl = globalThis.WebSocket }) {
  if (!/^wss?:\/\//.test(url || "")) throw Object.assign(new Error("MQTT needs a ws:// or wss:// broker URL (MQTT over WebSocket)"), { code: "bad_arg" });
  const ws = new WebSocketImpl(url, "mqtt"); ws.binaryType = "arraybuffer"; let rest = new Uint8Array(0), ping = null;
  const send = (u8) => { if (ws.readyState === 1) ws.send(u8); };
  ws.onopen = () => { send(connectPacket({ clientId, username, password })); };
  ws.onmessage = (ev) => {
    const data = new Uint8Array(ev.data instanceof ArrayBuffer ? ev.data : ev.data.buffer ? ev.data.buffer.slice(ev.data.byteOffset, ev.data.byteOffset + ev.data.byteLength) : ev.data);
    const all = new Uint8Array(rest.length + data.length); all.set(rest); all.set(data, rest.length);
    let r; try { r = readPackets(all); } catch (e) { onStatus("error", e.message); ws.close(); return; } rest = r.rest;
    for (const p of r.packets) {
      if (p.type === 2) { if (p.body[1] !== 0) { onStatus("refused", `CONNACK code ${p.body[1]}`); ws.close(); return; } send(subscribePacket(1, [].concat(topic))); ping = setInterval(() => send(pingPacket()), 25000); onStatus("connected"); }
      else if (p.type === 9) onStatus("subscribed");
      else if (p.type === 3) { const m = parsePublish(p); if (m.qos === 1) send(packet(4, 0, [m.id >> 8, m.id & 255])); for (const rd of readingsFrom(m.topic, m.payload)) onReading(rd, m.topic); }
    }
  };
  ws.onerror = () => onStatus("error", "WebSocket error"); ws.onclose = () => { if (ping) clearInterval(ping); onStatus("closed"); };
  return { close: () => { if (ping) clearInterval(ping); try { send(new Uint8Array([0xe0, 0])); ws.close(); } catch { /* closed */ } } };
}
