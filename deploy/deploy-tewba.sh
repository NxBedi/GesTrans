#!/usr/bin/env bash
# ---------------------------------------------------------------
# نشر واجهة GesTrans على tewba.seheltech.com  (نسخة 2b6628a)
# الاستخدام:
#   sudo bash deploy-tewba.sh /tmp/tewba-frontend-2b6628a.tar.gz
# ---------------------------------------------------------------
set -euo pipefail

ARCHIVE="${1:?استخدم: sudo bash deploy-tewba.sh /path/to/tewba-frontend-2b6628a.tar.gz}"
SERVER_NAME="${SERVER_NAME:-tewba.seheltech.com}"
EXPECTED_SHA256="${EXPECTED_SHA256:-9066e7d697c1f585a19398a1e6f438cc30a9d4e5de8b6834f57030ef6236655a}"

if [[ $EUID -ne 0 ]]; then
  echo "!! شغّل السكربت بصلاحية root: sudo bash $0 $ARCHIVE" >&2
  exit 1
fi

# 1) التحقق من سلامة الحزمة
if [[ -n "$EXPECTED_SHA256" ]]; then
  ACTUAL_SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
  if [[ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
    echo "!! بصمة الملف لا تطابق المتوقع" >&2
    echo "   متوقع: $EXPECTED_SHA256" >&2
    echo "   فعلي : $ACTUAL_SHA256" >&2
    exit 1
  fi
  echo "==> الحزمة سليمة (SHA256 مطابق)"
fi

# 2) اكتشاف مجلد الموقع من إعدادات nginx
detect_root() {
  nginx -T 2>/dev/null | awk -v site="$SERVER_NAME" '
    /^[[:space:]]*server[[:space:]]*\{/ { inblock = 1; names = ""; root = ""; next }
    inblock && /^[[:space:]]*server_name/ { names = names " " $0; next }
    inblock && /^[[:space:]]*root[[:space:]]/ && root == "" {
      r = $0; sub(/^[[:space:]]*root[[:space:]]+/, "", r); sub(/;.*/, "", r); root = r; next
    }
    inblock && /^[[:space:]]*\}/ {
      if (index(names, site) > 0 && root != "") print root;
      inblock = 0; next
    }
  ' | sort -u
}

WEB_ROOT="${WEB_ROOT:-}"
if [[ -z "$WEB_ROOT" ]]; then
  mapfile -t CANDIDATES < <(detect_root)
  if [[ ${#CANDIDATES[@]} -eq 1 ]]; then
    WEB_ROOT="${CANDIDATES[0]}"
  elif [[ ${#CANDIDATES[@]} -gt 1 ]]; then
    echo "!! أكثر من مجلد محتمل، حدّد المسار يدوياً:" >&2
    printf '   %s\n' "${CANDIDATES[@]}" >&2
    echo "   مثال: sudo WEB_ROOT=/var/www/tewba bash $0 $ARCHIVE" >&2
    exit 1
  fi
fi

if [[ -z "$WEB_ROOT" || ! -f "${WEB_ROOT%/}/index.html" ]]; then
  echo "!! تعذّر اكتشاف مجلد الموقع تلقائياً." >&2
  echo "   اعرض الإعدادات بـ: nginx -T | grep -nE 'server_name|root '" >&2
  echo "   ثم أعد التشغيل: sudo WEB_ROOT=/path/to/site bash $0 $ARCHIVE" >&2
  exit 1
fi

echo "==> مجلد الموقع: $WEB_ROOT"

# 3) نسخة احتياطية
NGINX_USER="$(ps -o user= -C nginx 2>/dev/null | head -n1 | tr -d ' ')"
NGINX_USER="${NGINX_USER:-www-data}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${WEB_ROOT%/}.bak-$STAMP"
cp -a "$WEB_ROOT" "$BACKUP"
echo "==> نسخة احتياطية: $BACKUP"

# 4) فك الحزمة فوق المجلد الحالي (الأصول القديمة تبقى، لا ضرر منها)
tar -xzf "$ARCHIVE" -C "$WEB_ROOT"
chown -R "$NGINX_USER":"$NGINX_USER" "$WEB_ROOT" 2>/dev/null || true
echo "==> تم فك الحزمة وضبط الصلاحيات ($NGINX_USER)"

# 5) اختبار وإعادة تحميل nginx
nginx -t
if systemctl reload nginx 2>/dev/null; then
  echo "==> تم إعادة تحميل nginx"
else
  echo "!! systemctl reload nginx فشل — إذا كان nginx داخل Docker:"
  echo "   docker ps --format '{{.Names}}' | grep -i nginx"
  echo "   docker exec <container> nginx -s reload"
fi

# 6) التحقق
echo "==> النسخة المنشورة الآن:"
curl -fsS "https://$SERVER_NAME/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)' | sort -u

echo
echo "المتوقع: assets/index-ge43fJII.js و assets/index-COza5ahJ.css"
echo "للرجوع عن النشر:"
echo "  rm -rf '$WEB_ROOT' && mv '$BACKUP' '$WEB_ROOT' && systemctl reload nginx"
