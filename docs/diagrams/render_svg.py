#!/usr/bin/env python3
"""Renders a generated .excalidraw scene to a plain SVG preview (for the README and
for eyeballing the layout without opening Excalidraw). Approximate by design: straight
strokes, no hand-drawn roughness."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "cooler-calls-page-flow.excalidraw")
dst = os.path.splitext(src)[0] + ".svg"
scene = json.load(open(src))
els = [e for e in scene["elements"] if not e.get("isDeleted")]

xs = [e["x"] for e in els] + [e["x"] + e["width"] for e in els]
ys = [e["y"] for e in els] + [e["y"] + e["height"] for e in els]
pad = 40
minx, miny = min(xs) - pad, min(ys) - pad
w, h = max(xs) - minx + pad, max(ys) - miny + pad

def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

out = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
    f'viewBox="0 0 {w:.0f} {h:.0f}" font-family="ui-monospace, Menlo, monospace">',
    f'<rect width="{w:.0f}" height="{h:.0f}" fill="#ffffff"/>',
    '<defs><marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">'
    '<path d="M0,0 L8,3 L0,6 z" fill="context-stroke"/></marker></defs>',
]

for e in els:
    x, y = e["x"] - minx, e["y"] - miny
    t = e["type"]
    if t == "rectangle":
        dash = ' stroke-dasharray="6 4"' if e.get("strokeStyle") == "dashed" else ""
        out.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{e["width"]:.1f}" height="{e["height"]:.1f}" rx="8" '
            f'fill="{e["backgroundColor"]}" stroke="{e["strokeColor"]}" stroke-width="{e["strokeWidth"]}"{dash}/>'
        )
    elif t == "ellipse":
        out.append(
            f'<ellipse cx="{x + e["width"]/2:.1f}" cy="{y + e["height"]/2:.1f}" '
            f'rx="{e["width"]/2:.1f}" ry="{e["height"]/2:.1f}" fill="{e["backgroundColor"]}" stroke="{e["strokeColor"]}"/>'
        )
    elif t == "arrow":
        pts = " ".join(f"{x + px:.1f},{y + py:.1f}" for px, py in e["points"])
        dash = ' stroke-dasharray="6 4"' if e.get("strokeStyle") == "dashed" else ""
        out.append(
            f'<polyline points="{pts}" fill="none" stroke="{e["strokeColor"]}" '
            f'stroke-width="{e["strokeWidth"]}" marker-end="url(#a)"{dash}/>'
        )
    elif t == "text":
        size = e["fontSize"]
        for i, line in enumerate(e["text"].split("\n")):
            out.append(
                f'<text x="{x:.1f}" y="{y + size * 1.25 * i + size:.1f}" font-size="{size}" '
                f'fill="{e["strokeColor"]}">{esc(line)}</text>'
            )

out.append("</svg>")
open(dst, "w").write("\n".join(out))
print(f"wrote {dst}  ({w:.0f}x{h:.0f})")
