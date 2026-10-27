# Страницы narfu.ru (раздел «Обучение → Стипендия», «Жизнь САФУ») → абзацы и таблицы дословно
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
import re, json, html, sys
F = os.path.join(HERE, 'docs', 'pages', 'narfu.ru_')
PAGES = [
  ('academic', 'studies_stipendia_academic_', 'https://narfu.ru/studies/stipendia/academic/'),
  ('social', 'studies_stipendia_social_', 'https://narfu.ru/studies/stipendia/social/'),
  ('pgas', 'studies_stipendia_hight_', 'https://narfu.ru/studies/stipendia/hight/'),
  ('mathelp', 'studies_stipendia_soc_help_', 'https://narfu.ru/studies/stipendia/soc_help/'),
  ('stipsize', 'studies_stipendia_size_', 'https://narfu.ru/studies/stipendia/size/'),
  ('stipcom', 'studies_stipendia_commition_', 'https://narfu.ru/studies/stipendia/commition/'),
  ('president', 'studies_stipendia_president_', 'https://narfu.ru/studies/stipendia/president/'),
  ('governor', 'studies_stipendia_governor_', 'https://narfu.ru/studies/stipendia/governor/'),
  ('named', 'studies_stipendia_named_', 'https://narfu.ru/studies/stipendia/named/'),
  ('studsemia', 'life_social_studsemia_', 'https://narfu.ru/life/social/studsemia/'),
  ('socprotect', 'life_social_', 'https://narfu.ru/life/social/'),
  ('dorms', 'life_campus_dormitories_', 'https://narfu.ru/life/campus/dormitories/'),
  ('settle', 'life_campus_the_procedure_for_settling_', 'https://narfu.ru/life/campus/the_procedure_for_settling/'),
  ('dormpay', 'life_campus_oplata-prozhivaniya-v-obshchezhitii_', 'https://narfu.ru/life/campus/oplata-prozhivaniya-v-obshchezhitii/'),
]
def txt(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
def table(t):
    rows = []
    for tr in re.findall(r'<tr[\s\S]*?</tr>', t, re.I):
        cells = [txt(c) for c in re.findall(r'<t[dh][^>]*>([\s\S]*?)</t[dh]>', tr, re.I)]
        if any(cells): rows.append(' | '.join(cells))
    return '\n'.join(rows)
def page(path):
    h = open(path, encoding='utf-8', errors='replace').read()
    i = h.find('class="main__content'); seg = h[i:]
    for stop in ('class="sidebar', '<footer', 'class="footer'):
        j = seg.find(stop)
        if j > 0: seg = seg[:j]
    seg = re.sub(r'<(script|style)[\s\S]*?</\1>', ' ', seg)
    seg = re.sub(r'<!--[\s\S]*?-->', ' ', seg)
    tables = []
    def keep(m): tables.append(table(m.group(0))); return f'\n@@T{len(tables)-1}@@\n'
    seg = re.sub(r'<table[\s\S]*?</table>', keep, seg, flags=re.I)
    seg = re.sub(r'<br\s*/?>', '\n', seg)
    seg = re.sub(r'<li[^>]*>', '\n• ', seg)
    seg = re.sub(r'</(p|div|li|h[1-6]|ul|ol)>', '\n', seg)
    seg = re.sub(r'<h[1-6][^>]*>', '\n## ', seg)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', seg))
    t = re.sub(r'[ \t\xa0]+', ' ', t)
    lines = [l.strip() for l in t.split('\n')]
    lines = [l for l in lines if l and l not in ('•', '-->', '## ', '##')]
    # навигация: «… Назад / Разделы / Заголовок»
    title = ''
    if 'Разделы' in lines:
        k = lines.index('Разделы'); title = lines[k + 1].lstrip('# ').strip(); lines = lines[k + 2:]
    blocks, cur = [], None
    for l in lines:
        m = re.match(r'@@T(\d+)@@', l)
        if m:
            if cur: blocks.append(cur); cur = None
            if tables[int(m.group(1))]: blocks.append({'h': '', 'text': tables[int(m.group(1))], 'table': True})
            continue
        head = l.startswith('## ')
        l = l.lstrip('# ').strip()
        if not l: continue
        if l.startswith('• ') and cur: cur['text'] += '\n' + l; continue
        # абзац, разорванный ссылкой или <br>: предыдущий не закончен или этот начинается со строчной
        if cur and not head and not cur['h'] and (re.match(r'[а-яёa-z(«"]', l) or not re.search(r'[.!?:;»)]$', cur['text'])):
            cur['text'] += ' ' + l; continue
        if cur: blocks.append(cur)
        cur = {'h': l if head else '', 'text': l}
    if cur: blocks.append(cur)
    # заголовок без текста приклеиваем к следующему абзацу
    out, pend = [], ''
    for b in blocks:
        if b['h'] and b['text'] == b['h'] and not b.get('table'): pend = (pend + ' · ' if pend else '') + b['h']; continue
        b['sect'] = pend or ''; out.append(b)
    return title, [b for b in out if len(b['text']) > 20]
docs, chunks = [], []
for pid, f, url in PAGES:
    title, blocks = page(F + f)
    docs.append({'id': pid, 'title': title, 'act': 'страница сайта narfu.ru (снимок 27.10.2026)', 'url': url, 'page': True})
    for n, b in enumerate(blocks, 1):
        chunks.append({'doc': pid, 'p': str(n), 'sect': b.get('sect', ''), 'part': '', 'text': b['text'], **({'table': True} if b.get('table') else {})})
    print(pid, title, len(blocks), file=sys.stderr)
json.dump({'docs': docs, 'chunks': chunks}, open(os.path.join(HERE, 'corpus_pages.json'), 'w'), ensure_ascii=False, indent=0)
