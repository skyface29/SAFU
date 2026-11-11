/* Анонимный счётчик «сейчас на сайте» для arktika-app.ru (сервер — stats-api/pulse.js).
   Отправляет при открытии и потом раз в 5 минут, пока вкладка открыта и видна: случайный номер этого браузера и
   название раздела. Ни имени, ни IP, ни того, что открыто на странице, не отправляет.
   В ответ может прийти объявление из админки — тогда оно показывается внизу страницы (закрыл — больше не появится).
   Подключение: <script src="../pulse.js" data-section="raspisanie" defer></script> */
(function () {
  'use strict';
  var PULSE = 'https://functions.yandexcloud.net/d4e43red8p3b1m9jftnf';   // функция arktika-pulse в Yandex Cloud; пусто — счётчик выключен
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

  var COLORS = { info: '#5aa0ff', warn: '#f6c25b', ok: '#46e0a6' };
  function showBanner(b) {
    if (!b || !b.text) return;
    try { if (localStorage.getItem('arktika.banner.closed') === b.id) return; } catch (e) { /* ничего */ }
    var old = document.getElementById('arktika-banner');
    if (old) { if (old.getAttribute('data-id') === b.id) return; old.remove(); }
    var el = document.createElement('div');
    el.id = 'arktika-banner'; el.setAttribute('data-id', b.id); el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translate(-50%,24px);opacity:0;' +
      'z-index:2147483000;max-width:min(680px,calc(100vw - 24px));display:flex;align-items:flex-start;gap:12px;padding:13px 14px 13px 16px;' +
      'border-radius:16px;background:rgba(10,14,25,.92);color:#eef2fb;font:500 14.5px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'box-shadow:0 18px 50px -12px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.1);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
      'transition:transform .5s cubic-bezier(.16,1,.3,1),opacity .4s';
    var dot = document.createElement('span');
    dot.style.cssText = 'flex:none;width:9px;height:9px;margin-top:6px;border-radius:50%;background:' + (COLORS[b.kind] || COLORS.info) + ';box-shadow:0 0 10px ' + (COLORS[b.kind] || COLORS.info);
    var txt = document.createElement('span'); txt.textContent = b.text; txt.style.cssText = 'flex:1;min-width:0';
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Закрыть'); x.textContent = '×';
    x.style.cssText = 'flex:none;border:0;background:none;color:#8f9db4;font:400 22px/1 system-ui;cursor:pointer;padding:0 2px;margin-top:-2px';
    x.onclick = function () { try { localStorage.setItem('arktika.banner.closed', b.id); } catch (e) { /* ничего */ } el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 400); };
    el.appendChild(dot); el.appendChild(txt); el.appendChild(x);
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transform = 'translate(-50%,0)'; el.style.opacity = '1'; }); });
  }

  var last = 0;
  function beat() {
    if (document.visibilityState !== 'visible' || Date.now() - last < 240000) return;
    last = Date.now();
    try {
      fetch(PULSE, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ s: id, p: section }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (d && d.b) showBanner(d.b); })
        .catch(function () {});
    } catch (e) { /* старый браузер — не считаем */ }
  }
  beat();
  setInterval(beat, 300000);
  document.addEventListener('visibilitychange', beat);
})();
