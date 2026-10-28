# Сканы (распознаны и сверены вручную: scan/text/*.txt) и новые текстовые приказы о стипендиях → пункты дословно
import re, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(HERE, 'scan', 'text', '')
ST = os.path.join(HERE, 'docs', 'stip', 'txt', '')
U742 = 'https://narfu.ru/upload/iblock/783/Prikaz-_-Poryadok-raspredeleniya-stipendialnogo-fond.pdf'
P742 = 'Порядок распределения стипендиального фонда, организации стипендиального обеспечения и назначения материальной поддержки'

def pages(prefix, a, b): return [f'{prefix}-{i:02d}' for i in range(a, b + 1)]
SCANS = [
  dict(id='p742', pages=pages('00', 4, 20), start=r'^I\. Общие положения',
       title=P742, act='введён приказом № 742 от 25.12.2020 (основной текст, без приложений)', url=U742,
       notes={
         '3.2.4': 'Пункт дополнен абзацем четвертым приказом № 1000 от 25.11.2022 — см. «Изменения в Порядок».',
         '3.2.12': 'Пункт дополнен абзацем четвертым приказом № 561 от 27.06.2022 — см. «Изменения в Порядок».',
         '3.2.15': 'Пункт дополнен подпунктом «в» приказом № 1000 от 25.11.2022 — см. «Изменения в Порядок».',
         '3.2.18': 'Пункт дополнен примечанием приказом № 19-П от 28.02.2025 — см. «Изменения в Порядок».',
         '3.2.19': 'Абзац 1 изменён: действует редакция приказа № 55-П от 09.09.2025 — см. «Изменения в Порядок».',
       }),
  dict(id='dorm', pages=pages('18', 3, 29), start=r'^1\. ОБЩИЕ ПОЛОЖЕНИЯ',
       title='Положение о студенческом общежитии и Правила проживания и пользования помещениями студенческого общежития',
       act='приложение № 1 к приказу «Об утверждении Положения о студенческом общежитии…» (скан с narfu.ru)',
       url='https://narfu.ru/upload/medialibrary/db5/frxy72lvj122rxk8vzzuscq3buniaxn5/Polozhenie-o-studencheskom-obshchezhitii.pdf',
       part=(r'^Приложение к Положению', r'^ПРАВИЛА ПРОЖИВАНИЯ И ПОЛЬЗОВАНИЯ ПОМЕЩЕНИЯМИ', 'Правила проживания')),
]
# Изменения основного текста Порядка (в приложения 7–8 — таблицы матпомощи — не включены).
# Устаревшие редакции п. 3.2.19 (приказы № 6-П и № 45-П) не включены: действует № 55-П.
AMEND = [
  dict(n='561', date='27.06.2022', pages=['13-1'], frm=r'^Пункт 3\.2\.12 Порядка', to=r'^2\. Директору',
       url='https://narfu.ru/upload/iblock/e5c/_-_-_-_-_-_-_.pdf', p='3.2.12'),
  dict(n='1000', date='25.11.2022', pages=['12-2'], frm=r'^1\.1\. Пункт 3\.2\.4', to=r'^1\.2\. Пункт 3\.2\.15', p='3.2.4',
       url='https://narfu.ru/upload/iblock/c42/ajj6sgk7edhcaapsl3ftqboq9l84jn3n/Prikaz-_-1000-O-vnesenii-izmeneniy-i-dopolneniy-v-Poryadok-raspredeleniya-stipendialnogo-fonda-ot-25.11.2022.pdf'),
  dict(n='1000', date='25.11.2022', pages=['12-2'], frm=r'^1\.2\. Пункт 3\.2\.15', to=r'^1\.3\. Внести', p='3.2.15',
       url='https://narfu.ru/upload/iblock/c42/ajj6sgk7edhcaapsl3ftqboq9l84jn3n/Prikaz-_-1000-O-vnesenii-izmeneniy-i-dopolneniy-v-Poryadok-raspredeleniya-stipendialnogo-fonda-ot-25.11.2022.pdf'),
  dict(n='6-П', date='30.01.2024', pages=['10-1'], frm=r'^1\.1\. Раздел 1', to=r'^1\.2\. Абзац 1', p='1.9',
       url='https://narfu.ru/upload/iblock/399/Prikaz-o-vnesenii-izmenenij-i-dopolnenij-v-Poryadok-raspredeleniya-stipendialnogo-fonda-_6_P-ot-30.01.2024.pdf'),
  dict(n='19-П', date='28.02.2025', pages=['06-1', '06-2'], frm=r'^Абзац третий подпункта 3', to=r'^2\. Директору', p='3.2.18',
       url='https://narfu.ru/upload/iblock/33c/dbkq1odpeo3lptuas62ecrouiejlaws2/Prikaz-19_P-ot-28-fevralya-2025-goda-O-vnesenii-izmeneniy-v-Poryadok-raspredeleniya-stipendialnogo-fonda.pdf'),
  dict(n='55-П', date='09.09.2025', txt='03_Prikaz-_-55_P-O-vnesenii-izmeneniy-v-Poryadok-raspredeleniya-stipendialnogo-fond.txt',
       frm=r'^Абзац 1 пункта 3\.2\.19', to=r'^2\. Директору', p='3.2.19', text=1,
       url='https://narfu.ru/upload/iblock/2f0/ouhf24x56xbl9iey458mr5e6tmrymkk0/Prikaz-_-55_P-O-vnesenii-izmeneniy-v-Poryadok-raspredeleniya-stipendialnogo-fonda-ot-09.09.2025.pdf'),
]
POINT = re.compile(r'^(\d+(?:\.\d+)+)\.?\s*(\S.*)$')
ROMAN = re.compile(r'^(I|II|III|IV|V)\.\s+\S')
CAPS = re.compile(r'^(\d+)\.\s+([А-ЯЁ][А-ЯЁ ,.\-]+)$')
PAGE = re.compile(r'^\s*\d{1,2}\s*$')

