# Drawings in BIMja

## Two kinds of sheet
- **Generic** (`sheets_auto`, `plan`, `elevations`, `sections`, `schedule`, `register`, `service`, `coordinated`, `piping_iso`, `spool`, `bwic`, `plant`, `containment`, `sld`, `whitespace`, `equipment`, `fire`, `site`, `site_section`, `isometric`): fast overviews generated from the model. Good for checking and registers; not the standard to issue for construction.
- **Drafted** — composed on paper at a fixed scale with a label placer and a QA report. Issue these.

| kind | What it draws | Needs |
|---|---|---|
| `ga` | general arrangement: cut walls (poché), door swings + marks, rooms with areas, grids, dimension chains, all equipment outlined and tagged, containment (dashed) | `zone` with grids |
| `elec` | walls as background; electrical equipment tagged; busways (double line, grouped label per row), trays/ladders with rungs, racks; optional single-line panel | `zone`; `drawing_setup {sld}` for the panel |
| `mech` | mechanical equipment tagged; pipes as single lines (supply solid, return dashed), flow arrows, risers, valves, `system DNxxx CL +z` labels | `zone` |
| `roof` | roof edge and parapet, roof plant tagged, roof-level pipework and risers | `zone` |
| `fire_plan` | GA base with fire-rated walls in red, fire-door ratings (FD120), final exits, sprinkler pipework | `zone`; door/wall types with `fireRating` |
| `block_sld` | a power block's single line from the model: per source MV → TX → MSB (+gen) → UPS + battery → output board → busways → rows, with a line-load table | `{zone, block}`; marks `{K}-TX-L{b}{s}`, `-MSB-`, `-GEN-`, `-UPS-`, `-OB-`, `-BAT-`; busway systems `BW-{row}` |
| `hall_section` | building section: cut poché, elements within `depth` beyond drawn thin (hidden behind parallel walls are left out), grid bubbles, levels (FFL, rack top, plenum, service CLs, roof, parapet), tags | `{zone, cut:{axis:"x"|"y", at (site mm), look:1|-1, depth, from, to, name}}` |
| `site_plan` | site boundary, roads, building footprints (roof slabs), plant, zones labelled, overall dimensions | a site/earthworks mass or zones |

Scale is 1:100 by default and falls back to 1:200, 1:250, 1:500… when the zone does not fit the paper above the ~160 mm band (legend, notes, key plan). A0 is the default for drafted kinds (A1 for single lines); for small buildings pass `paper:"A2"` or `"A1"` on `sheet` so the plan fills the sheet at 1:100 (check the scale in the result stays 100).

## The QA rule
`drawing` returns `qa: {overlaps, overlap_pairs, missing, small, tags}`. A sheet is ready only with `overlaps: 0` and `missing: []`. When it isn't:
- `missing` lists labels that found no free place → split the zone, shorten marks/names, or give the zone more margin around the building.
- `overlap_pairs` names the two labels that collide → usually two runs with near-identical paths; offset them in the model (they would clash on site too).
- The scale came out larger than 1:100 → the zone is too big; split it (below).
Look at the sheet too (SVG or PDF): QA catches label collisions, not design errors. Runs shorter than about 25 mm on paper are deliberately left unlabelled (and not reported as missing) — give short stubs their own `system` and label the network on a longer run, or draw at 1:50 for small rooms (`sheet {scale:50, paper:"A1"}`).

## Splitting a building across sheets (matchlines)
A0 holds about 70 × 62 m at 1:100. For larger buildings:
```json
[{"name":"zone","args":{"name":"Hall A","code":"HA","outline":[...whole hall incl. yards...]}},
 {"name":"zone","args":{"name":"Hall A part 1 (grids 1–10)","code":"HA1","parent":"HA","outline":[[x0,y0],[xm,y0],[xm,y1],[x0,y1]]}},
 {"name":"zone","args":{"name":"Hall A part 2 (grids 11–20)","code":"HA2","parent":"HA","outline":[[xm,y0],[x1,y0],[x1,y1],[xm,y1]]}},
 {"name":"zone","args":{"name":"Hall A yards","code":"HAY","parent":"HA","outline":[...yard strip...]}}]
```
- Grids are created once on the parent (`zone:"HA"`); parts clip them and keep bubbles only at true ends.
- Each part draws a chain-line **MATCHLINE — SEE <other part>** where it meets its neighbour, and its key plan shades the hall and outlines the part.
- Equipment belongs to the part holding its centre; walls must lie wholly in a part, so break long walls at the matchline (`walls` along a long facade as two segments). Put the matchline on a line nothing large straddles.
- Plans: one sheet per part per kind (`ga`, `elec`, `mech`, `roof`, `fire_plan`); yards as their own part at 1:200.

## Notes, single line, title block
```json
{"name":"drawing_setup","args":{"project_code":"HSD","project_name":"…","client":"…","author":"…","checker":"…","approver":"…",
  "notes":{"GA":["…"],"E":["…"],"M":["…"],"R":["…"],"F":["…"]},
  "sld":{"title":"Typical power block B1","sources":["A","B","C","D"],"mv":"33 kV","tx":"TX-L1{s} 2.5 MVA","msb":"MSB-L1{s} 4000 A","gen":"GEN-L1{s} 2.5 MVA","ups":"UPS-L1{s} 2000 kVA","ob":"OB-L1{s} 3200 A","busway":"4 × 800 A busways","load":"…","note":"…"}}}
```
Three standard notes are always printed (dimensions/levels, do not scale, concept status); yours follow, then the LOD note. Keep each note one clear sentence, include design values and their basis, and say what is assumed. `{s}` in the SLD strings becomes the source letter.

## Numbering and issue
ISO 19650 container names: `Project-Originator-Volume-Level-Type-Role-Number`. Volume = zone code (`ZZ` when none); level `00` for ground plans, `RF` roof, `ZZ` multi-level; type `DR` drawing / `SH` schedule; role A/E/M/F…; number = series by kind (GA 1101…, roof 1301, fire 1501, site 1001, sections 3001, SLDs 6011…, mechanical 5151, electrical 5251). `drawing_setup {standard:"us-ncs"|"is-nbc"}` switches convention. `publish {status:"S2", date}` sets suitability and revisions (P01…; C01… once A-status) and returns the issue zip; `register` shows the history.

## Exporting files
- `drawing {sheet, format:"svg"|"pdf"|"dxf"}` (PDF as base64; DXF text with layers, CENTER/HIDDEN linetypes; label wipeouts stay out of CAD).
- Runner: `{"name":"@drawings","args":{"formats":["pdf","dxf"]}}` renders every sheet in the register to files named by sheet number.
- Combine a set in register order with `qpdf --empty --pages a.pdf b.pdf … -- set.pdf` if needed.
