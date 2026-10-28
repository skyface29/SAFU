import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
import json, collections
parts = [json.load(open(os.path.join(HERE, f))) for f in ('corpus_docs.json', 'corpus_pages.json', 'corpus_scans.json')]
docs = sum((x['docs'] for x in parts), []); chunks = sum((x['chunks'] for x in parts), [])
seen = collections.Counter()
for c in chunks:
    base = c['doc'] + ':' + ('pp:' if c['part'] else '') + c['p']
    seen[base] += 1
    c['id'] = base + ('#' + str(seen[base]) if seen[base] > 1 else '')
json.dump({'docs': docs, 'chunks': chunks}, open(os.path.join(HERE, 'corpus.json'), 'w'), ensure_ascii=False)
print(len(docs), 'docs', len(chunks), 'chunks')
