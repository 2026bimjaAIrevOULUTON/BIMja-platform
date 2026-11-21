import { Bus } from "../src/core/bus.js";
import { installCore } from "../src/core/handlers.js";
const L = installCore(new Bus()); const ex = (n, a) => L.execute({ name: n, args: a, actor: "human", apply: true });
ex("mass", { outline: [[0, 0], [20000, 0], [20000, 10000], [0, 10000]], height: 10000 });
ex("geolocate", { lat: 27.175, lon: 78.0421, timezone: 5.5 });
const r = ex("solar_study", { date: "2026-12-21" }); if (!r.ok) console.log(r.refusals); console.log(r.data.sun_hours_window, r.data.facades, r.data.steps.map(s=>s.ground_shadow_m2).join(","));
