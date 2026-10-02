export const COMPANY = {
  nameAr: 'مؤسسة التوبة للتخليص الجمركي',
  nameFr: 'Établissement TEWBA',
  form: 'ETS TEWBA',
  tel: '+222 22 43 50 99 - 49 94 69 11',
  email: 'etstewba@gmail.com',
  nifRcAgrement: 'NIF : 00792648 - Agrément N°104/TRASSA/1999',
};

let current = { ...COMPANY };

// Live company identity loaded from /api/settings/company. Non-React utilities
// (PDF/Excel exports) read this store at call time so saved changes apply immediately.
export function getCompany() {
  return current;
}

export function setCompany(data) {
  current = { ...current, ...(data || {}) };
  return current;
}