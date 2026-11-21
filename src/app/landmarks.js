// Landmark massing studies, built only from BIMja commands (the same ones an AI agent sends over MCP).
// Simplified for demonstration and learning; credited to their architects; not affiliated with or endorsed by
// the buildings' owners. Units: mm. Each sample is { id, name, credit, commands }.

const ring = (r, n, phase = 0) => [...Array(n)].map((_, k) => { const a = phase + (2 * Math.PI * k) / n; return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))]; });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const rot = (p, deg) => { const a = (deg * Math.PI) / 180; return [Math.round(p[0] * Math.cos(a) - p[1] * Math.sin(a)), Math.round(p[0] * Math.sin(a) + p[1] * Math.cos(a))]; };
const tag = (name) => ({ as, ...args }) => (as ? { name, as, args } : { name, args });
const mass = tag("mass");
const rev = tag("revolve");
const cyl = (r, h) => [[0, 0], [r, 0], [r, h], [0, h]];
const tube = (ri, ro, h) => [[ri, 0], [ro, 0], [ro, h], [ri, h]];
/** Onion/bulbous dome: base radius r0, bulge rmax at a fraction of height, pointed tip. */
const onion = (r0, rmax, h, n = 14) => { const p = [[0, 0], [r0, 0]];
  for (let i = 1; i <= n; i++) { const t = i / n; const r = t < 0.32 ? r0 + (rmax - r0) * Math.sin((t / 0.32) * Math.PI / 2) : rmax * Math.pow(Math.cos(((t - 0.32) / 0.68) * Math.PI / 2), 1.25); p.push([Math.max(0, Math.round(r)), Math.round(t * h)]); }
  p[p.length - 1][0] = 0; return p; };

// ---------------------------------------------------------------- Leaning Tower of Pisa
function pisa() {
  const L = { lean_deg: 3.97, lean_dir_deg: 270, pivot: [0, 0, 0] }; // whole tower leans about the centre of its base
  const c = []; const M = "Marble", stone = "#efe9dc";
  const between = (r, n, phase, k) => { const a = phase + (2 * Math.PI * (k + 0.5)) / n; return { p: [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))], dir: Math.round(((a * 180) / Math.PI + 90) * 1000) / 1000 }; };
  c.push(rev({ as: "drum", name: "Base drum", center: [0, 0], profile: cyl(7700, 11000), material: M, color: stone, segments: 60, ifc_class: "IfcWall", ...L }));
  c.push({ name: "boolean", args: { base: "$drum", op: "difference", tools: [...Array(15).keys()].map((k) => { const b = between(7700, 15, 0, k); return { shape: "opening", at: [...b.p, 400], dir_deg: b.dir, width: 2600, height: 9000, depth: 800, arch: "semi", ...L }; }) } });
  c.push(rev({ name: "Stylobate", center: [0, 0], profile: cyl(8600, 600), base: -600, material: M, color: "#e4dccb", segments: 48, ifc_class: "IfcSlab", ...L }));
  for (const [k, a] of ring(7820, 15).entries()) c.push(rev({ name: `Blind arcade column G${k + 1}`, center: a, profile: cyl(300, 9200), base: 400, material: M, color: stone, segments: 10, ifc_class: "IfcColumn", ...L }));
  let z = 11000;
  for (let s = 1; s <= 6; s++) {
    const h = 6500;
    c.push(rev({ name: `Cornice ${s}`, center: [0, 0], profile: tube(0, 8100, 450), base: z, material: M, color: "#e8e1d2", segments: 48, ifc_class: "IfcSlab", ...L }));
    c.push(rev({ name: `Gallery wall ${s}`, center: [0, 0], profile: tube(5200, 6300, h - 450), base: z + 450, material: M, color: stone, segments: 48, ifc_class: "IfcWall", ...L }));
    const ph = s % 2 ? 0 : Math.PI / 30; // arcade band springing from the capitals, cut with 30 round arches
    c.push(rev({ as: `band${s}`, name: `Arcade ${s}`, center: [0, 0], profile: tube(7150, 7850, 1200), base: z + h - 1200, material: M, color: "#f1ece1", segments: 60, ifc_class: "IfcBeam", ...L }));
    c.push({ name: "boolean", args: { base: `$band${s}`, op: "difference", tools: [...Array(30).keys()].map((k) => { const b = between(7500, 30, ph, k); return { shape: "opening", at: [...b.p, z + h - 1500], dir_deg: b.dir, width: 900, height: 1250, depth: 1400, arch: "semi", ...L }; }) } });
    for (const [k, a] of ring(7500, 30, ph).entries()) c.push(rev({ name: `Loggia column ${s}.${k + 1}`, center: a, profile: [[0, 0], [260, 0], [230, h - 900], [330, h - 650], [330, h - 450], [0, h - 450]], base: z + 450, material: M, color: "#f6f2ea", segments: 10, ifc_class: "IfcColumn", ...L }));
    z += h;
  }
  c.push(rev({ name: "Cornice 7", center: [0, 0], profile: tube(0, 8100, 450), base: z, material: M, color: "#e8e1d2", segments: 48, ifc_class: "IfcSlab", ...L }));
  c.push(rev({ name: "Belfry", center: [0, 0], profile: [[0, 0], [5300, 0], [5300, 5200], [5600, 5200], [5600, 5700], [0, 5700]], base: z + 450, material: M, color: stone, segments: 40, ifc_class: "IfcWall", ...L }));
  for (const [k, a] of ring(5450, 12).entries()) c.push(rev({ name: `Belfry column ${k + 1}`, center: a, profile: cyl(200, 3600), base: z + 900, material: M, color: "#f6f2ea", segments: 8, ifc_class: "IfcColumn", ...L }));
  return { id: "pisa", plans: [{ title: "Ground storey plan", cut_z: 1200 }, { title: "Gallery plan, third storey", cut_z: 26000 }], name: "Leaning Tower of Pisa", credit: "Campanile of Pisa Cathedral, begun 1173 (attributed to Bonanno Pisano; completed by Tommaso di Andrea Pisano, 1372). LOD 350 study built from BIMja commands: 8 storeys, ~56 m, 3.97° lean, blind arcade on the base drum, six open loggias of 30 columns carrying round-arched arcades.", commands: c };
}

