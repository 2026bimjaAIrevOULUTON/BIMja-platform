// BIMja command bus: the single path for every change, from a person (UI), an agent (window.bimja / MCP) or a replay.
//   command: { id, name, args, rev?, actor?, dry_run?, session?, apply? }
//   result:  { ok, rev, changed[], diff?, refusals?[], proposal?, data? }
// Refusals are typed, write nothing and bump no rev. No DOM here: it runs in the browser and in Node (headless MCP).
import { Model } from "../author/model.js";

export const REFUSALS = ["stale_rev", "locked", "out_of_bounds", "would_overlap", "no_such_element", "bad_arg", "paused", "expired", "unknown_command", "not_implemented", "unavailable"];
const LOCK_TTL_MS = 3000, PROPOSAL_TTL_MS = 10 * 60 * 1000;
const clone = (x) => JSON.parse(JSON.stringify(x));
let seq = 0; const uid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Diff between two element maps: what was added, removed or modified (ids). */
export function diffElements(before, after) {
  const added = [], removed = [], modified = [];
  for (const id of Object.keys(after)) if (!(id in before)) added.push(id); else if (JSON.stringify(before[id]) !== JSON.stringify(after[id])) modified.push(id);
  for (const id of Object.keys(before)) if (!(id in after)) removed.push(id);
  return { added, removed, modified };
}
const changedIds = (d) => [...d.added, ...d.removed, ...d.modified];

