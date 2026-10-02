# 🌐 نظام محاسبة التخليص الجمركي

تطبيق ويب كامل (React + Express + PostgreSQL) لإدارة محاسبة نشاط التخليص الجمركي،
مع أدوار مختلفة للمدير والموظفين.

## البنية والميزات

- **أدوار المستخدمين**: مدير (`manager`) وموظف (`employee`).
- **المسار**: تسجيل الحاوية → الموظفون يدخلون المبالغ المصروفة على 17 نوع فاتورة
  → المدير يدخل فاتورة الجمارك (LIQUIDATION) → المدير يحدد السعر النهائي يدوياً
  → تُحسب الأرباح والتكاليف تلقائياً → تُرحّل لحساب العميل.
- **أنواع الفواتير الرسمية (17)** التي يدخلها الموظف:
  Charge Locale, Manutention, TS Douane, Facture Port, Bonnop, Armande, Transport,
  Dischargement, Bon de sortie Port, Bon de sortie Douane, Federation, Forfait,
  Autre, Transfert, TELEX RELEASE, Sortie TC CEVA, Dolerent.

  **ملاحظة (المدير فقط):** يرى جميع الفواتير + يدخل فاتورة **LIQUIDATION** (رقم + مبلغ)
  التي لا تظهر للموظفين.

- **تقارير**: الأرباح، حالة الحاويات، أرصدة العملاء (المبلغ/المدفوع/المتبقي).
- **إدارة**: العملاء، المستخدمون، أنواع الفواتير (المدير يديرها حسب الحاجة).

## البنية التقنية

| الطبقة | التقنية |
|--------|---------|
| الواجهة الأمامية | React + Vite (عربي RTL، خط Tajawal) |
| الواجهة الخلفية | Node.js + Express |
| قاعدة البيانات | PostgreSQL (تعمل عبر Docker) |
| المصادقة | JWT + bcrypt |

```
customs-accounting/
├── docker-compose.yml        # PostgreSQL
├── backend/
│   ├── sql/schema.sql        # مخطط قاعدة البيانات + البذور
│   ├── src/
│   │   ├── index.js          # نقطة الدخول
│   │   ├── db.js
│   │   ├── middleware/auth.js
│   │   ├── routes/           # auth, users, customers, containers,
│   │   │                     # invoices, pricing, payments, reports
│   │   └── scripts/init-db.js
│   └── .env                  # إعدادات الاتصال + حساب المدير
├── frontend/
│   └── src/                  # React app (pages, contexts, utils)
```

## التشغيل

### 1) تشغيل قاعدة البيانات (PostgreSQL عبر Docker)
```
docker compose up -d
```
(تأكد من أن Docker Desktop يعمل.)

### 2) تهيئة قاعدة البيانات + إنشاء حساب المدير (مرة واحدة فقط)
```
cd backend
npm install
npm run init-db
```
مخرجاتها: إنشاء الجداول، زرع أنواع الفواتير الـ 18، وإنشاء حساب المدير الافتراضي.

### 3) تشغيل الخادم الخلفي
```
npm start
```
(`src/index.js` ينفّذ فحص الترحيلات تلقائياً عند الإقلاع، لذا لا حاجة لإعادة init عند كل بداية.)

### 4) تشغيل الواجهة الأمامية
```
cd ../frontend
npm install
npm run dev      # أو npm run build ثم npm run preview
```

### 5) فتح التطبيق
- الواجهة: http://localhost:5173
- **حساب المدير الافتراضي**: اسم المستخدم `admin` / كلمة المرور `admin123`
  (غيّر كلمة المرور فوراً من صفحة «المستخدمون».)

## بيانات الاعتماد الافتراضية (راجع backend/.env)
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_FULLNAME=مدير النظام
```

## ملاحظات الأمان (قبل الاستخدام الفعلي)
- غيّر `JWT_SECRET` في `backend/.env` إلى قيمة عشوائية طويلة.
- غيّر كلمة مرور المدير الافتراضية.
- على الشبكة الخارجية: أضف HTTPS (SSL) وتقييد CORS (`FRONTEND_ORIGIN`).

## ملاحظة حول المشروع
هذا التطبيق منفصل عن أداة BL → XML ASYCUDA الموجودة في نفس المجلد
(`bl_to_xml.py`). إن صحّت الحاجة للربط بينهما (مثلاً استيراد بيانات BL إلى الحاوية)،
يمكن إضافته لاحقاً.
