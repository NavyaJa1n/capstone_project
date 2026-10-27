"use strict";
(function () {
  // Equations shown beside each output (single source for the information icons).
  const OUT_EQ = {
    alpha: "α = ρf / (ρs − ρf)\nDensity ratio, Eq. (2).",
    xt_nowall: "xt,a = H² / γ1\nγ1 = 2·α·qf / Ka\nEqs. (A4), (A6). Toe position without a wall.",
    xt: "xt = x̄t · xt,a\nEq. (8) inverted. x̄t comes from the identified scenario.",
    xt_bar: null, // filled from the server's scenario equations
    reduction: "Reduction = (1 − x̄t) · 100 %\nShortening of the intrusion length relative to no wall.",
    scenario: "Scenario (a)-(f) from Eq. (23), using\nκ = Kw/Ka, L̄w = Lw/xt,a, h̄w = hw/H, w̄ = w/xt,a (Eq. 8).",
    kappa: "κ = Kw / Ka   Eq. (8)",
    L_bar: "L̄w = Lw / xt,a   Eq. (8)",
    h_bar: "h̄w = hw / H   Eq. (8)",
    w_bar: "w̄ = w / xt,a   Eq. (8)"
  };

  const $ = (id) => document.getElementById(id);
  const state = { cfg: null, rows: {}, result: null, busy: false };

  // ---------- helpers ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function info(text, extra) {
    const w = el("span", "info" + (extra ? " " + extra : ""));
    w.appendChild(el("span", "i", "i"));
    const t = el("span", "tip", text);
    t.setAttribute("role", "tooltip");
    w.appendChild(t);
    return w;
  }
  function fmt(x) {
    if (typeof x !== "number" || !isFinite(x)) return "-";
    if (x !== 0 && Math.abs(x) < 1e-3) return x.toExponential(4);
    return String(Number(x.toPrecision(6)));
  }
  const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

  function checkOne(f, raw) {
    const s = String(raw).trim();
    if (!s) return "Enter a value.";
    if (!NUM.test(s)) return "Enter a number.";
    const x = Number(s);
    if (!isFinite(x)) return "Enter a finite number.";
    if (x < f.min || (f.min_ex && x === f.min)) return "Must be " + (f.min_ex ? "greater than " : "at least ") + f.min + " " + f.unit + ".";
    if (x > f.max) return "Must be at most " + f.max + " " + f.unit + ".";
    return "";
  }
  function setError(key, msg) {
    const r = state.rows[key];
    if (!r) return;
    r.row.classList.toggle("bad", !!msg);
    r.input.setAttribute("aria-invalid", msg ? "true" : "false");
    r.msg.textContent = msg || "";
    r.msg.hidden = !msg;
  }
  function values() {
    const v = {};
    state.cfg.fields.forEach((f) => { v[f.key] = state.rows[f.key].input.value; });
    return v;
  }
  function validateAll() {
    let first = null;
    state.cfg.fields.forEach((f) => {
      const m = checkOne(f, state.rows[f.key].input.value);
      setError(f.key, m);
      if (m && !first) first = f.key;
    });
    return first;
  }
  function showStatus(msg, ok) {
    const s = $("status");
    s.textContent = msg || "";
    s.hidden = !msg;
    s.className = "status" + (ok ? " ok" : "");
  }
  async function post(url, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctl.signal
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* non-JSON reply */ }
      if (!data) throw new Error("The server sent an unreadable reply.");
      return data;
    } finally { clearTimeout(timer); }
  }

  // ---------- build form ----------
  function buildForm() {
    const host = $("fields");
    host.textContent = "";
    state.cfg.groups.forEach((g) => {
      const grp = el("div", "group");
      grp.appendChild(el("h3", "", g));
      state.cfg.fields.filter((f) => f.group === g).forEach((f) => {
        const row = el("div", "row");
        const line = el("div", "line");
        const lab = el("div", "lab");
        const label = el("label", "", f.name);
        label.htmlFor = "in-" + f.key;
        const sym = el("span", "sym");
        sym.innerHTML = f.html; // symbol markup comes from our own server config
        lab.append(label, sym, info(f.desc));
        const input = el("input");
        input.type = "text"; input.id = "in-" + f.key; input.name = f.key;
        input.inputMode = "decimal"; input.value = String(f.default);
        input.dataset.def = String(f.default);
        input.setAttribute("aria-describedby", "msg-" + f.key);
        line.append(lab, input, el("span", "unit", f.unit));
        const msg = el("p", "msg"); msg.id = "msg-" + f.key; msg.hidden = true;
        row.append(line, msg);
        grp.appendChild(row);
        state.rows[f.key] = { row, input, msg, field: f };
        input.addEventListener("focus", () => input.select());
        input.addEventListener("input", () => { setError(f.key, checkOne(f, input.value)); markStale(); });
        input.addEventListener("keydown", onKey);
      });
      host.appendChild(grp);
    });
  }

  function onKey(e) {
    const keys = state.cfg.fields.map((f) => f.key);
    const i = keys.indexOf(e.target.name);
    let j = null;
    if (e.key === "ArrowDown") j = Math.min(i + 1, keys.length - 1);
    else if (e.key === "ArrowUp") j = Math.max(i - 1, 0);
    else if (e.key === "Enter") {
      e.preventDefault();
      if (i === keys.length - 1) { calculate(); return; }
      j = i + 1;
    }
    if (j !== null) {
      e.preventDefault();
      state.rows[keys[j]].input.focus();
    }
  }

  // ---------- output rendering ----------
  function markStale() {
    $("out").classList.toggle("stale", !!state.result);
  }
  function eqForToe(sc) {
    if (sc) return state.cfg.equations[sc];
    return Object.keys(state.cfg.equations).map((k) => "Scenario (" + k + ")\n" + state.cfg.equations[k]).join("\n\n");
  }
  function resRow(key, label, value, unit, desc, eq) {
    const r = el("div", "res");
    const k = el("span", "k", label);
    k.appendChild(info(eq, "eq right"));
    const v = el("span", "v", value + (unit ? " " + unit : ""));
    r.append(k, v);
    if (desc) r.appendChild(el("span", "d", desc));
    return r;
  }
  function render() {
    const out = $("out");
    out.textContent = "";
    out.classList.remove("stale");
    const r = state.result;
    if (!r) {
      out.appendChild(el("p", "empty", "No output yet. Review the values and select Process output."));
      return;
    }
    const head = el("div", "headline");
    const k = el("div", "k", "Interface toe position with wall (xt)");
    k.appendChild(info(OUT_EQ.xt + "\n\n" + eqForToe(r.scenario), "eq right"));
    const v = el("div", "v", fmt(r.xt));
    v.appendChild(el("small", "", "m from the coast"));
    head.append(k, v);
    out.appendChild(head);
    out.appendChild(resRow("reduction", "Reduction in intrusion length", fmt(r.reduction_pct), "%", "", OUT_EQ.reduction));
    out.appendChild(resRow("xt_nowall", "Toe position without wall (xt,a)", fmt(r.xt_nowall), "m", "", OUT_EQ.xt_nowall));
    out.appendChild(resRow("scenario", "Scenario", "(" + r.scenario + ")", "", r.scenario_desc, OUT_EQ.scenario));
    out.appendChild(resRow("xt_bar", "Dimensionless toe (x̄t)", fmt(r.xt_bar), "", "", eqForToe(r.scenario)));
    out.appendChild(resRow("alpha", "Density ratio (α)", fmt(r.alpha), "", "", OUT_EQ.alpha));
    out.appendChild(resRow("kappa", "Conductivity ratio (κ)", fmt(r.kappa), "", "", OUT_EQ.kappa));
    out.appendChild(resRow("L_bar", "Dimensionless wall distance (L̄w)", fmt(r.L_bar), "", "", OUT_EQ.L_bar));
    out.appendChild(resRow("h_bar", "Dimensionless opening (h̄w)", fmt(r.h_bar), "", "", OUT_EQ.h_bar));
    out.appendChild(resRow("w_bar", "Dimensionless width (w̄)", fmt(r.w_bar), "", "", OUT_EQ.w_bar));
  }

  // ---------- actions ----------
  function setBusy(b) {
    state.busy = b;
    $("btn-calc").disabled = b; $("btn-snap").disabled = b;
  }
  async function calculate() {
    if (state.busy) return;
    try {
      state.result = null; render();
      const bad = validateAll();
      if (bad) {
        showStatus("Some values are missing or out of range. Correct the marked fields.");
        state.rows[bad].input.focus();
        return;
      }
      showStatus("");
      setBusy(true);
      const data = await post("/api/calculate", { inputs: values() });
      if (!data.ok) {
        Object.keys(data.errors || {}).forEach((k) => setError(k, data.errors[k]));
        showStatus(data.message || "The calculation could not be completed.");
        const first = Object.keys(data.errors || {})[0];
        if (first && state.rows[first]) state.rows[first].input.focus();
        return;
      }
      state.result = data.result;
      render();
    } catch (err) {
      showStatus(err && err.name === "AbortError"
        ? "The server took too long to respond. Try again."
        : "Could not reach the calculation server. Check that it is running.");
    } finally { setBusy(false); }
  }

  function save(name, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function offlineSnapshot(inputs) {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const day = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    const lines = ["Seawater intrusion with a cutoff wall", "Aquifer type : confined",
      "Created      : " + day + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()),
      "", "INPUTS"];
    state.cfg.fields.forEach((f) => lines.push("  " + f.name + " (" + f.sym + ") = " + String(inputs[f.key]).replace(/\s+/g, " ").slice(0, 40) + " " + f.unit));
    lines.push("", "OUTPUTS", "  Status : ERROR - no output was produced", "  Message: the calculation server could not be reached");
    return { name: "confined_offline_" + day + ".txt", text: lines.join("\n") + "\n" };
  }
  async function snapshot() {
    if (state.busy) return;
    setBusy(true);
    const inputs = values();
    try {
      const data = await post("/api/snapshot", { aquifer: "confined", inputs });
      if (!data.ok) throw new Error(data.message || "Snapshot failed.");
      save(data.filename, data.text);
      showStatus("Snapshot downloaded as " + data.filename + ". A copy is kept in the snapshots folder.", true);
    } catch (err) {
      const s = offlineSnapshot(inputs);
      save(s.name, s.text);
      showStatus("The server could not create the snapshot. A basic record of the inputs was downloaded as " + s.name + ".");
    } finally { setBusy(false); }
  }
  function reset() {
    state.cfg.fields.forEach((f) => { state.rows[f.key].input.value = state.rows[f.key].input.dataset.def; setError(f.key, ""); });
    state.result = null; showStatus(""); render();
    state.rows[state.cfg.fields[0].key].input.focus();
  }

  // ---------- tabs ----------
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    function select(t, focus) {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute("aria-selected", on ? "true" : "false");
        x.tabIndex = on ? 0 : -1;
        $(x.getAttribute("aria-controls")).hidden = !on;
      });
      if (focus) t.focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(t, false));
      t.addEventListener("keydown", (e) => {
        let j = null;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  }

  // ---------- start ----------
  async function init() {
    initTabs();
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("config " + res.status);
      state.cfg = await res.json();
      OUT_EQ.xt_bar = null;
      buildForm();
      render();
      $("btn-calc").addEventListener("click", calculate);
      $("btn-snap").addEventListener("click", snapshot);
      $("btn-reset").addEventListener("click", reset);
      $("form").addEventListener("submit", (e) => e.preventDefault());
    } catch (err) {
      $("fields").textContent = "";
      showStatus("The calculator could not be loaded. Check that the server is running and reload the page.");
      document.querySelectorAll(".actions button").forEach((b) => { b.disabled = true; });
    }
  }
  init();
})();
