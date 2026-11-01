# Загрузчик PDF колледжей

narfu.ru не открывается с зарубежных серверов (GitHub Actions получает 404), поэтому PDF колледжа Петра I
и ТК Северодвинска скачивает этот загрузчик из России и кладёт в ветку `college-inbox`. Сборщик зеркала
(`ruz.yml`) читает их оттуда при каждом запуске. Загрузчик скачивает только новые файлы и ничего не удаляет.

Нужен токен GitHub: github.com → Settings → Developer settings → Fine-grained tokens → Generate new token,
Repository access — только `skyface29/SAFU`, Permissions → Contents: **Read and write**. Срок — до года.

## Вариант 1. Функция Yandex Cloud (рекомендуется: работает, даже когда компьютер выключен)

1. `node ruz/colleges/fetcher/pack.mjs` → `ruz/colleges/fetcher/dist/index.js`.
2. Cloud Functions → Создать функцию `college-fetcher` (не публичная) → Node.js 22, точка входа `index.handler`,
   код — содержимое `dist/index.js` в файл `index.js`. Таймаут 300 с, память 256 МБ.
3. Переменная окружения `GITHUB_TOKEN` — токен (лучше секретом Lockbox).
4. Триггеры → Создать триггер «Таймер», cron `0 * ? * * *` (раз в час), функция `college-fetcher`,
   сервисный аккаунт с ролью `functions.functionInvoker`.
5. Проверка: «Тестирование» функции → в ответе `{"added": N}`, в репозитории появилась ветка `college-inbox`.

Укладывается в бесплатный лимит: ~720 вызовов в месяц по нескольку секунд.

## Вариант 2. Задача на компьютере с Windows

Нужен Node.js 22. Один раз в PowerShell из папки репозитория:

```powershell
setx ARKTIKA_GITHUB_TOKEN "<токен>"
schtasks /Create /TN "Arktika college PDF" /SC HOURLY /TR "cmd /c set GITHUB_TOKEN=%ARKTIKA_GITHUB_TOKEN% && node \"%CD%\ruz\colleges\fetcher\fetch.mjs\""
```

Работает, только пока компьютер включён; пропущенные часы догонит следующий запуск
(замены Северодвинска висят на сайте 1–2 дня).
