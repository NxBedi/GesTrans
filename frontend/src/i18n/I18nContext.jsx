import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DICTIONARIES, LANGUAGES, metaOf } from './dictionaries.js';
import * as rt from './runtime.js';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => rt.getLang());

  // keep <html lang/dir>, the document title and the module runtime in sync
  useEffect(() => {
    rt.setLang(lang);
    const meta = metaOf(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir;
    document.title = rt.translate('common.appTitle', null, lang);
  }, [lang]);

  const setLang = useCallback((code) => {
    if (!DICTIONARIES[code]) return;
    rt.setLang(code);
    setLangState(code);
  }, []);

  const toggleLang = useCallback(() => {
    const idx = LANGUAGES.findIndex((l) => l.code === lang);
    const next = LANGUAGES[(idx + 1) % LANGUAGES.length];
    if (next) setLang(next.code);
  }, [lang, setLang]);

  const value = useMemo(() => {
    const meta = metaOf(lang);
    const label = (ns, code) => {
      if (!code) return '';
      const key = `${ns}.${code}`;
      const text = rt.translate(key, null, lang);
      return text === key ? code : text;
    };
    return {
      lang,
      setLang,
      toggleLang,
      dir: meta.dir,
      locale: meta.locale,
      languages: LANGUAGES,
      t: (key, vars) => rt.translate(key, vars, lang),
      fmt: (n, opts) => rt.fmt(n, opts),
      money: (n) => rt.money(n),
      dmy: (iso) => rt.dmy(iso),
      dlong: (iso) => rt.dlong(iso),
      dtm: (iso) => rt.dtm(iso),
      statusLabel: (code) => label('status', code),
      debtLabel: (code) => label('debtStatus', code),
      kindLabel: (code) => label('kinds', code),
      roleLabel: (code) => label('roles', code),
      companyName: (company) => rt.companyName(company),
      isRtl: meta.dir === 'rtl',
    };
  }, [lang, setLang, toggleLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export default I18nContext;
