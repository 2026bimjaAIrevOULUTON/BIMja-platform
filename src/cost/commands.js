// 5D commands on the bus (headless-safe). State: bus.extra.cost {currency, rates}, bus.extra.assets {ref: fields}.
import { authoredRecords } from "../author/records.js";
import { SAMPLE_RATES, validateRates, estimate, estimateCSV, ASSET_FIELDS, cobieSheets, cobieXlsx, authoredSpaceOf } from "./cost.js";
import { toBase64 } from "./xlsx.js";

const fail = (m, code = "bad_arg") => { throw Object.assign(new Error(m), { code }); };

export function installCost(bus) {
  bus.cost ||= {};
  // The app swaps these for the open IFC's index; headless they read the authored model.
  bus.cost.elements ||= () => authoredRecords(bus.model);
  bus.cost.spaceOf ||= () => authoredSpaceOf(bus.model);
  bus.cost.levels ||= () => { const ls = [...bus.model.data.levels].sort((a, b) => a.elevation - b.elevation);
    return ls.map((l, i) => ({ name: l.name, elevation_m: l.elevation / 1000, height_m: ls[i + 1] ? (ls[i + 1].elevation - l.elevation) / 1000 : undefined })); };
  bus.cost.project ||= () => bus.model.data.name || "BIMja project";

  bus.register("cost", (a) => {
    const cur = bus.extra.cost || { currency: "INR", rates: [] };
    let rates = cur.rates;
    if (a.sample) rates = validateRates(SAMPLE_RATES.rates);
    if (a.rates) rates = a.mode === "add" ? [...rates, ...validateRates(a.rates)] : validateRates(a.rates);
    if (a.remove) rates = rates.filter((r) => ![].concat(a.remove).includes(r.code));
    const currency = a.currency ? String(a.currency).toUpperCase().slice(0, 3) : a.sample ? SAMPLE_RATES.currency : cur.currency;
    if (!/^[A-Z]{3}$/.test(currency)) fail("currency must be a 3-letter ISO code (INR, USD, GBP…)");
    bus.extra.cost = { currency, rates, ...(a.sample ? { label: SAMPLE_RATES.label } : cur.label && !a.rates ? { label: cur.label } : {}) };
    const est = estimate(bus.cost.elements(), bus.extra.cost); return { rates: rates.length, currency, total: est.total, label: bus.extra.cost.label || null };
  });

  bus.register("estimate", (a) => {
    if (!bus.extra.cost?.rates?.length) fail("no rates yet: cost {sample:true} or cost {rates:[…]}");
    const est = estimate(bus.cost.elements(), bus.extra.cost); if (bus.extra.cost.label) est.label = bus.extra.cost.label;
    if (a.format === "csv") return { csv: estimateCSV(est), total: est.total, currency: est.currency };
    return est;
  }, { kind: "read" });

  bus.register("asset", (a) => {
    const reg = (bus.extra.assets ||= {});
    let refs = a.elements || (a.element ? [a.element] : null);
    if (!refs && a.rule) { const m = a.rule; refs = [...bus.cost.elements().values()].filter((e) => !e.isPart && (!m.ifc_class || [].concat(m.ifc_class).some((c) => c.toLowerCase() === e.ifcClass.toLowerCase())) && (!m.type || String(e.type || "").includes(m.type))).map((e) => e.id).sort(); a.elements = refs; }
    if (!refs?.length) fail("give element, elements or rule {ifc_class, type}");
    const recs = bus.cost.elements(); const known = new Set([...recs.values()].flatMap((e) => [e.id, e.globalId]));
    for (const r of refs) if (!known.has(r)) fail(`no element ${r}`, "no_such_element");
    for (const r of refs) {
      if (a.delete) { delete reg[r]; continue; }
      const f = { ...(reg[r] || {}) }; for (const k of ASSET_FIELDS) if (a[k] != null) f[k] = typeof a[k] === "number" ? a[k] : String(a[k]);
      if (refs.length === 1 && a.tag) f.tag = String(a.tag); else if (a.tag_prefix) f.tag = `${a.tag_prefix}${String(refs.indexOf(r) + 1).padStart(3, "0")}`;
      reg[r] = f;
    }
    return { assets: Object.keys(reg).length, changed: refs.length };
  });

  bus.register("cobie", (a) => {
    const recs = bus.cost.elements(); const assets = bus.extra.assets || {};
    const rows = cobieSheets(recs, { project: bus.cost.project(), createdBy: a.created_by || "bim@example.com", createdOn: a.created_on || "2026-01-01T00:00:00", levels: bus.cost.levels(), spaceOf: bus.cost.spaceOf(), assets, currency: bus.extra.cost?.currency });
    const summary = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
    if (a.format === "json") return { summary, sheets: rows };
    return { summary, filename: `${bus.cost.project().replace(/[^\w.-]+/g, "_")}-COBie.xlsx`, base64: toBase64(cobieXlsx(rows)) };
  }, { kind: "read" });
  return bus;
}
