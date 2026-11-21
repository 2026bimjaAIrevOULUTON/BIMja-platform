"""Reference quantities from IfcOpenShell's ifc5d (LGPL-3.0, CI/test only, never shipped).
Usage: python ci/ifc5d_ref.py model.ifc -> JSON {GlobalId: {QuantityName: value}} computed from geometry."""
import json, sys
import ifcopenshell, ifc5d.qto as qto
f = ifcopenshell.open(sys.argv[1])
els = set(f.by_type("IfcElement")) | set(f.by_type("IfcSpace"))
res = qto.quantify(f, els, qto.rules["IFC4QtoBaseQuantities"])
print(json.dumps({e.GlobalId: {k: v for d in qs.values() for k, v in d.items() if v is not None} for e, qs in res.items()}))
