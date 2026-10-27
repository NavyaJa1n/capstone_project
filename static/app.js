"use strict";
const $ = s => document.querySelector(s);
const fmt = (x, d = 4) => Number(x.toPrecision(d)).toString();
let FIELDS = [], GROUPS = [], BUSY = false;

async function api(path, body) {
  const r = await fetch(path, body ? {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)} : {});
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!j) throw new Error("The server did not respond correctly. Try again.");
  return j;
}

function build() {
  const box = $("#fields");
  box.innerHTML = "";
  GROUPS.forEach(g => {
    const s = document.createElement("div");
    s.className = "grp";
    s.innerHTML = `<h3>${g}</h3>`;
    FIELDS.filter(f => f.group === g).forEach(f => {
      const d = document.createElement("div");
      d.className = "f"; d.id = "f-" + f.key;
      d.innerHTML = `<label for="i-${f.key}">${f.name} (${f.html})</label>
        <input id="i-${f.key}" data-k="${f.key}" inputmode="decimal" value="${f.default}" aria-describedby="m-${f.key}">
        <span class="u">${f.unit}</span><div class="m" id="m-${f.key}">${f.desc}</div>`;
      s.appendChild(d);
    });
    box.appendChild(s);
  });
}

const inputs = () => Object.fromEntries(FIELDS.map(f => [f.key, $("#i-" + f.key).value]));

function mark(errors) {
  FIELDS.forEach(f => {
    const el = $("#f-" + f.key), bad = errors && errors[f.key];
    el.classList.toggle("bad", !!bad);
    $("#m-" + f.key).textContent = bad || f.desc;
    $("#i-" + f.key).setAttribute("aria-invalid", bad ? "true" : "false");
  });
}

function status(msg) { const s = $("#status"); s.hidden = !msg; s.textContent = msg || ""; }

const SCN_TEXT = {
  a: "The wall is further inland than the natural toe, so the interface is the same as with no wall.",
  b: "The wall does not touch the interface. The interface toe ends beneath the wall.",
  c: "The wall does not touch the interface. The toe lies inland of the wall; the gap under the wall is large enough for most flow to pass.",
  d: "The interface runs into the wall and the toe ends inside the wall. Seawater cannot get past the wall.",
  e: "The interface runs into the wall, leaves it at the bottom of the opening, and the toe lies inland of the wall.",
  f: "The interface enters the wall and leaves at its landward face. The wall restricts most of the flow."
};

function info(r) {
  const p = r.plot, has = k => p.marks.some(m => m.key === k);
  let h = `<p><b>What this shows.</b> A side view of the aquifer. The sea is on the left at x = 0. The blue line is the boundary between freshwater above and seawater below. Where it reaches the aquifer base is the interface toe, the furthest point seawater reaches inland.</p>
    <p><b>Dashed grey line.</b> The interface if there were no wall (toe at ${fmt(r.xt_nowall)} m). The gap between the two lines is what the wall achieves.</p>
    <p><b>Grey bar.</b> The cutoff wall. Water can pass only through the opening of height h<sub>w</sub> = ${fmt(p.hw)} m at the aquifer base${p.w < 1 ? "" : ""}.</p>
    <p><b>This case, scenario (${r.scenario}).</b> ${SCN_TEXT[r.scenario]}</p>`;
  h += `<p><b>Points.</b> Each point is a calculated value. Hover over a point to read its position and height.</p>`;
  return h;
}