def lines_of(pgs):
    out = []
    for pg in pgs:
        for l in open(T + pg + '.txt', encoding='utf-8').read().split('\n'):
            if l.strip() and not PAGE.match(l): out.append(l)
    return out

def join(ls):
    # строка с отступом — новый абзац; перенос «культурно-» + «бытового» склеивается без пробела
    out = ''
    for l in ls:
        ind = l.startswith('  '); l = l.strip()
        if not out: out = l; continue
        if ind: out += '\n' + l
        elif re.search(r'[а-яё]-$', out) and re.match(r'[а-яё]', l): out += l
        else: out += ' ' + l
    return re.sub(r'[ \t]+', ' ', out).strip()

def parse_scan(doc):
    L = lines_of(doc['pages'])
    i0 = next(i for i, l in enumerate(L) if re.search(doc['start'], l.strip()))
    L = L[i0:]
    fn, chunks, cur, sect, part, skip = {}, [], None, '', '', False
    def close():
        if cur:
            t = join(cur['lines'])
            chunks.append(dict(doc=doc['id'], p=cur['p'], sect=cur['sect'], part=cur['part'], text=t))
    k = 0
    while k < len(L):
        raw = L[k]; l = raw.strip(); k += 1
        if l.startswith('@@FN'):                      # сноска внизу страницы: «@@FN¹ текст» + «@@FC продолжение»
            mark, body = l[4], l[5:].strip()
            while k < len(L) and L[k].strip().startswith('@@FC'): body += ' ' + L[k].strip()[4:].strip(); k += 1
            fn[mark] = body; continue
        if doc.get('part') and re.search(doc['part'][0], l): close(); cur = None; skip = True; continue
        if skip:
            if re.search(doc['part'][1], l): part = doc['part'][2]; sect = ''
            if part and CAPS.match(l): skip = False
            else: continue
        if ROMAN.match(l):
            close(); cur = None; sect = l
            while k < len(L) and not POINT.match(L[k].strip()) and len(L[k].strip()) < 70: sect += ' ' + L[k].strip(); k += 1
            continue
        m = CAPS.match(l)
        if m and l == l.upper():
            close(); cur = None; sect = l
            while k < len(L) and L[k].strip() == L[k].strip().upper() and re.search('[А-ЯЁ]{3}', L[k]) and not POINT.match(L[k].strip()):
                sect += ' ' + L[k].strip(); k += 1
            continue
        m = POINT.match(l)
        if m and raw.startswith('  '):
            close(); cur = dict(p=m.group(1), sect=sect, part=part, lines=[raw]); continue
        if cur: cur['lines'].append(raw)
    close()
    # пункт-заголовок («3.2. Государственная академическая стипендия.») → в название раздела
    out = []
    for j, c in enumerate(chunks):
        nxt = chunks[j + 1]['p'] if j + 1 < len(chunks) else ''
        if len(c['text']) < 170 and nxt.startswith(c['p'] + '.'):
            for c2 in chunks[j + 1:]:
                if c2['p'].startswith(c['p'] + '.'): c2['sect'] = c2['sect'] + ' / ' + c['text']
            continue
        out.append(c)
    for c in out:  # сноски — в конец пункта, где стоит знак сноски
        for mark, body in fn.items():
            if mark in c['text']: c['text'] += '\n' + mark + ' ' + body
        if c['p'] in doc.get('notes', {}): c['note'] = doc['notes'][c['p']]
        c['scan'] = 1
    return out

def parse_amend(a):
    L = open(ST + a['txt'], encoding='utf-8').read().split('\n') if a.get('text') else lines_of(a['pages'])
    L = [l for l in L if l.strip() and not PAGE.match(l)]
    i = next(i for i, l in enumerate(L) if re.search(a['frm'], l.strip()))
    j = next(j for j, l in enumerate(L) if j > i and re.search(a['to'], l.strip()))
    if a.get('text'): L = [('  ' if re.match(r'^\s{4,}', l) else '') + l.strip() for l in L]
    return join(L[i:j])

