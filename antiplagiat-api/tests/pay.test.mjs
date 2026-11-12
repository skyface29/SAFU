// node --test antiplagiat-api/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { handle, handleResult, memoryDb, payUrl, resultOk, md5, hmac, codeKey, PLANS } = require('../pay.js')._test;

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
  assert.equal(s, 200); assert.equal(d.ready, false); assert.equal(d.plans.length, 3);
  assert.equal((await handle({ action: 'create', plan: 'one' }, db, {}, 'ip'))[0], 503);
});

test('оплата антиплагиата: заказ → уведомление → код → билеты', async () => {
  const db = memoryDb(), now = Date.now();
  const [s, d] = await handle({ action: 'create', plan: 'five' }, db, env, 'ip1', now);
  assert.equal(s, 200);
  assert.equal((await handle({ action: 'status', order: d.order }, db, env, 'ip1', now))[1].paid, false);
  assert.equal((await handle({ action: 'status', order: d.inv + '.wrong' }, db, env, 'ip1', now))[0], 404);

  assert.equal((await handleResult(notify(d.inv, '149.00', 'bad'), db, env, now)).statusCode, 400, 'чужая подпись');
  assert.equal((await handleResult(notify(d.inv, '1.00'), db, env, now)).statusCode, 400, 'другая сумма');
  const ok = await handleResult(notify(d.inv, '149.000000'), db, env, now);
  assert.equal(ok.statusCode, 200); assert.equal(ok.body, 'OK' + d.inv);
  assert.equal((await handleResult(notify(d.inv, '149.00'), db, env, now)).body, 'OK' + d.inv, 'повтор уведомления');

  const st = (await handle({ action: 'status', order: d.order }, db, env, 'ip1', now))[1];
  assert.equal(st.paid, true); assert.match(st.code, /^AIS-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.equal(st.left, 5);

  const lower = st.code.toLowerCase().replace(/-/g, ' ');
  for (let i = 4; i >= 0; i--) {
    const [ts, t] = await handle({ action: 'ticket', code: lower }, db, env, 'ip1', now);
    assert.equal(ts, 200); assert.equal(t.left, i);
    const [payload, sig] = t.ticket.split('.');
    assert.equal(sig, crypto.createHmac('sha256', 'tk').update(payload).digest('hex'));
  }
  const [es, e] = await handle({ action: 'ticket', code: st.code }, db, env, 'ip1', now);
  assert.equal(es, 402); assert.equal(e.left, 0);
  assert.equal((await handle({ action: 'ticket', code: st.code }, db, env, 'ip1', now + PLANS.five.days * 86400e3 + 1))[0], 402);
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
