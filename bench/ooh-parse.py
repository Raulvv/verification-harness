import os,re,json
ROOT='bench/corpus/ooh-v1'
out=[]
for fn in sorted(os.listdir(ROOT)):
    if not fn.endswith('.md') or fn=='SOURCE.md': continue
    text=open(os.path.join(ROOT,fn)).read()
    title=re.search(r'^#\s+(.+)$',text,re.M).group(1).strip()
    # quick facts block
    qf={}
    m=re.search(r'^## Quick Facts\n([\s\S]*?)(?=\n## |\Z)',text,re.M)
    if m:
        for line in m.group(1).split('\n'):
            if '|' not in line: continue
            k,v=[x.strip() for x in line.split('|',1)]
            qf[k]=v
    def find(prefix):
        for k,v in qf.items():
            if prefix.lower() in k.lower(): return k,v
        return None,None
    payk,payv=find('Median Pay')
    annual=hourly=None
    if payv:
        a=re.search(r'\$([\d,]+)\s*per year',payv); h=re.search(r'\$([\d.,]+)\s*per hour',payv)
        if a: annual=int(a.group(1).replace(',',''))
        if h: hourly=float(h.group(1).replace(',',''))
    edk,edv=find('Typical Entry-Level Education')
    wek,wev=find('Work Experience in a Related Occupation')
    trk,trv=find('On-the-job Training')
    jk,jv=find('Number of Jobs')
    jobs=None; jobs_year=None
    if jv:
        jobs=int(jv.replace(',',''))
        y=re.search(r'(\d{4})',jk or '')
        jobs_year=int(y.group(1)) if y else None
    ok,ov=find('Job Outlook')
    outlook_pct=None; outlook_label=None; out_years=None
    if ov:
        p=re.search(r'(-?\d+)%',ov); outlook_pct=int(p.group(1)) if p else None
        l=re.search(r'\((.*?)\)',ov); outlook_label=l.group(1) if l else None
        y=re.search(r'(\d{4})\s*[-–]\s*(\d{2,4})',ok or '')
        if y: out_years=y.group(1)+'-'+y.group(2)
    ck,cv=find('Employment Change')
    change=None
    if cv:
        c=re.search(r'(-?[\d,]+)',cv)
        if c: change=int(c.group(1).replace(',',''))
    # annual openings in Job Outlook section
    openings=None; openings_sentence=None
    mj=re.search(r'^## Job Outlook\n([\s\S]*?)(?=\n## |\Z)',text,re.M)
    if mj:
        sec=mj.group(1)
        om=re.search(r'About\s+([\d,]+)\s+openings[^\n]*',sec,re.I)
        if om:
            openings=int(om.group(1).replace(',','')); openings_sentence=om.group(0).strip()
    # section lines for evidence
    ev={}
    for k,v in qf.items():
        ev[k]=f'{k} | {v}'
    if openings_sentence: ev['openings']=openings_sentence
    out.append({'slug':fn[:-3],'title':title,'annual':annual,'hourly':hourly,'education':edv,'work_experience':wev,'training':trv,'jobs':jobs,'jobs_year':jobs_year,'outlook_pct':outlook_pct,'outlook_label':outlook_label,'outlook_years':out_years,'change':change,'annual_openings':openings,'quick_facts':ev})
json.dump(out,open('bench/ooh-data.json','w'),indent=2)
print('occupations',len(out))
for x in out[:5]: print(x['slug'],x['title'],x['annual'],x['education'],x['jobs'],x['outlook_pct'],x['change'],x['annual_openings'])
print('missing annual',sum(1 for x in out if x['annual'] is None),'missing jobs',sum(1 for x in out if x['jobs'] is None),'missing pct',sum(1 for x in out if x['outlook_pct'] is None),'missing openings',sum(1 for x in out if x['annual_openings'] is None))
