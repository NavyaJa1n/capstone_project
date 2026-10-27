"""Confined-aquifer seawater intrusion with a cutoff wall.
Implements Algorithm 1 (blue steps) of Sun et al. (2026), Adv. Water Resour. 212, 105301:
Eq. (8) dimensionless variables, Eq. (23) scenario test, Eqs. (17)-(22) interface toe.
Flux-controlled inland boundary only; no mixing correction applied."""
import math
import re

GROUPS = ["Aquifer", "Cutoff wall", "Fluid", "Inland boundary"]

# min/max are bounds; *_ex = True means the bound itself is not allowed.
FIELDS = [
    dict(key="H", group="Aquifer", name="Aquifer thickness", sym="H", html="H", unit="m", default=30,
         min=0, min_ex=True, max=1000, desc="H: vertical thickness of the confined aquifer."),
    dict(key="Hs", group="Aquifer", name="Sea level above aquifer base", sym="Hs", html="H<sub>s</sub>", unit="m", default=35,
         min=0, min_ex=True, max=1000, desc="Hs: sea level measured from the aquifer base. Must be at least H for a confined aquifer."),
    dict(key="Ka", group="Aquifer", name="Aquifer hydraulic conductivity", sym="Ka", html="K<sub>a</sub>", unit="m/d", default=10,
         min=0, min_ex=True, max=10000, desc="Ka: hydraulic conductivity of the aquifer."),
    dict(key="Kw", group="Cutoff wall", name="Wall hydraulic conductivity", sym="Kw", html="K<sub>w</sub>", unit="m/d", default=0.001,
         min=0, min_ex=True, max=10000, desc="Kw: hydraulic conductivity of the cutoff wall. Must be smaller than Ka."),
    dict(key="Lw", group="Cutoff wall", name="Wall distance from coast", sym="Lw", html="L<sub>w</sub>", unit="m", default=38,
         min=0, min_ex=False, max=100000, desc="Lw: distance from the coastline to the seaward face of the wall. 0 means the wall is on the coast."),
    dict(key="hw", group="Cutoff wall", name="Wall opening height", sym="hw", html="h<sub>w</sub>", unit="m", default=18,
         min=0, min_ex=True, max=1000, desc="hw: height of the open gap between the aquifer base and the bottom of the wall. Must be smaller than H."),
    dict(key="w", group="Cutoff wall", name="Wall width", sym="w", html="w", unit="m", default=1,
         min=0, min_ex=False, max=1000, desc="w: thickness of the cutoff wall in the flow direction."),
    dict(key="rho_f", group="Fluid", name="Freshwater density", sym="rho_f", html="&rho;<sub>f</sub>", unit="kg/m³", default=1000,
         min=900, min_ex=False, max=1100, desc="ρf: density of freshwater."),
    dict(key="rho_s", group="Fluid", name="Seawater density", sym="rho_s", html="&rho;<sub>s</sub>", unit="kg/m³", default=1025,
         min=1000, min_ex=False, max=1300, desc="ρs: density of seawater. Must be larger than ρf."),
    dict(key="qf", group="Inland boundary", name="Inland freshwater flux", sym="qf", html="q<sub>f</sub>", unit="m²/d", default=0.36,
         min=0, min_ex=True, max=1000, desc="qf: constant freshwater discharge per metre of coastline entering at the inland boundary."),
]
FIELD_BY_KEY = {f["key"]: f for f in FIELDS}

SCENARIOS = {
    "a": "Wall is inland of the no-wall interface toe; the wall has no effect.",
    "b": "Wall does not cut the interface; the toe lies beneath the wall.",
    "c": "Wall does not cut the interface; the toe lies inland of the wall.",
    "d": "Interface enters the wall; the toe lies within the wall.",
    "e": "Interface enters the wall; the toe lies inland of the wall.",
    "f": "Interface enters the wall and leaves at its landward face.",
}

EQUATIONS = {
    "a": "x̄t = 1   (Eq. 17)",
    "b": "x̄t = 1 − 2(1−κ)(1−h̄w)(1−√L̄w)   (Eq. 18)",
    "c": "x̄t = 1 − 2β̄1(λ̄1 + √(λ̄1² + w̄))\nβ̄1 = (1−h̄w)(1−κ),  λ̄1 = β̄1 − √L̄w   (Eqs. 19, 11, 13)",
    "d": "x̄t = (h̄w² + L̄w)(1−κ) + κ   (Eq. 20)",
    "e": "x̄t = (3−2κ)κ − [2β̄1·√(κL̄w + w̄ − κβ̄1²/(1−κ))\n      − h̄w(2−h̄w)(1−κ)(1−2κ) − (1−κ)L̄w]   (Eq. 21)\nβ̄1 = (1−h̄w)(1−κ)",
    "f": "x̄t = 1 + w̄(1 − 1/κ)   (Eq. 22)",
}


