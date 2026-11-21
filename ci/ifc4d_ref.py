"""Reference task counts from IfcOpenShell's ifc4d readers (LGPL-3.0, CI/test only, never shipped).
Usage: python ci/ifc4d_ref.py <p6|mspdi> <file.xml>  ->  JSON {activities, wbs, links}"""
import json, sys
kind, path = sys.argv[1], sys.argv[2]
if kind == "p6":
    from ifc4d.p62ifc import P62Ifc
    r = P62Ifc(); r.xml = path; r.parse_xml()
else:
    from ifc4d.msp2ifc import MSP2Ifc
    r = MSP2Ifc(); r.xml = path; r.parse_xml()
print(json.dumps({"activities": len(r.activities), "wbs": len(r.wbs), "links": len(r.relationships)}))
