"""CI only: write a survey DXF with ezdxf (R2018: LWPOLYLINE contours with elevation, 3D POINTs, spot-level TEXT), so
BIMja's DXF reader is tested on a file made by an independent writer."""
import sys, math, ezdxf
doc = ezdxf.new("R2018"); msp = doc.modelspace()
for k, z in enumerate([100, 101, 102, 103, 104]):
    pts = [(x, 10 * k + 3 * math.sin(x / 7)) for x in range(0, 61, 3)]
    msp.add_lwpolyline(pts, dxfattribs={"elevation": z, "layer": "CONTOURS"})
for i in range(10): msp.add_point((5 + i * 5, 45, 104.5 + i * 0.05), dxfattribs={"layer": "SPOTS"})
msp.add_text("103.75", dxfattribs={"insert": (30, 35), "height": 0.4, "layer": "LEVELS"})
doc.saveas(sys.argv[1]); print("ok")
