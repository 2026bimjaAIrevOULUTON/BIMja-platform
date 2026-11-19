// Handover / data-quality rules (IDS-style, simplified). Editable JSON; agents can pass their own rule set.
export const DEFAULT_RULES = {
  name: "BIMja handover baseline v0",
  appliesTo: ["IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcRoof", "IfcDoor", "IfcWindow", "IfcColumn", "IfcBeam", "IfcStair", "IfcStairFlight",
    "IfcRailing", "IfcCovering", "IfcCurtainWall", "IfcPlate", "IfcMember", "IfcFurnishingElement", "IfcFlowTerminal", "IfcSpace"],
  rules: [
    { id: "R1", sev: "high", title: "Element has a Name", applies: "*", check: (e) => !!e.name?.trim() },
    { id: "R2", sev: "high", title: "Element is placed on a storey", applies: "*", check: (e) => !!e.storey },
    { id: "R3", sev: "medium", title: "Element has a Type (needed for COBie Type sheet)", applies: "*", except: ["IfcSpace"], check: (e) => !!e.type || e.isPart },
    { id: "R4", sev: "medium", title: "Element has a Material", applies: "*", except: ["IfcSpace", "IfcFlowTerminal", "IfcFurnishingElement"], check: (e) => e.materials.length > 0 },
    { id: "R5", sev: "high", title: "Door has Pset_DoorCommon.FireRating", applies: ["IfcDoor"], check: (e) => hasProp(e, "Pset_DoorCommon", "FireRating") },
    { id: "R6", sev: "medium", title: "Door/Window states IsExternal", applies: ["IfcDoor", "IfcWindow"], check: (e) => hasProp(e, /Pset_(Door|Window)Common/, "IsExternal") },
    { id: "R7", sev: "medium", title: "Wall states IsExternal and LoadBearing", applies: ["IfcWall", "IfcWallStandardCase"], check: (e) => hasProp(e, "Pset_WallCommon", "IsExternal") && hasProp(e, "Pset_WallCommon", "LoadBearing") },
    { id: "R8", sev: "low", title: "Space has a LongName / room name", applies: ["IfcSpace"], check: (e) => !!(e.longName || hasAnyProp(e, /LongName|RoomName/i)) },
    { id: "R9", sev: "low", title: "Element has base quantities (for 5D take-off)", applies: ["IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcRoof", "IfcColumn", "IfcBeam", "IfcSpace"], check: (e) => Object.keys(e.quantities).length > 0 },
  ],
};

function hasProp(e, pset, prop) {
  for (const [name, props] of Object.entries(e.psets)) {
    if (pset instanceof RegExp ? pset.test(name) : name === pset) {
      const val = props[prop]; if (val !== undefined && val !== null && String(val).trim() !== "") return true;
    }
  }
  return false;
}
function hasAnyProp(e, re) { return Object.values(e.psets).some((p) => Object.keys(p).some((k) => re.test(k) && p[k])); }

/** Run the rule set; returns {summary, issues[]} — issues carry the element's GlobalId so they map to BCF / the model. */
export function runCheck(elements, ruleSet = DEFAULT_RULES) {
  const issues = []; let checks = 0;
  const targets = [...elements.values()].filter((e) => ruleSet.appliesTo.includes(e.ifcClass));
  for (const e of targets) {
    for (const r of ruleSet.rules) {
      const applies = r.applies === "*" ? !(r.except || []).includes(e.ifcClass) : r.applies.includes(e.ifcClass);
      if (!applies) continue;
      checks++;
      if (!r.check(e)) issues.push({ rule: r.id, severity: r.sev, title: r.title, expressID: e.id, globalId: e.globalId, ifcClass: e.ifcClass, name: e.name, storey: e.storey || "" });
    }
  }
  const bySev = (s) => issues.filter((i) => i.severity === s).length;
  const byRule = Object.fromEntries(ruleSet.rules.map((r) => [r.id, { title: r.title, severity: r.sev, failed: issues.filter((i) => i.rule === r.id).length }]));
  const score = checks ? Math.round(100 * (1 - issues.length / checks)) : 100;
  return { ruleSet: ruleSet.name, elementsChecked: targets.length, checks, passed: checks - issues.length, score,
    high: bySev("high"), medium: bySev("medium"), low: bySev("low"), byRule, issues };
}

/** 5D seed: counts + summed base quantities per IFC class. */
export function quantities(elements) {
  const rows = {};
  for (const e of elements.values()) {
    const r = rows[e.ifcClass] ||= { ifcClass: e.ifcClass, count: 0, area_m2: 0, volume_m3: 0, length_m: 0 };
    r.count++;
    let a = 0, vol = 0, len = 0;
    for (const q of Object.values(e.quantities)) {
      for (const [k, val] of Object.entries(q)) {
        if (/NetSideArea|NetArea|NetFloorArea/i.test(k)) a = Math.max(a, val);
        else if (!a && /GrossSideArea|GrossArea|GrossFloorArea|^Area$/i.test(k)) a = Math.max(a, val);
        if (/NetVolume/i.test(k)) vol = Math.max(vol, val); else if (!vol && /GrossVolume|^Volume$/i.test(k)) vol = Math.max(vol, val);
        if (/^Length$|^Perimeter$/i.test(k)) len = Math.max(len, val);
      }
    }
    r.area_m2 += a; r.volume_m3 += vol; r.length_m += len;
  }
  return Object.values(rows).map((r) => ({ ...r, area_m2: +r.area_m2.toFixed(2), volume_m3: +r.volume_m3.toFixed(3), length_m: +r.length_m.toFixed(2) }))
    .sort((a, b) => b.count - a.count);
}

export function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
}
