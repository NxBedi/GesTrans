// Loads every translation file in this folder. To add a language, drop a new
// <code>.json file here (with a "_meta" block) and it is picked up automatically.
const modules = import.meta.glob('./*.json', { eager: true });

export const DICTIONARIES = {};

Object.entries(modules).forEach(([path, mod]) => {
  const data = mod?.default ?? mod;
  if (!data || typeof data !== 'object') return;
  const code = String(path).replace('./', '').replace('.json', '');
  DICTIONARIES[code] = data;
});

export const DEFAULT_LANG = 'ar';

export const LANG_CODES = Object.keys(DICTIONARIES);

export function metaOf(code) {
  const meta = DICTIONARIES[code]?._meta || {};
  return {
    code,
    label: meta.label || code.toUpperCase(),
    dir: meta.dir === 'ltr' ? 'ltr' : 'rtl',
    locale: meta.locale || code,
    flag: meta.flag || '',
  };
}

export const LANGUAGES = LANG_CODES.map(metaOf);
