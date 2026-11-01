// Server-side i18n: the API speaks Arabic by default and French when the
// client sends "Accept-Language: fr". Messages are translated centrally in
// res.json(), so route handlers keep their original (Arabic) wording.

const MESSAGES = {
  'LIQUIDATION مسجلة بالفعل لهذه الحاوية': 'LIQUIDATION déjà enregistrée pour ce conteneur',
  'Old Debt / دين قديم — رصيد سابق': 'Ancienne dette / solde antérieur',
  'أدخل اسم المستخدم وكلمة المرور': "Saisissez le nom d'utilisateur et le mot de passe",
  'أدخل الرصيد الفعلي المُدقّق بعد العدد': 'Saisissez le solde réel vérifié après comptage',
  'أدخل رصيداً افتتاحياً صحيحاً': "Saisissez un solde d'ouverture valide",
  'أدخل سعراً نهائياً صحيحاً أكبر من صفر': 'Saisissez un prix final valide supérieur à zéro',
  'أدخل مبلغاً صحيحاً أكبر من صفر': 'Saisissez un montant valide supérieur à zéro',
  'أموال المالك': 'Fonds du propriétaire',
  'أيام التخزين المجاني يجب أن تكون عدداً بين 0 و 365': 'Les jours de stockage gratuit doivent être compris entre 0 et 365',
  'إيداع رأس مال': 'Apport de capital',
  'اسم الزبون مطلوب': 'Le nom du client est obligatoire',
  'اسم المستخدم أو كلمة المرور غير صحيحة': "Nom d'utilisateur ou mot de passe incorrect",
  'اسم المستخدم موجود مسبقاً': "Ce nom d'utilisateur existe déjà",
  'اسم النسخة غير صالح': 'Nom de sauvegarde invalide',
  'اسم نوع الفاتورة مطلوب': 'Le nom du type de facture est obligatoire',
  'الأنواع المسموحة: PNG، JPG، WEBP، GIF أو SVG': 'Formats autorisés : PNG, JPG, WEBP, GIF ou SVG',
  'البند مطلوب': 'Le libellé est obligatoire',
  'التاريخ مطلوب': 'La date est obligatoire',
  'التسوية غير موجودة': 'Ajustement introuvable',
  'الحاوية غير متاحة': 'Conteneur indisponible',
  'الحاوية غير موجودة': 'Conteneur introuvable',
  'الحاوية لا تتبع هذا الزبون': "Ce conteneur n'appartient pas à ce client",
  'الحاوية مُغلقة ولا يمكن إضافة مصاريف عليها': 'Le conteneur est clôturé : impossible d’ajouter des dépenses',
  'الحاوية يجب أن تكون مُغلقة (جاهزة للتسعير) أولاً': "Le conteneur doit d'abord être clôturé (prêt à tarifer)",
  'الحاوية يجب أن تُسعّر وتُرحَّل للحسابات قبل تسجيل التحصيل':
    "Le conteneur doit être tarifé et transféré en comptabilité avant d'enregistrer un encaissement",
  'الحركة غير موجودة': 'Mouvement introuvable',
  'الحساب غير نشط': 'Compte inactif',
  'الحساب معطل': 'Compte désactivé',
  'الدفعة غير موجودة': 'Paiement introuvable',
  'الدين السابق يجب أن يكون رقماً': "L'ancienne dette doit être un nombre",
  'الراتب يجب أن يكون مبلغاً غير سالب': 'Le salaire doit être un montant positif ou nul',
  'الزبون غير صالح': 'Client invalide',
  'الزبون غير موجود': 'Client introuvable',
  'الصندوق ليس مفتوحاً': "La caisse n'est pas ouverte",
  'الصندوق مفتوح بالفعل — أغلقه أولاً': 'La caisse est déjà ouverte : clôturez-la d’abord',
  'العملية غير موجودة': 'Opération introuvable',
  'الفاتورة غير موجودة': 'Facture introuvable',
  'القيد غير موجود': 'Écriture introuvable',
  'الكمية يجب أن تكون عدداً صحيحاً غير سالب': 'La quantité doit être un entier positif ou nul',
  'المبلغ مطلوب ويجب ألا يكون صفراً': 'Le montant est obligatoire et ne doit pas être nul',
  'المبلغ مطلوب ويجب أن يكون أكبر من صفر': 'Le montant est obligatoire et doit être supérieur à zéro',
  'المستخدم غير موجود': 'Utilisateur introuvable',
  'المصروف غير موجود': 'Dépense introuvable',
  'الملف المختار فارغ': 'Le fichier sélectionné est vide',
  'الملف لا يحوي جدول settings — ليس نسخة صالحة لهذا النظام':
    'Le fichier ne contient pas la table settings : sauvegarde invalide pour ce système',
  'الملف لا يحوي جدول users — ليس نسخة صالحة لهذا النظام':
    'Le fichier ne contient pas la table users : sauvegarde invalide pour ce système',
  'الموظف غير صالح': 'Employé invalide',
  'الموظف غير موجود': 'Employé introuvable',
  'الموظف غير موجود أو غير نشط': 'Employé introuvable ou inactif',
  'النسخة المستعادة لا تحتوي على أي مستخدم': 'La sauvegarde restaurée ne contient aucun utilisateur',
  'النوع غير موجود': 'Type introuvable',
  'انتهت الجلسة، سجل الدخول مجدداً': 'Session expirée, veuillez vous reconnecter',
  'بدون سجل': 'Sans compte',
  'تاريخ الدين الأصلي مطلوب': "La date de la dette d'origine est obligatoire",
  'تاريخ الدين القديم لا يمكن أن يكون في المستقبل': "La date de l'ancienne dette ne peut pas être dans le futur",
  'تسوية الصندوق': 'Ajustement de caisse',
  'جميع الحقول المطلوبة يجب أن تكون غير فارغة': 'Tous les champs obligatoires doivent être renseignés',
  'جميع الحقول مطلوبة': 'Tous les champs sont obligatoires',
  'جميع الحقول مطلوبة (BL، التاريخ، الزبون، رقم الحاوية، المحتوى)':
    'Tous les champs sont obligatoires (BL, date, client, n° conteneur, contenu)',
  'حجم الصورة يتجاوز 3MB': "L'image dépasse 3 Mo",
  'حجم ملف الاستعادة أكبر من المسموح (500MB)': 'Le fichier de restauration dépasse la limite autorisée (500 Mo)',
  'حدث خطأ داخلي في قاعدة البيانات': 'Erreur interne de la base de données',
  'خطأ غير متوقع': 'Erreur inattendue',
  'دفعة / إيداع': 'Paiement / dépôt',
  'دور غير صالح': 'Rôle invalide',
  'رصيد أول المدة / Opening balance': "Solde d'ouverture / Opening balance",
  'رقم BL مسجل مسبقاً': 'Ce numéro de BL est déjà enregistré',
  'رقم LIQUIDATION مطلوب': 'Le numéro LIQUIDATION est obligatoire',
  'سحب رأس مال': 'Retrait de capital',
  'صيغة الصورة غير صالحة': "Format d'image invalide",
  'غير مصرح': 'Non autorisé',
  'قيد تسجيل الفواتير': 'Saisie des factures en cours',
  'لا بقية تُدفع — راتب الشهر مستوفى بالكامل':
    'Aucun solde à payer : le salaire du mois est intégralement réglé',
  'لا توجد بيانات للتحديث': 'Aucune donnée à mettre à jour',
  'لا يمكن تعديل حاوية اكتملت معالجتها': 'Impossible de modifier un conteneur déjà traité',
  'لا يمكن تعديل فواتير حاوية تم تسعيرها': 'Impossible de modifier les factures d’un conteneur tarifé',
  'لا يمكن تعطيل آخر مدير نشط في النظام': 'Impossible de désactiver le dernier gérant actif',
  'لا يمكن تغيير الزبون بعد إغلاق الحاوية وتسعيرها':
    'Impossible de changer le client après clôture et tarification du conteneur',
  'لا يمكن حذف آخر مدير نشط في النظام': 'Impossible de supprimer le dernier gérant actif',
  'لا يمكن حذف حاوية عليها فواتير مسجلة': 'Impossible de supprimer un conteneur ayant des factures enregistrées',
  'لا يمكن حذف حاوية عليها مدفوعات مسجلة': 'Impossible de supprimer un conteneur ayant des paiements enregistrés',
  'لا يمكن حذف حاوية مُسعّرة': 'Impossible de supprimer un conteneur tarifé',
  'لا يمكن حذف زبون عليه دفعات مسجلة — يمكنك تعطيله بدلاً من ذلك':
    'Impossible de supprimer un client avec des paiements : désactivez-le plutôt',
  'لا يمكن حذف زبون له حاويات مسجلة — يمكنك تعطيله بدلاً من ذلك':
    'Impossible de supprimer un client avec des conteneurs : désactivez-le plutôt',
  'لا يمكن حذف نوع فاتورة مُستخدَم في سجلات — يمكنك تعطيله بدلاً من ذلك':
    'Impossible de supprimer un type de facture utilisé : désactivez-le plutôt',
  'لا يمكنك تعطيل حسابك الخاص': 'Vous ne pouvez pas désactiver votre propre compte',
  'لا يمكنك تغيير دور حسابك الخاص': 'Vous ne pouvez pas changer le rôle de votre propre compte',
  'لا يمكنك حذف حسابك الخاص': 'Vous ne pouvez pas supprimer votre propre compte',
  'لا يوجد تسعير': 'Aucune tarification',
  'لا يوجد شعار مخصص': 'Aucun logo personnalisé',
  'ليست لديك صلاحية لهذه العملية': "Vous n'avez pas les droits pour cette opération",
  'مؤسسة التوبة للتخليص الجمركي': 'Établissement TEWBA',
  'مدير النظام': 'Administrateur système',
  'مسار النسخة غير صالح': 'Chemin de sauvegarde invalide',
  'ملف الاستعادة فارغ': 'Fichier de restauration vide',
  'نوع الحاوية يجب أن يكون 20 أو 40': 'Le type de conteneur doit être 20 ou 40',
  'نوع الفاتورة غير موجود': 'Type de facture introuvable',
  'نوع الفاتورة غير نشط': 'Type de facture inactif',
  'نوع الفاتورة والتاريخ مطلوبان': 'Le type de facture et la date sont obligatoires',
  'هذا الإجراء للمدير فقط': 'Cette action est réservée au gérant',
  'هذه الفاتورة للمدير فقط': 'Cette facture est réservée au gérant',
  'يمكن إعادة فتح الحاويات المُسعّرة فقط': 'Seuls les conteneurs tarifés peuvent être réouverts',
  'يمكن إغلاق الحاوية وهي مسجلة أو قيد تسجيل الفواتير فقط':
    'Un conteneur ne peut être clôturé que s’il est enregistré ou en saisie de factures',
  '⚠️  JWT_SECRET غير مضبوط — يُستخدم المفتاح الافتراضي. اضبطه في backend/.env':
    '⚠️  JWT_SECRET non défini — la clé par défaut est utilisée. Configurez-la dans backend/.env',
};

