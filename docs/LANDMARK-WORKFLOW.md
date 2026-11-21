# How an agent takes a landmark through every stage

This is the exact process shown in the screen recordings. The same steps run from the app ("Samples" → a landmark), from `window.bimja` in the browser console, or from an agent over MCP (`node mcp/bimja-mcp.mjs`). Every step is a registered command. Each one is logged with its actor (`agent:claude` or `human`), can be undone, and replays to the identical model.

## The steps

| # | Step | Command(s) | What happens | Where to see it |
|---|---|---|---|---|
| 1 | Proposal and approval | `load_project` | The agent **proposes** the project: name, units, levels, plan cuts and credit. Nothing changes until a person presses **Apply** in Activity. | Activity |
| 2 | Model | `mass`, `revolve`, `sweep`, `boolean`, `opening`, `array`, `family`, `place` | The agent builds the model one command at a time; once the person allows it, they apply directly. A step tagged `as: "x"` is referred to later as `"$x"`, so a solid can be built and then cut. | 3D view, Activity |
| 3 | Locate | `geolocate {lat, lon, timezone, height_m}` | Takes a Google Maps pin. Sets the UTM CRS, the map anchor with grid convergence (local north is true north), the time zone and the site pin. The IFC gets IfcMapConversion and TrueNorth. | Twin → Location |
| 4 | Map context | `map_context {imagery, buildings, radius_m}` | Drapes OpenStreetMap under the model in true position, optionally with neighbouring buildings. Context only, never exported. | 3D view |
| 5 | Sun and shadow | `sun {date, time}` | The NOAA sun position for that place and moment. The viewer casts real shadows; "Play day" runs from 06:00 to 18:00. | Twin → Sun and shadow |
| 6 | Solar study | `solar_study {date, step_min}` | Simulates the day on the model's own geometry: sun hours and kWh/m² per facade and element, and ground in shadow. Shows an exposure heatmap. | Twin → Run solar study |
| 7 | 4D | `auto_sequence {start, finish}` | Sequences the build: site works first, then rise by rise from the ground up, structure before envelope. The programme fits the documented construction years. | 4D tab and the timeline dock |
| 8 | 5D | `cost {rates, currency}` then `estimate` | Prices every element from its quantities (NetVolume, NetSurfaceArea or count). The rates are illustrative. | 5D tab |
| 9 | Coordination | `clash_model {a: "S", b: "A"}` | Exact intersection volumes between disciplines on the geometry kernel. Click a clash to select its elements. | Clash tab |
| 10 | Drawings | `drawing_setup`, `sheets_auto`, `drawing`, `publish` | Builds the ISO 19650-named set: register, plans at the landmark's cut levels, elevations, sections, isometric and schedules. Output as PDF, DXF and Excel. | Drawings tab |

The stage commands for each landmark are in `src/app/landmarks.js` (`STAGES`, `landmarkStages(id)`).

## City context (Taj Mahal)

After step 10, the Twin pane's "Build city from OpenStreetMap" (or `city_plan`, then `script` per layer) models the surroundings in this order:

1. L-WATER
2. L-LANDSCAPE
3. C-PAVING
4. C-ROAD
5. C-FOOTWAY
6. C-KERB
7. P-WATER
8. P-SEWER
9. P-STORM
10. E-DUCT
11. E-LIGHTING
12. A-BUILDING
13. A-INFILL
14. L-TREES
15. L-WATER-FEATURE
16. A-FURNITURE

Real features come from OSM. Kerbs, carriageway widths, utilities, lighting and infill are indicative and named so. The live data panel adds weather, wind, air quality and earthquakes at the site.

## The five landmarks

| Landmark | Model commands | Command mix | Location (WGS84, standard time) | 4D programme | 5D |
|---|---|---|---|---|---|
| Leaning Tower of Pisa | 252 | revolve ×230, boolean ×14, family ×1, place ×7 | 43.72306, 10.39639 (UTC+1) | 1173-08-09 → 1372-12-31 | EUR, 5 rates |
| Taj Mahal | 75 | mass ×11, boolean ×2, sweep ×3, opening ×4, revolve ×45, family ×2, place ×8 | 27.175, 78.0421 (UTC+5.5) | 1632-01-01 → 1653-12-31 | INR, 10 rates |
| Fallingwater | 37 | mass ×27, array ×5, sweep ×3, boolean ×1, revolve ×1 | 39.90611, -79.46806 (UTC-5) | 1936-04-01 → 1939-12-31 | USD, 10 rates |
| Burj Khalifa | 99 | mass ×82, boolean ×1, family ×1, place ×3, revolve ×11, array ×1 | 25.197139, 55.274111 (UTC+4) | 2004-01-06 → 2010-01-04 | AED, 6 rates |
| Vitra Fire Station | 22 | mass ×11, boolean ×3, family ×1, place ×5, array ×2 | 47.6003639, 7.6146778 (UTC+1) | 1990-06-01 → 1993-06-30 | EUR, 6 rates |

## Driving it yourself

In the browser console, or through MCP with the same names and arguments:

```js
await bimja.run("geolocate", { lat: 27.175, lon: 78.0421, timezone: 5.5, height_m: 170, label: "Taj Mahal" }, { actor: "agent:claude" }); // proposes; Apply in Activity
await bimja.run("sun", { date: "2026-12-21", time: "09:00" });
await bimja.run("solar_study", { date: "2026-06-21", step_min: 30 });
await bimja.run("clash_model", { a: "S", b: "A", min_volume_m3: 0.01 });
```

## Honest limits

- These are LOD 350 *studies*, not survey-accurate models.
- Cost rates are illustrative. 4D durations inside each programme are proportioned by volume, not taken from historical records.
- The solar study is clear-sky only. It has no weather files, no daylight saving, and does not count neighbouring buildings or terrain when casting shadows.
- Clashes in the landmark studies are mostly intentional modelling overlaps, not design errors.
