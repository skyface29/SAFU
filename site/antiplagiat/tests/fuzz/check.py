import sys, zipfile, re, os, subprocess
from lxml import etree
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SEQ={
 'pPr':['pStyle','keepNext','keepLines','pageBreakBefore','framePr','widowControl','numPr','suppressLineNumbers','pBdr','shd','tabs','suppressAutoHyphens','kinsoku','wordWrap','overflowPunct','topLinePunct','autoSpaceDE','autoSpaceDN','bidi','adjustRightInd','snapToGrid','spacing','ind','contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'],
 'rPr':['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang','eastAsianLayout','specVanish','oMath'],
 'tblPr':['tblStyle','tblpPr','tblOverlap','bidiVisual','tblStyleRowBandSize','tblStyleColBandSize','tblW','jc','tblCellSpacing','tblInd','tblBorders','shd','tblLayout','tblCellMar','tblLook','tblCaption','tblDescription'],
 'sectPr':['headerReference','footerReference','footnotePr','endnotePr','type','pgSz','pgMar','paperSrc','pgBorders','lnNumType','pgNumType','cols','formProt','vAlign','noEndnote','titlePg','textDirection','bidi','rtlGutter','docGrid','printerSettings','sectPrChange'],
 'tcPr':['cnfStyle','tcW','gridSpan','hMerge','vMerge','tcBorders','shd','noWrap','tcMar','textDirection','tcFitText','vAlign','hideMark'],
}
def order_errors(x):
    errs=0; ex=[]
    for name,seq in SEQ.items():
        for el in x.iter(W+name):
            if name=='rPr' and el.getparent() is not None and el.getparent().tag==W+'pPr': pass
            idx=[seq.index(c.tag[len(W):]) if c.tag.startswith(W) and c.tag[len(W):] in seq else -1 for c in el]
            idx=[i for i in idx if i>=0]
            if idx!=sorted(idx): errs+=1; ex.append(name+':'+','.join(c.tag[len(W):] for c in el))
    return errs, ex[:3]
tot=0
for f in sorted(os.listdir(sys.argv[1])):
    if not f.endswith('.docx'): continue
    p=os.path.join(sys.argv[1],f); probs=[]
    z=zipfile.ZipFile(p)
    names=z.namelist()
    for n in names:
        if n.endswith('.xml') or n.endswith('.rels'):
            try: etree.fromstring(z.read(n))
            except Exception as e: probs.append('XML '+n+' '+str(e)[:60])
    x=etree.fromstring(z.read('word/document.xml'))
    oe,ex=order_errors(x)
    if oe: probs.append(f'порядок элементов: {oe} {ex}')
    ct=z.read('[Content_Types].xml').decode()
    for n in names:
        if n.startswith('word/') and n.endswith('.xml') and n.count('/')==1 and n not in('word/document.xml',) and '/'+n not in ct and 'Extension="xml"' not in ct: probs.append('нет в Content_Types: '+n)
    rels=z.read('word/_rels/document.xml.rels').decode()
    for t in re.findall(r'Target="([^"]+)"',rels):
        if 'http' in t or t.startswith('../'): continue
        if 'word/'+t not in names and 'TargetMode="External"' not in rels: probs.append('битая ссылка '+t)
    # bib checks
    txt=[''.join(p.itertext()) for p in x.iter(W+'p')]
    ib=next((i for i,t in enumerate(txt) if t.strip().lower().startswith('список использованных')),None)
    if ib is not None:
        for t in txt[ib+1:]:
            m=re.match(r'^(\d+)[\s\u00a0]+\[?(\d+)(?:[.)\]]|[\s\u00a0])',t)
            if m and m.group(1)==m.group(2): probs.append('двойной номер: '+t[:40])
            if re.search(r'С\.\s?–\s?Петерб|Изд\s?–\s?во|ун\s?–\s?та',t): probs.append('дефис→тире: '+t[:60])
    if 'settings.xml' in ''.join(names):
        s=z.read('word/settings.xml').decode()
        if 'TOC' in z.read('word/document.xml').decode() and 'updateFields' not in s: probs.append('нет updateFields')
    try:
        import docx; docx.Document(p)
    except Exception as e: probs.append('python-docx: '+str(e)[:80])
    tot+=len(probs)
    print(('OK  ' if not probs else 'BAD ')+f, '; '.join(probs))
print('problems', tot)
