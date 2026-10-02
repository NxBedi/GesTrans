import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';

export default function Login() {
  const { login } = useAuth();
  const { company } = useCompany();
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
      setError(err.message || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <CompanyLogo className="login-logo" alt={company.nameAr} />
        <div className="login-title">{company.nameAr}</div>
        <div className="login-sub" dir="ltr">{company.nameFr} — {company.form}</div>
        <div className="form-row">
          <label className="form-label">اسم المستخدم</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="form-row">
          <label className="form-label">كلمة المرور</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={loading}>
          {loading ? 'جارٍ الدخول...' : 'دخول'}
        </button>
        <div className="login-sub" style={{ marginBottom: 0, marginTop: 14, fontSize: 12, direction: 'ltr' }}>
          {company.tel}<br />
          {company.nifRcAgrement}
        </div>
      </form>
    </div>
  );
}