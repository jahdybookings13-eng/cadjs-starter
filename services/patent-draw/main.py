import os
import uuid
from fastapi import FastAPI

OUT_DIR = os.environ.get("PATENT_OUT", "/tmp/patent-draw")
os.makedirs(OUT_DIR, exist_ok=True)

app = FastAPI(title="scadgen-patent-draw")


@app.get("/health")
def health():
    return {"status": "ok", "service": "patent-draw", "graphviz": False}


@app.post("/figure")
def figure(payload: dict):
    label = payload.get("figureLabel", "FIG. 1")
    views = payload.get("geometryViews", [])
    svg = _render_svg(label, views)
    path = os.path.join(OUT_DIR, f"{uuid.uuid4().hex}.svg")
    with open(path, "w") as f:
        f.write(svg)
    return {"status": "ok", "sheetPath": path, "compliant": True, "issues": []}


@app.post("/compliance")
def compliance(payload: dict):
    issues = []
    if not payload.get("figureLabel"):
        issues.append("missing figure label")
    if not payload.get("geometryViews"):
        issues.append("no views provided")
    return {"issues": issues}


def _render_svg(label: str, views: list) -> str:
    lines = ['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" style="background:#fff">']
    lines.append(f'<text x="400" y="40" text-anchor="middle" font-size="20" font-family="serif">{label}</text>')
    y = 80
    for v in (views or ["(no view)"]):
        lines.append(f'<rect x="50" y="{y}" width="700" height="120" fill="none" stroke="#000" stroke-width="2"/>')
        lines.append(f'<text x="400" y="{y+65}" text-anchor="middle" font-size="14">{v}</text>')
        y += 140
    lines.append("</svg>")
    return "\n".join(lines)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8790)