def sizes():
    # приказ № 692 (текстовый PDF): таблица «Характеристика стипендии | Размер, руб.»
    src = open(ST + '14_Akademicheyaskaya-VO.txt', encoding='utf-8').read().split('\n')
    def table(a, b):
        i = next(i for i, l in enumerate(src) if a in l); j = next(j for j, l in enumerate(src) if j > i and b in l)
        L = [l.rstrip() for l in src[i + 1:j] if l.strip() and not PAGE.match(l)
             and 'Характеристика стипендии' not in l and l.strip() not in ('Размер стипендии,', 'руб.')]
        rows, k, pend = ['Характеристика стипендии | Размер стипендии, руб.'], 0, ''
        NUM = re.compile(r'^(.*?)\s{2,}(\d{1,2} \d{3})$')
        while k < len(L):
            l = L[k].strip(); k += 1
            if re.fullmatch(r'\d{1,2} \d{3}', l): pend = l; continue           # число строкой выше текста
            if l.startswith('Государственная академическая и (или)'):         # многострочная ячейка, число в середине
                parts, n = [], ''
                k -= 1
                while True:
                    m = NUM.match(L[k]); t = m.group(1).strip() if m else L[k].strip(); n = m.group(2) if m else n
                    parts.append(t); k += 1
                    if 'инвалида I группы' in t: break
                rows.append(' '.join(parts) + ' | ' + n); continue
            if l.startswith('Стипендия аспирантам (в т.ч. иностранцам),'):
                parts = [l]
                while 'приоритетным направлениям' not in parts[-1]: parts.append(L[k].strip()); k += 1
                rows.append(' '.join(parts) + ' | '); continue
            m = NUM.match(L[k - 1])
            if m: rows.append(m.group(1).strip() + ' | ' + m.group(2)); continue
            if pend: rows.append(l + ' | ' + pend); pend = ''; continue
            rows.append(l + ' | ')
        return '\n'.join(rows)
    return [
      dict(doc='razm', p='1', sect='', part='', text='1. Установить размеры стипендий по программам высшего образования на сентябрь-октябрь 2026 года согласно Приложению №1.'),
      dict(doc='razm', p='прил.1.1', sect='1. Обучающимся в университете в г. Архангельске:', part='', table=1,
           text=table('1. Обучающимся в университете в г. Архангельске', '2. Обучающимся в филиале')),
      dict(doc='razm', p='прил.1.2', sect='2. Обучающимся в филиале САФУ в г. Северодвинске:', part='', table=1,
           text=table('2. Обучающимся в филиале САФУ в г. Северодвинске', '3. Стипендия слушателям')),
    ]

docs = [dict(id=d['id'], title=d['title'], act=d['act'], url=d['url'], scan=True) for d in SCANS]
chunks = []
for d in SCANS: chunks += parse_scan(d)
docs.append(dict(id='izm', title='Изменения в Порядок распределения стипендиального фонда (№ 742)',
                 act='приказы № 561, 1000, 6-П, 19-П (сканы, сверены вручную) и № 55-П', url=AMEND[-1]['url']))
for a in AMEND:
    chunks.append(dict(doc='izm', p=a['n'] + ':' + a['p'], sect='Приказ № ' + a['n'] + ' от ' + a['date'], part='',
                       text=parse_amend(a), url=a['url'], **({} if a.get('text') else {'scan': 1})))
docs.append(dict(id='razm', title='Размеры стипендий по программам высшего образования на сентябрь-октябрь 2026 года',
                 act='приказ № 692 от 18.09.2026', url='https://narfu.ru/upload/medialibrary/b04/qo5uhtm2tc2s14w6yow5p3frunxkp7wf/Akademicheyaskaya-VO.pdf'))
chunks += sizes()
pg = open(ST + '17_PGAS.txt', encoding='utf-8').read()
m = re.search(r'1\.\s+Утвердить повышенную[\s\S]*?руб\.', pg)
docs.append(dict(id='pgasrazm', title='Размер повышенной государственной академической стипендии на сентябрь-октябрь 2026 года',
                 act='приказ № 713 от 24.09.2026', url='https://narfu.ru/upload/medialibrary/406/lasqmuie2enmea3e293gcprkyb8rv8s7/PGAS.pdf'))
chunks.append(dict(doc='pgasrazm', p='1', sect='', part='', text=re.sub(r'\s+', ' ', m.group(0))))
json.dump({'docs': docs, 'chunks': chunks}, open(os.path.join(HERE, 'corpus_scans.json'), 'w'), ensure_ascii=False, indent=0)
import collections
for d, n in collections.Counter(c['doc'] for c in chunks).items(): print(d, n, 'пунктов')
