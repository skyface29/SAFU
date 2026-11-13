import zipfile,re,collections,os,sys
from lxml import etree
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def T(p):
    x=etree.fromstring(zipfile.ZipFile(p).read('word/document.xml'))
    return [''.join(t.text or '' for t in q.iter(W+'t')) for q in x.iter(W+'p')]
c=collections.Counter(); ex={}; d=sys.argv[1]
for f in sorted(os.listdir(d)):
    if f.endswith('.2.docx') or not f.endswith('.docx'): continue
    a,b=T(d+'/'+f),T(d+'/'+f.replace('.docx','.2.docx'))
    if len(a)!=len(b): k='len %d→%d'%(len(a),len(b)); c[k]+=1; ex.setdefault(k,f); continue
    for x,y in zip(a,b):
        if x==y: continue
        i=next((k for k in range(min(len(x),len(y))) if x[k]!=y[k]),min(len(x),len(y)))
        key=(x[max(0,i-14):i+14],y[max(0,i-14):i+14]); c[key]+=1; ex.setdefault(key,f)
for k,v in c.most_common(40): print(v,ex.get(k,''),repr(k))
print('всего расхождений', sum(c.values()))
