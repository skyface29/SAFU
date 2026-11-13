# Генератор «злых» .docx для фаззинга оформления по СТО.
# Запуск (из корня репозитория, сайт поднят: cd site && python3 -m http.server 8799):
#   python3 site/antiplagiat/tests/fuzz/fuzz.py 0 200 /tmp/fz/in
#   node site/antiplagiat/tests/fuzz/fb.js /tmp/fz/in /tmp/fz/out      # оформляет каждый файл дважды
#   python3 site/antiplagiat/tests/fuzz/check.py /tmp/fz/out            # XML, порядок элементов, связи, Word-совместимость
#   python3 site/antiplagiat/tests/fuzz/an.py /tmp/fz/in /tmp/fz/out    # потеря текста, id, поля, замечания проверки
#   python3 site/antiplagiat/tests/fuzz/idem.py /tmp/fz/out             # повторное оформление ничего не меняет
import random, zipfile, io, sys, re, copy, os
IMG=os.path.join(os.path.dirname(os.path.abspath(__file__)),'img.png')
from lxml import etree
from docx import Document
from docx.shared import Cm
from docx.enum.text import WD_BREAK
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def q(t): return '{%s}%s'%(W,t)
WORDS='информационная безопасность система данные защита угроза анализ модель метод управление процесс исследование результат организация сеть доступ политика риск контроль средство'.split()
NB=' '
def sent(rnd,n=None):
    n=n or rnd.randint(6,20); w=[rnd.choice(WORDS) for _ in range(n)]
    s=w[0].capitalize()+' '+' '.join(w[1:])+'.'
    # типографские ловушки
    if rnd.random()<.2: s=s.replace(' ',' - ',1)
    if rnd.random()<.2: s='"'+s[:-1]+'".'
    if rnd.random()<.15: s=s.replace(' ','  ',2)
    if rnd.random()<.1: s+=' См. рис. 1 и т.д.'
    if rnd.random()<.1: s+=' По данным А.С. Пушкина, 2020 г.'
    if rnd.random()<.05: s+=' Цена 100 руб. '+'­'.join(['пере','нос'])
    return s
def para(rnd): return ' '.join(sent(rnd) for _ in range(rnd.randint(1,5)))
BIB=['Иванов И.И. Основы защиты информации. - М.: Юрайт, 2020. - 300 стр.','Очерки истории Поморья. – С.-Петерб.: Изд-во С.-Петерб. ун-та, 2010. – 312 с.',
 'Сидоров А.А., Кузнецов Б.Б. Криптография // Вестник САФУ. 2021. №3. С. 10-20.','OWASP Top 10 [Электронный ресурс]. – Режим доступа: https://owasp.org/Top10/ (дата обращения 01.10.2025)',
 'Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных».','Smith J. Security Engineering. – London: Wiley, 2020. – 1200 p.',
 'Кузнецова, М.'+NB+'В. Риски'+NB+'ИБ / М.'+NB+'В.'+NB+'Кузнецова. –'+NB+'Москва: Наука, 2018. – 200'+NB+'с. – ISBN'+NB+'978-5-02-012345-6.','100 задач по криптографии / сост. А. Б. Белов. – Москва: МЦНМО, 2015. – 96 с.']
