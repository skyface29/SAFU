#!/usr/bin/env python3
# Проверка синхронизации Mac ↔ iPhone в сборке: скрипт ведёт себя как iPhone (PCDiscovery.swift, PCSync.swift).
# Находит Mac (/v2/hello), связывается без QR-кода (X25519 + HKDF, как телефон; в режиме --smoke-tour
# Mac сам нажимает «Разрешить»), шифрует AES-256-GCM и присылает заметку и задачу, а потом проверяет,
# что Mac вернул их в общей версии и что повторный обмен ничего не теряет.
import base64, hashlib, json, sys, time, urllib.request, urllib.error, uuid

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:47823'


def call(method, path, body=None, headers=None, timeout=40):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers or {})
    if data is not None and 'Content-Type' not in (headers or {}):
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get('Content-Type', ''), r.read()


def j(method, path, body=None):
    st, _, raw = call(method, path, body)
    assert st == 200, (path, st)
    return json.loads(raw)


def b64url_dec(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def seal(key, plain, aad):
    import os
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, plain, aad.encode())


def unseal(key, sealed, aad):
    return AESGCM(key).decrypt(sealed[:12], sealed[12:], aad.encode())


hello = j('GET', '/v2/hello')
print('hello:', hello)
assert hello['app'] == 'arktika' and hello['v'] == 2

# связка без QR-кода
start = j('POST', '/v2/pair/start', {'device': 'iPhone из проверки'})
me = X25519PrivateKey.generate()
my_pub = me.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
ans = j('POST', '/v2/pair/key', {'sid': start['sid'], 'pub': base64.b64encode(my_pub).decode()})
pc_pub = base64.b64decode(ans['pub'])
assert base64.b64encode(hashlib.sha256(pc_pub).digest()).decode() == start['commit'], 'commit'
shared = me.exchange(X25519PublicKey.from_public_bytes(pc_pub))
k = HKDF(algorithm=hashes.SHA256(), length=32, salt=b'arktika-pair-v1', info=my_pub + pc_pub).derive(shared)
code = '%04d' % (int.from_bytes(hashlib.sha256(b'arktika-sas|' + my_pub + pc_pub).digest()[:4], 'big') % 10000)
assert code == ans.get('code'), ('code', code, ans.get('code'))
print('code:', code)
grant = None
for _ in range(10):
    w = j('POST', '/v2/pair/wait', {'sid': start['sid']})
    if w['status'] == 'ok':
        grant = json.loads(unseal(k, base64.b64decode(w['box']), 'arktika pair'))
        break
    assert w['status'] == 'wait', w
assert grant, 'no grant'
print('grant: id', grant['id'], 'hosts', grant['hosts'], 'port', grant['port'], 'name', grant['name'])
key = b64url_dec(grant['key'])
assert len(key) == 32
hello2 = j('GET', '/v2/hello')
assert hello2['pair'] == hashlib.sha256(grant['id'].encode()).hexdigest()[:12], 'pair tag'

# обмен: телефон присылает заметку и задачу
now = int(time.time() * 1000)
note_id = str(uuid.uuid4()).upper()
task_id = str(uuid.uuid4()).upper()
note = {'id': note_id, 'title': 'Заметка с iPhone', 'text': 'проверка синхронизации', 'items': [], 'subject': '',
        'color': 0, 'pinned': False, 'created': now, 'updated': now}
task = {'id': task_id, 'title': 'Задача с iPhone', 'subject': 'Матанализ', 'due': now + 86_400_000, 'note': '',
        'done': False, 'remind': True}


def stamps(item):
    return {item['id'].lower(): {f: now for f in item if f != 'id'}}


def sync(data):
    body = json.dumps({'device': 'iPhone из проверки', 'data': data}).encode()
    st, ctype, raw = call('POST', '/v2/sync', seal(key, body, 'POST /v2/sync'),
                          {'X-Arktika-Pair': grant['id'], 'Content-Type': 'application/octet-stream'})
    assert st == 200 and ctype.startswith('application/octet-stream'), (st, ctype)
    return json.loads(unseal(key, raw, 'R POST /v2/sync'))


r = sync({'notes': {'items': [note], 'm': stamps(note), 'tomb': {}},
          'tasks': {'items': [task], 'm': stamps(task), 'tomb': {}},
          'homework': {'items': [], 'm': {}, 'tomb': {}}})
print('answer keys:', sorted(r.keys()), 'pc', r.get('pc'), 'hosts', r.get('hosts'), 'port', r.get('port'))
notes = r['data']['notes']['items']
tasks = r['data']['tasks']['items']
assert any(n['id'].lower() == note_id.lower() and n['title'] == note['title'] for n in notes), notes
assert any(t['id'].lower() == task_id.lower() and t['subject'] == 'Матанализ' for t in tasks), tasks
print('sync 1: notes', len(notes), 'tasks', len(tasks), 'homework', len(r['data']['homework']['items']))

# второй обмен — телефон отмечает задачу сделанной позже: Mac должен принять правку
task2 = dict(task, done=True)
m2 = stamps(task)
m2[task_id.lower()]['done'] = now + 5000
r2 = sync({'tasks': {'items': [task2], 'm': m2, 'tomb': {}}})
t2 = [t for t in r2['data']['tasks']['items'] if t['id'].lower() == task_id.lower()]
assert t2 and t2[0]['done'] is True, t2
n2 = [n for n in r2['data']['notes']['items'] if n['id'].lower() == note_id.lower()]
assert n2, 'note lost on Mac after second sync'
print('sync 2: done принят, заметка на месте')

# чужой ключ — отказ
st = None
try:
    call('POST', '/v2/sync', seal(bytes(32), b'{}', 'POST /v2/sync'), {'X-Arktika-Pair': 'wrong'})
except urllib.error.HTTPError as e:
    st = e.code
assert st == 403, st
print('OK: синхронизация Mac ↔ iPhone работает')