// prefixes are used for the descriptions generated by SQL (movements, cash...)
const PREFIXES = [
  ['تحصيل من ', 'Encaissement de '],
  ['تكاليف حاوية ', 'Coûts conteneur '],
  ['مصروف مؤسسة: ', 'Dépense société : '],
  ['دفع مقدم من الراتب: ', 'Avance sur salaire : '],
  ['دفع بقية الراتب: ', 'Solde de salaire : '],
  ['خطأ في الخادم: ', 'Erreur serveur : '],
];

const PATTERNS = [
  [/^الحقل «(.+)» مطلوب$/, (m) => `Le champ « ${m[1]} » est obligatoire`],
  [/^المقدم يتجاوز المتبقي من راتب الشهر \((.+)\)$/, (m) => `L'avance dépasse le reste du salaire du mois (${m[1]})`],
  [/^فاتورة حاوية — BL (.+)$/, (m) => `Facture conteneur — BL ${m[1]}`],
];

export function normalizeLang(value) {
  const tag = String(value || '').split(',')[0].trim().toLowerCase();
  return tag.startsWith('fr') ? 'fr' : 'ar';
}

export function translateText(value, lang = 'ar') {
  if (lang !== 'fr' || typeof value !== 'string' || !value) return value;

  const exact = MESSAGES[value];
  if (exact) return exact;

  for (const [prefix, replacement] of PREFIXES) {
    if (value.startsWith(prefix)) {
      return replacement + translateText(value.slice(prefix.length), lang);
    }
  }

  for (const [re, build] of PATTERNS) {
    const m = value.match(re);
    if (m) return build(m);
  }

  return value;
}

// Fields that may contain user-facing messages.
const MESSAGE_FIELDS = ['error', 'message', 'warning', 'descr', 'description'];

function translatePayload(payload, lang) {
  if (Array.isArray(payload)) {
    let changed = false;
    const next = payload.map((item) => {
      const translated = translatePayload(item, lang);
      if (translated !== item) changed = true;
      return translated;
    });
    return changed ? next : payload;
  }
  if (!payload || typeof payload !== 'object') return payload;

  let changed = false;
  const next = { ...payload };
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && MESSAGE_FIELDS.includes(key)) {
      const translated = translateText(value, lang);
      if (translated !== value) { next[key] = translated; changed = true; }
    } else if (value && typeof value === 'object') {
      const translated = translatePayload(value, lang);
      if (translated !== value) { next[key] = translated; changed = true; }
    }
  }
  return changed ? next : payload;
}

export function i18nMiddleware(req, res, next) {
  req.lang = normalizeLang(req.headers['accept-language']);
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(translatePayload(payload, req.lang));
  next();
}

export default i18nMiddleware;