// ---------------------------------------------------------------- Taj Mahal
function taj() {
  const c = []; const M = "Marble", white = "#f4f1ea";
  const plinthH = 6700, P = 47500; // 95 m square plinth (chabutra)
  // plinth with a blind arcade of recessed arches on all four faces
  c.push(mass({ as: "plinth", name: "Plinth (chabutra)", outline: rect(-P, -P, P, P), height: plinthH, material: "Stone", color: "#e9e1d3", ifc_class: "IfcSlab" }));
  const niches = []; for (let k = 0; k < 4; k++) for (let x = -42000; x <= 42000; x += 6000) if (Math.abs(x) > 4000) niches.push({ shape: "opening", at: [...rot([x, -P], 90 * k), 900], dir_deg: 90 * k, width: 2600, height: 4600, depth: 1400, arch: "mughal" });
  c.push({ name: "boolean", args: { base: "$plinth", op: "difference", tools: niches } });
  c.push({ name: "sweep", args: { name: "Plinth cornice", profile: [[-200, 0], [450, 0], [450, 180], [250, 380], [-200, 380]], path: rect(-P, -P, P, P).map(([x, y]) => [x, y, plinthH - 380]), closed: true, material: "Stone", color: "#ded5c4", ifc_class: "IfcMember" } });
  c.push(mass({ name: "Plinth steps (south)", outline: rect(-6000, -P - 4200, 6000, -P), height: plinthH, top_scale: 1, material: "Stone", color: "#e2d9c8", ifc_class: "IfcStair" }));
  // mausoleum: 57 m chamfered square on a low podium
  const S = 28500, ch = 8500; const oct = [[-S + ch, -S], [S - ch, -S], [S, -S + ch], [S, S - ch], [S - ch, S], [-S + ch, S], [-S, S - ch], [-S, -S + ch]];
  c.push(mass({ as: "maus", name: "Mausoleum", outline: oct, base: plinthH, height: 30000, material: M, color: white, ifc_class: "IfcWall" }));
  const cuts = [];
  for (let k = 0; k < 4; k++) {
    const R = (p) => rot(p, 90 * k), d = 90 * k;
    cuts.push({ shape: "opening", at: [...R([0, -S]), plinthH], dir_deg: d, width: 14000, height: 24000, depth: 7000, arch: "mughal" }); // great iwan: 3.5 m deep recess
    for (const x of [-15500, 15500]) for (const [z, h] of [[plinthH + 800, 11500], [plinthH + 14200, 11500]]) cuts.push({ shape: "opening", at: [...R([x, -S]), z], dir_deg: d, width: 5600, height: h, depth: 3200, arch: "mughal" });
    const mid = R([S - ch / 2, -S + ch / 2]); // chamfered face: two stacked alcoves
    for (const [z, h] of [[plinthH + 800, 11500], [plinthH + 14200, 11500]]) cuts.push({ shape: "opening", at: [...mid, z], dir_deg: d + 45, width: 6400, height: h, depth: 3200, arch: "mughal" });
  }
  c.push({ name: "boolean", args: { base: "$maus", op: "difference", tools: cuts } });
  for (let k = 0; k < 4; k++) { // pishtaq: the raised rectangular frame around each great iwan, cut with the same arch
    c.push(mass({ as: `pish${k}`, name: `Pishtaq ${"SENW"[k]}`, outline: rect(-11000, -S - 700, 11000, -S + 200).map((p) => rot(p, 90 * k)), base: plinthH, height: 33500, material: M, color: white, ifc_class: "IfcWall" }));
    c.push({ name: "opening", args: { target: `$pish${k}`, at: [...rot([0, -S - 250], 90 * k), plinthH], dir_deg: 90 * k, width: 14000, height: 24000, depth: 2000, arch: "mughal" } });
    c.push(mass({ name: `Iwan back panel ${"SENW"[k]}`, outline: rect(-7000, -S + 3400, 7000, -S + 3500).map((p) => rot(p, 90 * k)), base: plinthH, height: 24500, material: M, color: "#d9d2c3", ifc_class: "IfcCovering" }));
    for (const x of [-11200, 11200]) c.push(rev({ name: `Guldasta ${"SENW"[k]}`, center: rot([x, -S - 250], 90 * k), profile: [[0, 0], [550, 0], [550, 33500], [700, 34000], [420, 35600], [0, 36400]], base: plinthH, segments: 12, material: M, color: white, ifc_class: "IfcColumn" }));
  }
  const roof = plinthH + 30000;
  c.push({ name: "sweep", args: { name: "Mausoleum cornice", profile: [[-300, 0], [500, 0], [700, 250], [700, 600], [-300, 600]], path: oct.map(([x, y]) => [x, y, roof - 600]), closed: true, material: M, color: "#ece6d9", ifc_class: "IfcMember" } });
  c.push({ name: "sweep", args: { name: "Parapet", profile: [[-250, 0], [250, 0], [250, 1400], [-250, 1400]], path: oct.map(([x, y]) => [x * 0.985, y * 0.985, roof]), closed: true, material: M, color: white, ifc_class: "IfcWall" } });
  c.push(rev({ name: "Drum", center: [0, 0], profile: cyl(14000, 7000), base: roof, material: M, color: white, segments: 64, ifc_class: "IfcWall" }));
  c.push(rev({ name: "Drum band", center: [0, 0], profile: [[13900, 0], [14600, 0], [14600, 300], [14250, 700], [13900, 700]], base: roof + 6300, material: M, color: "#ece6d9", segments: 64, ifc_class: "IfcMember" }));
  c.push(rev({ name: "Main onion dome", center: [0, 0], profile: onion(13800, 17500, 24000, 28), base: roof + 7000, material: M, color: white, segments: 64, ifc_class: "IfcRoof" }));
  c.push(rev({ name: "Lotus crown", center: [0, 0], profile: [[0, 0], [3200, 0], [2400, 700], [1200, 1100], [0, 1150]], base: roof + 30300, material: M, color: "#ece6d9", segments: 32, ifc_class: "IfcMember" }));
  c.push(rev({ name: "Finial (kalash)", center: [0, 0], profile: [[0, 0], [800, 0], [450, 1300], [700, 1900], [220, 2800], [110, 5100], [0, 5500]], base: roof + 31400, material: "Bronze", color: "#c9a44c", segments: 24, ifc_class: "IfcMember" }));
  // chhatri: a reusable family (8 columns, chajja, onion dome, finial) placed four times on the roof
  const chParts = (R, H) => [{ shape: "revolve", center: [0, 0], profile: cyl(R * 1.2, 600), segments: 8 },
    ...ring(R, 8, Math.PI / 8).map((a) => ({ shape: "revolve", center: a, profile: [[0, 0], [260, 0], [220, H - 500], [320, H - 300], [320, H], [0, H]], segments: 8 })),
    { shape: "revolve", center: [0, 0], profile: [[0, H], [R * 1.35, H], [R * 1.35, H + 150], [R * 1.05, H + 550], [0, H + 550]], segments: 8 },
    { shape: "revolve", center: [0, 0], profile: onion(R * 1.05, R * 1.25, R * 1.9, 14).map(([r, z]) => [r, z + H + 550]), segments: 24 },
    { shape: "revolve", center: [0, 0], profile: [[0, 0], [220, 0], [120, 900], [60, 1500], [0, 1600]].map(([r, z]) => [r, z + H + 550 + R * 1.9]), segments: 12 }];
  c.push({ name: "family", args: { name: "Chhatri 8-column", ifc_class: "IfcBuildingElementProxy", uniclass: { code: "EF_30_10", title: "Roofs" }, material: M, color: white, description: "Domed open pavilion on eight columns", parameters: { Columns: 8, Radius_mm: 3400, ColumnHeight_mm: 4200 }, psets: { Pset_BIMja_Heritage: { Period: "Mughal, 1632-1653", Material: "Makrana marble" } }, parts: chParts(3400, 4200) } });
  for (const [i, [x, y]] of [[-17000, -17000], [17000, -17000], [17000, 17000], [-17000, 17000]].entries()) c.push({ name: "place", args: { family: "Chhatri 8-column", at: [x, y, roof], mark: `CH-0${i + 1}` } });
  // four minarets at the plinth corners, leaning very slightly outward (as built), with corbelled balconies
  c.push({ name: "family", args: { name: "Minaret chhatri", ifc_class: "IfcBuildingElementProxy", uniclass: { code: "EF_30_10", title: "Roofs" }, material: M, color: white, parameters: { Columns: 8, Radius_mm: 2100 }, parts: chParts(2100, 3000) } });
  for (const [i, [x, y]] of [[-P + 3500, -P + 3500], [P - 3500, -P + 3500], [P - 3500, P - 3500], [-P + 3500, P - 3500]].entries()) {
    const out = (Math.atan2(y, x) * 180) / Math.PI;
    const L = { lean_deg: 0.5, lean_dir_deg: out, pivot: [x, y, plinthH] };
    c.push(rev({ name: "Minaret base", center: [x, y], profile: cyl(3600, 1500), base: plinthH, material: M, color: "#ece7dc", segments: 8, ifc_class: "IfcFooting", ...L }));
    c.push(rev({ name: "Minaret shaft", center: [x, y], profile: [[0, 0], [2800, 0], [2300, 39000], [0, 39000]], base: plinthH, material: M, color: white, segments: 32, ifc_class: "IfcColumn", ...L }));
    for (const hb of [12000, 24500, 37000]) {
      c.push(rev({ name: "Minaret balcony", center: [x, y], profile: [[0, 0], [2700, 0], [3700, 900], [3700, 1150], [0, 1150]], base: plinthH + hb - 900, material: M, color: "#ece7dc", segments: 32, ifc_class: "IfcSlab", ...L }));
      c.push(rev({ name: "Balcony railing", center: [x, y], profile: tube(3500, 3700, 900), base: plinthH + hb + 250, material: M, color: white, segments: 32, ifc_class: "IfcRailing", ...L })); }
    c.push({ name: "place", args: { family: "Minaret chhatri", at: [x, y, plinthH + 39000], mark: `MC-0${i + 1}` } });
  }
  return { id: "taj", plans: [{ title: "Plan at mausoleum floor (+8.0 m)", cut_z: 8000 }, { title: "Plan at upper alcoves (+24 m)", cut_z: 24000 }, { title: "Plan at drum (+39.7 m)", cut_z: 39700 }], name: "Taj Mahal", credit: "Taj Mahal, Agra, 1632–1653, attributed to Ustad Ahmad Lahauri for Emperor Shah Jahan. LOD 350 study built from BIMja commands: plinth arcade, cut mughal iwans and stacked alcoves, pishtaqs with guldastas, cornices, onion dome with lotus crown and kalash, chhatri families and corbelled minarets.", commands: c };
}

