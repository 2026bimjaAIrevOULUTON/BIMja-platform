// BCF 2.1 export/import. Issues live in BIMja as plain objects; this converts them to and from .bcfzip.
// Coordinates here are BCF/IFC world coordinates: metres, Z up. The viewer converts to and from its own frame.
import { zip, unzip } from "./zip.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v) => (Number.isFinite(+v) ? String(+(+v).toFixed(6)) : "0");
const pt = (tag, p) => `<${tag}><X>${num(p[0])}</X><Y>${num(p[1])}</Y><Z>${num(p[2])}</Z></${tag}>`;

export function visinfoXML(vp) {
  const comps = (vp.selection || []).map((g) => `<Component IfcGuid="${x(g)}"/>`).join("");
  const c = vp.camera;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<VisualizationInfo Guid="${x(vp.guid)}"><Components>${comps ? `<Selection>${comps}</Selection>` : ""}<Visibility DefaultVisibility="true"/></Components>`
    + (c ? `<PerspectiveCamera>${pt("CameraViewPoint", c.position)}${pt("CameraDirection", c.direction)}${pt("CameraUpVector", c.up)}<FieldOfView>${num(Math.min(60, Math.max(45, c.fov || 50)))}</FieldOfView></PerspectiveCamera>` : "")
    + `</VisualizationInfo>\n`;
}
export function markupXML(t) {
  const vps = t.viewpoints || [];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Markup>`
    + (t.files?.length ? `<Header>${t.files.map((f) => `<File${f.ifcProject ? ` IfcProject="${x(f.ifcProject)}"` : ""} isExternal="true"><Filename>${x(f.name)}</Filename></File>`).join("")}</Header>` : "")
    + `<Topic Guid="${x(t.guid)}" TopicType="${x(t.type || "Issue")}" TopicStatus="${x(t.status || "Open")}"><Title>${x(t.title)}</Title>`
    + (t.priority ? `<Priority>${x(t.priority)}</Priority>` : "")
    + (t.labels || []).map((l) => `<Labels>${x(l)}</Labels>`).join("")
    + `<CreationDate>${x(t.created)}</CreationDate><CreationAuthor>${x(t.author || "BIMja")}</CreationAuthor>`
    + (t.modified ? `<ModifiedDate>${x(t.modified)}</ModifiedDate><ModifiedAuthor>${x(t.modifiedBy || t.author || "BIMja")}</ModifiedAuthor>` : "")
    + (t.assigned ? `<AssignedTo>${x(t.assigned)}</AssignedTo>` : "")
    + (t.description ? `<Description>${x(t.description)}</Description>` : "")
    + `</Topic>`
    + (t.comments || []).map((c) => `<Comment Guid="${x(c.guid)}"><Date>${x(c.date)}</Date><Author>${x(c.author || "BIMja")}</Author><Comment>${x(c.text)}</Comment>${c.viewpoint ? `<Viewpoint Guid="${x(c.viewpoint)}"/>` : ""}</Comment>`).join("")
    + vps.map((v, i) => `<Viewpoints Guid="${x(v.guid)}"><Viewpoint>${i ? `viewpoint-${x(v.guid)}.bcfv` : "viewpoint.bcfv"}</Viewpoint>${v.snapshot ? `<Snapshot>${i ? `snapshot-${x(v.guid)}.png` : "snapshot.png"}</Snapshot>` : ""}<Index>${i}</Index></Viewpoints>`).join("")
    + `</Markup>\n`;
}
const b64ToBytes = (s) => { const bin = atob(s.replace(/^data:image\/png;base64,/, "")); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const bytesToB64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

/** topics -> .bcfzip bytes (deterministic for the same input) */
export function exportBCF(topics) {
  const files = [{ name: "bcf.version", data: `<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>\n` }];
  for (const t of topics) {
    files.push({ name: `${t.guid}/markup.bcf`, data: markupXML(t) });
    (t.viewpoints || []).forEach((v, i) => {
      files.push({ name: `${t.guid}/${i ? `viewpoint-${v.guid}.bcfv` : "viewpoint.bcfv"}`, data: visinfoXML(v) });
      if (v.snapshot) files.push({ name: `${t.guid}/${i ? `snapshot-${v.guid}.png` : "snapshot.png"}`, data: b64ToBytes(v.snapshot) });
    });
  }
  return zip(files);
}

// ---- a small XML reader (enough for BCF; no DTDs, no namespaces needed) ----
export function parseXML(s) {
  const root = { name: "#root", attrs: {}, children: [], text: "" }; const stack = [root]; let i = 0;
  const ent = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()] ?? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))));
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) break; if (lt > i) stack[stack.length - 1].text += ent(s.slice(i, lt));
    if (s.startsWith("<!--", lt)) { i = s.indexOf("-->", lt) + 3; continue; }
    if (s.startsWith("<![CDATA[", lt)) { const e = s.indexOf("]]>", lt); stack[stack.length - 1].text += s.slice(lt + 9, e); i = e + 3; continue; }
    if (s[lt + 1] === "?" || s[lt + 1] === "!") { i = s.indexOf(">", lt) + 1; continue; }
    const gt = s.indexOf(">", lt); if (gt < 0) throw new Error("malformed XML");
    const raw = s.slice(lt + 1, gt);
    if (raw[0] === "/") { const n = raw.slice(1).trim(); const top = stack.pop(); if (top.name !== n) throw new Error(`malformed XML: </${n}> closes <${top.name}>`); i = gt + 1; continue; }
    const selfClose = raw.endsWith("/"); const body = selfClose ? raw.slice(0, -1) : raw; const m = body.match(/^([\w:.-]+)/); if (!m) throw new Error("malformed XML tag");
    const node = { name: m[1].replace(/^.*:/, ""), attrs: {}, children: [], text: "" };
    for (const a of body.slice(m[1].length).matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) node.attrs[a[1].replace(/^.*:/, "")] = ent(a[3] ?? a[4]);
    stack[stack.length - 1].children.push(node); if (!selfClose) stack.push(node); i = gt + 1;
  }
  if (stack.length !== 1) throw new Error("malformed XML: unclosed tags");
  return root.children[0];
}
const kid = (n, name) => n?.children.find((c) => c.name === name);
const kids = (n, name) => (n?.children || []).filter((c) => c.name === name);
const txt = (n, name) => { const c = kid(n, name); return c ? c.text.trim() : undefined; };
const P = (n) => (n ? [+txt(n, "X"), +txt(n, "Y"), +txt(n, "Z")] : undefined);

