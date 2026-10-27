"""Local web server. Run:  python app.py   then open http://127.0.0.1:5000"""
import datetime
import logging
import re
import threading
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import calc

BASE = Path(__file__).resolve().parent
SNAP_DIR = BASE / "snapshots"
SNAP_DIR.mkdir(exist_ok=True)
AQUIFERS = {"confined"}
_lock = threading.Lock()
log = logging.getLogger("cutoff")
logging.basicConfig(level=logging.INFO)

app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


def fail(msg, code=400, fields=None):
    return jsonify(ok=False, message=msg, errors=fields or {}), code


@app.errorhandler(Exception)
def on_error(e):
    code = getattr(e, "code", 500)
    if not isinstance(code, int):
        code = 500
    if code >= 500:
        log.exception("Unhandled error")
    return fail("The request could not be processed." if code >= 500 else str(getattr(e, "description", e)), code)


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/config")
def api_config():
    return jsonify(calc.config())


@app.post("/api/calculate")
def api_calculate():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return fail("Request body must be JSON.")
    try:
        return jsonify(ok=True, result=calc.calculate(data.get("inputs")))
    except calc.CalcError as e:
        return fail(str(e), 422, e.fields)


def _clean(v):
    """Keep a typed value on one line and bounded, so it cannot forge snapshot lines."""
    return " ".join(str(v).split())[:40]


def _fmt(x):
    return f"{x:.6g}"


def _snapshot_text(aquifer, raw, serial, stamp):
    L = ["Seawater intrusion with a cutoff wall",
         f"Aquifer type : {aquifer}",
         f"Snapshot no. : {serial:03d}",
         f"Created      : {stamp:%Y-%m-%d %H:%M:%S}",
         "Method       : Sun et al. (2026), Adv. Water Resour. 212, 105301 (Eqs. 8, 17-23)",
         "Boundary     : constant inland flux; no mixing correction applied", "", "INPUTS"]
    for f in calc.FIELDS:
        L.append(f"  {f['name']} ({f['sym']}) = {_clean(raw.get(f['key'], ''))} {f['unit']}")
    L += ["", "OUTPUTS"]
    try:
        r = calc.calculate(raw)
        L += [f"  Status                         : OK",
              f"  Scenario                       : ({r['scenario']}) {r['scenario_desc']}",
              f"  Density ratio (alpha)          : {_fmt(r['alpha'])}",
              f"  Toe without wall (xt_a)        : {_fmt(r['xt_nowall'])} m",
              f"  Toe with wall (xt)             : {_fmt(r['xt'])} m",
              f"  Dimensionless toe (xt_bar)     : {_fmt(r['xt_bar'])}",
              f"  Reduction in intrusion length  : {_fmt(r['reduction_pct'])} %",
              f"  kappa = Kw/Ka                  : {_fmt(r['kappa'])}",
              f"  Lw_bar = Lw/xt_a               : {_fmt(r['L_bar'])}",
              f"  hw_bar = hw/H                  : {_fmt(r['h_bar'])}",
              f"  w_bar = w/xt_a                 : {_fmt(r['w_bar'])}"]
    except calc.CalcError as e:
        L.append("  Status : ERROR - no output was produced")
        L.append(f"  Message: {e}")
        for k, m in e.fields.items():
            L.append(f"    {calc.FIELD_BY_KEY[k]['name']} ({calc.FIELD_BY_KEY[k]['sym']}): {m}")
    except Exception as e:  # never lose the snapshot
        log.exception("Snapshot calculation failed")
        L += ["  Status : ERROR - no output was produced", f"  Message: unexpected error ({type(e).__name__})"]
    return "\n".join(L) + "\n"


@app.post("/api/snapshot")
def api_snapshot():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return fail("Request body must be JSON.")
    aquifer = data.get("aquifer", "confined")
    raw = data.get("inputs") if isinstance(data.get("inputs"), dict) else {}
    if aquifer not in AQUIFERS:
        return fail("Snapshots are only available for confined aquifers.")
    try:
        with _lock:
            pat = re.compile(rf"^{aquifer}_(\d+)_")
            serial = 1 + max([int(m.group(1)) for p in SNAP_DIR.glob(f"{aquifer}_*.txt")
                              if (m := pat.match(p.name))] or [0])
            stamp = datetime.datetime.now()
            name = f"{aquifer}_{serial:03d}_{stamp:%Y-%m-%d}.txt"
            text = _snapshot_text(aquifer, raw, serial, stamp)
            (SNAP_DIR / name).write_text(text, encoding="utf-8")
    except OSError:
        log.exception("Could not write snapshot")
        return fail("The snapshot could not be saved on the server.", 500)
    return jsonify(ok=True, filename=name, text=text)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
