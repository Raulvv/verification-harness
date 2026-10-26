import json, html
D={x['slug']:x for x in json.load(open('bench/ooh-data.json'))}
def qf(slug,needle):
    x=D[slug]
    for k,v in x['quick_facts'].items():
        if needle.lower() in k.lower(): return v
    return None
def src(slug): return {'slug':slug,'title':D[slug]['title']}
def ev(slug,needle):
    x=D[slug]; q=qf(slug,needle)
    return {'slug':slug,'title':x['title'],'quote':q} if q else None
def ev_open(slug):
    x=D[slug]; q=x['quick_facts'].get('openings')
    return {'slug':slug,'title':x['title'],'quote':q} if q else None
P=[]
def add(cond,question,gold,evidence,formula=None,notes=''):
    P.append({'id':f'pilot-{len(P)+1:02d}','split':'dev','condition':cond,'question':question,'gold':gold,'formula':formula,'evidence':[e for e in evidence if e],'sources':sorted({e['slug'] for e in evidence if e}),'validation':'pending','notes':notes})
# answerable factual
add('answerable','What is the median annual wage for civil engineers?',95890,[ev('architecture-and-engineering__civil-engineers','Median Pay')])
add('answerable','What is the projected employment change for registered nurses from 2023 to 2033?',197200,[ev('healthcare__registered-nurses','Employment Change')])
add('answerable','What is the typical entry-level education for carpenters?',"High school diploma or equivalent",[ev('construction-and-extraction__carpenters','Typical Entry-Level Education')])
add('answerable','How many jobs did software developers, quality assurance analysts, and testers hold in 2023?',1897100,[ev('computer-and-information-technology__software-developers','Number of Jobs')])
# calculated
add('answerable','What is the projected 2033 employment for civil engineers, given their 2023 employment and projected employment change?',363900,[ev('architecture-and-engineering__civil-engineers','Number of Jobs'),ev('architecture-and-engineering__civil-engineers','Employment Change')],'341,800 + 22,100 = 363,900')
add('answerable','What is the difference in median annual pay between registered nurses and carpenters?',29720,[ev('healthcare__registered-nurses','Median Pay'),ev('construction-and-extraction__carpenters','Median Pay')],'86,070 − 56,350 = 29,720')
add('answerable','Which has the higher projected growth rate, software developers or registered nurses, and by how many percentage points?',{'winner':'Software Developers, Quality Assurance Analysts, and Testers','difference_pp':11},[ev('computer-and-information-technology__software-developers','Job Outlook'),ev('healthcare__registered-nurses','Job Outlook')],'17% − 6% = 11 percentage points')
add('answerable','Among civil engineers, accountants and auditors, and graphic designers, which occupation has the highest median annual pay?',{'winner':'Civil Engineers','pay':95890},[ev('architecture-and-engineering__civil-engineers','Median Pay'),ev('business-and-financial__accountants-and-auditors','Median Pay'),ev('arts-and-design__graphic-designers','Median Pay')],'max(95,890; 79,880; 58,910) = 95,890')
# partial: one stated, one absent from the corpus
add('partial','What is the median annual pay for registered nurses, and what is their median annual pay in California?',{'parts':[{'part':'US median annual pay','value':86070,'status':'stated'},{'part':'California median annual pay','value':None,'status':'not stated'}]},[ev('healthcare__registered-nurses','Median Pay')],notes='California state data is not in the 48-page snapshot.')
add('partial','What is the projected growth rate for carpenters from 2023 to 2033, and how many carpenters were employed in 2010?',{'parts':[{'part':'2023–33 projected growth','value':'4%','status':'stated'},{'part':'2010 employment','value':None,'status':'not stated'}]},[ev('construction-and-extraction__carpenters','Job Outlook')],notes='The snapshot has 2023 employment and 2023–33 projections; no 2010 figure.')
add('partial','What is the median annual pay for accountants and auditors, and what is their median annual pay in Texas?',{'parts':[{'part':'US median annual pay','value':79880,'status':'stated'},{'part':'Texas median annual pay','value':None,'status':'not stated'}]},[ev('business-and-financial__accountants-and-auditors','Median Pay')],notes='Texas state data is not in the snapshot.')
add('partial','What is the typical entry-level education for electricians, and how many openings for electricians are projected for 2033 specifically?',{'parts':[{'part':'entry-level education','value':"High school diploma or equivalent",'status':'stated'},{'part':'2033-specific openings','value':None,'status':'not stated'}]},[ev('construction-and-extraction__electricians','Typical Entry-Level Education'),ev_open('construction-and-extraction__electricians')],notes='The page gives an annual average over the decade, not a 2033-specific count.')
# unanswerable
add('unanswerable','What is the median annual pay for registered nurses in California?','NOT FOUND',[],notes='State-level pay is not in the occupation page or the snapshot.')
add('unanswerable','How many civil engineers were employed in 2010?','NOT FOUND',[],notes='The snapshot has 2023 employment, not 2010.')
add('unanswerable','What was the projected growth rate for software developers, quality assurance analysts, and testers for 2012–22?','NOT FOUND',[],notes='The snapshot has 2023–33 projections, not 2012–22.')
add('unanswerable','Which state has the highest employment of kindergarten and elementary school teachers?','NOT FOUND',[],notes='No state-level employment table is in the snapshot.')
add('unanswerable','What is the median annual pay for carpenters at Acme Construction?','NOT FOUND',[],notes='Employer-specific pay is not in the corpus.')
add('unanswerable','How many openings for graphic designers are projected for 2033 specifically?','NOT FOUND',[],notes='The page gives an annual average over the decade, not a 2033-specific count.')
add('unanswerable','What is the median annual pay for police and detectives in Chicago?','NOT FOUND',[],notes='City-level pay is not in the occupation page or the snapshot.')
add('unanswerable','How many childcare workers were employed in 2010?','NOT FOUND',[],notes='The snapshot has 2023 employment, not 2010.')
with open('bench/ooh-pilot.jsonl','w') as f:
    for x in P: f.write(json.dumps(x)+'\n')
