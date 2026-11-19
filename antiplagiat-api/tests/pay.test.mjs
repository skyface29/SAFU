// node --test antiplagiat-api/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { handle, handleResult, memoryDb, payUrl, resultOk, md5, hmac, codeKey, PLANS, UNLIM } = require('../pay.js')._test;

const env = { ROBO_LOGIN: 'shop', ROBO_PASS1: 'p1', ROBO_PASS2: 'p2', TICKET_SECRET: 'tk', BOT_SECRET: 'bs', BOT_WEBHOOK_URL: 'https://bot.example/paid' };
const notify = (inv, sum, pass = 'p2') => ({ OutSum: sum, InvId: String(inv), SignatureValue: md5(`${sum}:${inv}:${pass}`).toUpperCase() });

test('ссылка на оплату подписана Паролем №1 вместе с Receipt', () => {
  const u = new URL(payUrl(env, 123, 49, 'Полная проверка'));
  const p = u.searchParams;
  assert.equal(p.get('OutSum'), '49.00');
  const receipt = p.get('Receipt');
  assert.deepEqual(JSON.parse(decodeURIComponent(receipt)).items[0].sum, 49);
  assert.equal(p.get('SignatureValue'), md5(`shop:49.00:123:${receipt}:p1`));
  assert.equal(p.get('IsTest'), null);
});

test('без настроек оплата закрыта, тарифы видны', async () => {
  const db = memoryDb();
  const [s, d] = await handle({ action: 'plans' }, db, {}, 'ip');
  assert.equal(s, 200); assert.equal(d.ready, false);
  assert.deepEqual(d.plans.map(p => p.id + ':' + p.price), ['one:79', 'iceberg:199', 'combo:349', 'semester:599', 'teacher:990']);
  assert.equal((await handle({ action: 'create', plan: 'one' }, db, {}, 'ip'))[0], 503);
});