class CalcError(Exception):
    def __init__(self, message, fields=None):
        super().__init__(message)
        self.fields = fields or {}


def config():
    return dict(groups=GROUPS, fields=FIELDS, equations=EQUATIONS, scenarios=SCENARIOS)


def _parse(raw):
    """Parse and range-check every field. Collects all field errors before raising."""
    errors, vals = {}, {}
    if not isinstance(raw, dict):
        raise CalcError("Input was not understood.")
    for f in FIELDS:
        k = f["key"]
        v = raw.get(k)
        try:
            if v is None or (isinstance(v, str) and not v.strip()):
                raise ValueError("Enter a value.")
            if isinstance(v, bool):
                raise ValueError("Enter a number.")
            if isinstance(v, str) and not re.fullmatch(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?", v.strip()):
                raise ValueError("Enter a number.")
            x = float(v)
            if not math.isfinite(x):
                raise ValueError("Enter a finite number.")
        except (TypeError, ValueError) as e:
            errors[k] = str(e) if str(e).startswith("Enter") else "Enter a number."
            continue
        lo, hi = f["min"], f["max"]
        if x < lo or (f["min_ex"] and x == lo):
            errors[k] = f"Must be {'greater than' if f['min_ex'] else 'at least'} {lo:g} {f['unit']}."
        elif x > hi:
            errors[k] = f"Must be at most {hi:g} {f['unit']}."
        else:
            vals[k] = x
    if not errors:  # cross-field checks
        if vals["Hs"] < vals["H"]:
            errors["Hs"] = "Must be at least the aquifer thickness H."
        if vals["hw"] >= vals["H"]:
            errors["hw"] = "Must be smaller than the aquifer thickness H."
        if vals["Kw"] >= vals["Ka"]:
            errors["Kw"] = "Must be smaller than the aquifer conductivity Ka."
        if vals["rho_s"] <= vals["rho_f"]:
            errors["rho_s"] = "Must be larger than the freshwater density."
    if errors:
        raise CalcError("Some values are out of range. Correct the marked fields.", errors)
    return vals


def _scenario(Lb, hb, kappa, wb):
    """Eq. (23). Branches are the exact partition of the six inequality sets."""
    if Lb >= 1:
        return "a"
    s = math.sqrt(Lb)
    if hb >= 1 - s:
        B = 1 + (Lb + wb - 1) / (2 * (kappa - 1) * (s - 1))
        return "b" if hb < B else "c"
    lower = 1 - math.sqrt(Lb + wb / kappa)
    rad = (kappa * (Lb - 1) + wb) / (1 - kappa)
    D = math.sqrt(rad) if rad > 0 else 0.0
    if hb < lower:
        return "f"
    return "d" if hb < D else "e"


def _toe(sc, Lb, hb, kappa, wb):
    """Eqs. (17)-(22): dimensionless interface toe."""
    beta1 = (1 - hb) * (1 - kappa)
    if sc == "a":
        return 1.0
    if sc == "b":
        return 1 - 2 * (1 - kappa) * (1 - hb) * (1 - math.sqrt(Lb))
    if sc == "c":
        lam1 = beta1 - math.sqrt(Lb)
        return 1 - 2 * beta1 * (lam1 + math.sqrt(lam1 ** 2 + wb))
    if sc == "d":
        return (hb ** 2 + Lb) * (1 - kappa) + kappa
    if sc == "e":
        inner = kappa * Lb + wb - kappa * beta1 ** 2 / (1 - kappa)
        if inner < 0:
            raise CalcError("Scenario (e) square root is negative for these inputs.")
        return ((3 - 2 * kappa) * kappa
                - (2 * beta1 * math.sqrt(inner)
                   - hb * (2 - hb) * (1 - kappa) * (1 - 2 * kappa)
                   - (1 - kappa) * Lb))
    if sc == "f":
        return 1 + wb * (1 - 1 / kappa)
    raise CalcError(f"Unknown scenario '{sc}'.")


def _g(sc, x, Lb, hb, k, wb):
    """Dimensionless flow-path thickness g = alpha*phi_bar = h/H (Eqs. 9-16). Interface height z/H = 1 - g (Eq. 7)."""
    r = lambda v: math.sqrt(max(v, 0.0))
    b1 = (1 - hb) * (1 - k)
    if sc == "a" or x <= Lb:
        return r(x)
    d2 = lambda: r((x - (1 - k) * Lb) / k)
    d3 = lambda: r(x - k * b1 ** 2 / (1 - k) - (1 - k) * Lb) + b1
    if sc in "bc":
        if sc == "b" or x <= Lb + wb:
            return r(x + b1 * (b1 - 2 * math.sqrt(Lb))) + b1
        lam = b1 - math.sqrt(Lb)
        return r(x + 2 * b1 * lam + 2 * b1 * r(lam ** 2 + wb))
    xh = (1 - k) * Lb + k * (1 - hb) ** 2
    if sc == "d":
        return d2() if x <= xh else d3()
    if sc == "e":
        if x <= xh:
            return d2()
        if x <= Lb + wb:
            return d3()
        return r(x - (1 - k) * Lb + b1 * ((1 - 2 * k) / (1 - k) * b1
                 + 2 * r(k * Lb + wb - k * b1 ** 2 / (1 - k))))
    return d2() if x <= Lb + wb else r(x - (1 - 1 / k) * wb)   # f


def _plot(sc, Lb, hb, k, wb, xtb, xa, H, v):
    xh = (1 - k) * Lb + k * (1 - hb) ** 2
    xs = {i * xtb / 300 for i in range(301)} | {xtb}
    for p in (Lb, Lb + wb, xh if sc in "de" else None):
        if p is not None and 0 <= p <= xtb:
            xs |= {p, max(p - 1e-9, 0.0)}
    xs = sorted(xs)
    z = lambda x: H * max(0.0, 1 - _g(sc, x, Lb, hb, k, wb))
    prof = [(x * xa, z(x)) for x in xs]
    prof[-1] = (prof[-1][0], 0.0)
    nw = [(i / 100 * xa, H * (1 - math.sqrt(i / 100))) for i in range(101)]
    marks = [dict(key="toe", label="Interface toe", x=xtb * xa, z=0.0)]
    if Lb <= xtb and sc != "a":
        marks.append(dict(key="seaward", label="Seaward face of wall", x=Lb * xa, z=z(Lb)))
    if Lb + wb <= xtb and sc != "a":
        marks.append(dict(key="landward", label="Landward face of wall", x=(Lb + wb) * xa, z=z(Lb + wb)))
    if sc in "de":
        marks.append(dict(key="exit", label="Interface leaves wall opening", x=xh * xa, z=v["hw"]))
    return dict(x=[round(p[0], 4) for p in prof], z=[round(p[1], 4) for p in prof],
                nx=[round(p[0], 3) for p in nw], nz=[round(p[1], 3) for p in nw],
                marks=marks, H=v["H"], hw=v["hw"], Lw=v["Lw"], w=v["w"],
                xmax=max(xa, v["Lw"] + v["w"]) * 1.06)


def calculate(raw):
    """Run Algorithm 1 (confined, flux-controlled). Returns a dict or raises CalcError."""
    v = _parse(raw)
    try:
        alpha = v["rho_f"] / (v["rho_s"] - v["rho_f"])          # Eq. (2) definition
        gamma1 = 2 * alpha * v["qf"] / v["Ka"]                   # Eq. (A4)
        xa = v["H"] ** 2 / gamma1                                # Eq. (A6)
        kappa = v["Kw"] / v["Ka"]                                # Eq. (8)
        Lb, wb, hb = v["Lw"] / xa, v["w"] / xa, v["hw"] / v["H"]  # Eq. (8)
        sc = _scenario(Lb, hb, kappa, wb)                        # Eq. (23)
        xtb = _toe(sc, Lb, hb, kappa, wb)                        # Eqs. (17)-(22)
        xt = xtb * xa                                            # Eq. (8) inverted
    except CalcError:
        raise
    except (ArithmeticError, ValueError) as e:
        raise CalcError(f"Calculation failed: {e}")
    if not all(math.isfinite(z) for z in (alpha, gamma1, xa, Lb, wb, xtb, xt)):
        raise CalcError("Calculation produced a non-finite value. Check the inputs.")
    if xtb <= 0 or xtb > 1 + 1e-9:
        raise CalcError(f"Dimensionless toe {xtb:.4g} is outside the physical range (0, 1] "
                        f"for scenario ({sc}). The inputs are outside the validity of the solution.")
    return dict(alpha=alpha, gamma1=gamma1, xt_nowall=xa, kappa=kappa, L_bar=Lb, w_bar=wb, h_bar=hb,
                scenario=sc, scenario_desc=SCENARIOS[sc], xt_bar=min(xtb, 1.0), xt=min(xt, xa),
                reduction_pct=(1 - min(xtb, 1.0)) * 100,
                plot=_plot(sc, Lb, hb, kappa, wb, min(xtb, 1.0), xa, v["H"], v))
