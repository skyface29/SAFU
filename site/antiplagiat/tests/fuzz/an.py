import sys, zipfile, json, re, os, collections
from lxml import etree
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
WP='{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
def words(path):
    z=zipfile.ZipFile(path); x=etree.fromstring(z.read('word/document.xml'))
    s=' '.join(''.join(t.text or '' for t in p.iter(W+'t')) for p in x.iter(W+'p'))
    s=s.replace(' ',' ').replace('­','')
    return collections.Counter(w.lower() for w in re.findall(r'[A-Za-zА-Яа-яЁё]{3,}',s)), x, z
def texts(x): return [''.join(t.text or '' for t in p.iter(W+'t')) for p in x.iter(W+'p')]
res=json.load(open(sys.argv[2]+'/res.json')); tot=collections.Counter()
for f in sorted(res):
    r=res[f]; probs=[]
    if 'fail' in r: print('FAIL',f); continue
    w0,x0,_=words(os.path.join(sys.argv[1],f)); w1,x1,z1=words(os.path.join(sys.argv[2],f)); w2,x2,_=words(os.path.join(sys.argv[2],f.replace('.docx','.2.docx')))
    pre=texts(x0); hi=max([i for i,t in enumerate(pre) if re.sub(r'[^а-яё]','',t.lower())=='введение']+[0])
    pre_words=set(w.lower() for t in pre[:hi] for w in re.findall(r'[A-Za-zА-Яа-яЁё]{3,}',t))
    lost={k:v-w1[k] for k,v in w0.items() if w1[k]<v and k not in pre_words}
    # слова титульника/оглавления могут измениться: разрешаем потерю служебных
    allow={'электронный','ресурс','режим','доступа','петерб','литературы','использованной','библиографический','список','источников','использованных','стр','содержание','оглавление','глава','стр','рис','табл','таблица','рисунок','вставка'}
    lost={k:v for k,v in lost.items() if k not in allow}
    if lost: probs.append('потеряны слова: '+str(dict(list(lost.items())[:8])))
    t1,t2=texts(x1),texts(x2)
    if t1!=t2:
        d=[(a,b) for a,b in zip(t1,t2) if a!=b][:2]; probs.append(f'неидемпотентно ({len(t1)}→{len(t2)} абз.) {d}')
    # уникальные id
    ids=[e.get('id') for e in x1.iter(WP+'docPr')]
    dup=[k for k,v in collections.Counter(ids).items() if v>1]
    if dup: probs.append('повтор docPr id '+str(dup[:5]))
    bm=[e.get(W+'id') for e in x1.iter(W+'bookmarkStart')]; bmn=[e.get(W+'name') for e in x1.iter(W+'bookmarkStart')]
    for nm,l in (('bookmark id',bm),('bookmark name',bmn)):
        dup=[k for k,v in collections.Counter(l).items() if v>1]
        if dup: probs.append('повтор '+nm+' '+str(dup[:5]))
    be=set(e.get(W+'id') for e in x1.iter(W+'bookmarkEnd'))
    if set(bm)-be: probs.append('bookmarkStart без End '+str(list(set(bm)-be)[:3]))
    rels=etree.fromstring(z1.read('word/_rels/document.xml.rels')); rid=[e.get('Id') for e in rels]
    if len(rid)!=len(set(rid)): probs.append('повтор rId')
    used=set(re.findall(r'r:(?:id|embed|link)="([^"]+)"',z1.read('word/document.xml').decode()))
    if used-set(rid): probs.append('нет rel для '+str(used-set(rid)))
    # поля сбалансированы
    fc=[e.get(W+'fldCharType') for e in x1.iter(W+'fldChar')]; dep=0; bad=False
    for c in fc:
        dep+= 1 if c=='begin' else -1 if c=='end' else 0
        if dep<0: bad=True
    if bad or dep: probs.append('несбалансированы поля')
    # sectPr последний в body
    body=x1.find(W+'body')
    if body[-1].tag!=W+'sectPr': probs.append('sectPr не в конце body')
    # пустые абзацы подряд в тексте
    if r['left']: probs.append('замечания: '+' | '.join(r['left'])[:200])
    if r['left2']!=r['left']: probs.append('замечания после 2-го прохода: '+' | '.join(r['left2'])[:150])
    for p in probs: tot[p.split(':')[0].split(' (')[0]]+=1
    print(('OK  ' if not probs else 'BAD ')+f,' ; '.join(probs)[:600])
print(dict(tot))
