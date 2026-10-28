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
# сканы: сверенный вручную текст страниц (scan/text), сноски — без служебных пометок; новые приказы — pdftotext
import glob
def scan(prefixes):
    t = ''
    for pre in prefixes:
        for f in sorted(glob.glob(os.path.join(HERE, 'scan', 'text', pre + '-*.txt'))):
            t += '\n'.join(l for l in open(f, encoding='utf-8').read().split('\n') if not re.match(r'^\s*\d{1,3}\s*$', l)) + '\n'
    return squash(t.replace('@@FN', '').replace('@@FC', ''))
ST = os.path.join(HERE, 'docs', 'stip', 'txt', '')
def txt(f, nonum=False):
    ls = open(ST + f, encoding='utf-8').read().split('\n')
    if nonum: ls = [re.sub(r'\s{2,}\d{1,2} \d{3}\s*$', '', l) for l in ls]  # таблица: число в конце строки отдельно
    return squash('\n'.join(ls))
src['p742'] = scan(['00']); src['dorm'] = scan(['18'])
src['izm'] = scan(['13', '12', '10', '06']) + txt('03_Prikaz-_-55_P-O-vnesenii-izmeneniy-v-Poryadok-raspredeleniya-stipendialnogo-fond.txt')
src['razm'] = txt('14_Akademicheyaskaya-VO.txt') + '|' + txt('14_Akademicheyaskaya-VO.txt', True)
src['pgasrazm'] = txt('17_PGAS.txt')
bad = 0
for c in D['chunks']:
    doc = D['docs'][c['d']]['id']; t = c['t']
    if c.get('tb'): parts = [squash(x) for row in t.split('\n') for x in row.split(' | ')]
    else: parts = [squash(x) for x in t.split('\n')]  # абзацы страницы со списками («• …») — каждая строка отдельно
    for p in parts:
        p = p.lstrip('•–')
        if c.get('tb') and p not in src[doc] and all(q in src[doc] for q in p.split(',') if q): continue  # шапка таблицы в две строки
        if p and p not in src[doc]:
            bad += 1; print('НЕ НАЙДЕНО', c['i'], p[:120]); break
print('пунктов:', len(D['chunks']), 'не совпало:', bad)
