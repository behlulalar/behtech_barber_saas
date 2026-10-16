#!/usr/bin/env bash
# Sunucuda (root): nginx yapılandırmasını GÜVENLİ uygular. Test başarısızsa eski dosyayı geri koyar ve nginx'e dokunmaz
# (hatalı bir dosya sunucudaki diğer sistemlerin nginx yeniden yüklemelerini bozmasın).
# Kullanım: apply-nginx.sh <alan_adı> http|https [wildcard]
set -uo pipefail
DOMAIN="$1"; MODE="$2"; WILD="${3:-}"
DIR="$(cd "$(dirname "$0")" && pwd)"
AVAIL=/etc/nginx/sites-available/$DOMAIN.conf
ENABLED=/etc/nginx/sites-enabled/$DOMAIN.conf
BAK=$(mktemp)
[ -f "$AVAIL" ] && cp "$AVAIL" "$BAK" || : > "$BAK"
cp "$DIR/nginx-limits.conf" /etc/nginx/conf.d/berber-limits.conf
"$DIR/render-nginx.sh" "$DOMAIN" "$MODE" $WILD > "$AVAIL"
ln -sf "$AVAIL" "$ENABLED"
if nginx -t >/tmp/berber-nginx-test.log 2>&1; then
  systemctl reload nginx && echo "nginx yapılandırması uygulandı ($MODE${WILD:+, $WILD})"
else
  echo "HATA: nginx testi başarısız, ESKİ yapılandırma geri konuyor:"; cat /tmp/berber-nginx-test.log
  if [ -s "$BAK" ]; then cp "$BAK" "$AVAIL"; else rm -f "$AVAIL" "$ENABLED"; fi
  nginx -t >/dev/null 2>&1 && echo "(eski yapılandırma geçerli, nginx etkilenmedi)"
  exit 1
fi