test('оплата антиплагиата: заказ → уведомление → код → билеты', async () => {
  const db = memoryDb(), now = Date.now();
  assert.equal((await handle({ action: 'create', plan: 'five' }, db, env, 'ip1', now))[0], 400, 'старый тариф не продаётся');
  const [s, d] = await handle({ action: 'create', plan: 'semester' }, db, env, 'ip1', now);
  assert.equal(s, 200);
  assert.equal((await handle({ action: 'status', order: d.order }, db, env, 'ip1', now))[1].paid, false);
  assert.equal((await handle({ action: 'status', order: d.inv + '.wrong' }, db, env, 'ip1', now))[0], 404);

  assert.equal((await handleResult(notify(d.inv, '599.00', 'bad'), db, env, now)).statusCode, 400, 'чужая подпись');
  assert.equal((await handleResult(notify(d.inv, '1.00'), db, env, now)).statusCode, 400, 'другая сумма');
  const ok = await handleResult(notify(d.inv, '599.000000'), db, env, now);
  assert.equal(ok.statusCode, 200); assert.equal(ok.body, 'OK' + d.inv);
  assert.equal((await handleResult(notify(d.inv, '599.00'), db, env, now)).body, 'OK' + d.inv, 'повтор уведомления');

  const st = (await handle({ action: 'status', order: d.order }, db, env, 'ip1', now))[1];
  assert.equal(st.paid, true); assert.match(st.code, /^AIS-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.equal(st.left, 15); assert.equal(st.fmt, UNLIM); assert.equal(st.def, UNLIM);

  const lower = st.code.toLowerCase().replace(/-/g, ' ');
  for (let i = 14; i >= 0; i--) {
    const [ts, t] = await handle({ action: 'ticket', code: lower }, db, env, 'ip1', now);
    assert.equal(ts, 200); assert.equal(t.left, i);
    const [payload, sig] = t.ticket.split('.');
    assert.equal(sig, crypto.createHmac('sha256', 'tk').update(payload).digest('hex'));
  }
  const [es, e] = await handle({ action: 'ticket', code: st.code }, db, env, 'ip1', now);
  assert.equal(es, 402); assert.equal(e.left, 0);
  assert.equal((await handle({ action: 'ticket', code: st.code }, db, env, 'ip1', now + PLANS.semester.days * 86400e3 + 1))[0], 402);
  assert.equal((await handle({ action: 'balance', code: 'AIS-0000-0000' }, db, env, 'ip1', now))[0], 404);
});

test('заказ бота: только с подписью сервера бота, оплата пересылается боту', async () => {
  const db = memoryDb(), now = Date.now();
  assert.equal((await handle({ action: 'create', purpose: 'bot', order_id: 'z1', amount: 500, sig: 'x' }, db, env, 'ip'))[0], 403);
  const [s, d] = await handle({ action: 'create', purpose: 'bot', order_id: 'z1', amount: 500, description: 'Лабораторная', sig: hmac('bs', 'z1:500.00') }, db, env, 'ip', now);
  assert.equal(s, 200);
  let sent = null;
  const fail = await handleResult(notify(d.inv, '500.00'), db, env, now, async () => ({ ok: false, status: 500 }));
  assert.equal(fail.statusCode, 502, 'бот не ответил — Robokassa повторит');
  const ok = await handleResult(notify(d.inv, '500.00'), db, env, now, async (url, init) => { sent = { url, init }; return { ok: true }; });
  assert.equal(ok.body, 'OK' + d.inv);
  assert.equal(sent.url, env.BOT_WEBHOOK_URL);
  assert.deepEqual(JSON.parse(sent.init.body), { order_id: 'z1', amount: '500.00', inv: d.inv, paid_at: now });
  assert.equal(sent.init.headers['X-Signature'], hmac('bs', sent.init.body));
});

test('подпись уведомления учитывает Shp_-параметры по алфавиту', () => {
  const p = { OutSum: '10.00', InvId: '7', Shp_b: '2', Shp_a: '1' };
  p.SignatureValue = md5('10.00:7:p2:Shp_a=1:Shp_b=2');
  assert.equal(resultOk(env, p), true);
  assert.equal(codeKey('ais-abcd-efgh'), 'AIS-ABCD-EFGH');
});

test('пакет «работа + защита»: проверка, оформление и защита списываются отдельно', async () => {
  const db = memoryDb(), now = Date.now();
  const [, d] = await handle({ action: 'create', plan: 'combo' }, db, env, 'ip2', now);
  await handleResult(notify(d.inv, '349.00'), db, env, now);
  const { code } = (await handle({ action: 'status', order: d.order }, db, env, 'ip2', now))[1];
  const bal = (await handle({ action: 'balance', code }, db, env, 'ip2', now))[1];
  assert.deepEqual([bal.left, bal.fmt, bal.def], [1, 1, 1]);

  const [fs, f] = await handle({ action: 'ticket', code, kind: 'format' }, db, env, 'ip2', now);
  assert.equal(fs, 200); assert.deepEqual([f.left, f.fmt, f.def], [1, 0, 1]);
  const [f2s, f2] = await handle({ action: 'ticket', code, kind: 'format' }, db, env, 'ip2', now);
  assert.equal(f2s, 402); assert.equal(f2.kind, 'format');
  assert.equal((await handle({ action: 'ticket', code, kind: 'defense' }, db, env, 'ip2', now))[0], 200);
  assert.equal((await handle({ action: 'ticket', code }, db, env, 'ip2', now))[0], 200, 'проверка — по умолчанию');
  assert.equal((await handle({ action: 'ticket', code, kind: 'weird' }, db, env, 'ip2', now))[0], 400);
});

test('«Полная проверка» за 79 ₽ не открывает оформление; «Семестр» не тратит безлимит', async () => {
  const db = memoryDb(), now = Date.now();
  const buy = async plan => {
    const [, d] = await handle({ action: 'create', plan }, db, env, 'ip3', now);
    await handleResult(notify(d.inv, PLANS[plan].price.toFixed(2)), db, env, now);
    return (await handle({ action: 'status', order: d.order }, db, env, 'ip3', now))[1].code;
  };
  const one = await buy('one');
  assert.equal((await handle({ action: 'ticket', code: one, kind: 'format' }, db, env, 'ip3', now))[0], 402);
  const sem = await buy('semester');
  for (let i = 0; i < 5; i++) assert.equal((await handle({ action: 'ticket', code: sem, kind: 'defense' }, db, env, 'ip3', now))[1].def, UNLIM);
});

test('заказ по старому тарифу, начатый до смены цен, всё равно выдаёт код', async () => {
  const db = memoryDb(), now = Date.now();
  await db.putOrder({ inv: 555, secret: 'x', purpose: 'antiplagiat', plan: 'five', ext: '', amount: '149.00', status: 'new', code: '', created: now, paid: 0 });
  assert.equal((await handleResult(notify(555, '149.00'), db, env, now)).body, 'OK555');
  const c = (await db.order(555)).code;
  assert.equal((await db.code(c)).left, 5);
});
