#!/usr/bin/env bash
# Стресс-тест Арктики для iPhone на симуляторе: первый запуск, «обезьяна» (XCUITest) по всему приложению,
# много холодных запусков, тема, размер шрифта, свернуть-развернуть, геопозиция, битые ссылки, пуши.
# Окружение: UDID (симулятор), APP (SAFU.app), XCTESTRUN, EVENTS. Аргумент — папка для результатов.
set -u
OUT="$1"
SIM="$UDID"
BID=ru.student.safuhub
EVENTS="${EVENTS:-1000}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/shots" "$OUT/stderr"
touch "$OUT/start.marker"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$OUT/steps.txt"; }
mark() { echo "$(date +%s) $1" >> "$OUT/phases.txt"; log "── $1"; }
alive() { xcrun simctl spawn "$SIM" launchctl list 2>/dev/null | grep -qF "UIKitApplication:$BID["; }
shot() { xcrun simctl io "$SIM" screenshot "$OUT/shots/$1.png" >/dev/null 2>&1 || true; }
# stderr каждого запуска — туда Swift пишет «Fatal error: …» перед падением
N=0
launch() { N=$(( N + 1 )); xcrun simctl launch --stderr="$OUT/stderr/$N.txt" "$SIM" "$BID" >/dev/null 2>&1; }
stop() { xcrun simctl terminate "$SIM" "$BID" >/dev/null 2>&1; }
check() {
    if alive; then log "   приложение живо после: $1"
    else log "   ПРИЛОЖЕНИЯ НЕТ после: $1"; echo "$1" >> "$OUT/dead_after.txt"; fi
}
# чистая установка с разрешениями
fresh() {
    stop
    xcrun simctl uninstall "$SIM" "$BID" >/dev/null 2>&1
    xcrun simctl install "$SIM" "$APP" || { log "не установилось"; echo install > "$OUT/FAILED"; exit 1; }
    xcrun simctl privacy "$SIM" grant all "$BID" >/dev/null 2>&1
}
# чистая установка + готовое состояние: регистрация пройдена, расписание, ДЗ, задачи, заметки
seed() {
    fresh
    local c
    c=$(xcrun simctl get_app_container "$SIM" "$BID" data)
    mkdir -p "$c/Library/Preferences"
    python3 "$HERE/seed_plist.py" "$HERE/../android-stress/seed.py" "$c/Library/Preferences/$BID.plist" > /dev/null
}
monkey() { # имя seed событий
    log "   «обезьяна» $1: $3 событий, seed $2"
    TEST_RUNNER_MONKEY_EVENTS="$3" TEST_RUNNER_MONKEY_SEED="$2" \
        xcodebuild test-without-building -xctestrun "$XCTESTRUN" -destination "id=$SIM" \
        -only-testing:SAFUMonkey/MonkeyTests/testMonkey > "$OUT/monkey_$1.txt" 2>&1
    grep -E "MONKEY: (готово|приложения нет|без ожидания|ожидание)" "$OUT/monkey_$1.txt" | head -12 | while IFS= read -r l; do log "   $l"; done
    if ! grep -q "MONKEY: готово" "$OUT/monkey_$1.txt"; then
        log "   «обезьяна» не дошла до конца; последнее: $(grep 'MONKEY: [0-9]' "$OUT/monkey_$1.txt" | tail -1)"
        grep -v "Ignoring failure to get hierarchy" "$OUT/monkey_$1.txt" |
            grep -iE "error:|failed|crash|exited|not running|lost connection|unexpected|Test Case|terminat|Restarting" |
            sort | uniq -c | sort -rn | head -12 | while IFS= read -r l; do log "      $(echo "$l" | cut -c1-300)"; done
        grep -v "Ignoring failure to get hierarchy" "$OUT/monkey_$1.txt" | grep -vE "^\s*$|Automation type mismatch" | tail -15 |
            while IFS= read -r l; do log "      … $(echo "$l" | cut -c1-240)"; done
    fi
}
# отчёты о падениях — сразу, чтобы не потерять при остановке задания по времени
reports() {
    mkdir -p "$OUT/crashes"
    for d in "$HOME/Library/Logs/DiagnosticReports" "/Library/Logs/DiagnosticReports" \
             "$HOME/Library/Developer/CoreSimulator/Devices/$SIM/data/Library/Logs/CrashReporter"; do
        [ -d "$d" ] || continue
        find "$d" -newer "$OUT/start.marker" -type f 2>/dev/null | while IFS= read -r f; do
            grep -qxF "$f" "$OUT/reports_found.txt" 2>/dev/null || echo "$f" >> "$OUT/reports_found.txt"
            case "$(basename "$f" | tr '[:upper:]' '[:lower:]')" in *safu*) cp -n "$f" "$OUT/crashes/" 2>/dev/null ;; esac
        done
    done
}
storm() { # сколько, режим (cold | fresh)
    local dead=0
    for i in $(seq 1 "$1"); do
        if [ "$2" = fresh ]; then if [ $(( i % 2 )) -eq 0 ]; then seed; else fresh; fi; else stop; sleep 0.5; fi
        launch; sleep "$([ "$2" = fresh ] && echo 7 || echo 3)"
        alive || dead=$(( dead + 1 ))
    done
    log "   $1 запусков ($2), приложения нет после: $dead"
}