// ---------------------------------------------------------------- Fallingwater
function fallingwater() {
  const c = []; const stone = "#8d7f6b", cream = "#e8dcbd", red = "#a8432f";
  // site: stream, rock ledges, the falls
  c.push(mass({ name: "Bear Run stream bed", outline: rect(-30000, -26000, 34000, -6000), base: -9000, height: 400, material: "Water", color: "#4f7f95", ifc_class: "IfcCovering" }));
  c.push(mass({ name: "Rock ledge (upper)", outline: [[-26000, -12000], [12000, -9000], [16000, 6000], [-24000, 9000]], base: -9000, height: 5500, material: "Stone", color: "#6f6a5f", ifc_class: "IfcFooting" }));
  c.push(mass({ name: "Falls", outline: [[-14000, -12100], [8000, -9900], [8000, -9500], [-14000, -11700]], base: -8800, height: 5200, material: "Water", color: "#cfe4ee", ifc_class: "IfcCovering" }));
  // stone core: chimney and piers
  c.push(mass({ name: "Chimney mass", outline: rect(-1800, 1500, 1600, 4300), base: -3500, height: 15500, material: "Stone", color: stone, ifc_class: "IfcWall" }));
  for (const [i, x] of [-7000, -2500, 2500].entries()) c.push(mass({ name: `Bolster pier ${i + 1}`, outline: rect(x, -4000, x + 1100, -1000), base: -3500, height: 3500, material: "Stone", color: stone, ifc_class: "IfcColumn" }));
  // living level: glass box + the two famous cantilevered terraces
  c.push(mass({ name: "Living room", outline: rect(-9000, -6500, 6000, 4000), base: 0, height: 3100, material: "Glass", color: "#4b5b60", ifc_class: "IfcWall" }));
  c.push(mass({ name: "Living floor slab", outline: rect(-9500, -7000, 6500, 4500), base: -400, height: 400, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  c.push(mass({ name: "East terrace (cantilever)", outline: rect(6000, -6800, 13500, 1200), base: -300, height: 900, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  c.push(mass({ name: "West terrace", outline: rect(-15500, -2000, -9000, 3500), base: -300, height: 900, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  c.push(mass({ name: "Living roof", outline: rect(-9500, -7000, 6500, 4500), base: 3100, height: 350, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  // bedroom level: south terrace cantilevers over the stream, perpendicular to the one below
  c.push(mass({ name: "Bedroom wing", outline: rect(-6500, -1000, 3000, 4000), base: 3450, height: 2900, material: "Glass", color: "#4b5b60", ifc_class: "IfcWall" }));
  c.push(mass({ name: "South terrace (cantilever)", outline: rect(-5500, -11500, 4000, -1000), base: 3100, height: 950, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  c.push(mass({ name: "Bedroom roof", outline: rect(-7000, -1500, 3500, 4500), base: 6350, height: 300, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  // top floor (study)
  c.push(mass({ name: "Study", outline: rect(-4000, 500, 1000, 4300), base: 6650, height: 2700, material: "Glass", color: "#4b5b60", ifc_class: "IfcWall" }));
  c.push(mass({ name: "Study terrace", outline: rect(-6000, -3500, 1500, 500), base: 6350, height: 750, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  c.push(mass({ name: "Study roof", outline: rect(-4500, 0, 1500, 4800), base: 9350, height: 300, material: "Concrete", color: cream, ifc_class: "IfcSlab" }));
  // Cherokee red steel sash on the living level: one mullion, arrayed
  c.push(mass({ as: "sash", name: "Steel sash", outline: rect(-8600, -6560, -8530, -6440), base: 0, height: 3100, material: "Steel", color: red, ifc_class: "IfcMember" }));
  c.push({ name: "array", args: { source: "$sash", count: 10, step: [1600, 0, 0] } });
  // rounded parapet caps along the cantilevered terraces (the signature curved edge)
  const cap = [[-200, 0], [200, 0], [200, 600], [120, 820], [0, 870], [-120, 820], [-200, 600]];
  c.push({ name: "sweep", args: { name: "East terrace parapet", profile: cap, path: [[6000, 1200, 600], [13500, 1200, 600], [13500, -6800, 600], [6000, -6800, 600]], material: "Concrete", color: cream, ifc_class: "IfcRailing" } });
  c.push({ name: "sweep", args: { name: "South terrace parapet", profile: cap, path: [[-5500, -1000, 4050], [-5500, -11500, 4050], [4000, -11500, 4050], [4000, -1000, 4050]], material: "Concrete", color: cream, ifc_class: "IfcRailing" } });
  // hatch stair from the living room down to the stream, and the trellis beams over the drive
  c.push(mass({ as: "step", name: "Hatch stair tread", outline: rect(-3000, -8200, -1800, -7900), base: -700, height: 120, material: "Concrete", color: cream, ifc_class: "IfcStair" }));
  c.push({ name: "array", args: { source: "$step", count: 12, step: [0, -280, -230] } });
  c.push(mass({ as: "trellis", name: "Trellis beam", outline: rect(-9000, 4500, -8800, 9500), base: 3100, height: 450, material: "Concrete", color: cream, ifc_class: "IfcBeam" }));
  c.push({ name: "array", args: { source: "$trellis", count: 9, step: [1000, 0, 0] } });
  return { id: "fallingwater", plans: [{ title: "Living level plan", cut_z: 1200 }, { title: "Bedroom level plan", cut_z: 4600 }, { title: "Study level plan", cut_z: 7800 }], name: "Fallingwater", credit: "Fallingwater (Kaufmann Residence), Mill Run, Pennsylvania, 1936–1939, by Frank Lloyd Wright. LOD 350 study built from BIMja commands: stone core, stacked cantilevered terraces with rounded parapets over the falls of Bear Run, Cherokee red sash, hatch stair and trellis.", commands: c };
}

// ---------------------------------------------------------------- Burj Khalifa
function burj() {
  const c = []; const glass = "#a9c4d2";
  c.push(mass({ name: "Podium", outline: ring(70000, 6).map((p) => rot(p, 30)), base: -0, height: 12000, material: "Glass", color: "#7f97a3", ifc_class: "IfcSlab" }));
  c.push(rev({ name: "Central core", center: [0, 0], profile: [[0, 0], [17000, 0], [12000, 585000], [0, 585000]], segments: 6, material: "Glass", color: glass, ifc_class: "IfcWall" }));
  // Y-shaped plan: three wings set back one after another as the tower spirals upward
  const W = 26000; // wing width
  for (let i = 0; i < 3; i++) {
    let z = 0; const dir = 90 + i * 120;
    for (let j = 0; j < 9; j++) {
      const top = Math.round((585000 * (3 * j + i + 1)) / 28); const Lw = 62000 - j * 6200;
      const half = W / 2 - j * 600; const end = []; // wing with a rounded end
      for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (Math.PI * k) / 6; end.push([Lw + half * Math.cos(a) * 0.6, half * Math.sin(a)]); }
      const wing = [[0, -half], ...end, [0, half]].map((p) => rot(p, dir));
      c.push(mass({ name: `Wing ${"ABC"[i]} tier ${j + 1}`, outline: wing, base: z, height: top - z, material: "Glass", color: glass, ifc_class: "IfcWall" }));
      z = top;
    }
  }
  c.push(rev({ name: "Spire", center: [0, 0], profile: [[0, 0], [7000, 0], [2600, 160000], [600, 243000], [0, 243000]], base: 585000, segments: 12, material: "Steel", color: "#c7ced4", ifc_class: "IfcMember" }));
  return { id: "burj", plans: [{ title: "Plan at +50 m", cut_z: 50000 }, { title: "Plan at +300 m", cut_z: 300000 }, { title: "Plan at +500 m", cut_z: 500000 }], name: "Burj Khalifa", credit: "Burj Khalifa, Dubai, 2004–2010, by Skidmore, Owings & Merrill (Adrian Smith, design partner). Simplified massing study: Y-shaped plan, 27 spiralling setbacks, 828 m. Not affiliated with or endorsed by the owner.", commands: c };
}

// ---------------------------------------------------------------- Vitra Fire Station
function vitra() {
  const c = []; const conc = "#c9c7c1";
  // long, sharp, layered concrete planes; walls lean and the canopy knifes out over the forecourt
  c.push(mass({ name: "Forecourt", outline: [[-12000, -14000], [62000, -9000], [64000, 9000], [-10000, 6000]], base: -300, height: 300, material: "Concrete", color: "#9d9b95", ifc_class: "IfcSlab" }));
  c.push(mass({ as: "hall", name: "Engine hall", outline: [[0, 0], [38000, 2500], [36500, 9200], [1200, 7400]], height: 7600, material: "Concrete", color: conc, ifc_class: "IfcWall" }));
  { const d = (Math.atan2(2500, 38000) * 180) / Math.PI; // five engine bays cut into the front face, plus a ribbon window on the back
    c.push({ name: "boolean", args: { base: "$hall", op: "difference", tools: [...[4500, 11000, 17500, 24000, 30500].map((x) => ({ shape: "opening", at: [x, Math.round((x * 2500) / 38000), 0], dir_deg: d, width: 5200, height: 5600, depth: 1600, arch: "rect" })),
      { shape: "box", min: [3000, 6800, 4300], max: [34000, 9600, 5100] }] } }); }
  c.push(mass({ name: "Hall glazing", outline: [[1500, -150], [30000, 1750], [30000, 1950], [1500, 50]], base: 300, height: 5600, material: "Glass", color: "#6f8790", ifc_class: "IfcWall" }));
  c.push(mass({ name: "Changing rooms wing", outline: [[-2000, 7400], [44000, 10800], [43500, 14200], [-1500, 10600]], height: 4300, material: "Concrete", color: conc, ifc_class: "IfcWall" }));
  c.push(mass({ name: "Club room (upper)", outline: [[6000, 8200], [40000, 10900], [39200, 14000], [6400, 11400]], base: 4300, height: 3600, material: "Concrete", color: "#d6d4ce", ifc_class: "IfcWall" }));
  c.push(mass({ name: "Leaning wall plane", outline: [[-6000, -1600], [46000, 2600], [46000, 3000], [-6000, -1200]], height: 9200, lean_deg: -9, lean_dir_deg: 98, material: "Concrete", color: "#bdbbb5", ifc_class: "IfcWall" }));
  c.push(mass({ name: "Knife-edge canopy", outline: [[2000, -400], [36000, 1600], [52000, -6500], [37000, -1200]], base: 6800, height: 320, material: "Concrete", color: "#e1dfd9", ifc_class: "IfcSlab" }));
  c.push(mass({ name: "Canopy strut", outline: [[30000, -900], [30500, -870], [30500, -500], [30000, -530]], height: 6800, lean_deg: 14, lean_dir_deg: 300, material: "Steel", color: "#5b5f63", ifc_class: "IfcMember" }));
  c.push(mass({ name: "Tapering wall (end)", outline: [[38000, 2500], [58000, 4800], [58000, 5300], [38000, 3000]], height: 5800, top_scale: 0.55, material: "Concrete", color: conc, ifc_class: "IfcWall" }));
  return { id: "vitra", plans: [{ title: "Ground floor plan", cut_z: 1200 }, { title: "Upper floor plan", cut_z: 5800 }], name: "Vitra Fire Station", credit: "Vitra Fire Station, Weil am Rhein, 1990–1993, by Zaha Hadid (her first major built work). LOD 350 study built from BIMja commands: long layered concrete planes, engine bays cut into the hall, leaning walls and a knife-edge canopy. Not affiliated with or endorsed by Vitra.", commands: c };
}

export const LANDMARKS = [pisa(), taj(), fallingwater(), burj(), vitra()];

import { newProject } from "../author/model.js";
/** The project + script for a landmark: a fresh project named after it, credit in the description. */
export function landmarkProject(id) {
  const l = LANDMARKS.find((x) => x.id === id); if (!l) return null;
  const model = newProject(`${l.name} (BIMja massing study)`); model.description = `${l.credit} Built with BIMja commands.`; model.drawing_plans = l.plans;
  return { landmark: l, project: { format: "bimja-project", version: 1, model, extra: {} } };
}
