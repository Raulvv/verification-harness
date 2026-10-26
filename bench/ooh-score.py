#!/usr/bin/env python3
"""OOH scorer — helpful-abstention rule.

A response to an unanswerable item is correct when it does not assert the
requested state/city/employer/year value and explicitly says that value is
absent from the table/corpus/snapshot. National context is allowed. External
general knowledge is not. A response to a partial item is correct when every
stated part is present and every missing part is explicitly marked absent.

Usage:
  python3 bench/ooh-score.py TEST OUTPUT [OUTPUT ...]
  python3 bench/ooh-score.py --strict TEST OUTPUT
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

def score(path, label, test, strict=False):
    rows = [json.loads(l) for l in Path(path).read_text().splitlines() if l.strip()]
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
    print(' answerable+partial citation supported',
          sum(1 for x in rows if test[x['id']]['condition'] in ('answerable','partial') and citations(test[x['id']], x)),
          '/', sum(1 for x in rows if test[x['id']]['condition'] in ('answerable','partial')))
    print(' review abstention/partial ids:', ' '.join(review) if review else 'none')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--test', default='bench/results/ooh-test-private.jsonl')
    ap.add_argument('outputs', nargs='+')
    a = ap.parse_args()
    test = {x['id']: x for x in map(json.loads, open(a.test))}
    for p in a.outputs:
        score(p, p, test, a.strict)

if __name__ == '__main__':
    main()
