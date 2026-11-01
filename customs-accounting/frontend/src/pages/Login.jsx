import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher.jsx';

export default function Login() {
  const { login } = useAuth();
  const { company } = useCompany();
  const { t, companyName } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username, password);
      navigate(user.role === 'manager' ? '/reports' : '/containers');
    } catch (err) {
      // backend message first (already localized), then generic fallback
      setError(err.message || t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-lang">
        <LanguageSwitcher compact />
      </div>
      <form className="login-box" onSubmit={submit}>
        <CompanyLogo className="login-logo" alt={companyName(company)} />
        <div className="login-title">{companyName(company)}</div>
        <div className="login-sub" dir="ltr">{company.nameFr} — {company.form}</div>
        <div className="form-row">
          <label className="form-label" htmlFor="login-username">{t('auth.username')}</label>
          <input
            id="login-username"
            className="input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <label className="form-label" htmlFor="login-password">{t('auth.password')}</label>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={loading}>
          {loading ? t('auth.submitting') : t('auth.submit')}
        </button>
        <div className="login-sub" style={{ marginBottom: 0, marginTop: 14, fontSize: 12, direction: 'ltr' }}>
          {company.tel}<br />
          {company.nifRcAgrement}
        </div>
      </form>
    </div>
  );
}