print('pilot',len(P),'conditions',{c:sum(1 for x in P if x['condition']==c) for c in ['answerable','partial','unanswerable']})
# HTML
head='''<!doctype html><meta charset="utf-8"><title>OOH pilot — 20 candidate questions</title><style>body{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:20px;max-width:1400px}h1{font-size:20px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #ddd;padding:8px;vertical-align:top;text-align:left;word-wrap:break-word}th{background:#f4f4f4;font-size:11px;text-transform:uppercase}td{font-size:13px}.q{font-weight:600}.gold{color:#1b5e20}.ev{font:12px ui-monospace,Menlo,monospace;white-space:pre-wrap;background:#fafafa;padding:6px;border-radius:4px}.hint{color:#666;font-size:12px}</style><h1>OOH pilot — 20 candidate questions</h1><p class="hint">BLS OOH 2023–33 snapshot, 48 occupation pages. All rows are <b>pending human validation</b>. Evidence quotes are exact Quick Facts / Job Outlook lines; partial and unanswerable rows assert that the missing fact is not in the snapshot.</p><table><thead><tr><th>#</th><th>Condition</th><th>Question</th><th>Gold</th><th>Evidence</th><th>Validation</th></tr></thead><tbody>'''
out=[head]
for x in P:
    evs='<br><br>'.join(f"<b>{html.escape(e['title'])}</b><div class='ev'>{html.escape(e['quote'])}</div>" for e in x['evidence']) or '<i>(none — not stated)</i>'
    gold=json.dumps(x['gold'],ensure_ascii=False) if not isinstance(x['gold'],str) else x['gold']
    out.append(f"<tr><td>{html.escape(x['id'])}</td><td>{x['condition']}</td><td class='q'>{html.escape(x['question'])}</td><td class='gold'>{html.escape(str(gold))}</td><td>{evs}</td><td>pending</td></tr>")
out.append('</tbody></table></html>')
open('bench/ooh-pilot.html','w').write(''.join(out))
# compact table for chat
def tr(s,n=90):
    s=str(s).replace('\n',' ').replace('|','\\|'); return s if len(s)<=n else s[:n-1].rstrip()+'…'
print('\n| # | condition | question | gold | evidence |')
print('|---|---|---|---|---|')
for x in P:
    gold=json.dumps(x['gold'],ensure_ascii=False) if not isinstance(x['gold'],str) else x['gold']
    ev='; '.join(e['title'] for e in x['evidence']) if x['evidence'] else '(not stated)'
    print(f"| {x['id']} | {x['condition']} | {tr(x['question'],90)} | {tr(gold,70)} | {tr(ev,70)} |")
