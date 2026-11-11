/* Анонимный счётчик «сейчас на сайте» для arktika-app.ru (сервер — stats-api/pulse.js).
   Отправляет при открытии и потом раз в 5 минут, пока вкладка открыта и видна: случайный номер этого браузера и название раздела.
   Ни имени, ни IP, ни того, что открыто на странице, не отправляет. Подключение:
   <script src="../pulse.js" data-section="raspisanie" defer></script> */
(function () {
  'use strict';
  var PULSE = '';   // адрес функции Yandex Cloud; пусто — счётчик выключен
  var me = document.currentScript;
  var section = (me && me.getAttribute('data-section')) || location.pathname.split('/')[1] || 'main';
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) PULSE = '/pulse';   // проверка у себя (site_dev.py)
  if (!PULSE || !/^[a-z]{2,20}$/.test(section)) return;
  var id;
  try { id = localStorage.getItem('arktika.pid'); } catch (e) { /* без хранилища — новый номер */ }
  if (!id || !/^[\w-]{8,40}$/.test(id)) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { localStorage.setItem('arktika.pid', id); } catch (e) { /* ничего */ }
  }
  var last = 0;
  function beat() {
    if (document.visibilityState !== 'visible' || Date.now() - last < 240000) return;
    last = Date.now();
    try {
      fetch(PULSE, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ s: id, p: section }) }).catch(function () {});
    } catch (e) { /* старый браузер — не считаем */ }
  }
  beat();
  setInterval(beat, 300000);
  document.addEventListener('visibilitychange', beat);
})();
