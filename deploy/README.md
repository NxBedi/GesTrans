# نشر الواجهة على tewba.seheltech.com

هذا المجلد يحتوي حزمة النشر الخاصة بالكوميت `2b6628a`
(صفحة كشف الحساب كصفحة كاملة + إبراز بطاقات نقدية الصندوق وإجمالي الديون وأرباح الحاويات
+ عنوان التبويب «مؤسسة التوبة» / «ETS TEWBA» + احتساب الدين القديم ضمن رأس المال).

> **ملاحظة:** التغييرات واجهة فقط (Frontend). الخادم الخلفي وقاعدة البيانات لم يتغيرا،
> لذلك لا حاجة لإعادة تشغيل الـ backend.

## الملفات

| الملف | الوصف |
|---|---|
| `tewba-frontend-2b6628a.tar.gz` | محتويات `frontend/dist` جاهزة للفك في جذر الموقع |
| `deploy-tewba.sh` | سكربت نشر آمن: يتحقق من البصمة، يأخذ نسخة احتياطية، يفك الحزمة، يعمل `nginx -t` ثم يعيد التحميل |
| `README.md` | هذا الملف |

- بصمة الحزمة SHA256:
  `9066e7d697c1f585a19398a1e6f438cc30a9d4e5de8b6834f57030ef6236655a`
- الأصول المتوقعة بعد النشر:
  `assets/index-ge43fJII.js` و `assets/index-COza5ahJ.css`

## 1) رفع الحزمة إلى السيرفر

من PowerShell على جهازك:

```powershell
scp "C:\Users\LMR\projects\GesTrans\deploy\tewba-frontend-2b6628a.tar.gz" root@62.84.188.109:/tmp/
scp "C:\Users\LMR\projects\GesTrans\deploy\deploy-tewba.sh" root@62.84.188.109:/tmp/
```

(استبدل `root` باسم المستخدم لديك إن اختلف.)

## 2) التنفيذ على السيرفر

```bash
sudo bash /tmp/deploy-tewba.sh /tmp/tewba-frontend-2b6628a.tar.gz
```

إذا لم يتمكن السكربت من اكتشاف مجلد الموقع تلقائياً:

```bash
nginx -T | grep -nE 'server_name|root '
sudo WEB_ROOT=/var/www/tewba bash /tmp/deploy-tewba.sh /tmp/tewba-frontend-2b6628a.tar.gz
```

## 3) التحقق

```bash
curl -fsS https://tewba.seheltech.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)' | sort -u
```

يجب أن يظهر:

```
assets/index-ge43fJII.js
assets/index-COza5ahJ.css
```

ثم افتح الموقع وسجّل الدخول كمدير:
- عنوان التبويب: «مؤسسة التوبة» في العربية و «ETS TEWBA» في الفرنسية.
- `لوحة التحكم`: البطاقات الثلاث الكبيرة (نقدية الصندوق، إجمالي الديون، أرباح الحاويات) في الصف الأول.
- `العملاء والديون` → زر `كشف حساب` يفتح صفحة `Compte client` بدل نافذة منبثقة.

## 4) الرجوع عن النشر (إن لزم)

السكربت يطبع مسار النسخة الاحتياطية بعد النشر، وبصيغة:

```bash
sudo rm -rf /path/to/site
sudo mv /path/to/site.bak-YYYYmmdd-HHMMSS /path/to/site
sudo systemctl reload nginx
```

## بناء حزمة جديدة لاحقاً

```powershell
cd C:\Users\LMR\projects\GesTrans\frontend
cmd /c npm.cmd run build
tar -czf ..\deploy\tewba-frontend-<commit>.tar.gz -C dist .
certutil -hashfile ..\deploy\tewba-frontend-<commit>.tar.gz SHA256
```

ثم حدّث `EXPECTED_SHA256` واسم الملف في `deploy-tewba.sh` وملف `README.md`.