xcrun simctl bootstatus "$SIM" -b >/dev/null 2>&1
# системный журнал всё время: падения Swift и завершения процесса приложения
xcrun simctl spawn "$SIM" log stream --style compact --predicate \
    '(process == "SAFU" AND (messageType == fault OR eventMessage CONTAINS[c] "fatal" OR eventMessage CONTAINS[c] "exception")) OR ((process == "runningboardd" OR process == "SpringBoard" OR process == "launchd_sim") AND eventMessage CONTAINS "safuhub" AND (eventMessage CONTAINS[c] "termination" OR eventMessage CONTAINS[c] "exited" OR eventMessage CONTAINS[c] "crash" OR eventMessage CONTAINS[c] "signal"))' \
    > "$OUT/sim_log.txt" 2>/dev/null &
LOGSTREAM=$!
xcrun simctl status_bar "$SIM" override --time 10:00 >/dev/null 2>&1
xcrun simctl location "$SIM" set 64.5399,40.5182 >/dev/null 2>&1
{
    echo "Симулятор: $(xcrun simctl list devices | grep "$SIM" | sed -E 's/ \(.*//' | xargs)"
    echo "iOS: $(xcrun simctl getenv "$SIM" SIMULATOR_RUNTIME_VERSION 2>/dev/null)"
    echo "Xcode: $(xcodebuild -version | head -1)"
} >> "$OUT/env.txt"

# ── 1. первый запуск (регистрация) ─────────────────────────────────────────────────────
mark first-run
fresh
launch; sleep 10; shot 01_first_run
check "первый запуск"
monkey first-run 101 400
shot 02_first_run_after_monkey

# ── 2. готовое состояние ───────────────────────────────────────────────────────────────
mark seeded-start
seed
launch; sleep 10; shot 03_home
check "запуск с готовым состоянием"

# ── 3. запуски подряд: холодные и «с нуля» ─────────────────────────────────────────────
mark cold-storm
storm 15 cold
mark fresh-storm
storm 6 fresh

# ── 4. «обезьяна» по всему приложению: 3 круга, перед каждым — свежее состояние ─────────
for s in 1 2 3; do
    mark "monkey-$s"
    seed
    launch; sleep 8
    monkey "main-$s" $(( 1000 + s * 7 )) "$EVENTS"
    shot "04_monkey_$s"
    check "«обезьяна» круг $s"
    sleep 10; reports
done

# ── 5. жизненный цикл ──────────────────────────────────────────────────────────────────
mark lifecycle
seed
launch; sleep 8
for i in 1 2 3 4 5; do xcrun simctl ui "$SIM" appearance dark; sleep 1.5; xcrun simctl ui "$SIM" appearance light; sleep 1.5; done
check "5 переключений тёмной темы"
for s in extra-small accessibility-extra-extra-extra-large extra-extra-extra-large large; do
    xcrun simctl ui "$SIM" content_size "$s" >/dev/null 2>&1; sleep 3
