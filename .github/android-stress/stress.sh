#!/usr/bin/env bash
# Стресс-тест Арктики на эмуляторе: первый запуск, monkey по всему приложению, повороты, тема,
# шрифт, плотность экрана, убийство процесса, нехватка памяти, путешествия во времени, без сети,
# битые ссылки и интенты. Всё пишется в папку результатов, разбирает analyze.py.
# Аргументы: путь к APK, папка для результатов. EVENTS — событий monkey в основном прогоне.
set -u
APK="$1"
OUT="$2"
PKG=ru.student.safuhub
ACT="$PKG/.MainActivity"
EVENTS="${EVENTS:-30000}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/shots"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$OUT/steps.txt"; }
mark() { adb shell log -t STRESS "phase $1" >/dev/null 2>&1; echo "$1" >> "$OUT/phases.txt"; log "── $1"; }
pid() { adb shell pidof "$PKG" 2>/dev/null | tr -d '\r'; }
shot() { adb exec-out screencap -p > "$OUT/shots/$1.png" 2>/dev/null || true; }
launch() { adb shell am start -W -n "$ACT" "$@" 2>&1 | tr -d '\r'; }
stop() { adb shell am force-stop "$PKG" >/dev/null 2>&1; }
check() {
    if [ -n "$(pid)" ]; then log "   приложение живо после: $1"
    else log "   ПРИЛОЖЕНИЯ НЕТ после: $1"; echo "$1" >> "$OUT/dead_after.txt"; fi
}
# среда после monkey: сеть, поворот, шторка
restore_env() {
    adb shell cmd connectivity airplane-mode disable >/dev/null 2>&1
    adb shell svc wifi enable >/dev/null 2>&1
    adb shell svc data enable >/dev/null 2>&1
    adb shell settings put system accelerometer_rotation 0 >/dev/null 2>&1
    adb shell settings put system user_rotation 0 >/dev/null 2>&1
    adb shell cmd statusbar collapse >/dev/null 2>&1
}
# готовое состояние: регистрация пройдена, расписание, ДЗ, задачи, заметки
seed() {
    stop
    adb shell "run-as $PKG sh -c 'mkdir -p files && rm -f files/defaults.bak.json && cat > files/defaults.json'" < "$OUT/seed.json"
    local size
    size=$(adb shell run-as "$PKG" sh -c "'wc -c < files/defaults.json'" 2>/dev/null | tr -d '\r ')
    log "   состояние записано: ${size:-?} байт"
}
# нажать на текст на экране (через дерево доступности)
tap_text() {
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || return 1
    local b
    b=$(adb shell cat /sdcard/ui.xml 2>/dev/null | tr '>' '\n' | grep -F "text=\"$1\"" | head -1 |
        sed -nE 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/p')
    [ -z "$b" ] && return 1
    set -- $b
    adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}
monkey() { # имя seed событий задержка
    local name=$1 seed=$2 count=$3 throttle=$4 f="$OUT/monkey_$1.txt"
    log "   monkey $name: $count событий, seed $seed, пауза ${throttle} мс"
    # когда заданы все виды событий, monkey требует ровно 100%
    adb shell monkey -p "$PKG" -s "$seed" --throttle "$throttle" \
        --pct-touch 49 --pct-motion 22 --pct-pinchzoom 3 --pct-nav 5 --pct-majornav 10 \
        --pct-appswitch 4 --pct-rotation 3 --pct-syskeys 4 --pct-anyevent 0 --pct-flip 0 --pct-trackball 0 \
        --ignore-crashes --ignore-timeouts --ignore-security-exceptions --monitor-native-crashes \
        -v -v "$count" > "$f" 2>&1
    if ! grep -q "Events injected" "$f"; then
        log "   monkey не принял ключи ($(grep -m1 -E 'Error|\*\*' "$f" | tr -d '\r')) — запуск с ключами по умолчанию"
        adb shell monkey -p "$PKG" -s "$seed" --throttle "$throttle" \
            --ignore-crashes --ignore-timeouts --ignore-security-exceptions --monitor-native-crashes \
            -v -v "$count" > "$f" 2>&1
    fi
    log "   $(grep -m1 'Events injected' "$f" | tr -d '\r' || echo 'событий: ?')"
    restore_env
}
cold_starts() { # имя
    for i in 1 2 3 4 5; do
        stop; sleep 1
        local t
        t=$(launch | sed -nE 's/^TotalTime: ([0-9]+).*/\1/p')
        echo "$1 ${t:-0}" >> "$OUT/startup.txt"
        sleep 3
    done
    log "   холодный запуск ($1): $(grep "^$1 " "$OUT/startup.txt" | awk '{print $2}' | tr '\n' ' ')мс"
}
# много холодных запусков подряд: гонки при старте (главный экран рисуется, фон уже считает уведомления)
cold_storm() { # сколько
    local dead=0
    for i in $(seq 1 "$1"); do
        stop; sleep 0.5
        adb shell am start -n "$ACT" >/dev/null 2>&1
        sleep 2.5
        [ -n "$(pid)" ] || dead=$(( dead + 1 ))
    done
    log "   $1 холодных запусков, приложения нет после: $dead"
}

# ── подготовка ─────────────────────────────────────────────────────────────────────────
adb root >/dev/null 2>&1; sleep 3; adb wait-for-device
adb shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
adb logcat -G 16M >/dev/null 2>&1
adb logcat -c >/dev/null 2>&1
# logcat пишется всё время; при обрыве adb переподключается с последней строки
( while :; do adb logcat -v threadtime -b main,system,crash,events -T 1 >> "$OUT/logcat.txt" 2>/dev/null; sleep 1; done ) &
LOGCAT=$!
adb shell cmd statusbar send-disable-flag statusbar-expansion >/dev/null 2>&1
adb shell settings put global auto_time 0 >/dev/null 2>&1
adb shell settings put global package_verifier_enable 0 >/dev/null 2>&1
adb shell getprop ro.build.version.release | tr -d '\r' | sed 's/^/Android: /' >> "$OUT/env.txt"
adb shell getprop persist.sys.timezone | tr -d '\r' | sed 's/^/Часовой пояс: /' >> "$OUT/env.txt"
adb shell date | tr -d '\r' | sed 's/^/Время на эмуляторе: /' >> "$OUT/env.txt"
python3 "$HERE/seed.py" > "$OUT/seed.json"

# ── 1. первый запуск (регистрация) ─────────────────────────────────────────────────────
mark first-run
adb install -r -g "$APK" > "$OUT/install.txt" 2>&1 || { cat "$OUT/install.txt"; log "APK не установился"; echo "install" > "$OUT/FAILED"; exit 1; }
launch > /dev/null; sleep 6; shot 01_first_run
check "первый запуск"
monkey first-run 101 3000 75
shot 02_first_run_after_monkey
check "monkey на регистрации"

# ── 2. готовое состояние, холодный запуск ──────────────────────────────────────────────
mark seeded-start
adb uninstall "$PKG" >/dev/null 2>&1
adb install -g "$APK" >/dev/null 2>&1
seed
cold_starts seeded
shot 03_home
check "холодные запуски"
mark cold-storm
cold_storm 25
check "25 холодных запусков подряд"
# первый запуск после установки или сброса: здесь ловилось падение при старте
mark fresh-storm
dead=0
for i in $(seq 1 10); do
    adb shell pm clear "$PKG" >/dev/null 2>&1
    [ $(( i % 2 )) -eq 0 ] && seed
    launch > /dev/null; sleep 5
    [ -n "$(pid)" ] || dead=$(( dead + 1 ))
done
log "   10 запусков с нуля (5 — первый запуск, 5 — с данными), приложения нет после: $dead"
# сброс мог отозвать разрешения — переустановка поверх с выдачей всех разрешений
adb install -r -g "$APK" >/dev/null 2>&1

# ── 3. monkey по всему приложению: 4 круга, перед каждым — свежее состояние ─────────────
PER=$(( EVENTS / 4 ))
for s in 1 2 3 4; do
    mark "monkey-$s"
    seed
    launch > /dev/null; sleep 4
    monkey "main-$s" $(( 1000 + s * 7 )) "$PER" 40
    shot "04_monkey_$s"
    check "monkey круг $s"
done

# ── 4. жизненный цикл ──────────────────────────────────────────────────────────────────
mark lifecycle
seed
launch > /dev/null; sleep 4
adb shell settings put system accelerometer_rotation 0
for i in $(seq 1 24); do adb shell settings put system user_rotation $(( i % 4 )); sleep 0.6; done
adb shell settings put system user_rotation 0
check "24 поворота"
for i in $(seq 1 8); do adb shell cmd uimode night yes; sleep 1; adb shell cmd uimode night no; sleep 1; done
check "8 переключений тёмной темы"
for s in 1.3 2.0 0.85 1.0; do adb shell settings put system font_scale $s; sleep 3; done
shot 05_font_restored
check "размер шрифта 1.3 / 2.0 / 0.85 (пересоздание экрана)"
for d in 280 560 420; do adb shell wm density $d; sleep 3; done
adb shell wm density reset
check "плотность экрана 280 / 560"
adb shell cmd locale set-app-locales "$PKG" --locales en-US >/dev/null 2>&1; sleep 3
adb shell cmd locale set-app-locales "$PKG" --locales "" >/dev/null 2>&1; sleep 3
check "язык приложения en-US и обратно"
for i in $(seq 1 15); do adb shell input keyevent KEYCODE_HOME; sleep 0.5; launch > /dev/null; sleep 0.7; done
check "15 раз свернуть-развернуть"
for lvl in RUNNING_MODERATE RUNNING_LOW RUNNING_CRITICAL; do adb shell am send-trim-memory "$PKG" $lvl >/dev/null 2>&1; sleep 1; done
check "нехватка памяти на переднем плане"
for i in 1 2 3 4 5; do
    adb shell input keyevent KEYCODE_HOME; sleep 1
    adb shell am send-trim-memory "$PKG" COMPLETE >/dev/null 2>&1; sleep 0.5
    adb shell am kill "$PKG"; sleep 1
    launch > /dev/null; sleep 3
done
shot 06_after_process_death
check "5 раз убит системой в фоне и восстановлен"
for i in $(seq 1 20); do adb shell input keyevent KEYCODE_BACK; sleep 0.3; done
launch > /dev/null; sleep 2
check "20 раз «назад» и снова открыть"

# ── 5. ссылки и интенты (активность открыта для любых приложений) ───────────────────────
mark intents
LONG=$(head -c 6000 /dev/zero | tr '\0' 'a')
for u in "safu://schedule" "safu://board" "safu://boards" "safu://tasks" "safu://files" "safu://home" \
         "safu://pair?subject=Физика" "safu://pair?subject=" "safu://photo?subject=%00%FF" "safu://photo?subject=Несуществующий" \
         "safu://" "safu:" "safu:///" "safu://%E0%A4%A" "safu://schedule/../../../etc/passwd" "safu://$LONG" \
         "arktika://sync" "arktika://sync?" "arktika://sync?h=&p=&k=" "arktika://sync?h=1.2.3.4&p=99999999&k=zzz&n=$LONG" \
         "arktika://sync?h=::::&p=-1&i=-5&k=%00" "arktika://unknown?x=🎓"; do
    adb shell am start -n "$ACT" -a android.intent.action.VIEW -d "'$u'" >/dev/null 2>&1
    sleep 1.2
    adb shell input keyevent KEYCODE_BACK; sleep 0.3
done
check "битые ссылки safu:// и arktika://"
adb shell am start -n "$ACT" -a ru.student.safuhub.OPEN_NOTIFICATION --es type hw --es id NOPE >/dev/null 2>&1; sleep 1.5
adb shell am start -n "$ACT" -a ru.student.safuhub.OPEN_NOTIFICATION --es kind mail --es subject "'$LONG'" >/dev/null 2>&1; sleep 1.5
adb shell am start -n "$ACT" -a ru.student.safuhub.OPEN_NOTIFICATION >/dev/null 2>&1; sleep 1.5
adb shell am start -n "$ACT" --es shortcut "'../../../x'" >/dev/null 2>&1; sleep 1.5
check "интенты уведомлений и ярлыков"
adb shell am start -n "$ACT" -a android.intent.action.SEND -t text/plain --es android.intent.extra.TEXT "'привет'" >/dev/null 2>&1; sleep 1.5
adb shell am start -n "$ACT" -a android.intent.action.SEND -t image/png --eu android.intent.extra.STREAM content://nope.provider/x.png >/dev/null 2>&1; sleep 2
adb shell am start -n "$ACT" -a android.intent.action.SEND_MULTIPLE -t "'*/*'" >/dev/null 2>&1; sleep 1.5
shot 07_shared_files
adb shell input keyevent KEYCODE_BACK; sleep 0.5
check "«Поделиться» с битыми файлами"
# битая резервная копия: открыть и нажать «Восстановить»
head -c 4096 /dev/urandom > "$OUT/bad.safubackup"
adb push "$OUT/bad.safubackup" /sdcard/Download/bad.safubackup >/dev/null 2>&1
for u in "file:///sdcard/Download/bad.safubackup" "content://nope.provider/copy.safubackup"; do
    adb shell am start -n "$ACT" -a android.intent.action.VIEW -d "'$u'" -t application/octet-stream >/dev/null 2>&1
    sleep 2
    if tap_text "Восстановить"; then log "   нажато «Восстановить» ($u)"; sleep 4; else log "   кнопка «Восстановить» не найдена ($u)"; fi
    shot "08_bad_backup_$(echo "$u" | cut -c1-4)"
    # закрыть «Не получилось», чтобы следующий диалог был сверху
    tap_text "OK" || tap_text "ОК" || adb shell input keyevent KEYCODE_BACK
    sleep 1
done
check "восстановление из битой копии"
for w in Night Aurora Graphite Bordeaux Forest Sunset Light Clear; do
    adb shell am broadcast -n "$PKG/.widget.PairWidget${w}Receiver" -a android.appwidget.action.APPWIDGET_UPDATE --eia appWidgetIds 1,2,999 >/dev/null 2>&1
done
sleep 3
check "обновление виджетов с несуществующими id"

# ── 6. путешествия во времени (пары, недели, салют, сессия) ─────────────────────────────
mark time-travel
REAL=$(adb shell date +%m%d%H%M%Y.%S | tr -d '\r')
for d in 102512002026.00 102608252026.00 102610052026.00 102614552026.00 123123592026.30 010100012027.00 \
         083123592026.40 020109002027.00 022910002028.00 061512002027.00; do
    adb shell date "$d" >/dev/null 2>&1
    d2=$(adb shell date "+%Y-%m-%d %H:%M %a" | tr -d '\r')
    stop; launch > /dev/null; sleep 4
    shot "09_time_$(echo "$d2" | tr ' :' '__')"
    monkey "time-$(echo "$d" | cut -c1-8)" 77 400 60
    check "время $d2"
done
adb shell date "$REAL" >/dev/null 2>&1
adb shell settings put global auto_time 1 >/dev/null 2>&1

# ── 7. без сети ────────────────────────────────────────────────────────────────────────
mark offline
seed
adb shell cmd connectivity airplane-mode enable >/dev/null 2>&1
adb shell svc wifi disable >/dev/null 2>&1; adb shell svc data disable >/dev/null 2>&1
sleep 2
launch > /dev/null; sleep 4
shot 10_offline
adb shell monkey -p "$PKG" -s 4242 --throttle 50 --ignore-crashes --ignore-timeouts --ignore-security-exceptions \
    --pct-appswitch 0 --pct-syskeys 0 -v 2500 > "$OUT/monkey_offline.txt" 2>&1
log "   $(grep -m1 'Events injected' "$OUT/monkey_offline.txt" | tr -d '\r' || echo 'событий: ?')"
check "monkey без сети"
restore_env
sleep 3
check "сеть вернулась"

# ── итоги ──────────────────────────────────────────────────────────────────────────────
mark collect
launch > /dev/null; sleep 3
adb shell dumpsys meminfo "$PKG" > "$OUT/meminfo.txt" 2>&1
adb shell dumpsys gfxinfo "$PKG" > "$OUT/gfxinfo.txt" 2>&1
adb shell dumpsys dropbox --print data_app_crash > "$OUT/dropbox_crash.txt" 2>&1
adb shell dumpsys dropbox --print data_app_anr > "$OUT/dropbox_anr.txt" 2>&1
adb shell dumpsys dropbox --print data_app_native_crash > "$OUT/dropbox_native.txt" 2>&1
adb shell dumpsys dropbox --print SYSTEM_TOMBSTONE > "$OUT/dropbox_tombstone.txt" 2>&1
mkdir -p "$OUT/anr" "$OUT/tombstones"
adb pull /data/anr "$OUT/anr" >/dev/null 2>&1 || true
adb pull /data/tombstones "$OUT/tombstones" >/dev/null 2>&1 || true
shot 11_final
sleep 2
kill "$LOGCAT" >/dev/null 2>&1
pkill -f "adb logcat" >/dev/null 2>&1
log "готово"
exit 0
