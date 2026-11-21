// Minimal ZIP: write (stored, deterministic: fixed date) and read (stored + deflate via DecompressionStream).
// Enough for BCF. Works in browsers and Node 18+. No dependencies.
const enc = new TextEncoder();
let CRC; function crc32(b) { CRC ||= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** files: [{name, data: string|Uint8Array}] -> Uint8Array (no compression, DOS date 1980-01-01 for determinism) */
export function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)]; const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; } return out;
}

async function inflateRaw(data) {
  const ds = new DecompressionStream("deflate-raw"); const w = ds.writable.getWriter(); w.write(data); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
/** Uint8Array -> Map(name -> Uint8Array). Uses the central directory; refuses anything malformed with an Error. */
export async function unzip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file (no end record)");
  const n = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true); const out = new Map(); const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), lho = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    if (lho + 30 > b.length || v.getUint32(lho, true) !== 0x04034b50) throw new Error(`corrupt zip entry ${name}`);
    const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true), data = b.subarray(start, start + csize);
    if (start + csize > b.length) throw new Error(`truncated zip entry ${name}`);
    if (!name.endsWith("/")) out.set(name, method === 0 ? data : method === 8 ? await inflateRaw(data) : (() => { throw new Error(`unsupported zip method ${method}`); })());
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
