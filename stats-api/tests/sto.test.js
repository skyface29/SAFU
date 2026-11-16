// Тесты статистики оформления по СТО в функции arktika-pulse (база в памяти, без Yandex Cloud).
// Запуск: node stats-api/tests/sto.test.js
const { handle, memoryDb, resetSto } = require('../pulse.js')._test;
let fail = 0, n = 0;
const ok = (name, cond, info) => { n++; if (!cond) { fail++; console.log('✗', name, info !== undefined ? JSON.stringify(info) : ''); } };
const UA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' };
const ADMIN = Object.assign({ 'X-Admin-Token': 'secret' }, UA);
process.env.ADMIN_TOKEN = 'secret';
const T0 = Date.UTC(2026, 10, 16, 8, 0, 0);   // 16 ноября 2026, 11:00 по Москве

(async () => {
  resetSto(); let db = memoryDb();
  const sto = (body, now = T0, h = UA) => handle('POST', Object.assign({ ev: 'sto', s: 'browser-0001' }, body), h, db, now);

  let [code, r] = await handle('POST', { ev: 'sto-count' }, UA, db, T0);
  ok('пустая база: всё по нулям', code === 200 && r.n === 0 && r.fixed === 0 && r.today.n === 0, r);

  [code, r] = await sto({ fixed: 206, kind: 'prakt' });
  ok('первая работа: всего 1, исправлено 206', r.n === 1 && r.fixed === 206 && r.today.n === 1 && r.today.f === 206, r);
  [, r] = await sto({ fixed: 10, kind: 'referat' });
  ok('вторая работа складывается', r.n === 2 && r.fixed === 216 && r.today.n === 2, r);

  [, r] = await handle('POST', { ev: 'sto-count' }, UA, db, T0);
  ok('sto-count только читает', r.n === 2 && r.fixed === 216, r);

  [, r] = await sto({ fixed: -50 });
  ok('отрицательное число исправлений → 0', r.fixed === 216 && r.n === 3, r);
  [, r] = await sto({ fixed: 1e9 });
  ok('огромное число исправлений обрезается до 2000', r.fixed === 2216, r);
  [, r] = await sto({ fixed: 'abc' });
  ok('не число → 0', r.fixed === 2216 && r.n === 5, r);
  [, r] = await sto({ fixed: 3, kind: '<script>' });
  ok('мусор вместо вида не ломает', r.n === 6, r);

  [, r] = await sto({ fixed: 5, s: 'x' });
  ok('без номера браузера не считаем', r.n === 6, r);
  [, r] = await sto({ fixed: 5 }, T0, { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  ok('робота не считаем', r.n === 6, r);

  // не больше 30 работ в сутки с одного браузера
  resetSto(); db = memoryDb();
  for (let i = 0; i < 40; i++) [, r] = await sto({ fixed: 1, s: 'flood-browser' });
  ok('потолок 30 работ в сутки с браузера', r.n === 30 && r.fixed === 30, r);
  [, r] = await sto({ fixed: 1, s: 'other-browser' });
  ok('другой браузер считается', r.n === 31, r);
  [, r] = await sto({ fixed: 1, s: 'flood-browser' }, T0 + 864e5);
  ok('на следующий день — снова считается', r.n === 32, r);
  ok('«сегодня» начинается заново в полночь по Москве', r.today.n === 1, r.today);

  // сутки — по Москве: 23:30 МСК 16-го и 00:30 МСК 17-го — разные дни
  resetSto(); db = memoryDb();
  const late = Date.UTC(2026, 10, 16, 20, 30), early = Date.UTC(2026, 10, 16, 21, 30);
  await sto({ fixed: 1, s: 'night-owl-01' }, late);
  [, r] = await sto({ fixed: 1, s: 'night-owl-02' }, early);
  ok('после полуночи по Москве — новый день', r.today.n === 1 && r.n === 2, r);

  // админка
  resetSto(); db = memoryDb();
  await sto({ fixed: 100, kind: 'prakt', s: 'admin-test-1' }, T0 - 864e5);
  await sto({ fixed: 50, kind: 'prakt', s: 'admin-test-1' });
  await sto({ fixed: 7, kind: 'kursovaya', s: 'admin-test-2' });
  [code, r] = await handle('GET', null, ADMIN, db, T0);
  ok('админка: ответ 200', code === 200, code);
  const s = r.sto;
  ok('админка: всего и исправлено', s && s.total === 3 && s.fixed === 157, s);
  ok('админка: 14 дней, последний — сегодня', s.days.length === 14 && s.days[13].day === '2026-11-16' && s.days[13].n === 2 && s.days[12].n === 1, s.days.slice(-2));
  ok('админка: виды работ за две недели', s.kinds.prakt === 2 && s.kinds.kursovaya === 1, s.kinds);
  ok('админка: сегодня', s.today.n === 2 && s.today.f === 57, s.today);
  [code] = await handle('GET', null, UA, db, T0);
  ok('без пароля админка закрыта', code === 403, code);
  [code] = await handle('GET', null, Object.assign({}, UA, { 'X-Admin-Token': 'wrong' }), db, T0);
  ok('неверный пароль', code === 403, code);

  // кэш статистики в админке: второй запрос через минуту не перечитывает базу
  await sto({ fixed: 1, s: 'admin-test-3' });
  [, r] = await handle('GET', null, ADMIN, db, T0 + 60e3);
  ok('админка: кэш на 2 минуты', r.sto.total === 3, r.sto.total);
  [, r] = await handle('GET', null, ADMIN, db, T0 + 180e3);
  ok('админка: через 3 минуты — свежие цифры', r.sto.total === 4, r.sto.total);

  // битые данные в хранилище не роняют функцию
  resetSto(); db = memoryDb(); await db.setKv('sto.d.2026-11-16', '{не json');
  [code, r] = await sto({ fixed: 1, s: 'broken-kv-01' });
  ok('битая запись дня → начинаем день заново', code === 200 && r.today.n === 1, r);

  // обычный счётчик посещений не задет
  [code] = await handle('POST', { s: 'visitor-0001', p: 'antiplagiat' }, UA, db, T0);
  ok('счётчик посещений работает', code === 200, code);

  console.log(fail ? `ПРОВАЛ: ${fail} из ${n}` : `${n} из ${n} проверок пройдено`);
  process.exit(fail ? 1 : 0);
})();
