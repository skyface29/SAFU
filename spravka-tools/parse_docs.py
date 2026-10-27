# Документы САФУ (pdftotext -layout) → пункты дословно. Меняется только перенос строк и лишние пробелы.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
import re, json, sys
D = os.path.join(HERE, 'docs', 'txt', '')
DOCS = [
  dict(id='tkipa', file='TKiPA-P48-23062026.pdf.txt', start=r'^\s*1\.\s+Область применения', end=r'^\s*Приложение\s+(№\s*)?1\s*$|^\s*ПРИЛОЖЕНИЕ\s+1',
       title='Положение о текущем контроле успеваемости и промежуточной аттестации (бакалавриат, специалитет, магистратура)',
       act='приказ № 48-П от 23.07.2026, действует с 01.09.2026',
       url='https://narfu.ru/upload/iblock/557/9wetvcxp8yn8aui1j70x63ljrlac3he1/TKiPA-P48-23062026.pdf'),
  dict(id='otch', file='otchislenie-2022.txt', start=r'^\s*1\.\s+ОБЩИЕ ПОЛОЖЕНИЯ', end=r'^\s*Приложение\s+(№\s*)?1\b',
       title='Положение о порядке отчисления, восстановления и перевода обучающихся',
       act='приказ № 1010 от 28.11.2022 (изменения: приказ № 53-П от 20.08.2026 — только в п. 1.2)',
       url='https://narfu.ru/upload/iblock/88f/otchislinia_vossrtanovlenie_perevoda_2022.pdf', skip=['1.2']),
  dict(id='pravila', file='Pravila-vnutrennego-rasporyadka-obuchayushchikhsya.pdf.txt', start=r'^\s*1\.?\s+ОБЩИЕ ПОЛОЖЕНИЯ', end=None,
       title='Правила внутреннего распорядка обучающихся',
       act='приказ № 553 от 01.07.2019',
       url='https://narfu.ru/upload/medialibrary/c30/lpozh4nc2o28nn1iiq21i5f3ln1t9cxn/Pravila-vnutrennego-rasporyadka-obuchayushchikhsya.pdf'),
  dict(id='rezhim', file='Polozhenie-o-rezhime-zanyatiy.pdf.txt', start=r'^\s*1\.\s+ОБЩИЕ ПОЛОЖЕНИЯ', end=r'^\s*Приложение к\s*$',
       title='Положение о режиме занятий обучающихся',
       act='приказ № 764 от 30.09.2019',
       url='https://narfu.ru/upload/medialibrary/dcd/41qfm5gasllnoka5414164eb8qkn7wls/Polozhenie-o-rezhime-zanyatiy.pdf'),
  dict(id='otnosh', file='poryadok-otnosheniy-652.txt', start=r'^\s*1\.\s+Общие положения', end=None,
       title='Порядок оформления возникновения, приостановления и прекращения отношений между САФУ и обучающимися',
       act='приказ № 652 от 02.09.2019',
       url='https://narfu.ru/upload/medialibrary/e38/jkn0v91mmhmbgavo6fq1keaku4akn7tz/Poryadok-oformleniya_-vozniknoveniya-i-prekrashcheniya-otnosheniy.pdf'),
]
PAGE = re.compile(r'^\s*\d{1,3}\s*$')
POINT = re.compile(r'^\s*(\d+(?:\.\d+)+)(?:\.(?!\d)\s*|\s+|(?=[А-ЯЁA-Z«"(—-]))(\S.*)$')
SECT = re.compile(r'^\s*(\d+)\.\s+([А-ЯЁA-Z][^а-яё]{3,}.*|[А-ЯЁ][а-яё].*)$')
APPX = re.compile(r'^\s*(ПРАВИЛА ПОВЕДЕНИЯ|Правила поведения)', re.I)
def join(lines):
    out = ''
    for l in lines:
        l = l.strip()
        if not l: continue
        if out.endswith('-') and re.search(r'[а-яёa-z]-$', out) and re.match(r'[а-яёa-z]', l): out += l
        else: out += (' ' if out else '') + l
    return re.sub(r'[ \t\xa0]+', ' ', out).strip()
