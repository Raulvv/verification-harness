"""Build a one-question-at-a-time HTML gold form.

Open the HTML in a browser. For each claim, choose the gold label:
Supported / Contradicted / Absent / Partial / Ambiguous / Skip.

The provisional gold and formal verdict are hidden by default; use the
"Show provisional hints" toggle if you want them.

    .venv/bin/python competitive/build_gold_form.py \
      --input competitive/pilot-160.jsonl \
      --output competitive/GOLD-FORM.html \
      --title "OOH 160-claim gold"
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  :root { --bg:#0f172a; --panel:#16213a; --text:#e6edf7; --muted:#93a4c3;
          --line:#263451; --good:#1f9d63; --bad:#c0392b; --warn:#b7791f;
          --absent:#2f80ed; --partial:#7d5fff; --skip:#6b7280; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  header { position:sticky; top:0; z-index:3; background:#0b1222;
           border-bottom:1px solid var(--line); padding:12px 18px; }
  .top { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:17px; margin:0; }
  .spacer { flex:1; }
  .progress { height:8px; background:#1b2742; border-radius:99px; overflow:hidden; margin-top:10px; }
  .progress > div { height:100%; width:0; background:linear-gradient(90deg,#2f80ed,#56ccf2); }
  main { max-width:980px; margin:0 auto; padding:22px 18px 90px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px; }
  .meta { display:flex; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:13px; margin-bottom:10px; }
  .pill { border:1px solid var(--line); border-radius:999px; padding:2px 9px; }
  .q { font-size:20px; font-weight:650; margin:6px 0 14px; }
  .a { background:#0f1a30; border-left:4px solid #2f80ed; border-radius:8px; padding:12px 14px; }
  .label { color:var(--muted); font-size:13px; margin:14px 0 6px; }
  .options { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  @media (max-width:760px) { .options { grid-template-columns:1fr 1fr; } }
  .opt { text-align:left; border:1px solid var(--line); background:#1b2742; color:var(--text);
         border-radius:10px; padding:11px 12px; cursor:pointer; }
  .opt strong { display:block; font-size:15px; }
  .opt span { color:var(--muted); font-size:12px; }
  .opt.supported { border-color:var(--good); }
  .opt.contradicted { border-color:var(--bad); }
  .opt.absent { border-color:var(--absent); }
  .opt.partial { border-color:var(--partial); }
  .opt.ambiguous { border-color:var(--warn); }
  .opt.skip { border-color:var(--skip); }
  .opt.selected { outline:2px solid #fff; background:#23345a; }
  textarea { width:100%; min-height:52px; margin-top:12px; background:#0b1222; color:var(--text);
             border:1px solid var(--line); border-radius:8px; padding:9px; }
  details { margin-top:12px; color:var(--muted); }
  pre { white-space:pre-wrap; word-break:break-word; background:#0b1222; border:1px solid var(--line);
        border-radius:8px; padding:10px; max-height:300px; overflow:auto; font-size:13px; }
  .nav { display:flex; gap:10px; align-items:center; margin-top:16px; }
  button { border:1px solid var(--line); background:#1b2742; color:var(--text); border-radius:8px;
           padding:9px 14px; cursor:pointer; font-size:14px; }
  button:hover { background:#23345a; }
  button.ghost { background:transparent; }
  button.primary { background:#2f80ed; border-color:#2f80ed; }
  .hints { display:none; margin-top:12px; color:var(--muted); font-size:13px; }
  .hints.show { display:block; }
  .small { color:var(--muted); font-size:12px; }
  .counts { color:var(--muted); font-size:13px; }
  .done { text-align:center; padding:40px 0; }
  .done h2 { margin:0 0 8px; }
</style>
</head>
<body>
<header>
  <div class="top">
    <h1>__TITLE__</h1>
    <span class="counts" id="counts"></span>
    <span class="spacer"></span>
    <select id="filter" style="background:#1b2742;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px">
      <option value="all">All</option>
      <option value="required">Needs audit</option>
      <option value="unreviewed">Unreviewed</option>
    </select>
    <label class="small"><input id="hints-toggle" type="checkbox"> Show provisional hints</label>
    <button id="export-json-top" class="primary">Export JSON</button>
    <button id="export-csv-top">Export CSV</button>
  </div>
  <div class="progress"><div id="progress"></div></div>
</header>
<main>
  <section class="card" id="card">
    <div class="meta" id="meta"></div>
    <div class="q" id="question"></div>
    <div class="label">Answer to judge</div>
    <div class="a" id="answer"></div>

    <div class="label">What is the gold label?</div>
    <div class="options" id="options">
      <button class="opt supported" data-gold="supported"><strong>1 · Supported</strong><span>Correct and supported by the evidence</span></button>
      <button class="opt contradicted" data-gold="contradicted"><strong>2 · Contradicted</strong><span>Wrong or contradicted by the evidence</span></button>
      <button class="opt absent" data-gold="absent"><strong>3 · Absent</strong><span>Correctly says the fact is not stated</span></button>
      <button class="opt partial" data-gold="partial"><strong>4 · Partial</strong><span>Some parts correct, some missing</span></button>
      <button class="opt ambiguous" data-gold="ambiguous"><strong>5 · Ambiguous</strong><span>Cannot decide from the evidence</span></button>
      <button class="opt skip" data-gold="skip"><strong>6 · Skip</strong><span>Not enough context / skip</span></button>
    </div>

    <textarea id="notes" placeholder="Notes (optional)"></textarea>

    <details>
      <summary>Evidence</summary>
      <pre id="evidence"></pre>
    </details>

    <div class="hints" id="hints"></div>

    <div class="nav">
      <button id="prev" class="ghost">← Previous</button>
      <button id="next" class="primary">Next →</button>
      <span class="spacer"></span>
      <button id="next-unreviewed" class="ghost">Next unreviewed</button>
    </div>
    <div class="small" style="margin-top:8px">
      Keys: 1 Supported · 2 Contradicted · 3 Absent · 4 Partial · 5 Ambiguous · 6 Skip · ←/→ navigate.
      Clicking a label stays on the claim so you can add notes; keyboard selection advances.
    </div>
  </section>

  <section class="done" id="done" style="display:none">
    <h2>All done</h2>
    <p class="small">Export your labels as JSON or CSV.</p>
    <button id="export-json" class="primary">Export JSON</button>
    <button id="export-csv">Export CSV</button>
    <button id="reset" class="ghost">Reset</button>
  </section>
</main>
<script>
const DATA = __DATA__;
const KEY = "__KEY__";
const LABELS = ["supported","contradicted","absent","partial","ambiguous","skip"];
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }
let idx = 0;
let filter = "all";
let showHints = false;

function rows() {
  if (filter === "required") return DATA.filter(r => r.audit_required === "yes");
  if (filter === "unreviewed") return DATA.filter(r => !state[r.id]?.gold);
  return DATA;
}
function current() { return rows()[idx]; }
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function counts() {
  const total = DATA.length;
  const reviewed = DATA.filter(r => state[r.id]?.gold).length;
  const required = DATA.filter(r => r.audit_required === "yes").length;
  const complete = reviewed === total ? " · complete" : "";
  document.getElementById("counts").textContent = `${reviewed}/${total} reviewed · ${required} required${complete}`;
  document.getElementById("progress").style.width = (total ? Math.round(100*reviewed/total) : 0) + "%";
}
function render() {
  counts();
  const list = rows();
  if (!list.length) {
    document.getElementById("card").style.display = "none";
    document.getElementById("done").style.display = "block";
    return;
  }
  document.getElementById("card").style.display = "block";
  document.getElementById("done").style.display = "none";
  if (idx < 0) idx = 0;
  if (idx >= list.length) idx = list.length - 1;
  const r = list[idx];
  const meta = document.getElementById("meta");
  meta.innerHTML = "";
  [r.id, r.category, r.condition, `${idx+1} / ${list.length}`].filter(Boolean).forEach(t => {
    const s = document.createElement("span"); s.className = "pill"; s.textContent = t; meta.appendChild(s);
  });
  document.getElementById("question").textContent = r.question;
  document.getElementById("answer").textContent = r.answer;
  document.getElementById("evidence").textContent = String(r.evidence || "").slice(0, 5000);
  document.getElementById("notes").value = state[r.id]?.notes || "";
  document.querySelectorAll(".opt").forEach(b => {
    b.classList.toggle("selected", state[r.id]?.gold === b.dataset.gold);
  });
  const hints = document.getElementById("hints");
  hints.classList.toggle("show", showHints);
  if (showHints) {
    hints.textContent = `Provisional gold: ${r.provisional_gold || r.gold || "(none)"} · Formal verdict: ${r.formal_verdict || "(none)"}`;
  }
}
function select(gold, advance) {
  const r = current();
  if (!r) return;
  state[r.id] = {...(state[r.id] || {}), gold, notes: document.getElementById("notes").value};
  save();
  if (advance) { idx = Math.min(idx + 1, rows().length - 1); }
  render();
}
function nextUnreviewed() {
  const list = rows();
  const found = list.findIndex(r => !state[r.id]?.gold);
  if (found >= 0) { idx = found; render(); }
  else alert("No unreviewed claims in this filter.");
}
function exportJSON() {
  const payload = {
    title: "__TITLE__",
    exported_at: new Date().toISOString(),
    results: DATA.map(r => ({
      id: r.id, category: r.category, condition: r.condition || null,
      question: r.question, answer: r.answer,
      provisional_gold: r.provisional_gold || r.gold || null,
      formal_verdict: r.formal_verdict || null,
      gold: state[r.id]?.gold || null,
      notes: state[r.id]?.notes || "",
    })),
  };
  download("gold-results.json", JSON.stringify(payload, null, 2), "application/json");
}
function exportCSV() {
  const head = ["id","category","condition","gold","notes","question","answer"];
  const esc = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [head.map(esc).join(",")];
  DATA.forEach(r => lines.push([
    r.id, r.category, r.condition || "", state[r.id]?.gold || "", state[r.id]?.notes || "",
    r.question, r.answer,
  ].map(esc).join(",")));
  download("gold-results.csv", lines.join("\\n"), "text/csv");
}
function download(name, text, type) {
  const blob = new Blob([text], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.querySelectorAll(".opt").forEach(b => {
  b.onclick = () => select(b.dataset.gold, false);
});
document.getElementById("prev").onclick = () => { idx = Math.max(0, idx - 1); render(); };
document.getElementById("next").onclick = () => { idx = Math.min(rows().length - 1, idx + 1); render(); };
document.getElementById("next-unreviewed").onclick = nextUnreviewed;
document.getElementById("filter").onchange = (e) => { filter = e.target.value; idx = 0; render(); };
document.getElementById("hints-toggle").onchange = (e) => { showHints = e.target.checked; render(); };
document.getElementById("notes").oninput = (e) => {
  const r = current(); if (!r) return;
  state[r.id] = {...(state[r.id] || {}), notes: e.target.value}; save();
};
document.getElementById("export-json").onclick = exportJSON;
document.getElementById("export-csv").onclick = exportCSV;
document.getElementById("export-json-top").onclick = exportJSON;
document.getElementById("export-csv-top").onclick = exportCSV;
document.getElementById("reset").onclick = () => { if (confirm("Reset all labels?")) { state = {}; save(); render(); } };
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  const map = {"1":"supported","2":"contradicted","3":"absent","4":"partial","5":"ambiguous","6":"skip"};
  if (map[e.key]) { e.preventDefault(); select(map[e.key], true); }
  if (e.key === "ArrowLeft") { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
  if (e.key === "ArrowRight") { e.preventDefault(); idx = Math.min(rows().length - 1, idx + 1); render(); }
});
render();
</script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a one-question-at-a-time gold form")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="Gold-label audit")
    parser.add_argument("--evidence-chars", type=int, default=4000)
    args = parser.parse_args(argv)

    rows = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    supported_seen = 0
    for row in rows:
        row["evidence"] = str(row.get("evidence", ""))[: args.evidence_chars]
        if row.get("audit_required") not in ("yes", "no"):
            if row.get("gold") == "contradicted":
                row["audit_required"] = "yes"
            else:
                supported_seen += 1
                row["audit_required"] = "yes" if supported_seen % 5 == 0 else "no"
    data = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
    key = "gold-form-" + re.sub(r"[^a-z0-9]+", "-", args.title.lower()).strip("-")
    text = (
        TEMPLATE.replace("__TITLE__", html.escape(args.title))
        .replace("__KEY__", key)
        .replace("__DATA__", data)
    )
    args.output.write_text(text, encoding="utf-8")
    print(f"wrote {len(rows)} rows -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
