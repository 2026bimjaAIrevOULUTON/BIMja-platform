// Clash runs off the main thread (anything over 50 ms belongs in a worker).
import { clash } from "./clash.js";
self.onmessage = (e) => {
  const { A, B, same, options } = e.data;
  const ignoreSameClass = !!options.ignoreSameClass; const pairs = new Set(options.ignorePairs || []);
  const ignore = (a, b) => (ignoreSameClass && a.ifcClass === b.ifcClass) || pairs.has(`${a.key}|${b.key}`) || pairs.has(`${b.key}|${a.key}`);
  try { self.postMessage({ ok: true, ...clash(A, same ? A : B, { tolerance: options.tolerance, clearance: options.clearance, ignore }) }); }
  catch (err) { self.postMessage({ ok: false, error: String(err.message || err) }); }
};
