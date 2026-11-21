// Plan view: a 2D canvas over the viewport for drawing. Every click emits a bus command (same as agents).
// Keys: V select · W wall · D door · N window · R room · Enter/double-click finish · Esc cancel · wheel zoom · drag pan.
import { add, sub, mul, norm, perp, dist, polygonArea, projectToSegment } from "../author/geom.js";

const GRID = 100, SNAP_PX = 12;
export function initPlan({ bus, run, toast, container, onSelect }) {
  const cv = document.createElement("canvas"); cv.id = "plan"; cv.hidden = true; cv.tabIndex = 0; container.appendChild(cv);
  const ctx = cv.getContext("2d");
  const st = { on: false, tool: "select", level: null, scale: 0.05, off: [0, 0], pts: [], cursor: null, hover: null, sel: null, drag: null };
  const toolBtns = () => document.querySelectorAll("[data-plantool]");

  const w2s = (p) => [p[0] * st.scale + st.off[0], -p[1] * st.scale + st.off[1]];
  const s2w = (x, y) => [(x - st.off[0]) / st.scale, -(y - st.off[1]) / st.scale];
  const level = () => st.level || bus.model.defaultLevel();
  const walls = () => bus.model.wallsOn(level());

  function fit() {
    const els = bus.model.elements.filter((e) => e.level === level() && (e.a || e.boundary));
    const pts = els.flatMap((e) => e.boundary || [e.a, e.b]);
    const r = cv.getBoundingClientRect(); const W = r.width || 800, H = r.height || 600;
    if (!pts.length) { st.scale = Math.min(W, H) / 20000; st.off = [W / 2, H / 2]; return; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    st.scale = Math.min(W / ((maxx - minx) * 1.3 + 2000), H / ((maxy - miny) * 1.3 + 2000));
    st.off = [W / 2 - ((minx + maxx) / 2) * st.scale, H / 2 + ((miny + maxy) / 2) * st.scale];
  }
  function snap(raw) {
    const cands = [];
    for (const w of walls()) cands.push(w.a, w.b);
    for (const p of st.pts) cands.push(p);
    let best = null;
    for (const c of cands) { const d = dist(c, raw) * st.scale; if (d < SNAP_PX && (!best || d < best.d)) best = { p: c, d, kind: "end" }; }
    if (best) return { p: [...best.p], kind: "end" };
    if (st.tool === "wall" && st.pts.length) { // angle snap (15°) from the last point, then grid on the length
      const last = st.pts[st.pts.length - 1], v = sub(raw, last), ang = Math.atan2(v[1], v[0]), step = Math.PI / 12;
      const a = Math.round(ang / step) * step, L = Math.round(Math.hypot(v[0], v[1]) / GRID) * GRID;
      return { p: [Math.round(last[0] + Math.cos(a) * L), Math.round(last[1] + Math.sin(a) * L)], kind: "angle" };
    }
    return { p: [Math.round(raw[0] / GRID) * GRID, Math.round(raw[1] / GRID) * GRID], kind: "grid" };
  }
  function hitElement(p) {
    let best = null;
    for (const e of bus.model.elements.filter((x) => x.level === level())) {
      if (e.kind === "wall") { const d = projectToSegment(p, e.a, e.b).d; const t = bus.model.type("wall", e.type).thickness / 2 + 4 / st.scale; if (d < t && (!best || d < best.d)) best = { id: e.id, d }; }
      if (e.kind === "door" || e.kind === "window") { const w = bus.model.el(e.host); const c = add(w.a, mul(norm(sub(w.b, w.a)), e.offset)); const d = dist(p, c); if (d < bus.model.openingSpan(e).width / 2 && (!best || d < best.d - 1)) best = { id: e.id, d: d - 1000 }; }
    }
    if (!best) for (const r of bus.model.elements.filter((x) => x.kind === "room" && x.level === level())) if (pointIn(p, r.boundary)) best = { id: r.id, d: 0 };
    return best?.id || null;
  }
  const pointIn = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };

  async function click(raw) {
    const s = snap(raw).p;
    if (st.tool === "select") { st.sel = hitElement(raw); onSelect(st.sel); draw(); return; }
    if (st.tool === "wall") {
      if (st.pts.length && dist(s, st.pts[0]) < 1 && st.pts.length >= 3) return finish(true);
      st.pts.push(s); draw(); return;
    }
    if (st.tool === "door" || st.tool === "window") { const r = await run(st.tool, { at: raw, level: level() }); if (!r.ok) toast(r.refusals[0].message); return; }
    if (st.tool === "room") {
      const name = (document.querySelector("#planRoomName")?.value || "").trim() || `Room ${bus.model.elements.filter((e) => e.kind === "room").length + 1}`;
      const r = await run("room", { name, at: raw, level: level() }); if (!r.ok) toast(r.refusals[0].message); return;
    }
  }
  async function finish(closed = false) {
    if (st.pts.length >= 2) {
      const pts = st.pts.slice(); st.pts = [];
      const type = document.querySelector("#planWallType")?.value || "Exterior 230";
      const r = await run(pts.length === 2 ? "wall" : "walls", pts.length === 2 ? { start: pts[0], end: pts[1], type, level: level() } : { points: pts, closed, type, level: level() });
      if (!r.ok) toast(r.refusals[0].message);
    }
    st.pts = []; draw();
  }

  function draw() {
    if (!st.on) return;
    const r = cv.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = "#0c0f13"; ctx.fillRect(0, 0, r.width, r.height);
    // grid (1 m)
    const step = 1000 * st.scale; if (step > 6) { ctx.strokeStyle = "#161c24"; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = st.off[0] % step; x < r.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, r.height); }
      for (let y = st.off[1] % step; y < r.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(r.width, y); } ctx.stroke(); }
    const lv = level();
    // rooms
    for (const rm of bus.model.elements.filter((e) => e.kind === "room" && e.level === lv)) {
      ctx.fillStyle = st.sel === rm.id ? "#ff7a1a33" : "#5adcff14"; poly(rm.boundary); ctx.fill();
      const c = rm.boundary.reduce((a, p) => add(a, p), [0, 0]).map((v) => v / rm.boundary.length); const s = w2s(c);
      ctx.fillStyle = "#cfe8f3"; ctx.font = "600 13px Inter, system-ui"; ctx.textAlign = "center"; ctx.fillText(rm.name, s[0], s[1]);
      ctx.font = "11px Inter, system-ui"; ctx.fillStyle = "#8e99a8"; ctx.fillText(`${rm.number} · ${(Math.abs(polygonArea(rm.boundary)) / 1e6).toFixed(1)} m²`, s[0], s[1] + 15);
    }
    // walls with openings
    for (const w of bus.model.elements.filter((e) => e.kind === "wall" && e.level === lv)) {
      const t = bus.model.type("wall", w.type); const dir = norm(sub(w.b, w.a)), n = mul(perp(dir), t.thickness / 2); const { ea, eb } = bus.model.wallExtents(w);
      const A = add(w.a, mul(dir, -ea)), B = add(w.b, mul(dir, eb));
      ctx.fillStyle = st.sel === w.id ? "#ff7a1a" : t.isExternal ? "#d9dde3" : "#9aa4b2"; poly([add(A, n), add(B, n), sub(B, n), sub(A, n)]); ctx.fill();
      for (const o of bus.model.hosted(w.id)) {
        const sp = bus.model.openingSpan(o); const p0 = add(w.a, mul(dir, sp.from)), p1 = add(w.a, mul(dir, sp.to));
        ctx.fillStyle = "#0c0f13"; poly([add(p0, n), add(p1, n), sub(p1, n), sub(p0, n)]); ctx.fill();
        ctx.strokeStyle = st.sel === o.id ? "#ff7a1a" : o.kind === "door" ? "#c48a52" : "#7cc4ff"; ctx.lineWidth = 2; ctx.beginPath();
        if (o.kind === "door") { const s0 = w2s(p0), s1 = w2s(add(p0, mul(perp(dir), sp.width))); ctx.moveTo(...w2s(p0)); ctx.lineTo(...s1); const rr = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
          const a0 = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]), e1 = w2s(p1), a1 = Math.atan2(e1[1] - s0[1], e1[0] - s0[0]); ctx.arc(s0[0], s0[1], rr, a0, a1, a1 > a0 ? false : true); }
        else { ctx.moveTo(...w2s(p0)); ctx.lineTo(...w2s(p1)); }
        ctx.stroke();
        const lab = w2s(add(mul(add(p0, p1), 0.5), mul(perp(dir), -(t.thickness / 2 + 250)))); ctx.fillStyle = "#8e99a8"; ctx.font = "10px Inter"; ctx.textAlign = "center"; ctx.fillText(o.mark, lab[0], lab[1]);
      }
    }
    // drawing in progress
    if (st.pts.length) {
      ctx.strokeStyle = "#ff7a1a"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(...w2s(st.pts[0]));
      for (const p of st.pts.slice(1)) ctx.lineTo(...w2s(p)); if (st.cursor) ctx.lineTo(...w2s(st.cursor)); ctx.stroke(); ctx.setLineDash([]);
      if (st.cursor) { const last = st.pts[st.pts.length - 1], L = dist(last, st.cursor), m = w2s(mul(add(last, st.cursor), 0.5)); ctx.fillStyle = "#ffb27a"; ctx.font = "600 12px Inter"; ctx.fillText(`${(L / 1000).toFixed(2)} m`, m[0], m[1] - 8); }
    }
    if (st.cursor && st.tool !== "select") { const s = w2s(st.cursor); ctx.strokeStyle = "#ff7a1a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 7); ctx.stroke(); }
    ctx.fillStyle = "#8e99a8"; ctx.font = "12px Inter"; ctx.textAlign = "left";
    ctx.fillText(`${bus.model.level(lv).name} · ${TOOL_HELP[st.tool]}`, 12, 20);
  }
  const TOOL_HELP = { select: "Select (V): click an element", wall: "Wall (W): click points, Enter or double-click to finish, click the first point to close, Esc to cancel", door: "Door (D): click on a wall", window: "Window (N): click on a wall", room: "Room (R): click inside closed walls" };
  function poly(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...w2s(p)) : ctx.moveTo(...w2s(p)))); ctx.closePath(); }

  // pointer
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener("pointerdown", (e) => { cv.focus(); st.drag = { start: pos(e), off: [...st.off], moved: false, button: e.button }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    const p = pos(e);
    if (st.drag) { const dx = p[0] - st.drag.start[0], dy = p[1] - st.drag.start[1]; if (Math.hypot(dx, dy) > 4) st.drag.moved = true;
      if (st.drag.moved && (st.tool === "select" || st.drag.button !== 0)) st.off = [st.drag.off[0] + dx, st.drag.off[1] + dy]; }
    st.cursor = snap(s2w(...p)).p; draw();
  });
  cv.addEventListener("pointerup", (e) => { const d = st.drag; st.drag = null; if (d && !d.moved && d.button === 0) click(s2w(...pos(e))); });
  cv.addEventListener("dblclick", () => st.tool === "wall" && finish(false));
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const p = pos(e), w = s2w(...p); st.scale *= Math.exp(-e.deltaY * 0.0015); st.scale = Math.max(0.005, Math.min(2, st.scale)); const s = w2s(w); st.off = [st.off[0] + p[0] - s[0], st.off[1] + p[1] - s[1]]; draw(); }, { passive: false });
  addEventListener("keydown", (e) => {
    if (!st.on || /input|textarea|select/i.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase(); const map = { v: "select", w: "wall", d: "door", n: "window", r: "room" };
    if (map[k]) { setTool(map[k]); e.preventDefault(); }
    else if (e.key === "Enter") finish(false); else if (e.key === "Escape") { st.pts = []; draw(); } else if (k === "f") { fit(); draw(); }
  });
  function setTool(t) { st.tool = t; st.pts = []; toolBtns().forEach((b) => b.classList.toggle("on", b.dataset.plantool === t)); draw(); }
  toolBtns().forEach((b) => (b.onclick = () => setTool(b.dataset.plantool)));
  new ResizeObserver(() => draw()).observe(container);
  bus.on(() => draw());
  return {
    show(on) { st.on = on; cv.hidden = !on; if (on) { fit(); draw(); cv.focus(); } },
    setLevel(id) { st.level = id; fit(); draw(); }, setTool, get on() { return st.on; }, draw, fit, select(id) { st.sel = id; draw(); },
  };
}
