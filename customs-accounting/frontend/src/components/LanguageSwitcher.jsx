import { useI18n } from '../i18n/I18nContext.jsx';

// Small segmented control listing every available language.
// Adding a new translation file automatically adds its button here.
export default function LanguageSwitcher({ compact = false, className = '' }) {
  const { lang, setLang, languages, t } = useI18n();

  return (
    <div
      className={`lang-switch${compact ? ' lang-switch-compact' : ''} ${className}`.trim()}
      role="group"
      aria-label={t('common.language')}
    >
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-btn${l.code === lang ? ' active' : ''}`}
          onClick={() => setLang(l.code)}
          aria-pressed={l.code === lang}
          title={l.label}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
