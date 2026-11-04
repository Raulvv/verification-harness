"""Build a self-contained HTML audit sheet.

Open the HTML in a browser, click Correct / Incorrect / Ambiguous, add notes,
and export JSON/CSV. Results are saved in localStorage and can be imported
again.

    .venv/bin/python competitive/build_audit_html.py \
      --input competitive/pilot-160.jsonl \
      --output competitive/AUDIT-SHEET.html \
      --title "OOH 160-claim audit"
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
  :root { --bg:#0f172a; --card:#16213a; --text:#e6edf7; --muted:#93a4c3;
          --good:#1f9d63; --bad:#c0392b; --warn:#b7791f; --line:#263451; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:var(--bg); color:var(--text); }
  header { position:sticky; top:0; z-index:2; background:#0b1222; border-bottom:1px solid var(--line);
           padding:14px 20px; }
  h1 { font-size:18px; margin:0 0 8px; }
  .bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  button { border:1px solid var(--line); background:#1b2742; color:var(--text);
           border-radius:8px; padding:7px 11px; cursor:pointer; font-size:14px; }
  button:hover { background:#23345a; }
  button.good { background:var(--good); border-color:var(--good); }
  button.bad { background:var(--bad); border-color:var(--bad); }
  button.warn { background:var(--warn); border-color:var(--warn); }
  button.ghost { background:transparent; }
  .progress { height:8px; background:#1b2742; border-radius:99px; overflow:hidden; margin:10px 0; }
  .progress > div { height:100%; width:0; background:linear-gradient(90deg,#2f80ed,#56ccf2); }
  main { max-width:1100px; margin:0 auto; padding:18px 20px 80px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px;
          padding:16px; margin:14px 0; }
  .card.reviewed { border-color:#2f6f4f; }
  .meta { display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-size:13px; margin-bottom:8px; }
  .pill { border:1px solid var(--line); border-radius:999px; padding:2px 8px; }
  .pill.required { border-color:#b7791f; color:#f6c177; }
  .q { font-weight:600; margin:8px 0; }
  .a { background:#0f1a30; border-left:3px solid #2f80ed; padding:9px 12px; border-radius:6px; }
  .evidence { margin-top:10px; color:var(--muted); }
  details { margin-top:8px; }
  pre { white-space:pre-wrap; word-break:break-word; background:#0b1222; border:1px solid var(--line);
        border-radius:8px; padding:10px; max-height:340px; overflow:auto; font-size:13px; }
  textarea { width:100%; min-height:44px; margin-top:8px; background:#0b1222; color:var(--text);
             border:1px solid var(--line); border-radius:8px; padding:8px; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .small { color:var(--muted); font-size:12px; }
  .counts { color:var(--muted); font-size:13px; margin-left:auto; }
  @media (max-width:700px) { main { padding:12px; } .card { padding:12px; } }
</style>
</head>
<body>
<header>
  <h1>__TITLE__</h1>
  <div class="bar">
    <button class="ghost" data-filter="all">All</button>
    <button class="ghost" data-filter="required">Needs audit</button>
    <button class="ghost" data-filter="unreviewed">Unreviewed</button>
    <button class="ghost" data-filter="contradicted">Contradicted</button>
    <button class="ghost" data-filter="supported">Supported</button>
    <button class="ghost" data-filter="absent">Absent</button>
    <span class="counts" id="counts"></span>
  </div>
  <div class="progress"><div id="progress"></div></div>
  <div class="bar">
    <button id="export-json">Export JSON</button>
    <button id="export-csv">Export CSV</button>
    <label class="ghost" style="border:1px solid var(--line);padding:7px 11px;border-radius:8px;cursor:pointer">
      Import JSON <input id="import" type="file" accept="application/json" hidden>
    </label>
    <button id="reset" class="ghost">Reset</button>
    <span class="small">Keys: 1 = correct, 2 = incorrect, 3 = ambiguous, 4 = skip.</span>
  </div>
</header>
<main id="cards"></main>
<script>
const DATA = __DATA__;
const KEY = "__KEY__";
const VERDICTS = ["correct", "incorrect", "ambiguous", "skip"];
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }
let filter = "required";
let current = 0;

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  renderCounts();
  render();
}

function matches(row) {
  if (filter === "all") return true;
  if (filter === "required") return row.audit_required === "yes";
  if (filter === "unreviewed") return !state[row.id];
  if (filter === "contradicted") return row.gold === "contradicted";
  if (filter === "supported") return row.gold === "supported";
  if (filter === "absent") return row.gold === "absent";
  return true;
}

function renderCounts() {
  const total = DATA.length;
  const required = DATA.filter(r => r.audit_required === "yes").length;
  const reviewed = DATA.filter(r => state[r.id]).length;
  const correct = DATA.filter(r => state[r.id]?.verdict === "correct").length;
  const incorrect = DATA.filter(r => state[r.id]?.verdict === "incorrect").length;
  const ambiguous = DATA.filter(r => state[r.id]?.verdict === "ambiguous").length;
  document.getElementById("counts").textContent =
    `${reviewed}/${total} reviewed · ${correct} correct · ${incorrect} incorrect · ${ambiguous} ambiguous · ${required} required`;
  const pct = total ? Math.round(100 * reviewed / total) : 0;
  document.getElementById("progress").style.width = pct + "%";
}

function render() {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";
  const rows = DATA.filter(matches);
  rows.forEach((row, idx) => {
    const card = document.createElement("section");
    card.className = "card" + (state[row.id] ? " reviewed" : "");
    card.dataset.id = row.id;
    const meta = document.createElement("div");
    meta.className = "meta";
    const pills = [
      row.id,
      row.category,
      `gold: ${row.gold}`,
      row.formal_verdict ? `formal: ${row.formal_verdict}` : null,
      row.condition ? row.condition : null,
    ].filter(Boolean);
    pills.forEach(t => {
      const s = document.createElement("span");
      s.className = "pill";
      s.textContent = t;
      meta.appendChild(s);
    });
    if (row.audit_required === "yes") {
      const s = document.createElement("span");
      s.className = "pill required";
      s.textContent = "audit required";
      meta.appendChild(s);
    }
    card.appendChild(meta);

    const q = document.createElement("div");
    q.className = "q";
    q.textContent = row.question;
    card.appendChild(q);

    const a = document.createElement("div");
    a.className = "a";
    a.textContent = row.answer;
    card.appendChild(a);

    const ev = document.createElement("div");
    ev.className = "evidence";
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    sum.textContent = `Evidence (${String(row.evidence || "").length} chars)`;
    det.appendChild(sum);
    const pre = document.createElement("pre");
    pre.textContent = String(row.evidence || "").slice(0, 5000);
    det.appendChild(pre);
    ev.appendChild(det);
    card.appendChild(ev);

    const actions = document.createElement("div");
    actions.className = "actions";
    const labels = {correct: "Correct", incorrect: "Incorrect", ambiguous: "Ambiguous", skip: "Skip"};
    VERDICTS.forEach(v => {
      const b = document.createElement("button");
      b.textContent = labels[v];
      b.className = v === "correct" ? "good" : v === "incorrect" ? "bad" : v === "ambiguous" ? "warn" : "ghost";
      if (state[row.id]?.verdict === v) b.style.outline = "2px solid #fff";
      b.onclick = () => {
        state[row.id] = {...(state[row.id] || {}), verdict: v};
        save();
      };
      actions.appendChild(b);
    });
    card.appendChild(actions);

    const notes = document.createElement("textarea");
    notes.placeholder = "Notes (optional)";
    notes.value = state[row.id]?.notes || "";
    notes.oninput = () => {
      state[row.id] = {...(state[row.id] || {}), notes: notes.value};
      localStorage.setItem(KEY, JSON.stringify(state));
    };
    card.appendChild(notes);

    cards.appendChild(card);
  });
}

function exportJSON() {
  const payload = {
    title: "__TITLE__",
    exported_at: new Date().toISOString(),
    results: DATA.map(r => ({
      id: r.id, category: r.category, question: r.question, answer: r.answer,
      gold: r.gold, provisional_gold: r.provisional_gold || null,
      formal_verdict: r.formal_verdict || null,
      verdict: state[r.id]?.verdict || null,
      notes: state[r.id]?.notes || "",
    })),
  };
  download("audit-results.json", JSON.stringify(payload, null, 2), "application/json");
}

function exportCSV() {
  const head = ["id","category","gold","verdict","notes","question","answer"];
  const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [head.map(esc).join(",")];
  DATA.forEach(r => lines.push([
    r.id, r.category, r.gold, state[r.id]?.verdict || "", state[r.id]?.notes || "",
    r.question, r.answer,
  ].map(esc).join(",")));
  download("audit-results.csv", lines.join("\\n"), "text/csv");
}

function download(name, text, type) {
  const blob = new Blob([text], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById("export-json").onclick = exportJSON;
document.getElementById("export-csv").onclick = exportCSV;
document.getElementById("reset").onclick = () => {
  if (confirm("Reset all audit decisions?")) { state = {}; save(); }
};
document.getElementById("import").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      (payload.results || []).forEach(r => {
        if (r.verdict) state[r.id] = {verdict: r.verdict, notes: r.notes || ""};
      });
      save();
    } catch (err) { alert("Invalid JSON: " + err.message); }
  };
  reader.readAsText(file);
};
document.querySelectorAll("[data-filter]").forEach(b => {
  b.onclick = () => { filter = b.dataset.filter; current = 0; render(); };
});
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  const rows = DATA.filter(matches);
  const row = rows[current];
  if (!row) return;
  const map = {"1":"correct","2":"incorrect","3":"ambiguous","4":"skip"};
  if (map[e.key]) {
    state[row.id] = {...(state[row.id] || {}), verdict: map[e.key]};
    save();
    current = Math.min(current + 1, rows.length - 1);
  }
});
renderCounts();
render();
</script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a self-contained audit sheet")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="Formal verification audit")
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
    key = "formal-audit-" + re.sub(r"[^a-z0-9]+", "-", args.title.lower()).strip("-")
    html_text = (
        TEMPLATE.replace("__TITLE__", html.escape(args.title))
        .replace("__KEY__", key)
        .replace("__DATA__", data)
    )
    args.output.write_text(html_text, encoding="utf-8")
    print(f"wrote {len(rows)} rows -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
