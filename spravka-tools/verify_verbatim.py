# Проверка «дословности»: каждый пункт справочника (без пробелов) должен найтись в исходном тексте документа
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
import json, re, html, sys
sys.path.insert(0, HERE)
D = json.load(open(os.path.join(HERE, '..', 'site', 'spravka', 'data', 'spravka.json')))
SRC = {'tkipa': 'TKiPA-P48-23062026.pdf.txt', 'otch': 'otchislenie-2022.txt', 'pravila': 'Pravila-vnutrennego-rasporyadka-obuchayushchikhsya.pdf.txt',
       'rezhim': 'Polozhenie-o-rezhime-zanyatiy.pdf.txt', 'otnosh': 'poryadok-otnosheniy-652.txt'}
from parse_pages import PAGES, F
def squash(s): return re.sub(r'\s+', '', s.replace('ѐ', 'ё'))
src = {}
for k, f in SRC.items():
    lines = open(os.path.join(HERE, 'docs', 'txt', f), encoding='utf-8').read().split('\n')
    src[k] = squash('\n'.join(l for l in lines if not re.match(r'^\s*\d{1,3}\s*$', l)))
for pid, f, url in PAGES:
    h = open(F + f, encoding='utf-8', errors='replace').read()
    h = re.sub(r'<!--[\s\S]*?-->', ' ', h)
    src[pid] = squash(html.unescape(re.sub(r'<[^>]+>', ' ', h)))
bad = 0
for c in D['chunks']:
    doc = D['docs'][c['d']]['id']; t = c['t']
    if c.get('tb'): parts = [squash(x) for row in t.split('\n') for x in row.split(' | ')]
    else: parts = [squash(x) for x in t.split('\n')]  # абзацы страницы со списками («• …») — каждая строка отдельно
    for p in parts:
        p = p.lstrip('•')
        if p and p not in src[doc]:
            bad += 1; print('НЕ НАЙДЕНО', c['i'], p[:120]); break
print('пунктов:', len(D['chunks']), 'не совпало:', bad)
