// Разовая разведка: какие учебные подразделения есть в РУЗ и как колледжи САФУ публикуют расписание.
const UA = { 'User-Agent': 'Mozilla/5.0 (arktika-app.ru schedule mirror; +https://arktika-app.ru/raspisanie/)', 'Accept-Language': 'ru' };
const get = async u => { try { const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(30000) }); return { ok: r.ok, status: r.status, url: r.url, text: await r.text() }; } catch (e) { return { ok: false, status: String(e.message), url: u, text: '' }; } };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const links = (html, base) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => { let h = m[1]; try { h = new URL(h, base).href; } catch {} return [h, strip(m[2]).slice(0, 120)]; });
const sec = t => console.log('\n===== ' + t);

const ruz = await get('https://ruz.narfu.ru/');
sec('RUZ main ' + ruz.status);
const insts = links(ruz.text, ruz.url).filter(([h]) => /institution=\d+/.test(h));
for (const [h, t] of insts) console.log(h.match(/institution=(\d+)/)[1], '|', t);
const ids = [...new Set([...insts.map(([h]) => +h.match(/institution=(\d+)/)[1]), 23, 33, 35])];
for (const id of ids) {
  const p = await get(`https://ruz.narfu.ru/?groups&institution=${id}`);
  const g = [...new Set([...p.text.matchAll(/group=(\d+)/g)].map(m => m[1]))];
  const names = links(p.text, p.url).filter(([h]) => /group=\d+/.test(h)).map(([, t]) => t);
  console.log(`inst ${id}: status ${p.status}, groups ${g.length}; e.g.`, names.slice(0, 6).join(' ; '));
  if (g[0]) { const tt = await get(`https://ruz.narfu.ru/?timetable&group=${g[0]}`); console.log(`  first group page: ${tt.status}, has weekday: ${/понедельник|вторник|среда|четверг|пятница|суббота/i.test(tt.text)}, len ${tt.text.length}`); }
}

const pages = [
  'https://narfu.ru/ltk/obrazovatelnaya/raspisanie/',
  'https://narfu.ru/ltk/',
  'https://narfu.ru/sf/',
  'https://narfu.ru/sf/tk/',
  'https://narfu.ru/university/structure/',
  'https://narfu.ru/university/',
  'https://narfu.ru/',
];
for (const u of pages) {
  const p = await get(u);
  sec(`${u} -> ${p.status} ${p.url} len ${p.text.length}`);
  const L = links(p.text, p.url);
  const interesting = L.filter(([h, t]) => /колледж|college|ltk|raspis|расписан|\.xlsx?\b|\.pdf\b|\.docx?\b|docs\.google|disk\.yandex|cloud\.mail|spo|СПО|tk|филиал/i.test(h + ' ' + t));
  const seen = new Set();
  for (const [h, t] of interesting) { if (seen.has(h)) continue; seen.add(h); console.log(' ', t, '=>', h); if (seen.size > 120) break; }
  if (u.includes('raspisanie')) { console.log('--- text ---'); console.log(strip(p.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')).slice(0, 6000)); }
}