/** .bcfzip bytes -> topics. Returns an error object instead of throwing for bad input. */
export async function importBCF(bytes) {
  let files; try { files = await unzip(bytes); } catch (e) { return { ok: false, error: `not a BCF zip: ${e.message}` }; }
  const dec = new TextDecoder(); const topics = []; const errors = [];
  for (const [name, data] of files) {
    if (!name.endsWith("/markup.bcf")) continue; const folder = name.slice(0, -"markup.bcf".length);
    try {
      const mk = parseXML(dec.decode(data)), tp = kid(mk, "Topic"); if (!tp) throw new Error("no Topic");
      const t = { guid: tp.attrs.Guid, title: txt(tp, "Title") || "(untitled)", type: tp.attrs.TopicType, status: tp.attrs.TopicStatus, priority: txt(tp, "Priority"),
        labels: kids(tp, "Labels").map((l) => l.text.trim()), created: txt(tp, "CreationDate"), author: txt(tp, "CreationAuthor"), modified: txt(tp, "ModifiedDate"), modifiedBy: txt(tp, "ModifiedAuthor"),
        assigned: txt(tp, "AssignedTo"), description: txt(tp, "Description"),
        files: kids(kid(mk, "Header"), "File").map((f) => ({ name: txt(f, "Filename"), ifcProject: f.attrs.IfcProject })).filter((f) => f.name),
        comments: kids(mk, "Comment").map((c) => ({ guid: c.attrs.Guid, date: txt(c, "Date"), author: txt(c, "Author"), text: txt(c, "Comment"), viewpoint: kid(c, "Viewpoint")?.attrs.Guid })),
        viewpoints: [] };
      for (const v of kids(mk, "Viewpoints")) {
        const vfile = txt(v, "Viewpoint"), sfile = txt(v, "Snapshot"); const vx = vfile && files.get(folder + vfile);
        const vi = vx ? parseXML(dec.decode(vx)) : null; const cam = kid(vi, "PerspectiveCamera");
        const snap = sfile && files.get(folder + sfile);
        const vpo = { guid: v.attrs.Guid, selection: kids(kid(kid(vi, "Components"), "Selection"), "Component").map((c) => c.attrs.IfcGuid).filter(Boolean),
          camera: cam ? { position: P(kid(cam, "CameraViewPoint")), direction: P(kid(cam, "CameraDirection")), up: P(kid(cam, "CameraUpVector")), fov: +txt(cam, "FieldOfView") } : null,
          ...(snap ? { snapshot: bytesToB64(snap) } : {}) };
        t.viewpoints.push(vpo);
      }
      for (const k of Object.keys(t)) if (t[k] === undefined || (Array.isArray(t[k]) && !t[k].length && k !== "viewpoints" && k !== "comments" && k !== "labels")) delete t[k];
      topics.push(t);
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  return { ok: errors.length === 0 || topics.length > 0, topics, errors };
}