def build(seed):
    rnd=random.Random(seed)
    d=Document()
    feats=set(f for f in ['title','tocman','caps','headstyle','figs','tabs','nested','merged','lists','bibnum','appx','landscape','emptylines','pagebreaks','code'] if rnd.random()<.6)
    if 'title' in feats:
        for l in ['МИНИСТЕРСТВО НАУКИ И ВЫСШЕГО ОБРАЗОВАНИЯ РФ','САФУ имени М.В. Ломоносова','Высшая школа информационных технологий и автоматизированных систем',rnd.choice(['РЕФЕРАТ','КУРСОВАЯ РАБОТА','ЭССЕ','КОНТРОЛЬНАЯ РАБОТА']),'по дисциплине «'+rnd.choice(['История','Информатика','Право'])+'»','на тему: «'+sent(rnd,5)[:-1]+'»','Выполнил'+rnd.choice(['','а'])+': студент 1 курса группы 151621','Зарубин Кирилл Сергеевич','Проверил: доцент Петров П.П.','Архангельск 2026']:
            d.add_paragraph(l).alignment=1
        d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    if 'tocman' in feats:
        d.add_paragraph(rnd.choice(['СОДЕРЖАНИЕ','Оглавление','Содержание']))
        for i,x in enumerate(['Введение','1 Теория','1.1 Понятия','Заключение','Список литературы']): d.add_paragraph(x+rnd.choice(['\t','.......... ','  '])+str(i+3))
        if 'pagebreaks' in feats: d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    def H(t,lvl):
        if 'caps' in feats: t=t.upper()
        if rnd.random()<.3: t+='.'
        return d.add_paragraph(t, style=('Heading %d'%lvl) if 'headstyle' in feats else None)
    H('Введение',1)
    for _ in range(rnd.randint(1,4)): d.add_paragraph(para(rnd))
    if 'emptylines' in feats: d.add_paragraph(); d.add_paragraph()
    for c in range(1,rnd.randint(2,4)):
        if 'pagebreaks' in feats: d.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        H(rnd.choice(['%d '%c,'%d. '%c,'Глава %d. '%c,'ГЛАВА %d '%c])+sent(rnd,3)[:-1],1)
        for s in range(1,rnd.randint(2,4)):
            H('%d.%d%s %s'%(c,s,rnd.choice(['','.']),sent(rnd,3)[:-1]),2)
            for _ in range(rnd.randint(1,4)): d.add_paragraph(para(rnd))
            if 'lists' in feats:
                st=rnd.choice(['List Bullet','List Number',None])
                for i in range(3): d.add_paragraph((rnd.choice(['• ','- ','1) ','']) if st is None else '')+sent(rnd,4)[:-1]+';', style=st)
            if 'figs' in feats and rnd.random()<.5:
                d.add_paragraph().add_run().add_picture(IMG, width=Cm(rnd.choice([6,10,16,18])))
                d.add_paragraph(rnd.choice(['Рисунок %d.%d – Схема','рис. %d.%d Схема','Рис.%d.%d: схема','Рисунок %d%d. Схема']) % (c,s))
            if 'tabs' in feats and rnd.random()<.5:
                d.add_paragraph(rnd.choice(['Таблица %d.%d – Данные','Табл. %d.%d. Данные','таблица %d%d данные'])%(c,s))
                t=d.add_table(rows=rnd.randint(2,6),cols=rnd.randint(1,5)); t.style='Table Grid'
                for row in t.rows:
                    for cell in row.cells: cell.text=sent(rnd,rnd.randint(1,5))
                if 'merged' in feats and len(t.columns)>1: t.cell(0,0).merge(t.cell(0,1))
                if 'nested' in feats: t.cell(len(t.rows)-1,0).add_table(rows=2,cols=2)
            if 'code' in feats and rnd.random()<.3:
                p=d.add_paragraph(); r=p.add_run('def f(x):\n    return x * 2'); r.font.name='Courier New'
    H('Заключение',1); d.add_paragraph(para(rnd))
    H(rnd.choice(['Список литературы','СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ','Список использованной литературы','Библиографический список']),1)
    for i in range(rnd.randint(1,12)):
        b=rnd.choice(BIB)
        if 'bibnum' in feats: b=rnd.choice(['%d. ','%d\t','[%d] ','%d) ','%d '])%(i+1)+b
        d.add_paragraph(b, style='List Number' if rnd.random()<.2 else None)
    if 'appx' in feats: H('Приложение А',1); d.add_paragraph('(обязательное)'); d.add_paragraph(para(rnd))
    if 'landscape' in feats:
        from docx.enum.section import WD_ORIENT
        s=d.add_section(); s.orientation=WD_ORIENT.LANDSCAPE; s.page_width,s.page_height=s.page_height,s.page_width; d.add_paragraph(para(rnd))
    bio=io.BytesIO(); d.save(bio); return mutate(bio.getvalue(), rnd, feats)