export class Bus {
  constructor({ model = new Model(), now = () => Date.now() } = {}) {
    this.model = model; this.now = now;
    this.rev = 0; this.log = []; this.seen = new Map(); this.history = []; // history[i] = diff that produced rev i+1
    this.undoStack = []; this.redoStack = [];
    this.locks = new Map(); // elementId -> {holder, until}
    this.paused = false; this.proposals = new Map();
    this.handlers = new Map(); this.listeners = new Set();
    this.extra = {}; // state owned by other domains (coordination, time, geo, cost), saved with the project
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) try { fn(ev, this); } catch (e) { console.error(e); } }

  /** Register a command handler. kind: "write" changes project state; "read" doesn't; "view" acts on the viewer only. */
  register(name, run, { kind = "write" } = {}) { this.handlers.set(name, { run, kind }); return this; }
  has(name) { return this.handlers.has(name); }

  snapshot() { return JSON.stringify({ model: this.model.data, extra: this.extra }); }
  restore(s) { const o = JSON.parse(s); this.model.data = o.model; this.extra = o.extra; }

  lock(ids, holder) { const until = this.now() + LOCK_TTL_MS; for (const id of ids) this.locks.set(id, { holder, until }); this.emit({ type: "lock", ids, holder }); }
  lockedBy(id, actor) { const l = this.locks.get(id); if (!l) return null; if (l.until < this.now()) { this.locks.delete(id); return null; } return l.holder !== actor ? l.holder : null; }
  pause(on = !this.paused) { this.paused = !!on; this.emit({ type: "pause", paused: this.paused }); return this.paused; }

  diffSince(rev) { const d = { added: new Set(), removed: new Set(), modified: new Set() }; for (const h of this.history.slice(rev)) { h.added.forEach((x) => d.added.add(x)); h.removed.forEach((x) => d.removed.add(x)); h.modified.forEach((x) => d.modified.add(x)); } return { added: [...d.added], removed: [...d.removed], modified: [...d.modified] }; }

  refuse(cmd, code, message, extra = {}) {
    const r = { ok: false, rev: this.rev, changed: [], refusals: [{ code, message }], ...extra };
    this.emit({ type: "refused", cmd, result: r }); return r;
  }

  /** Execute one command. Agents propose by default: their writes return a proposal (a dry-run diff) unless apply:true. */
  execute(input) {
    const cmd = { id: input.id || uid(), name: input.name, args: input.args || {}, rev: input.rev, actor: input.actor || "human", dry_run: !!input.dry_run, session: input.session || input.id || null, apply: !!input.apply };
    if (this.seen.has(cmd.id)) return this.seen.get(cmd.id); // idempotent: a replayed id changes state once
    const h = this.handlers.get(cmd.name);
    if (!h) return this.refuse(cmd, "unknown_command", `unknown command "${cmd.name}". Call "commands" for the list.`);
    const isAgent = cmd.actor.startsWith("agent");
    if (h.kind !== "write") {
      try { const data = h.run(cmd.args, cmd, this); return { ok: true, rev: this.rev, changed: [], data }; }
      catch (e) { return this.refuse(cmd, e.code || "bad_arg", e.message); }
    }
    if (cmd.rev != null && cmd.rev !== this.rev) return this.refuse(cmd, "stale_rev", `model is at rev ${this.rev}, command was made at rev ${cmd.rev}`, { diff: this.diffSince(cmd.rev) });

    // dry run on the live state, then roll back
    const before = this.snapshot(); const elsBefore = clone(this.model.data.elements);
    let data;
    try { data = h.run(cmd.args, cmd, this); }
    catch (e) { this.restore(before); return this.refuse(cmd, e.code || "bad_arg", e.message); }
    const diff = diffElements(elsBefore, this.model.data.elements); const ids = changedIds(diff);
    const after = this.snapshot(); this.restore(before);

    for (const id of ids) { const holder = this.lockedBy(id, cmd.actor); if (holder) return this.refuse(cmd, "locked", `${id} is being edited by ${holder}`, { holder }); }
    if (cmd.dry_run) return { ok: true, rev: this.rev, changed: ids, diff, dry_run: true, data };
    if (isAgent && (this.paused || !cmd.apply)) {
      const pid = `p${cmd.id}`; this.proposals.set(pid, { id: pid, cmd: { ...cmd, apply: true }, diff, expires: this.now() + PROPOSAL_TTL_MS, rev: this.rev });
      this.emit({ type: "proposal", id: pid, cmd, diff });
      if (this.paused) return this.refuse(cmd, "paused", "agents are paused; the change was queued as a proposal", { proposal: pid, diff });
      return { ok: true, rev: this.rev, changed: [], diff, proposal: pid, note: "proposed: a person applies it (apply_proposal), or send apply:true for headless runs" };
    }
    // commit
    this.restore(after);
    this.rev++; this.history.push(diff);
    this.undoStack.push({ session: cmd.session, before }); this.redoStack = [];
    const entry = { id: cmd.id, name: cmd.name, args: cmd.args, actor: cmd.actor, session: cmd.session, rev: this.rev, changed: ids };
    this.log.push(entry);
    const result = { ok: true, rev: this.rev, changed: ids, diff, data };
    this.seen.set(cmd.id, result);
    this.emit({ type: "applied", entry, result });
    return result;
  }

  applyProposal(pid, actor = "human") {
    const p = this.proposals.get(pid); if (!p) return this.refuse({ name: "apply_proposal" }, "no_such_element", `no proposal ${pid}`);
    this.proposals.delete(pid);
    if (p.expires < this.now()) return this.refuse({ name: "apply_proposal" }, "expired", `proposal ${pid} expired`);
    const r = this.execute({ ...p.cmd, id: `${p.cmd.id}:applied`, rev: undefined, actor: p.cmd.actor, apply: true, approvedBy: actor });
    if (r.ok) this.log[this.log.length - 1].approvedBy = actor;
    return r;
  }
  rejectProposal(pid) { const ok = this.proposals.delete(pid); this.emit({ type: "proposal_rejected", id: pid }); return ok; }

  /** Undo the last session (an agent's whole run undoes as one step). */
  undo() {
    if (!this.undoStack.length) return false;
    const session = this.undoStack[this.undoStack.length - 1].session; const cur = this.snapshot();
    let first;
    do { first = this.undoStack.pop(); } while (session != null && this.undoStack.length && this.undoStack[this.undoStack.length - 1].session === session);
    this.redoStack.push({ session, after: cur, before: first.before });
    const elsBefore = clone(this.model.data.elements); this.restore(first.before);
    const diff = diffElements(elsBefore, this.model.data.elements); this.rev++; this.history.push(diff);
    this.log.push({ id: uid(), name: "undo", args: {}, actor: "human", session, rev: this.rev, changed: changedIds(diff) });
    this.emit({ type: "applied", entry: this.log[this.log.length - 1], result: { diff } }); return true;
  }
  redo() {
    const r = this.redoStack.pop(); if (!r) return false;
    const elsBefore = clone(this.model.data.elements); this.undoStack.push({ session: r.session, before: r.before }); this.restore(r.after);
    const diff = diffElements(elsBefore, this.model.data.elements); this.rev++; this.history.push(diff);
    this.log.push({ id: uid(), name: "redo", args: {}, actor: "human", session: r.session, rev: this.rev, changed: changedIds(diff) });
    this.emit({ type: "applied", entry: this.log[this.log.length - 1], result: { diff } }); return true;
  }

  /** Replay a log onto a fresh bus: same commands, same bytes out. */
  static replay(log, makeBus) {
    const b = makeBus();
    for (const e of log) {
      if (e.name === "undo") b.undo(); else if (e.name === "redo") b.redo();
      else b.execute({ id: e.id, name: e.name, args: e.args, actor: e.actor, session: e.session, apply: true });
    }
    return b;
  }
  saveProject() { return { format: "bimja-project", version: 1, rev: this.rev, model: clone(this.model.data), extra: clone(this.extra), log: clone(this.log) }; }
}