function draw(r) {
  const p = r.plot, f = k => FIELDS.find(x => x.key === k);
  const mk = {toe: ["circle", 11, "#1f4e79"], seaward: ["square", 9, "#1c2430"], landward: ["diamond", 10, "#5b6675"], exit: ["triangle-up", 10, "#1c2430"]};
  const tr = [
    {x: p.nx, y: p.nz, mode: "lines", name: "No wall", line: {color: "#8b95a3", dash: "dash", width: 1.5}, hovertemplate: "No wall<br>x = %{x:.1f} m<br>height = %{y:.1f} m<extra></extra>"},
    {x: p.x, y: p.z, mode: "lines", name: "With wall", line: {color: "#1f4e79", width: 2.5}, hovertemplate: "Interface<br>x = %{x:.1f} m<br>height = %{y:.2f} m<extra></extra>"}
  ];
  p.marks.forEach(m => tr.push({x: [m.x], y: [m.z], mode: "markers", name: m.label, marker: {symbol: mk[m.key][0], size: mk[m.key][1], color: mk[m.key][2], line: {color: "#fff", width: 1}},
    hovertemplate: `${m.label}<br>x = %{x:.2f} m<br>height = %{y:.2f} m<extra></extra>`}));
  const wallW = Math.max(p.w, p.xmax * 0.004);
  const layout = {
    margin: {l: 56, r: 16, t: 8, b: 48}, paper_bgcolor: "#fff", plot_bgcolor: "#fff", font: {family: "system-ui,sans-serif", size: 13, color: "#1c2430"},
    xaxis: {title: "Distance inland from the coast, x (m)", range: [0, p.xmax], gridcolor: "#e6e9ed", zeroline: false, fixedrange: false},
    yaxis: {title: "Height above aquifer base (m)", range: [0, p.H], gridcolor: "#e6e9ed", zeroline: false},
    legend: {orientation: "h", y: -0.25}, hoverlabel: {bgcolor: "#fff", font: {color: "#1c2430"}},
    shapes: [{type: "rect", x0: p.Lw, x1: p.Lw + wallW, y0: p.hw, y1: p.H, fillcolor: "#7a8494", line: {color: "#5b6675", width: 1}}]
  };
  $("#gtitle").textContent = `Interface profile, scenario (${r.scenario})`;
  $("#info").innerHTML = info(r);
  $("#graph-wrap").hidden = false;
  Plotly.react("plot", tr, layout, {responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"]});
}

function show(r) {
  const row = (a, b, c) => `<div><b>${a}</b><span>${b}</span> <small>${c || ""}</small></div>`;
  $("#out").innerHTML = `<div class="scn"><b>Scenario (${r.scenario}).</b> ${r.scenario_desc}</div>
    <div class="kv">${row("Interface toe with wall", fmt(r.xt), "m")}${row("Interface toe without wall", fmt(r.xt_nowall), "m")}
    ${row("Reduction in intrusion length", fmt(r.reduction_pct, 3), "%")}${row("Dimensionless toe", fmt(r.xt_bar))}</div>`;
  draw(r);
}

async function calc() {
  if (BUSY) return;
  BUSY = true; $("#btn-calc").disabled = true;
  try {
    const j = await api("/api/calculate", {inputs: inputs()});
    mark(j.errors);
    if (!j.ok) { status(j.message); $("#out").innerHTML = ""; $("#graph-wrap").hidden = true; }
    else { status(""); show(j.result); }
  } catch (e) { status(e.message); }
  finally { BUSY = false; $("#btn-calc").disabled = false; }
}

async function snap() {
  try {
    const j = await api("/api/snapshot", {aquifer: "confined", inputs: inputs()});
    if (!j.ok) return status(j.message);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([j.text], {type: "text/plain"}));
    a.download = j.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { status(e.message); }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const c = await api("/api/config");
    FIELDS = c.fields; GROUPS = c.groups;
  } catch (e) { return status("Could not load the form. Reload the page."); }
  build();
  $("#btn-calc").onclick = calc;
  $("#btn-snap").onclick = snap;
  $("#btn-reset").onclick = () => { FIELDS.forEach(f => $("#i-" + f.key).value = f.default); mark(null); status(""); calc(); };
  $("#form").addEventListener("keydown", e => {
    const el = e.target; if (el.tagName !== "INPUT") return;
    const all = [...document.querySelectorAll("#fields input")], i = all.indexOf(el);
    if (e.key === "Enter") { e.preventDefault(); i === all.length - 1 ? calc() : all[i + 1].focus(); }
    else if (e.key === "ArrowDown" && all[i + 1]) { e.preventDefault(); all[i + 1].focus(); }
    else if (e.key === "ArrowUp" && all[i - 1]) { e.preventDefault(); all[i - 1].focus(); }
  });
  $("#info-btn").onclick = e => { const o = e.currentTarget.getAttribute("aria-expanded") === "true"; e.currentTarget.setAttribute("aria-expanded", String(!o)); $("#info").hidden = o; };
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(x => { x.setAttribute("aria-selected", x === b); x.tabIndex = x === b ? 0 : -1; });
    ["confined", "unconfined", "other"].forEach(t => $("#panel-" + t).hidden = t !== b.dataset.tab);
    if (b.dataset.tab === "confined" && window.Plotly && !$("#graph-wrap").hidden) Plotly.Plots.resize("plot");
  });
  calc();
});
