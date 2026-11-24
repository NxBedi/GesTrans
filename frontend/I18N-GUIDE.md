# دليل الترجمة (عربي / فرنسي)

التطبيق يدعم اللغتين العربية (RTL، الافتراضية) والفرنسية (LTR). كل النصوص المعروضة
موجودة في ملفات JSON، ولا يوجد أي نص ثابت داخل المكوّنات.

## 1. الملفات

| الملف | الدور |
|-------|-------|
| `src/i18n/ar.json` | كل نصوص الواجهة بالعربية (المصدر المرجعي للترجمات). |
| `src/i18n/fr.json` | نفس المفاتيح بالفرنسية. |
| `src/i18n/dictionaries.js` | يحمّل كل ملفات `*.json` في المجلد تلقائياً. |
| `src/i18n/runtime.js` | الترجمة + تنسيق الأرقام/المبالغ/التواريخ (يعمل أيضاً خارج React). |
| `src/i18n/I18nContext.jsx` | `useI18n()` + المزوّد الذي يضبط `lang` و`dir` و`title`. |
| `src/components/LanguageSwitcher.jsx` | زر تبديل اللغة (شاشة الدخول + الشريط الجانبي). |
| `scripts/check-i18n.mjs` | يتحقق من أن كل مفتاح مستعمل موجود في اللغتين. |
| `public/fonts/Amiri-*.ttf` | خط PDF المضمّن (عربي + لاتيني). |

`ar.json` و`fr.json` يجب أن يحتويا **نفس المفاتيح بالضبط**. أي فرق يُكتشف بـ
`node scripts/check-i18n.mjs`.

## 2. الاستعمال في المكوّنات

```jsx
import { useI18n } from '../i18n/I18nContext.jsx';

const {
  t,            // t('debts.title') / t('pdf.period', { from, to })
  fmt,          // 12 345,50   (حسب اللغة)
  money,        // 12 345,50 MRU
  dmy,          // 01/10/2026
  dlong,        // 1 octobre 2026 / 1 أكتوبر 2026
  dtm,          // 01/10/2026 14:05
  statusLabel,  // registered -> مسجلة / Enregistré
  debtLabel,
  kindLabel,
  roleLabel,
  companyName,  // الاسم باللغة النشطة (nameAr / nameFr)
  lang, dir, isRtl, setLang, languages,
} = useI18n();
```

قواعد:

- لا تكتب أي نص ظاهر في الكود: العناوين، الأعمدة، `placeholder`، `title=`،
  `aria-label=`، خيارات `select`، رسائل `toast`/`confirm`، رسائل الأخطاء، أسماء ملفات
  التصدير.
- الأرقام والتواريخ عبر `fmt` / `money` / `dmy` / `dlong` / `dtm` فقط (لا
  `Intl.*` ولا `toLocaleString` في المكوّنات).
- الرموز التقنية (رقم BL، رقم الحاوية، الهاتف، NIF) تبقى `dir="ltr"`.
- الإدراج داخل النص يكون بـ `{name}` في ملف الترجمة: `t('debts.confirmDelete', { name })`.
- ملفات غير React (`utils/export.js`, `utils/api.js`…) تستعمل
  `import { t, getLang, dmy, fmt } from '../i18n/runtime.js'`.

## 3. إضافة نص جديد

1. أضف المفتاح في `ar.json` **و** `fr.json` (نفس المسار، نفس البنية).
2. استعمله بـ `t('namespace.key')`.
3. شغّل `node scripts/check-i18n.mjs` للتأكد من عدم وجود مفاتيح ناقصة.

## 4. إضافة لغة جديدة (ملف واحد فقط)

```jsonc
// src/i18n/en.json
{
  "_meta": { "label": "English", "dir": "ltr", "locale": "en-GB", "code": "en" },
  "common": { "...": "..." }
}
```

- `_meta.label` هو ما يظهر على الزر، و`_meta.dir` يحدد الاتجاه تلقائياً.
- `dictionaries.js` يكتشف الملف تلقائياً (`import.meta.glob('./*.json')`)، فيظهر الزر
  في `LanguageSwitcher` وتُضاف اللغة إلى القائمة بدون أي تعديل في الكود.
- `_meta.locale` يُستعمل في تنسيق الأرقام والتواريخ (`Intl`).
- المفاتيح الناقصة تُعوَّض من العربية (`DEFAULT_LANG`).

## 5. الاتجاه RTL / LTR

- `<html lang dir>` يُضبط في `index.html` قبل أول رسم (بدون وميض) ثم في `I18nProvider`.
- الاختيار محفوظ في `localStorage` تحت المفتاح `lang`.
- CSS يستعمل الخصائص المنطقية: `margin-inline-start/end`، `padding-inline-*`،
  `inset-inline-start`، `text-align: start/end`، `border-inline-start`.
- في الأنماط السطرية (inline) استعمل نفس الخصائص المنطقية، ولا تكتب
  `left/right` أو `textAlign: 'right'`.
- الجداول والأزرار والقوائم تتبع الاتجاه تلقائياً بفضل `dir` على `<html>`.

## 6. ملفات PDF و Excel

- `exportPdf` و `exportStatementPdf` **غير متزامنتين** (`await` أو `.catch`).
- العناوين والأعمدة وأسماء الملفات تُمرَّر مترجمة من الصفحة:
  `exportPdf(t('reports.profitsTitle'), headers, rows, sub)`.
- داخل `utils/export.js`:
  - `tt()` يزيل علامات الاتجاه الخفية (RLM/LRM) التي يضيفها `Intl` في التواريخ،
    ثم يطبّق `shapeArabic()` (وصل الحروف) على العربية فقط؛ jsPDF يتولى الترتيب البصري.
  - في الوضع العربي تُعكس أعمدة الجداول لتُقرأ من اليمين إلى اليسار.
  - المبالغ تُطبع بمنزلتين عشريتين (`money2`).
  - الخط `Amiri` مضمّن في الملف، لذا لا حاجة لخطوط النظام عند الطباعة.
- Excel: اسم الورقة والعناوين مترجمة، والورقة تُفتح باتجاه RTL في الوضع العربي
  (`Workbook.Views[0].RTL`).

## 7. رسائل الخادم (API)

- كل طلب يرسل `Accept-Language: <lang>` (في `utils/api.js`).
- `backend/src/i18n/index.js` يترجم `error` / `message` / `description` مركزياً داخل
  `res.json` اعتماداً على قاموس عربي ← فرنسي.
- لإضافة رسالة جديدة: أضف النص العربي في المسار كالمعتاد، ثم أضف الترجمة الفرنسية في
  قاموس `MESSAGES` (أو بادئة في `PREFIXES`، أو نمط في `PATTERNS`).
- `backend/scripts/extract-strings.mjs` يستخرج كل النصوص العربية من الخادم للمساعدة في
  تغطية الترجمات.

## 8. التحقق قبل التسليم

```
node scripts/check-i18n.mjs     # لا مفاتيح ناقصة في ar/fr
npm run build                   # بناء سليم
```

ثم تصفّح الصفحات باللغتين وتأكد من: الاتجاه، عدم ظهور مفاتيح خام
(`common.xxx`)، وتصدير PDF/Excel باللغة المختارة.
