// Twin history that survives a reload: readings in IndexedDB (this browser only, never uploaded).
// Writes are batched; reads return the newest N in tick order. Falls back to memory where IndexedDB is missing.
const DB = "bimja-twin", STORE = "readings";
export function openStore(name = DB) {
  if (typeof indexedDB === "undefined") return memoryStore();
  const ready = new Promise((res, rej) => { const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { autoIncrement: true }); s.createIndex("tick", "tick"); s.createIndex("sensor", "sensor"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }).catch(() => null);
  let queue = [], timer = null;
  const tx = async (mode, fn) => { const db = await ready; if (!db) return null; return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
  const flush = () => { const rows = queue; queue = []; timer = null; return rows.length ? tx("readwrite", (s) => rows.forEach((r) => s.add(r))) : Promise.resolve(); };
  return {
    persistent: true,
    add(row) { queue.push(row); timer ||= setTimeout(flush, 500); },
    flush,
    async last(n = 5000, sensor) { await flush(); const db = await ready; if (!db) return [];
      return new Promise((res) => { const out = []; const s = db.transaction(STORE).objectStore(STORE); const src = sensor ? s.index("sensor").openCursor(IDBKeyRange.only(sensor), "prev") : s.openCursor(null, "prev");
        src.onsuccess = (e) => { const c = e.target.result; if (c && out.length < n) { out.push(c.value); c.continue(); } else res(out.reverse()); }; src.onerror = () => res(out); }); },
    async count() { await flush(); return (await tx("readonly", (s) => s.count())) ?? 0; },
    async clear() { queue = []; await tx("readwrite", (s) => s.clear()); },
  };
}
function memoryStore() { const rows = []; return { persistent: false, add: (r) => rows.push(r), flush: async () => {}, last: async (n = 5000, sensor) => rows.filter((r) => !sensor || r.sensor === sensor).slice(-n), count: async () => rows.length, clear: async () => { rows.length = 0; } }; }
