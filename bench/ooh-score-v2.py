#!/usr/bin/env python3
"""OOH scorer v2 — helpful-abstention + true verbatim legs.

v1 checked only that evidence titles appeared in the quote/legs. v2 keeps that
title/row-support metric and adds a byte-verbatim check of every cited leg
against the cited document. Table rows are checked against the compact table;
page/aggregate legs against the page corpus.

Usage:
  python3 bench/ooh-score-v2.py OUTPUT [OUTPUT ...]
  python3 bench/ooh-score-v2.py --strict OUTPUT
  python3 bench/ooh-score-v2.py --json OUTPUT
  python3 bench/ooh-score-v2.py --corpus bench/corpus/ooh-v1 --table bench/ooh-table-v1.md OUTPUT
"""
import argparse, json, re, sys
from pathlib import Path

def norm(s):
    s = str(s or '').lower()
    s = re.sub(r"[^a-z0-9$%.\- ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def nums(s):
    return [x.replace(',', '') for x in re.findall(r'-?\d[\d,]*(?:\.\d+)?', str(s))]

def has_num(ans, n):
    if n is None:
        return False
    if isinstance(n, float) and not n.is_integer():
        return str(n) in str(ans)
    s = str(int(n))
    return s in [x.rstrip('.0') for x in nums(ans)] or f'{int(n):,}' in str(ans)

def has_value(ans, v):
    if isinstance(v, (int, float)):
        return has_num(ans, v)
    s = str(v).strip()
    if re.fullmatch(r'-?\d+(?:\.\d+)?%', s):
        return has_num(ans, s[:-1])
    return norm(s) in norm(ans)

def has_winner(ans, w):
    a, w = norm(ans), norm(w)
    if w and w in a:
        return True
    return bool(w) and all(t in a for t in w.split() if len(t) > 3)

MISSING = [
    r"\b(?:does|do|did) not\b",
    r"\b(?:doesn t|don t|didn t|isn t|aren t|wasn t|weren t)\b",
    r"\bnot (?:available|stated|listed|reported|provided|included|contained|specified|given|found|reported|in the (?:table|corpus|documents|snapshot))\b",
    r"\b(?:does|do) not (?:[a-z]+ ){0,3}(?:state|list|include|provide|give|report|contain|specify|break|have)\b",
    r"\bnot in (?:the )?(?:table|corpus|documents|snapshot)\b",
    r"\b(?:cannot|can t) be (?:determined|answered|found|calculated|located|provided)\b",
    r"\bnot break (?:it )?(?:out|down)\b",
    r"\brather than (?:a )?(?:separate|2033|specific)\b",
    r"\bno (?:specific )?(?:state|city|local|employer|company)?[ -]*(?:specific )?(?:data|figures?|numbers?|information|pay|salary|wage|value|breakdown|estimate)s?\b",
    r"\b(?:state|city|local|employer|company)[ -]*specific (?:data|figures?|pay|wage|number|information)\b",
    r"\bunavailable\b",
    r"\bonly (?:national|provides?|gives?|lists?|reports?|includes?|contains?|covers?)\b",
    r"\bno\b[^.]{0,80}\b(?:given|stated|reported|provided|listed|included|available|appears?|found)\b",
]
MISSING_RE = re.compile("|".join(MISSING))

EXTERNAL = [
    r"\bbased on (?:general|common|my|outside|external) knowledge\b",
    r"\bcommonly referenced\b",
    r"\bhistorically\b",
    r"\bbased on historical\b",
    r"\bfrom memory\b",
    r"\bi (?:recall|remember)\b",
    r"\boutside (?:the|this) (?:corpus|documents|table|snapshot)\b",
]
EXTERNAL_RE = re.compile("|".join(EXTERNAL))

def missing_signal(s):
    return bool(MISSING_RE.search(norm(s)))

def external_signal(s):
    return bool(EXTERNAL_RE.search(norm(s)))

def asks_pay(q):
    return bool(re.search(r"\b(?:what|how much)\b[^?]*\bpay\b|\bwhat is that pay\b", norm(q)))

def asks_growth(q):
    return bool(re.search(r"\b(?:what|how much)\b[^?]*\b(?:growth|rate)\b", norm(q)))

def abstains(s):
    return missing_signal(s) and not external_signal(s)

def correct(t, x, strict=False):
    g, a = t.get('gold'), x.get('answer') or ''
    cond = t['condition']
    if cond == 'unanswerable':
        if strict:
            return bool(a) and not nums(a) and missing_signal(a)
        return bool(a) and abstains(a)
    if cond == 'partial':
        parts = g.get('parts', [])
        stated = [p for p in parts if p.get('status') == 'stated' and p.get('value') is not None]
        missing = [p for p in parts if p.get('status') != 'stated' and p.get('value') is None]
        ok_stated = all(has_value(a, p['value']) for p in stated)
        return bool(ok_stated and (not missing or missing_signal(a)) and not external_signal(a))
    if not a:
        return False
    if isinstance(g, dict):
        if 'winner' in g and not has_winner(a, g['winner']):
            return False
        for k in ('difference_pp', 'difference'):
            if k in g and not has_num(a, g[k]):
                return False
        if 'pay' in g and asks_pay(t['question']) and not has_num(a, g['pay']):
            return False
        if 'growth_pct' in g and asks_growth(t['question']) and not has_num(a, g['growth_pct']):
            return False
        return True
    if isinstance(g, int):
        if not has_num(a, g):
            return False
        if g < 0 and not re.search(r'declin|decreas|lose|loss|negative|drop|fell|fewer|-[0-9]', norm(a)):
            return False
        return True
    if isinstance(g, str):
        return norm(g) in norm(a) or all(t in norm(a) for t in norm(g).split() if len(t) > 3)
    return False

def read_doc(doc, corpus, table):
    if not doc:
        return None
    if doc == 'ooh-table-v1.md':
        return Path(table).read_text() if Path(table).exists() else None
    p = Path(corpus) / doc
    return p.read_text() if p.exists() else None

def segments(q):
    return [p.strip() for p in re.split(r'\s*\|\s*', str(q or '')) if p.strip()]

def evidence_matches(content, quote):
    q = norm(quote)
    if not q:
        return False
    c = norm(content)
    if q in c:
        return True
    sq = re.sub(r'\s+/\s+', ' ', q)
    if sq in re.sub(r'\s+/\s+', ' ', c):
        return True
    segs = [norm(s) for s in re.split(r'\s+/\s+', str(quote or '')) if norm(s)]
    if len(segs) > 1 and all(s in c for s in segs):
        return True
    lines = [norm(s) for s in str(quote or '').split('\n') if norm(s) and norm(s) != 'not found']
    return bool(lines) and all(s in c for s in lines)

def contiguous_legs(x, corpus, table):
    legs = x.get('legs') or []
    if not legs:
        return False
    for leg in legs:
        doc = leg.get('doc') or leg.get('rel')
        q = leg.get('quote')
        if not doc or not q:
            return False
        text = read_doc(doc, corpus, table)
        if text is None or not evidence_matches(text, q):
            return False
    return True

def verbatim_legs(x, corpus, table):
    legs = x.get('legs') or []
    if not legs:
        return False
    for leg in legs:
        doc = leg.get('doc') or leg.get('rel')
        q = leg.get('quote')
        if not doc or not q:
            return False
        text = read_doc(doc, corpus, table)
        if text is None:
            return False
        for part in segments(q):
            if not evidence_matches(text, part):
                return False
    return True

def citations(t, x):
    if t['condition'] == 'unanswerable':
        return None
    q = norm(x.get('quote', ''))
    legs = [norm(l.get('title', '')) for l in (x.get('legs') or [])]
    ev = t.get('evidence') or []
    if ev:
        return all(norm(e.get('title', '')) in q or any(norm(e.get('title', '')) in lt for lt in legs) for e in ev)
    g = t['gold']
    if isinstance(g, dict) and g.get('winner'):
        return has_winner(q, g['winner'])
    if isinstance(g, int):
        return has_num(q, g)
    if isinstance(g, str):
        return norm(g) in q
    return False

def breadth(x, t):
    q, a = norm(x.get('quote', '')), norm(x.get('answer', ''))
    cs = t.get('citation_set') or []
    titles = {c['title'] for c in cs}
    return sum(1 for title in titles if has_winner(q + ' ' + a, title)), len(titles)

def score(path, label, test, corpus, table, strict=False):
    rows = [json.loads(l) for l in Path(path).read_text().splitlines() if l.strip()]
    ids = [x.get('id') for x in rows]
    unknown = [i for i in ids if i not in test]
    if unknown:
        raise SystemExit(f"{path}: unknown ids: {unknown[:5]}")
    if len(ids) != len(set(ids)):
        raise SystemExit(f"{path}: duplicate ids")
    print(f"\n## {label} n {len(rows)}" + (" STRICT" if strict else ""))
    by, review = {}, []
    for x in rows:
        t = test[x['id']]
        ok = correct(t, x, strict)
        by.setdefault(t['condition'], []).append(ok)
        if t['condition'] in ('unanswerable', 'partial') and missing_signal(x.get('answer', '')):
            review.append(x['id'])
        if x.get('global'):
            b, tot = breadth(x, t)
            print(f" GLOBAL {x['id']} answer {ok} cites {b}/{tot} quote_words {len(x.get('quote','').split())}")
    for c in ('answerable', 'partial', 'unanswerable'):
        xs = by.get(c, [])
        print(f" {c}: {sum(xs)}/{len(xs)}")
    ap = [x for x in rows if test[x['id']]['condition'] in ('answerable', 'partial')]
    title = sum(1 for x in ap if citations(test[x['id']], x))
    verbatim = sum(1 for x in ap if verbatim_legs(x, corpus, table))
    print(' answerable+partial citation title/row support', title, '/', len(ap))
    contiguous = sum(1 for x in ap if contiguous_legs(x, corpus, table))
    print(' answerable+partial citation verbatim segments', verbatim, '/', len(ap))
    print(' answerable+partial citation contiguous leg', contiguous, '/', len(ap))
    print(' review abstention/partial ids:', ' '.join(review) if review else 'none')

def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--test', default='bench/results/ooh-test-private.jsonl')
    ap.add_argument('--corpus', default='bench/corpus/ooh-v1')
    ap.add_argument('--table', default='bench/ooh-table-v1.md')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('outputs', nargs='+')
    a = ap.parse_args()
    test = {x['id']: x for x in map(json.loads, open(a.test))}
    if a.json:
        out = []
        for p in a.outputs:
            rows = [json.loads(l) for l in Path(p).read_text().splitlines() if l.strip()]
            ids = [x.get('id') for x in rows]
            if any(i not in test for i in ids) or len(ids) != len(set(ids)):
                raise SystemExit(f"{p}: bad ids")
            by = {}
            for x in rows:
                t = test[x['id']]
                by.setdefault(t['condition'], []).append(correct(t, x, a.strict))
            ap_rows = [x for x in rows if test[x['id']]['condition'] in ('answerable', 'partial')]
            out.append({
                'file': p, 'n': len(rows),
                'by_condition': {k: [sum(v), len(v)] for k, v in by.items()},
                'citation_title': [sum(1 for x in ap_rows if citations(test[x['id']], x)), len(ap_rows)],
                'citation_verbatim_segments': [sum(1 for x in ap_rows if verbatim_legs(x, a.corpus, a.table)), len(ap_rows)],
                'citation_contiguous_leg': [sum(1 for x in ap_rows if contiguous_legs(x, a.corpus, a.table)), len(ap_rows)]
            })
        print(json.dumps(out, indent=2))
        return
    for p in a.outputs:
        score(p, p, test, a.corpus, a.table, a.strict)

if __name__ == '__main__':
    main()
