#!/bin/bash
# Арктика: после установки .deb/.rpm. Отличие от шаблона electron-builder — проверка песочницы: Ubuntu 24.04+
# разрешает создать user namespace, но AppArmor отнимает в нём права, и песочница Chromium без SUID не стартует.
# Поэтому SUID chrome-sandbox ставится, если namespaces нет совсем ИЛИ они урезаны AppArmor / sysctl.

if type update-alternatives 2>/dev/null >&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/${executable}' -a -e '/usr/bin/${executable}' -a "`readlink '/usr/bin/${executable}'`" != '/etc/alternatives/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; } \
    || [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] \
    || [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

if hash gtk-update-icon-cache 2>/dev/null; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
