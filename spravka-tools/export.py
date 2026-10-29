# Данные для arktika-app.ru/spravka/: документы, пункты (дословно) и частые вопросы
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
import json, sys
sys.path.insert(0, HERE)
from cards import CARDS
corp = json.load(open(os.path.join(HERE, 'corpus.json')))
ids = {c['id'] for c in corp['chunks']}
docs = [{'id': d['id'], 't': d['title'], 'a': d['act'], 'u': d['url'], **({'w': 1} if d.get('page') else {})} for d in corp['docs']]
di = {d['id']: i for i, d in enumerate(docs)}
PART = {'Правила поведения обучающихся': 1, 'Правила проживания': 'Правила проживания'}
def label(c):  # подпись цитаты, если «п. N» не подходит
    if c['doc'] == 'izm': return c['sect'] + ' — изменение ' + ('п. ' + c['p'].split(':')[1] if c['p'].split(':')[1] != '1.9' else 'раздела 1')
    if c['doc'] == 'razm' and c.get('table'): return 'Приложение № 1 — ' + ('Архангельск' if 'Архангельске' in c['sect'] else 'филиал в Северодвинске')
    return None
ch = [{'i': c['id'], 'd': di[c['doc']], 'p': c['p'], 's': c['sect'], **({'pp': PART[c['part']]} if c['part'] else {}), 't': c['text'],
       **({'tb': 1} if c.get('table') else {}), **({'o': 1} if c.get('scan') else {}), **({'n': c['note']} if c.get('note') else {}),
       **({'u': c['url']} if c.get('url') else {}), **({'lb': label(c)} if label(c) else {})} for c in corp['chunks']]
cards = [{'c': c['cat'], 'q': c['q'], 'k': c['k'], 'r': [[cid] + ([h] if h else []) for cid, h in c['r']]} for c in CARDS]
for c in cards:
    for r in c['r']: assert r[0] in ids, r
out = {'v': 1, 'snap': '27.10.2026', 'docs': docs, 'chunks': ch, 'cards': cards}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(HERE, '..', 'site', 'spravka', 'data', 'spravka.json'), 'w').write(s)
import gzip; print(len(s) // 1024, 'КБ,', len(gzip.compress(s.encode())) // 1024, 'КБ gzip;', len(ch), 'пунктов,', len(cards), 'вопросов')
