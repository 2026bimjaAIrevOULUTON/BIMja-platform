# Reference clash set from IfcOpenShell 0.8.5's geometry tree (CI/test only; LGPL, never bundled).
# 0.9.x pip builds ship only the BRep tree, which has no clash queries, so tests run this with PYTHONPATH=<ifcopenshell 0.8.5>.
import sys, json, ifcopenshell, ifcopenshell.geom, ifcopenshell.ifcopenshell_wrapper
fa, fb, tol = ifcopenshell.open(sys.argv[1]), ifcopenshell.open(sys.argv[2]), float(sys.argv[3])
s = ifcopenshell.geom.settings()
tree = ifcopenshell.geom.tree()
for f in (fa, fb):
    it = ifcopenshell.geom.iterator(s, f, include=f.by_type("IfcElement"))
    if it.initialize():
        while True:
            tree.add_element(it.get())
            if not it.next(): break
ga = [e for e in fa.by_type("IfcElement") if not e.is_a("IfcOpeningElement")]
gb = [e for e in fb.by_type("IfcElement") if not e.is_a("IfcOpeningElement")]
res = tree.clash_intersection_many(ga, gb, tolerance=tol, check_all=True)
out = sorted({(c.a.get_argument(0), c.b.get_argument(0)) for c in res})
print(json.dumps([{"a": a, "b": b} for a, b in out]))
