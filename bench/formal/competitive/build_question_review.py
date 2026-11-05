"""Build a one-question-at-a-time review form for generated questions.

    .venv/bin/python competitive/build_question_review.py \
      --input competitive/private/hard-h3-100.jsonl \
      --output competitive/private/hard-h3-100-review.html \
      --title "H3 question review"
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
          --line:#263451; --good:#1f9d63; --bad:#c0392b; --skip:#6b7280; }
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
  main { max-width:1000px; margin:0 auto; padding:22px 18px 90px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px; }
  .meta { display:flex; gap:8px; flex-wrap:wrap; color:var(--muted); font-size:13px; margin-bottom:10px; }
  .pill { border:1px solid var(--line); border-radius:999px; padding:2px 9px; }
  .q { font-size:20px; font-weight:650; margin:6px 0 14px; }
  .label { color:var(--muted); font-size:13px; margin:14px 0 6px; }
  pre { white-space:pre-wrap; word-break:break-word; background:#0b1222; border:1px solid var(--line);
        border-radius:8px; padding:10px; max-height:360px; overflow:auto; font-size:13px; }
  .options { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:14px; }
  .opt { text-align:left; border:1px solid var(--line); background:#1b2742; color:var(--text);
         border-radius:10px; padding:11px 12px; cursor:pointer; }
  .opt strong { display:block; font-size:15px; }
  .opt span { color:var(--muted); font-size:12px; }
  .opt.accept { border-color:var(--good); }
  .opt.fix { border-color:var(--bad); }
  .opt.skip { border-color:var(--skip); }
  .opt.selected { outline:2px solid #fff; background:#23345a; }
  textarea { width:100%; min-height:52px; margin-top:12px; background:#0b1222; color:var(--text);
             border:1px solid var(--line); border-radius:8px; padding:9px; }
  .nav { display:flex; gap:10px; align-items:center; margin-top:16px; }
  button { border:1px solid var(--line); background:#1b2742; color:var(--text); border-radius:8px;
           padding:9px 14px; cursor:pointer; font-size:14px; }
  button.primary { background:#2f80ed; border-color:#2f80ed; }
  .counts { color:var(--muted); font-size:13px; }
</style>
</head>
<body>
<header>
  <div class="top">
    <h1>__TITLE__</h1>
    <span class="counts" id="counts"></span>
    <span class="spacer"></span>
    <button id="export" class="primary">Export JSON</button>
  </div>
  <div class="progress"><div id="progress"></div></div>
</header>
<main>
  <section class="card">
    <div class="meta" id="meta"></div>
    <div class="q" id="question"></div>
    <div class="label">Gold</div>
    <pre id="gold"></pre>
    <div class="label">Formula / note</div>
    <pre id="note"></pre>
    <div class="label">Evidence</div>
    <pre id="evidence"></pre>
    <div class="options">
      <button class="opt accept" data-review="accept"><strong>1 · Accept</strong><span>Question and gold are correct</span></button>
      <button class="opt fix" data-review="needs_fix"><strong>2 · Needs fix</strong><span>Question, gold, or evidence is wrong</span></button>
      <button class="opt skip" data-review="skip"><strong>3 · Skip</strong><span>Not enough context</span></button>
    </div>
    <textarea id="notes" placeholder="Notes (optional)"></textarea>
    <div class="nav">
      <button id="prev" class="ghost">← Previous</button>
      <button id="next">Next →</button>
    </div>
  </section>
</main>
<script>
const DATA = __DATA__;
const KEY = '__KEY__';
const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
let index = 0;
const $ = (id) => document.getElementById(id);
function render() {
  const row = DATA[index];
  $('meta').innerHTML = [
    `<span class="pill">${row.id}</span>`,
    `<span class="pill">${row.level || ''}</span>`,
    `<span class="pill">${row.type || ''}</span>`,
    `<span class="pill">${row.condition || ''}</span>`,
  ].join('');
  $('question').textContent = row.question;
  $('gold').textContent = JSON.stringify(row.gold, null, 2);
  $('note').textContent = [row.formula, row.notes, row.expected_verdict ? `expected verdict: ${row.expected_verdict}` : ''].filter(Boolean).join('\\n');
  $('evidence').textContent = (row.evidence || []).map(e => `[${e.title}] ${e.quote}`).join('\\n\\n') || '(none)';
  const s = saved[row.id] || {};
  $('notes').value = s.notes || '';
  document.querySelectorAll('.opt').forEach(b => b.classList.toggle('selected', b.dataset.review === s.review));
  const done = Object.keys(saved).length;
  $('counts').textContent = `${index + 1} / ${DATA.length} · ${done} reviewed`;
  $('progress').style.width = `${(done / DATA.length) * 100}%`;
}
document.querySelectorAll('.opt').forEach(b => b.onclick = () => {
  const row = DATA[index];
  saved[row.id] = { review: b.dataset.review, notes: $('notes').value };
  localStorage.setItem(KEY, JSON.stringify(saved));
  render();
});
$('notes').oninput = () => {
  const row = DATA[index];
  const s = saved[row.id] || {};
  s.notes = $('notes').value;
  saved[row.id] = s;
  localStorage.setItem(KEY, JSON.stringify(saved));
};
$('prev').onclick = () => { index = Math.max(0, index - 1); render(); };
$('next').onclick = () => { index = Math.min(DATA.length - 1, index + 1); render(); };
$('export').onclick = () => {
  const results = DATA.map(row => ({ id: row.id, ...(saved[row.id] || {}) }));
  const blob = new Blob([JSON.stringify({ title: '__TITLE__', results }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'question-review-results.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
render();
</script>
</body>
</html>
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a question review form")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="Question review")
    args = parser.parse_args(argv)
    rows = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    data = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
    key = "question-review-" + re.sub(r"[^a-z0-9]+", "-", args.title.lower()).strip("-")
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
