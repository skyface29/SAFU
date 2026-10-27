// Статус сервисов САФУ для arktika-app.ru/status/ — Cloudflare Worker (бесплатный план).
//  • раз в 5 минут (Cron Trigger) проверяет сервисы и пишет итог в KV (одна запись за проверку — ~288 в сутки при лимите 1000)
//  • GET /status.json — текущее состояние, история сбоев за 60 дней и доступность по дням за 30 дней
// Как развернуть — README.md рядом.

const SERVICES = [
  // mark — что должно быть на странице, если сервис реально работает (а не отдал заглушку или ошибку)
  { id: 'ruz', name: 'РУЗ', about: 'Расписание занятий', url: 'https://ruz.narfu.ru/', mark: /Расписание учебных занятий/i },
  { id: 'sakai', name: 'Sakai', about: 'Курсы и задания', url: 'https://sakai.narfu.ru/portal', mark: /Sakai/i },
  { id: 'lk', name: 'Личный кабинет', about: 'Зачётка, приказы, справки', url: 'https://lk.narfu.ru/', mark: /Личный кабинет/i },
  { id: 'site', name: 'Сайт narfu.ru', about: 'Новости, документы', url: 'https://narfu.ru/', mark: /САФУ|Северный \(Арктический\)/i },
  { id: 'mail', name: 'Почта', about: 'edu.narfu.ru', url: 'https://edu.narfu.ru/', mark: /edu\.narfu\.ru|Pronto/i },
];
const TIMEOUT = 20000, SLOW = 8000;          // дольше 8 с — «медленно», 20 с без ответа — «не работает»
const KEEP_INCIDENTS = 60 * 864e5, KEEP_DAYS = 30;
const TZ = 3 * 3600e3;                        // дни считаем по Москве
const UA = 'Mozilla/5.0 (arktika-app.ru status; +https://arktika-app.ru/status/)';

// читаем только начало страницы (до 64 КБ) — этого хватает, чтобы найти метку, и не тратим лимит CPU
async function probe(s) {
  const t0 = Date.now();
  try {
    const r = await fetch(s.url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT), cf: { cacheTtl: 0 } });
    let text = '', got = 0;
    if (r.body) {
      const reader = r.body.getReader(), dec = new TextDecoder();
      while (got < 65536) {
        const { done, value } = await reader.read(); if (done) break;
        got += value.length; text += dec.decode(value, { stream: true });
        if (s.mark.test(text)) break;
      }
      reader.cancel().catch(() => {});
    }
    const ms = Date.now() - t0, ok = r.ok && s.mark.test(text);
    return { ok, ms, code: r.status, why: ok ? '' : (r.ok ? 'страница без нужного содержимого' : 'ошибка ' + r.status) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, code: 0, why: e && e.name === 'TimeoutError' ? 'не ответил за 20 с' : 'нет соединения' };
  }
}

async function check(env) {
  const prev = (await env.STATUS.get('state', 'json')) || { services: {}, incidents: [], days: {} };
  const now = Date.now(), day = new Date(now + TZ).toISOString().slice(0, 10);
  // проверяем всё параллельно; упавшее — ещё раз через 10 с, чтобы не поднимать тревогу из-за одного сбоя сети
  let res = await Promise.all(SERVICES.map(probe));
  const again = SERVICES.map((s, i) => res[i].ok ? null : s);
  if (again.some(Boolean)) {
    await new Promise(r => setTimeout(r, 10000));
    const r2 = await Promise.all(again.map(s => s ? probe(s) : null));
    res = res.map((x, i) => r2[i] || x);
  }
  const services = {}, incidents = (prev.incidents || []).filter(x => !x.end || x.end > now - KEEP_INCIDENTS);
  const days = prev.days || {};
  days[day] = days[day] || {};
  SERVICES.forEach((s, i) => {
    const r = res[i], p = prev.services[s.id] || {};
    const state = !r.ok ? 'down' : r.ms > SLOW ? 'slow' : 'up';
    const changed = (p.state === 'down') !== (state === 'down');
    services[s.id] = { state, ms: r.ms, code: r.code, why: r.why, since: changed || !p.since ? now : p.since };
    // сбой: начало — первая проверка, где сервис не работает; конец — первая, где снова работает
    const open = incidents.find(x => x.id === s.id && !x.end);
    if (state === 'down' && !open) incidents.push({ id: s.id, start: now, why: r.why });
    if (state !== 'down' && open) open.end = now;
    const d = days[day][s.id] || [0, 0]; d[1]++; if (state !== 'down') d[0]++; days[day][s.id] = d;
  });
  for (const k of Object.keys(days).sort().slice(0, -KEEP_DAYS)) delete days[k];
  const state = { checked: now, services, incidents: incidents.slice(-300), days };
  await env.STATUS.put('state', JSON.stringify(state));
  return state;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
function out(state) {
  return {
    checked: state.checked,
    every: 5,
    services: SERVICES.map(s => ({ id: s.id, name: s.name, about: s.about, url: s.url, ...(state.services[s.id] || { state: 'unknown' }) })),
    incidents: state.incidents.slice().reverse(),
    days: state.days,
  };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(check(env)); },
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (u.pathname === '/status.json') {
      let state = await env.STATUS.get('state', 'json');
      if (!state) state = await check(env);   // самый первый запрос до первой проверки по расписанию
      return new Response(JSON.stringify(out(state)), {
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
      });
    }
    return Response.redirect('https://arktika-app.ru/status/', 302);
  },
};
