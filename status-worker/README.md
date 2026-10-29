# Статус сервисов САФУ — Cloudflare Worker

Каждые 5 минут проверяет РУЗ, Sakai, личный кабинет и почту (сайт narfu.ru отвечает проверке ошибкой 404, поэтому не проверяется). Результат отдаёт по адресу `/status.json`,
его показывает страница https://arktika-app.ru/status/.

Работает на бесплатном плане Cloudflare:
- 288 проверок в сутки — это 288 записей в KV при лимите 1000;
- запросы страницы статуса — до 100 000 в сутки, ответ кэшируется на минуту.

## Как развернуть (один раз, ~5 минут, всё в браузере)

1. **Хранилище.** dash.cloudflare.com → Storage & Databases → **KV** → Create namespace → имя `safu-status`.
2. **Воркер.** Compute (Workers) → **Workers & Pages** → Create → Create Worker → имя `safu-status` → Deploy.
   Потом **Edit code**, удалить всё, вставить содержимое `worker.js` и нажать **Deploy**.
3. **Подключить хранилище.** В воркере: Settings → **Bindings** → Add → KV namespace.
   Имя переменной (Variable name): `STATUS`, namespace: `safu-status` → Save.
4. **Расписание.** В воркере: Settings → **Trigger events** (Triggers) → Add → Cron Triggers → `*/5 * * * *` → Add.
5. **Проверка.** Открыть `https://safu-status.<поддомен>.workers.dev/status.json` (сейчас: https://safu-status.zarubin-kirillcka.workers.dev).
   Должен прийти JSON со списком сервисов. Этот адрес нужно вписать в `site/status/index.html` (константа `WORKER`).

## Что считается «работает»

Сервис ответил за 20 секунд, код ответа 2xx/3xx, и на странице есть ожидаемый текст. Например, у РУЗа это
«Расписание учебных занятий». Так заглушка «502 Bad Gateway» не засчитается как «работает».

Если сервис упал, через 10 секунд он проверяется ещё раз. Тревога поднимается, только если упал и второй раз.
Ответ дольше 8 секунд — это «медленно».
