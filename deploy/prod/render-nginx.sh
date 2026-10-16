#!/usr/bin/env bash
# Kullanım: render-nginx.sh <alan_adı> http|https [wildcard]
#   http   : yalnızca 80 (ACME doğrulaması + yönlendirme) — sertifika alınmadan önce
#   https  : 80 + 443 (sertifika /etc/letsencrypt/live/<alan_adı>/ altında olmalı)
#   wildcard verilirse server_name'e *.<alan_adı> eklenir (joker sertifika gerekir)
set -euo pipefail
DOMAIN="$1"; MODE="$2"; WILD="${3:-}"
DIR="$(cd "$(dirname "$0")" && pwd)"
NAMES="$DOMAIN"; [ "$WILD" = "wildcard" ] && NAMES="$DOMAIN *.$DOMAIN"
CF_RANGES="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
# Cloudflare arkasındaki istekte gerçek istemci IP'si (CF-Connecting-IP) yalnızca isteği Cloudflare adreslerinden aldıysak kabul edilir;
# doğrudan gelen istekte başlık yok sayılır (IP sahteciliği olmaz).
REAL_IP="    real_ip_header CF-Connecting-IP;"$'\n'; for r in $CF_RANGES; do REAL_IP+="    set_real_ip_from $r;"$'\n'; done
HASH=""
if [ "$MODE" = "https" ]; then
  # index.html'deki satır içi tema betiğinin SHA-256 karması (CSP için)
  HASH=$(python3 - <<PY
import re, hashlib, base64
html = open("/opt/berber/frontend/dist/index.html", encoding="utf-8").read()
m = re.search(r"<script>(.*?)</script>", html, re.S)
print(base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode() if m else "")
PY
)
  HTTPS=$(sed -e "s|{{SERVER_NAMES}}|$NAMES|g" -e "s|{{CERT_NAME}}|$DOMAIN|g" "$DIR/nginx-https-block.conf.template")
  mkdir -p /etc/nginx/snippets
  sed -e "s|{{CSP_SCRIPT_HASH}}|$HASH|g" "$DIR/nginx-security-snippet.conf.template" > /etc/nginx/snippets/berber-security.conf
  HTTPS=$(python3 -c "import sys; print(sys.argv[1].replace('{{REAL_IP}}', sys.argv[2]))" "$HTTPS" "$REAL_IP")
else
  HTTPS=""
fi
python3 - "$DIR/nginx-site.conf.template" "$DOMAIN" "$NAMES" "$REAL_IP" "$HTTPS" <<'PY'
import sys
tpl, domain, names, cf, https = sys.argv[1:6]
s = open(tpl).read().replace("{{DOMAIN}}", domain).replace("{{SERVER_NAMES}}", names).replace("{{REAL_IP}}", cf).replace("{{HTTPS_BLOCK}}", https)
print(s)
PY
