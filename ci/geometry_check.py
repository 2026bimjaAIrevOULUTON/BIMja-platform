"""CI only (IfcOpenShell, LGPL): build the geometry of every product, so a faceted B-rep that no viewer can read fails the build."""
import sys, json, ifcopenshell, ifcopenshell.geom
s = ifcopenshell.geom.settings()
for path in sys.argv[1:]:
    f = ifcopenshell.open(path); ok = bad = 0
    for e in f.by_type("IfcProduct"):
        if not e.Representation: continue
        try: ifcopenshell.geom.create_shape(s, e); ok += 1
        except Exception as ex: bad += 1; print("  FAIL", e.is_a(), e.Name, ex)
    print(json.dumps({"file": path, "shapes": ok, "failed": bad}))
