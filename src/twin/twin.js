// Digital twin engine (pure, no DOM): sensors bound to IFC GlobalIds, thresholds, alerts, a seeded simulated feed,
// and a bounded history. The simulated feed is deterministic for a given seed and tick, so demos and tests repeat.
const KINDS = { temperature: { unit: "°C", base: 22, amp: 3, min: 16, max: 27 }, humidity: { unit: "%", base: 45, amp: 10, min: 25, max: 65 },
  co2: { unit: "ppm", base: 650, amp: 250, min: 0, max: 1000 }, occupancy: { unit: "people", base: 4, amp: 4, min: 0, max: 12 }, energy: { unit: "kW", base: 12, amp: 6, min: 0, max: 25 } };
export const SENSOR_KINDS = Object.keys(KINDS);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function defaultSensor(id, kind = "temperature", extra = {}) {
  const k = KINDS[kind]; if (!k) throw Object.assign(new Error(`kind must be one of ${SENSOR_KINDS.join(", ")}`), { code: "bad_arg" });
  return { id, name: extra.name || `${kind} ${id}`, kind, unit: extra.unit || k.unit, min: extra.min ?? k.min, max: extra.max ?? k.max, element: extra.element || null };
}
/** Simulated reading for a sensor at an integer tick: a slow daily wave, noise, and a rare excursion so alerts fire. */
export function simulate(sensor, tick, seed = 7) {
  const k = KINDS[sensor.kind]; const r = mulberry32(hash(`${sensor.id}/${seed}/${tick}`));
  const wave = Math.sin((tick / 60) * Math.PI * 2 + (hash(sensor.id) % 628) / 100);
  let v = k.base + k.amp * 0.6 * wave + k.amp * 0.25 * (r() - 0.5) * 2;
  if (r() < 0.06) v = sensor.max + k.amp * (0.2 + r() * 0.5); // excursion
  return Math.round(v * 10) / 10;
}
export function evaluate(sensor, value) { return value > sensor.max ? "high" : value < sensor.min ? "low" : "ok"; }

export class History {
  constructor(limit = 2000) { this.limit = limit; this.rows = []; }
  push(row) { this.rows.push(row); if (this.rows.length > this.limit) this.rows.splice(0, this.rows.length - this.limit); }
  at(tick) { const m = new Map(); for (const r of this.rows) if (r.tick <= tick) m.set(r.sensor, r); return m; }
  range() { return this.rows.length ? [this.rows[0].tick, this.rows[this.rows.length - 1].tick] : [0, 0]; }
}
