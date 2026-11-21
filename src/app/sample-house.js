// The sample house used by the Create tab, tests and demos.
export const SAMPLE_HOUSE = [
  { name: "walls", args: { points: [[0, 0], [10000, 0], [10000, 8000], [0, 8000]], closed: true, type: "Exterior 230" } },
  { name: "wall", args: { start: [6000, 0], end: [6000, 8000], type: "Interior 115" } },
  { name: "wall", args: { start: [6000, 4500], end: [10000, 4500], type: "Interior 115" } },
  { name: "door", args: { at: [2000, 0], type: "Double 1500x2100" } },
  { name: "door", args: { at: [6000, 2000] } },
  { name: "door", args: { at: [6000, 6500] } },
  { name: "window", args: { at: [4000, 0] } }, { name: "window", args: { at: [8000, 0] } },
  { name: "window", args: { at: [10000, 6200] } }, { name: "window", args: { at: [3000, 8000] } }, { name: "window", args: { at: [0, 4000] } },
  { name: "floor", args: { from_walls: true } },
  { name: "room", args: { name: "Living", at: [3000, 4000] } },
  { name: "room", args: { name: "Bedroom", at: [8000, 6200] } },
  { name: "room", args: { name: "Kitchen", at: [8000, 2000] } },
  { name: "roof", args: { level: "L2", overhang: 400 } },
];
