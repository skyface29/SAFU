#!/bin/bash
# Промежуточный сертификат Минцифры для GigaChat (как на iPhone).
# Скачиваем с gu-st.ru и кладём в приложение, только если он подписан корнем
# «Russian Trusted Root CA» (app/src/main/res/raw/russian_trusted_root_ca.der). В систему телефона ничего не ставится.
# Не скачался — не страшно: приложение докачает его само при первом обращении к GigaChat.
set -u
cd "$(dirname "$0")/.." || exit 0
DIR=app/src/main/assets/certs
ROOT_DER=app/src/main/res/raw/russian_trusted_root_ca.der
mkdir -p "$DIR"
TMP=$(mktemp -d)
openssl x509 -inform der -in "$ROOT_DER" -out "$TMP/root.pem" || exit 0
n=0
for U in \
  https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt \
  https://gu-st.ru/content/Other/doc/russian_trusted_sub_ca.cer \
  http://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt ; do
  F="$TMP/c$n"; n=$((n+1))
  # -k: подлинность проверяем ниже подписью корня, а не TLS сайта
  curl -fsSLk -m 30 -o "$F" "$U" 2>/dev/null || continue
  openssl x509 -in "$F" -out "$F.pem" 2>/dev/null || openssl x509 -inform der -in "$F" -out "$F.pem" 2>/dev/null || continue
  if openssl verify -CAfile "$TMP/root.pem" "$F.pem" >/dev/null 2>&1; then
    openssl x509 -in "$F.pem" -outform der -out "$DIR/RussianTrustedSub.cer"
    echo "Russian Trusted Sub CA: $(openssl x509 -in "$F.pem" -noout -subject -enddate | tr '\n' ' ')"
    exit 0
  fi
done
echo "warning: Russian Trusted Sub CA не скачался — приложение докачает его само"
exit 0