def parse(doc):
    raw = open(D + doc['file'], encoding='utf-8').read().split('\n')
    i0 = next(i for i, l in enumerate(raw) if re.search(doc['start'], l))
    lines = raw[i0:]
    if doc.get('end'):
        j = next((i for i, l in enumerate(lines) if i > 5 and re.search(doc['end'], l)), None)
        if j: lines = lines[:j]
    chunks, cur, sect, part = [], None, '', ''
    def close():
        if cur and cur['lines']:
            t = join(cur['lines'])
            if len(t) > 15: chunks.append(dict(doc=doc['id'], p=cur['p'], sect=cur['sect'], part=cur['part'], text=t))
    sect_pending = False
    for l in lines:
        if PAGE.match(l) or not l.strip(): continue
        if APPX.match(l.strip()) and len(l.strip()) < 60:
            close(); cur = None; part = 'Правила поведения обучающихся'; sect = ''; continue
        m = POINT.match(l)
        if m and not (len(l) - len(l.lstrip()) > 20):
            close(); cur = dict(p=m.group(1), sect=sect, part=part, lines=[l.strip()]); continue
        s = SECT.match(l)
        indent = len(l) - len(l.lstrip())
        if s and (indent >= 6 or s.group(2).isupper()) and len(s.group(2)) < 90 and (not re.search(r'[;,:]$', l.strip()) or s.group(2).strip().isupper()):
            close(); cur = None
            if part:  # в приложении пункты нумеруются одним числом
                if s.group(2).isupper(): sect = s.group(1) + '. ' + s.group(2).strip()
                else: cur = dict(p=s.group(1), sect=sect, part=part, lines=[l.strip()])
                continue
            sect = s.group(1) + '. ' + s.group(2).strip(); continue
        if part and re.match(r'^\s*(\d+)\.\s+\S', l) and not s:
            close(); cur = dict(p=re.match(r'^\s*(\d+)\.', l).group(1), sect=sect, part=part, lines=[l.strip()]); continue
        if cur: cur['lines'].append(l)
        elif sect and l.strip().isupper() and len(l.strip()) < 80: sect += ' ' + l.strip()
    close()
    # разделы: «3. ПОРЯДОК ВОССТАНОВЛЕНИЯ ЛИЦ,» + продолжение заглавными; название раздела берём по первой цифре пункта
    titles, k = {}, 0
    while k < len(lines):
        l = lines[k]; m = re.match(r'^(\s*)(\d+)\.?\s+(\S.*)$', l)
        nxt = next((x for x in lines[k + 1:k + 5] if POINT.match(x)), '')
        head = m and not POINT.match(l) and m.group(2) not in titles and len(m.group(3)) < 100 and (
            m.group(3).strip().isupper() or (POINT.match(nxt) and POINT.match(nxt).group(1).startswith(m.group(2) + '.1')))
        if head:
            t = m.group(3).strip(); k2 = k + 1
            while k2 < len(lines) and lines[k2].strip() and lines[k2].strip().isupper() and len(lines[k2].strip()) < 80 and not POINT.match(lines[k2]): t += ' ' + lines[k2].strip(); k2 += 1
            if APPX.match(l.strip()): break
            titles[m.group(2)] = m.group(2) + '. ' + re.sub(r'\s+', ' ', t)
        if APPX.match(l.strip()): break
        k += 1
    for c in chunks:
        if not c['part']: c['sect'] = titles.get(c['p'].split('.')[0], '')
        c['text'] = c['text'].replace('ѐ', 'ё')
    return [c for c in chunks if c['p'] not in doc.get('skip', [])]
out = {'docs': [], 'chunks': []}
for d in DOCS:
    ch = parse(d)
    out['docs'].append({k: d[k] for k in ('id', 'title', 'act', 'url')})
    out['chunks'] += ch
    print(d['id'], len(ch), 'пунктов', file=sys.stderr)
json.dump(out, open(os.path.join(HERE, 'corpus_docs.json'), 'w'), ensure_ascii=False, indent=0)
