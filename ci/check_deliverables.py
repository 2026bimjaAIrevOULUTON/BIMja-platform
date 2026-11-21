"""CI only: open every published file with independent readers. PDF: pypdf (BSD); DXF: ezdxf (MIT) recover + audit;
XLSX: openpyxl (MIT). Prints JSON."""
import sys, json, io, zipfile
from pypdf import PdfReader
import ezdxf
from ezdxf import recover
from openpyxl import load_workbook
z = zipfile.ZipFile(sys.argv[1]); out = {"pdf": {}, "dxf": {}, "xlsx": {}, "errors": []}
for n in z.namelist():
    b = z.read(n)
    try:
        if n.endswith(".pdf"):
            r = PdfReader(io.BytesIO(b)); out["pdf"][n] = {"pages": len(r.pages), "text": (r.pages[0].extract_text() or "")[:4000]}
        elif n.endswith(".dxf"):
            doc, aud = recover.read(io.BytesIO(b)); msp = doc.modelspace()
            out["dxf"][n] = {"entities": len(msp), "layers": sorted(l.dxf.name for l in doc.layers), "audit_errors": len(aud.errors), "types": sorted({e.dxftype() for e in msp})}
            if aud.errors: out["errors"].append(f"{n}: {len(aud.errors)} DXF audit errors")
        elif n.endswith(".xlsx"):
            wb = load_workbook(io.BytesIO(b), read_only=True); out["xlsx"][n] = {s: sum(1 for _ in wb[s].iter_rows()) for s in wb.sheetnames}
    except Exception as e: out["errors"].append(f"{n}: {e}")
print(json.dumps(out))
