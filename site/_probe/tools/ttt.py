"""Read-only probe of ttt.narfu.ru (Livewire v2): call component methods and dump serverMemo data."""
import html, http.cookiejar, json, re, sys, urllib.request

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
BASE = 'https://ttt.narfu.ru'
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op.addheaders = [('User-Agent', 'Mozilla/5.0')]

def page(path='/'):
    h = op.open(BASE + path, timeout=30).read().decode('utf-8')
    tok = re.search(r"livewire_token = '([^']+)'", h).group(1)
    comps = [json.loads(html.unescape(m)) for m in re.findall(r'wire:initial-data="([^"]+)"', h)]
    return tok, comps

def call(tok, comp, updates):
    body = json.dumps({'fingerprint': comp['fingerprint'], 'serverMemo': comp['serverMemo'], 'updates': updates}).encode()
    req = urllib.request.Request(f"{BASE}/livewire/message/{comp['fingerprint']['name']}", data=body, method='POST',
                                 headers={'Content-Type': 'application/json', 'X-Livewire': 'true', 'X-CSRF-TOKEN': tok,
                                          'Accept': 'text/html, application/xhtml+xml'})
    r = json.loads(op.open(req, timeout=60).read().decode('utf-8'))
    # merge memo for chained calls
    memo = comp['serverMemo']
    for k, v in r.get('serverMemo', {}).items():
        if k == 'data': memo['data'].update(v)
        else: memo[k] = v
    return r

if __name__ == '__main__':
    mode = sys.argv[1]
    tok, comps = page(sys.argv[3] if len(sys.argv) > 3 else '/')
    comp = comps[0]
    if mode == 'search':
        r = call(tok, comp, [{'type': 'syncInput', 'payload': {'id': 'a1', 'name': 'search', 'value': sys.argv[2]}}])
        h = r['effects'].get('html', '')
        print(sorted(set(re.findall(r"set\('([^']+)'\)", h))))
    elif mode == 'group':
        r = call(tok, comp, [{'type': 'callMethod', 'payload': {'id': 'a1', 'method': 'set', 'params': [sys.argv[2]]}}])
        k = int(sys.argv[4]) if len(sys.argv) > 4 else 0
        for n in range(abs(k)):
            r = call(tok, comp, [{'type': 'callMethod', 'payload': {'id': 'a2', 'method': 'addWeek' if k > 0 else 'minusWeek', 'params': []}}])
            if len(sys.argv) > 6 and comp['serverMemo']['data'].get('count'):
                break
        d = comp['serverMemo']['data']
        print('date', d.get('date'), 'numWeek', d.get('numWeek'), 'group', d.get('group'), 'count', d.get('count'))
        t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style)[\s\S]*?</\1>', '', r['effects'].get('html', ''))))
        i = t.find('событий')
        print('HTML:', t[max(0, i - 50):i + 2500])
        print('effects keys:', {k: (v if k != 'html' else len(v)) for k, v in r['effects'].items()})
        print('dispatches:', json.dumps(r['effects'].get('dispatches', r['effects'].get('emits', '')), ensure_ascii=False)[:1500])
        ev = d.get('events')
        print(json.dumps(ev, ensure_ascii=False, indent=1)[:int(sys.argv[5]) if len(sys.argv) > 5 else 6000])

