import urllib.request, time, os, json, hashlib, re, sys
from bs4 import BeautifulSoup
from collections import defaultdict

IDX='bench/ooh-index.html'
OUT='bench/corpus/ooh-v1'
os.makedirs(OUT,exist_ok=True)
if not os.path.exists(IDX):
    import urllib.request
    req=urllib.request.Request('https://web.archive.org/web/20250101000000id_/https://www.bls.gov/ooh/a-z-index.htm',headers={'User-Agent':'Mozilla/5.0 (compatible; ooh-benchmark)'})
    with urllib.request.urlopen(req,timeout=90) as r: open(IDX,'wb').write(r.read())
s=BeautifulSoup(open(IDX,'rb').read(),'html.parser')
paths=[]; seen=set(); by=defaultdict(list)
for a in s.find_all('a',href=True):
    h=a['href'].split('#')[0]
    if '/ooh/' not in h or not h.endswith('.htm'): continue
    path=h[h.find('/ooh/'):]
    if any(x in path for x in ['/ooh/a-z-index','/ooh/print/','/ooh/faq','/ooh/about','/ooh/ooh','/ooh/home','/ooh/occupation-finder','/ooh/how-to-find']): continue
    if path in seen: continue
    seen.add(path); by[path.split('/')[2]].append(path)
# Want 2 per category; manual list wins when present.
WANT=[
'/ooh/management/administrative-services-managers.htm','/ooh/management/top-executives.htm',
'/ooh/business-and-financial/accountants-and-auditors.htm','/ooh/business-and-financial/financial-analysts.htm',
'/ooh/computer-and-information-technology/software-developers.htm','/ooh/computer-and-information-technology/information-security-analysts.htm',
'/ooh/architecture-and-engineering/civil-engineers.htm','/ooh/architecture-and-engineering/mechanical-engineers.htm',
'/ooh/life-physical-and-social-science/psychologists.htm','/ooh/life-physical-and-social-science/chemists-and-materials-scientists.htm',
'/ooh/community-and-social-service/social-workers.htm','/ooh/community-and-social-service/school-and-career-counselors.htm',
'/ooh/legal/judges-and-hearing-officers.htm','/ooh/legal/paralegals-and-legal-assistants.htm',
'/ooh/education-training-and-library/kindergarten-and-elementary-school-teachers.htm','/ooh/education-training-and-library/postsecondary-teachers.htm',
'/ooh/arts-and-design/graphic-designers.htm','/ooh/arts-and-design/interior-designers.htm',
'/ooh/healthcare/registered-nurses.htm','/ooh/healthcare/physicians-and-surgeons.htm',
'/ooh/protective-service/police-and-detectives.htm','/ooh/protective-service/firefighters.htm',
'/ooh/food-preparation-and-serving/chefs-and-head-cooks.htm','/ooh/food-preparation-and-serving/waiters-and-waitresses.htm',
'/ooh/building-and-grounds-cleaning/janitors-and-building-cleaners.htm','/ooh/building-and-grounds-cleaning/grounds-maintenance-workers.htm',
'/ooh/personal-care-and-service/barbers-hairstylists-and-cosmetologists.htm','/ooh/personal-care-and-service/childcare-workers.htm',
'/ooh/sales/advertising-sales-agents.htm','/ooh/sales/real-estate-brokers-and-sales-agents.htm',
'/ooh/office-and-administrative-support/bookkeeping-accounting-and-auditing-clerks.htm','/ooh/office-and-administrative-support/customer-service-representatives.htm',
'/ooh/farming-fishing-and-forestry/agricultural-workers.htm','/ooh/farming-fishing-and-forestry/fishers-and-related-fishing-workers.htm',
'/ooh/construction-and-extraction/carpenters.htm','/ooh/construction-and-extraction/electricians.htm',
'/ooh/installation-maintenance-and-repair/automotive-service-technicians-and-mechanics.htm','/ooh/installation-maintenance-and-repair/heating-air-conditioning-and-refrigeration-mechanics-and-installers.htm',
'/ooh/production/assemblers-and-fabricators.htm','/ooh/production/machinists-and-tool-and-die-makers.htm',
'/ooh/transportation-and-material-moving/heavy-and-tractor-trailer-truck-drivers.htm','/ooh/transportation-and-material-moving/airline-and-commercial-pilots.htm',
'/ooh/media-and-communication/writers-and-authors.htm','/ooh/media-and-communication/public-relations-specialists.htm',
'/ooh/math/actuaries.htm','/ooh/math/mathematicians-and-statisticians.htm',
'/ooh/entertainment-and-sports/musicians-and-singers.htm','/ooh/entertainment-and-sports/producers-and-directors.htm',
]
paths=set(path for xs in by.values() for path in xs)
chosen=[]
for p in WANT:
    if p in paths: chosen.append(p)
    else:
        cat=p.split('/')[2]; xs=by.get(cat,[])
        fallback=xs[0] if xs else None
        print('MISSING',p,'fallback',fallback)
        if fallback: chosen.append(fallback)
