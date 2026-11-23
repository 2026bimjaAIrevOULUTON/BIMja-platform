# Agents working on or with BIMja

To **operate** BIMja (build models, drawings, schedules, cost, handover), use the skill in `skills/bimja/`:
read `skills/bimja/SKILL.md` first. It covers connecting (MCP attached/headless, or the runner
`node skills/bimja/scripts/bimja.mjs plan.json --out out/`), every command family and the drawing QA rule.
Codex finds it via `.codex/skills/bimja`; Cursor and Claude Code can read it from here.

To **change** BIMja's code: commands live in `src/commands/registry.js` (keep it complete — the parity test
checks every command is reachable from the UI and `window.bimja`); run `npm test`; after adding or changing a
command run `node scripts/gen-skill-commands.mjs` so `skills/bimja/references/commands.md` stays in sync
(a test fails otherwise). Licence rules: MIT code; MPL-2.0/Apache-2.0 deps only; no AGPL; IfcOpenShell in CI only.
