# Проверка частых вопросов: каждый пункт существует, каждая подсвечиваемая фраза дословно есть в тексте пункта
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cards import CARDS
data = json.load(open(os.path.join(HERE, '..', 'site', 'spravka', 'data', 'spravka.json'), encoding='utf-8'))
ch = {c['i']: c['t'] for c in data['chunks']}
bad = 0
for c in CARDS:
    for cid, hls in c['r']:
        if cid not in ch: print('НЕТ ПУНКТА', cid, '—', c['q']); bad += 1; continue
        for h in hls:
            if h not in ch[cid]: print('НЕТ ФРАЗЫ', cid, '—', h[:80]); bad += 1
print(len(CARDS), 'вопросов,', sum(len(c['r']) for c in CARDS), 'ссылок на пункты; ошибок:', bad)
sys.exit(1 if bad else 0)