# dedupe
chosen=list(dict.fromkeys(chosen))
print('chosen',len(chosen),'categories',len(set(p.split('/')[2] for p in chosen)))

def clean_text(t):
    t=t.replace('\u200b','').replace('\ufeff','')
    lines=[]
    for line in t.split('\n'):
        x=' '.join(line.split())
        if not x: continue
        if x in ('About this section','Please enable javascript to play this video.','Read More','Explore more','Last Modified Date','Contact BLS','Follow Us','Search','Menu'): continue
        if x.startswith('Video transcript available at'): continue
        if x.startswith('Last Modified Date'): continue
        lines.append(x)
    return '\n'.join(lines)

def extract(html,path):
    s=BeautifulSoup(html,'html.parser')
    h1=s.find('h1'); title=h1.get_text(' ',strip=True) if h1 else path
    parts=[]
    # Quick Facts table
    qf=None
    for t in s.find_all('table'):
        if 'Quick Facts' in t.get_text(' ',strip=True):
            qf=t; break
    if qf:
        rows=[]
        for tr in qf.find_all('tr'):
            cells=[' '.join(c.get_text(' ',strip=True).split()) for c in tr.find_all(['th','td'])]
            cells=[c for c in cells if c]
            if cells: rows.append(' | '.join(cells))
        if rows: parts.append('## Quick Facts\n'+'\n'.join(rows))
    # Articles (sections)
    for art in s.find_all('article'):
        h=art.find(['h2','h3'])
        if not h: continue
        head=' '.join(h.get_text(' ',strip=True).split()).replace(' About this section','').replace('About this section','').strip()
        body=clean_text(art.get_text('\n',strip=True))
        if body.startswith(head): body=body[len(head):].strip()
        if body and head != 'Summary': parts.append('## '+head+'\n'+body)
    # Similar Occupations table (outside the articles)
    for h in s.find_all('h2'):
        if not h.get_text(' ',strip=True).startswith('Similar Occupations'): continue
        t=h.find_next('table')
        if t:
            rows=[]
            for tr in t.find_all('tr'):
                cells=[' '.join(c.get_text(' ',strip=True).split()) for c in tr.find_all(['th','td'])]
                cells=[c for c in cells if c]
                if cells: rows.append(' | '.join(cells))
            if rows: parts.append('## Similar Occupations\n'+'\n'.join(rows))
        break
    text='# '+title+'\n\n'+'\n\n'.join(parts)+'\n'
    return title,text

def fetch(path):
    last=None
    for ts in ['20250101000000','20250201000000','20241201000000','2024']:
        url=f'https://web.archive.org/web/{ts}id_/https://www.bls.gov{path}'
        for attempt in range(2):
            try:
                req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; ooh-benchmark)'})
                with urllib.request.urlopen(req,timeout=70) as r:
                    h=r.read(); memento=r.headers.get('Memento-Datetime'); eff=r.geturl()
                if len(h)>20000: return h,memento,eff,url
                last=f'short {len(h)}'
            except Exception as e:
                last=str(e)
                time.sleep(1.5)
        time.sleep(0.5)
    raise RuntimeError(last)

manifest=[]
for i,path in enumerate(chosen,1):
    cat=path.split('/')[2]
    slug=cat+'__'+path.rsplit('/',1)[-1].replace('.htm','')
    try:
        h,memento,eff,url=fetch(path)
        title,text=extract(h,path)
        open(os.path.join(OUT,slug+'.md'),'w').write(text)
        manifest.append({'slug':slug,'category':cat,'path':path,'page_url':'https://www.bls.gov'+path,'archive_url':url,'memento':memento,'effective':eff,'title':title,'sha256':hashlib.sha256(text.encode()).hexdigest(),'chars':len(text)})
        print(f'[{i}/{len(chosen)}] {slug} {len(text)}c {memento}')
    except Exception as e:
        print(f'[{i}/{len(chosen)}] FAIL {path}: {e}')
    time.sleep(0.5)
json.dump(manifest,open(os.path.join(OUT,'manifest.json'),'w'),indent=2)
print('wrote',len(manifest),'pages')