def mutate(data, rnd, feats):
    zin=zipfile.ZipFile(io.BytesIO(data)); files={n:zin.read(n) for n in zin.namelist()}
    doc=etree.fromstring(files['word/document.xml']); body=doc.find(q('body'))
    rels=etree.fromstring(files['word/_rels/document.xml.rels'])
    ct=etree.fromstring(files['[Content_Types].xml'])
    ps=[p for p in body.iter(q('p'))]
    # 1) разбиваем текст на много прогонов со случайным форматом
    for p in ps:
        for r in list(p.findall(q('r'))):
            t=r.find(q('t'))
            if t is None or not t.text or len(t.text)<4 or rnd.random()<.5: continue
            text=t.text; cuts=sorted(rnd.sample(range(1,len(text)),min(len(text)-1,rnd.randint(1,4))))
            pieces=[text[a:b] for a,b in zip([0]+cuts,cuts+[len(text)])]
            idx=list(p).index(r)
            p.remove(r)
            for k,pc in enumerate(pieces):
                nr=copy.deepcopy(r); nt=nr.find(q('t')); nt.text=pc; nt.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
                rp=nr.find(q('rPr'))
                if rnd.random()<.3:
                    if rp is None: rp=etree.SubElement(nr,q('rPr')); nr.insert(0,rp)
                    ORD=['rStyle','rFonts','b','bCs','i','iCs','caps','smallCaps','strike','dstrike','outline','shadow','emboss','imprint','noProof','snapToGrid','vanish','webHidden','color','spacing','w','kern','position','sz','szCs','highlight','u','effect','bdr','shd','fitText','vertAlign','rtl','cs','em','lang']
                    for tag in rnd.sample(['b','i','u','color','rFonts','sz','highlight','caps','lang'],2):
                        if rp.find(q(tag)) is not None: continue
                        e=etree.Element(q(tag)); k=ORD.index(tag)
                        pos=sum(1 for c in rp if c.tag.startswith('{'+W) and c.tag[len(W)+2:] in ORD and ORD.index(c.tag[len(W)+2:])<k)
                        rp.insert(pos,e)
                        if tag=='color': e.set(q('val'),'FF0000')
                        if tag=='rFonts': e.set(q('ascii'),'Arial'); e.set(q('hAnsi'),'Arial')
                        if tag=='sz': e.set(q('val'),'22')
                        if tag=='highlight': e.set(q('val'),'yellow')
                        if tag=='u': e.set(q('val'),'single')
                        if tag=='lang': e.set(q('val'),'ru-RU')
                p.insert(idx+k,nr)
    ps=[p for p in body.iter(q('p'))]
    nid=[900]
    def newid(): nid[0]+=1; return str(nid[0])
    # 2) гиперссылки, поля, закладки, sdt, исправления, комментарии-якоря, символы
    for p in rnd.sample(ps, min(len(ps), 12)):
        kind=rnd.choice(['hyper','fld','fldsimple','bookmark','sdt','ins','del','sym','nbh','tab','br','lrpb','smart','proof','move'])
        r=etree.Element(q('r')); t=etree.SubElement(r,q('t')); t.text=' вставка'; t.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
        if kind=='hyper':
            rid='rIdFz'+newid(); rel=etree.SubElement(rels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'); rel.set('Id',rid); rel.set('Type',R+'/hyperlink'); rel.set('Target','https://example.org/'+rid); rel.set('TargetMode','External')
            h=etree.SubElement(p,q('hyperlink')); h.set('{%s}id'%R,rid); h.append(r)
        elif kind=='fld':
            for typ,txt in [('begin',None),(None,' PAGEREF _Toc1 \\h '),('separate',None),(None,None),('end',None)]:
                rr=etree.SubElement(p,q('r'))
                if typ: etree.SubElement(rr,q('fldChar')).set(q('fldCharType'),typ)
                elif txt: it=etree.SubElement(rr,q('instrText')); it.text=txt; it.set('{http://www.w3.org/XML/1998/namespace}space','preserve')
                else: tt=etree.SubElement(rr,q('t')); tt.text='5'
        elif kind=='fldsimple':
            fs=etree.SubElement(p,q('fldSimple')); fs.set(q('instr'),' DATE '); fs.append(r)
        elif kind=='bookmark':
            i=newid(); b1=etree.Element(q('bookmarkStart')); b1.set(q('id'),i); b1.set(q('name'),'_Ref'+i); p.insert(1 if len(p) else 0,b1); etree.SubElement(p,q('bookmarkEnd')).set(q('id'),i)
        elif kind=='sdt':
            sdt=etree.SubElement(p,q('sdt')); etree.SubElement(sdt,q('sdtPr')); c=etree.SubElement(sdt,q('sdtContent')); c.append(r)
        elif kind=='ins':
            e=etree.SubElement(p,q('ins')); e.set(q('id'),newid()); e.set(q('author'),'A'); e.set(q('date'),'2025-01-01T00:00:00Z'); e.append(r)
        elif kind=='del':
            e=etree.SubElement(p,q('del')); e.set(q('id'),newid()); e.set(q('author'),'A'); e.set(q('date'),'2025-01-01T00:00:00Z')
            rr=etree.SubElement(e,q('r')); dt=etree.SubElement(rr,q('delText')); dt.text='удалённый текст'
        elif kind=='sym':
            rr=etree.SubElement(p,q('r')); s=etree.SubElement(rr,q('sym')); s.set(q('font'),'Symbol'); s.set(q('char'),'F0B7')
        elif kind=='nbh':
            rr=etree.SubElement(p,q('r')); etree.SubElement(rr,q('t')).text='a'; etree.SubElement(rr,q('noBreakHyphen')); etree.SubElement(rr,q('t')).text='b'
        elif kind=='tab':
            rr=etree.SubElement(p,q('r')); etree.SubElement(rr,q('tab')); etree.SubElement(rr,q('t')).text='после табуляции'
        elif kind=='br':
            rr=etree.SubElement(p,q('r')); etree.SubElement(rr,q('br')); etree.SubElement(rr,q('t')).text='новая строка'
        elif kind=='lrpb':
            if len(p.findall(q('r'))): p.findall(q('r'))[0].insert(0, etree.Element(q('lastRenderedPageBreak')))
        elif kind=='smart':
            st=etree.SubElement(p,q('smartTag')); st.set(q('uri'),'urn:x'); st.set(q('element'),'place'); st.append(r)
        elif kind=='proof':
            etree.SubElement(p,q('proofErr')).set(q('type'),'spellStart'); p.append(r); etree.SubElement(p,q('proofErr')).set(q('type'),'spellEnd')
        elif kind=='move':
            e=etree.SubElement(p,q('moveTo')); e.set(q('id'),newid()); e.set(q('author'),'A'); e.append(r)
    # 3) формула OMML
    if rnd.random()<.5:
        M='http://schemas.openxmlformats.org/officeDocument/2006/math'
        p=etree.Element(q('p')); om=etree.SubElement(p,'{%s}oMathPara'%M); o=etree.SubElement(om,'{%s}oMath'%M); mr=etree.SubElement(o,'{%s}r'%M); etree.SubElement(mr,'{%s}t'%M).text='E=mc2'
        body.insert(rnd.randint(0,len(body)-2),p)
    # 4) сноски
    if rnd.random()<.6:
        fx=('<w:footnotes xmlns:w="%s"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'%W)
        cand=[p for p in body.iter(q('p')) if p.find(q('r')) is not None]
        for i in range(1,4):
            fx+='<w:footnote w:id="%d"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Сноска номер %d.</w:t></w:r></w:p></w:footnote>'%(i,i)
            if cand:
                p=rnd.choice(cand); rr=etree.SubElement(p,q('r')); rp=etree.SubElement(rr,q('rPr')); etree.SubElement(rp,q('vertAlign')).set(q('val'),'superscript'); etree.SubElement(rr,q('footnoteReference')).set(q('id'),str(i))
        fx+='</w:footnotes>'; files['word/footnotes.xml']=fx.encode()
        rel=etree.SubElement(rels,'{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'); rel.set('Id','rIdFzFn'); rel.set('Type',R+'/footnotes'); rel.set('Target','footnotes.xml')
        o=etree.SubElement(ct,'{http://schemas.openxmlformats.org/package/2006/content-types}Override'); o.set('PartName','/word/footnotes.xml'); o.set('ContentType','application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml')
    # 5) надпись (text box)
    if rnd.random()<.4:
        cand=[p for p in body.findall(q('p'))]
        p=rnd.choice(cand)
        tb=('<w:r xmlns:w="%s" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1800000" cy="600000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="777" name="Надпись"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1800000" cy="600000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>ТЕКСТ В НАДПИСИ</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:t>надпись</w:t></mc:Fallback></mc:AlternateContent></w:r>'%W)
        p.append(etree.fromstring(tb))
    # 6) непрерывный разрыв раздела в середине
    if rnd.random()<.3:
        cand=body.findall(q('p'))[5:-5]
        if cand:
            p=rnd.choice(cand); pPr=p.find(q('pPr'))
            if pPr is None: pPr=etree.Element(q('pPr')); p.insert(0,pPr)
            sp=etree.SubElement(pPr,q('sectPr')); etree.SubElement(sp,q('type')).set(q('val'),'continuous')
    # 7) sdt-блок оглавления Word
    if rnd.random()<.3:
        sdt=etree.fromstring(('<w:sdt xmlns:w="%s"><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Оглавление</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Введение</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>3</w:t></w:r></w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:sdtContent></w:sdt>'%W))
        intro=[p for p in body.findall(q('p')) if ''.join(p.itertext()).strip().lower().rstrip('.')=='введение']
        if intro: body.insert(list(body).index(intro[0]), sdt)
    files['word/document.xml']=etree.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True)
    files['word/_rels/document.xml.rels']=etree.tostring(rels,xml_declaration=True,encoding='UTF-8',standalone=True)
    files['[Content_Types].xml']=etree.tostring(ct,xml_declaration=True,encoding='UTF-8',standalone=True)
    out=io.BytesIO(); z=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)
    for n,v in files.items(): z.writestr(n,v)
    z.close(); return out.getvalue()
if __name__=='__main__':
    import os
    a,b,outdir=int(sys.argv[1]),int(sys.argv[2]),sys.argv[3]; os.makedirs(outdir,exist_ok=True)
    for s in range(a,b): open(f'{outdir}/f{s:04d}.docx','wb').write(build(s))
