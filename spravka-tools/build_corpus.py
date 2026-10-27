import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
import json, collections
a = json.load(open(os.path.join(HERE, 'corpus_docs.json'))); b = json.load(open(os.path.join(HERE, 'corpus_pages.json')))
docs = a['docs'] + b['docs']; chunks = a['chunks'] + b['chunks']
seen = collections.Counter()
for c in chunks:
    base = c['doc'] + ':' + ('pp:' if c['part'] else '') + c['p']
    seen[base] += 1
    c['id'] = base + ('#' + str(seen[base]) if seen[base] > 1 else '')
json.dump({'docs': docs, 'chunks': chunks}, open(os.path.join(HERE, 'corpus.json'), 'w'), ensure_ascii=False)
print(len(docs), 'docs', len(chunks), 'chunks')
