// Разовая проверка (удалить перед слиянием): открывается ли ttt.narfu.ru («Расписание СПО») с серверов GitHub
const UA = 'Mozilla/5.0 (arktika-app.ru schedule mirror; +https://arktika-app.ru/raspisanie/)';
for (const u of ['https://ttt.narfu.ru/', 'https://narfu.ru/sf/stc/forstud/']) {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' }, signal: AbortSignal.timeout(25000) });
    const t = await r.text();
    console.log(r.status, t.length, u, /livewire/i.test(t) ? 'livewire: yes' : '');
  } catch (e) { console.log('ERR', e.cause?.code || e.message, u); }
}
