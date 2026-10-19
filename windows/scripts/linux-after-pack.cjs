// Linux: запуск через маленький скрипт. Песочнице Chromium в AppImage нужны user namespaces, а Ubuntu 24.04+
// (AppArmor) и часть ядер Debian их запрещают — тогда AppImage не открывался вовсе, без единого окна.
// Скрипт проверяет это при запуске и только в таком случае запускает без песочницы. В .deb и .rpm после установки
// стоит chrome-sandbox с SUID (build/linux/after-install.tpl) — тогда песочница работает и проверка не нужна.
const fs = require('node:fs')
const path = require('node:path')

const WRAPPER = `#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
BIN="$HERE/__EXE__-bin"
SANDBOX="$HERE/chrome-sandbox"
# песочница через SUID (пакет поставил chrome-sandbox от root с битом s) — всё в порядке
if [ -u "$SANDBOX" ] && [ "$(stat -c %u "$SANDBOX" 2>/dev/null)" = "0" ]; then exec "$BIN" "$@"; fi
# иначе нужны user namespaces с правами внутри: AppArmor в Ubuntu 24.04+ и sysctl в Debian могут их урезать
if command -v unshare >/dev/null 2>&1; then
  unshare --user --map-root-user true >/dev/null 2>&1 || exec "$BIN" --no-sandbox "$@"
elif [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] \\
  || [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
  exec "$BIN" --no-sandbox "$@"
fi
exec "$BIN" "$@"
`

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return
  const exe = context.packager.executableName
  const real = path.join(context.appOutDir, exe)
  const bin = real + '-bin'
  if (fs.existsSync(bin)) return
  fs.renameSync(real, bin)
  fs.writeFileSync(real, WRAPPER.replace('__EXE__', exe), { mode: 0o755 })
}
