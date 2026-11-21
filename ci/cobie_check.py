"""Independent COBie 2.4 structure check (CI only). Opens the .xlsx with openpyxl and checks:
every sheet and column of the COBie 2.4 template in order; required fields filled (no blanks; n/a where unknown);
unique names per keyed sheet; CreatedBy refers to a Contact; Floor/Space/Type references resolve;
categories and units are present. Prints JSON {ok, errors, counts}."""
import json, sys
from openpyxl import load_workbook
SHEETS = json.loads(sys.argv[2]) if len(sys.argv) > 2 else None
wb = load_workbook(sys.argv[1], read_only=True)
errors = []; data = {}
for name, cols in SHEETS.items():
    if name not in wb.sheetnames: errors.append(f"missing sheet {name}"); continue
    rows = [list(r) for r in wb[name].iter_rows(values_only=True)]
    if not rows or [str(c) for c in rows[0][:len(cols)]] != cols: errors.append(f"{name}: header mismatch"); continue
    data[name] = [dict(zip(cols, r)) for r in rows[1:] if any(v not in (None, "") for v in r)]
    for i, r in enumerate(data[name]):
        for c in cols:
            if r.get(c) in (None, ""): errors.append(f"{name} row {i+2}: {c} is blank (use n/a)")
def key(sheet, col="Name"):
    seen = set()
    for r in data.get(sheet, []):
        if r[col] in seen: errors.append(f"{sheet}: duplicate {col} {r[col]}")
        seen.add(r[col])
    return seen
contacts = key("Contact", "Email"); floors = key("Floor"); spaces = key("Space"); types = key("Type"); comps = key("Component")
for sheet, rows in data.items():
    for r in rows:
        if "CreatedBy" in r and r["CreatedBy"] not in contacts: errors.append(f"{sheet}: CreatedBy {r['CreatedBy']} is not a Contact")
for r in data.get("Space", []):
    if r["FloorName"] not in floors: errors.append(f"Space {r['Name']}: FloorName {r['FloorName']} not in Floor")
    if r["Category"] in ("n/a",): errors.append(f"Space {r['Name']}: Category required")
for r in data.get("Component", []):
    if r["TypeName"] not in types: errors.append(f"Component {r['Name']}: TypeName {r['TypeName']} not in Type")
    for s in str(r["Space"]).split(","):
        if s != "n/a" and s not in spaces: errors.append(f"Component {r['Name']}: Space {s} not in Space")
for r in data.get("Job", []):
    if r["TypeName"] not in types: errors.append(f"Job {r['Name']}: TypeName not in Type")
fac = data.get("Facility", [])
if len(fac) != 1: errors.append(f"Facility: expected 1 row, got {len(fac)}")
elif any(fac[0][c] == "n/a" for c in ("LinearUnits", "AreaUnits", "VolumeUnits", "CurrencyUnit")): errors.append("Facility: units missing")
if not data.get("Floor") or not data.get("Component"): errors.append("no floors or components")
print(json.dumps({"ok": not errors, "errors": errors[:30], "counts": {k: len(v) for k, v in data.items()}}))