done
shot 05_text_size_restored
check "размер текста от самого мелкого до самого крупного"
for i in $(seq 1 10); do xcrun simctl launch "$SIM" com.apple.Preferences >/dev/null 2>&1; sleep 0.8; launch; sleep 0.8; done
check "10 раз свернуть-развернуть"
for p in "64.5633,39.8302" "55.7558,37.6173" "64.5399,40.5182"; do xcrun simctl location "$SIM" set "$p" >/dev/null 2>&1; sleep 3; done
check "геопозиция: Северодвинск, Москва, Архангельск"
xcrun simctl privacy "$SIM" revoke all "$BID" >/dev/null 2>&1; sleep 2
launch; sleep 6
check "все разрешения отозваны"
xcrun simctl privacy "$SIM" grant all "$BID" >/dev/null 2>&1

# ── 6. ссылки и пуши ───────────────────────────────────────────────────────────────────
mark links
LONG=$(head -c 6000 /dev/zero | tr '\0' 'a')
KEY=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8
for u in "safu://schedule" "safu://board" "safu://boards" "safu://homework" "safu://hw" "safu://tasks" "safu://files" \
         "safu://pair?subject=Физика" "safu://pair?subject=" "safu://photo?subject=%00%FF" \
         "safu://" "safu:" "safu:///" "safu://%E0%A4%A" "safu://schedule/../../../etc/passwd" "safu://$LONG" \
         "arktika://sync" "arktika://sync?h=&p=&k=" "arktika://sync?h=::::&p=-1&i=-5&k=%00" "arktika://pc" "arktika://pc?h=1.2.3.4" \
         "arktika://unknown?x=🎓"; do
    alive || { launch; sleep 5; }
    before=$(wc -c < "$OUT/sim_log.txt")
    xcrun simctl openurl "$SIM" "$u" >/dev/null 2>&1
    sleep 3
    if ! alive; then
        log "   ПАДЕНИЕ после ссылки: $(echo "$u" | cut -c1-140)"
        echo "ссылка $(echo "$u" | cut -c1-140)" >> "$OUT/dead_after.txt"
        tail -c +$(( before + 1 )) "$OUT/sim_log.txt" | grep -v "^Filtering" | head -6 | while IFS= read -r l; do log "      $(echo "$l" | cut -c1-300)"; done
    fi
done
log "   битые ссылки проверены по одной"
# ссылка связки с компьютером в правильном формате: свяжется ли телефон без вопроса
alive || { launch; sleep 5; }
xcrun simctl openurl "$SIM" "arktika://sync?h=192.168.77.77&p=8765&i=stress-test&k=$KEY&n=Чужой+ноутбук" >/dev/null 2>&1
sleep 4; shot 06_sync_link_opened
log "   открыта ссылка связки с «Чужой ноутбук» (снимок 06_sync_link_opened)"
check "ссылка связки"
alive || { launch; sleep 5; }
for body in '{"aps":{"alert":{"title":"Замена пары","body":"Физика перенесена"}}}' \
            '{"aps":{"alert":"ДЗ"},"hw":"NOPE","subject":"'"$LONG"'"}' '{"aps":{}}'; do
    echo "$body" > "$OUT/push.json"
    xcrun simctl push "$SIM" "$BID" "$OUT/push.json" >/dev/null 2>&1; sleep 2
done
check "пуш-уведомления"

# ── итоги ──────────────────────────────────────────────────────────────────────────────
mark collect
sleep 5
sleep 15   # ReportCrash пишет отчёты с задержкой
kill "$LOGSTREAM" >/dev/null 2>&1
reports
log "   отчёты в системе за прогон: $(wc -l < "$OUT/reports_found.txt" 2>/dev/null | xargs || echo 0); $(sed 's#.*/##' "$OUT/reports_found.txt" 2>/dev/null | head -8 | tr '\n' ' ')"
grep -h -m3 -E "Fatal error|fatal error|Terminating app" "$OUT"/stderr/*.txt 2>/dev/null | sort | uniq -c | head -8 | while IFS= read -r l; do log "   stderr: $l"; done
xcrun simctl spawn "$SIM" log show --last 2h --style compact \
    --predicate 'process == "SAFU" AND (messageType == error OR messageType == fault)' 2>/dev/null | tail -n 3000 > "$OUT/errors.txt"
shot 07_final
log "готово, отчётов о падениях: $(ls "$OUT/crashes" | wc -l | xargs)"
exit 0
