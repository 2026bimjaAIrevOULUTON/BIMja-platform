# CI only (IfcOpenShell is LGPL-3.0 and never ships in the bundle): schema-validate exported IFC files.
import sys, ifcopenshell, ifcopenshell.validate
bad = 0
for path in sys.argv[1:]:
    f = ifcopenshell.open(path)
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, logger, express_rules=False)
    errs = [s for s in logger.statements if s.get("level") in ("ERROR", "error")] or logger.statements
    print(f"{path}: {f.schema}, {len(f.by_type('IfcProduct'))} products, {len(errs)} issues")
    for s in errs[:15]: print("   ", s.get("message", s))
    bad += len(errs)
sys.exit(1 if bad else 0)
