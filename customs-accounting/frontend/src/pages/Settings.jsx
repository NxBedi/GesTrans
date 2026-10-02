import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { useFeedback } from '../components/Feedback.jsx';
import { settingsApi, backupsApi } from '../utils/api.js';
import { bumpLogo } from '../utils/logo.js';
import CompanyLogo from '../components/CompanyLogo.jsx';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export default function Settings() {
  const { user } = useAuth();
  const { company, saveCompany } = useCompany();
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState({ ...company });
  const [busy, setBusy] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);

  useEffect(() => { setForm({ ...company }); }, [company]);

  const refreshBackups = async () => {
    try { setBackups(await backupsApi.list()); } catch { setBackups([]); }
  };
  useEffect(() => { refreshBackups(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveCompany(form);
      toast('تم حفظ بيانات المؤسسة بنجاح — تُطبق على التقارير والمطبوعات فوراً', 'success');
    } catch (err) {
      toast(err.message || 'تعذّر حفظ البيانات', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast('اختر صورة PNG أو JPG أو WEBP أو GIF أو SVG', 'error');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast('حجم الصورة يتجاوز 3MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const saveLogo = async () => {
    if (!logoPreview) return;
    setLogoBusy(true);
    try {
      await settingsApi.uploadLogo(logoPreview);
      bumpLogo();
      setLogoPreview(null);
      toast('تم تحديث شعار الشركة بنجاح', 'success');
    } catch (err) {
      toast(err.message || 'تعذّر حفظ الشعار', 'error');
    } finally {
      setLogoBusy(false);
    }
  };

  const resetLogo = async () => {
    const ok = await confirm('استعادة الشعار الافتراضي؟ سيُزال الشعار المخصص ويرجع النظام لشعاره الأصلي.');
    if (!ok) return;
    try {
      await settingsApi.resetLogo();
      bumpLogo();
      toast('تمت استعادة الشعار الافتراضي', 'success');
    } catch (err) {
      toast(err.message || 'تعذّرت الاستعادة', 'error');
    }
  };

  const doCreateBackup = async () => {
    setBackupBusy(true);
    try {
      const b = await backupsApi.create();
      toast(`تم إنشاء النسخة «${b.name}»`, 'success');
      await refreshBackups();
    } catch (err) {
      toast(err.message || 'تعذّر إنشاء النسخة', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const doDownloadBackup = async (name) => {
    try {
      const blob = await backupsApi.download(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message || 'تعذّر التحميل', 'error');
    }
  };

  const doDeleteBackup = async (name) => {
    const ok = await confirm(`حذف النسخة «${name}» نهائياً؟`);
    if (!ok) return;
    try {
      await backupsApi.remove(name);
      toast('تم حذف النسخة', 'success');
      await refreshBackups();
    } catch (err) {
      toast(err.message || 'تعذّر الحذف', 'error');
    }
  };

  const doRestoreBackup = async (name) => {
    const ok = await confirm('استعادة هذه النسخة؟ سَتُستبدَل كل البيانات الحالية بالنقاط من النسخة. سيؤخذ نسخة أمان تلقائية قبل الاستعادة، وسيُغلق النظام لحظات أثناء التطبيق.');
    if (!ok) return;
    setRestoreBusy(true);
    try {
      const r = await backupsApi.restore(name);
      toast(`تمت الاستعادة بنجاح — النسخة: ${name}${r.safetyCopy ? ` (نسخة الأمان: ${r.safetyCopy})` : ''}`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message || 'فشلت الاستعادة', 'error');
      setRestoreBusy(false);
    }
  };

  const doRestoreUpload = async () => {
    if (!restoreFile) return;
    const ok = await confirm(`استعادة النسخة من ملف «${restoreFile.name}»؟ سَتُستبدَل كل البيانات الحالية. سيؤخذ نسخة أمان تلقائية قبل الاستعادة.`);
    if (!ok) return;
    setRestoreBusy(true);
    try {
      const r = await backupsApi.upload(restoreFile);
      toast(`تمت الاستعادة بنجاح${r.safetyCopy ? ` — نسخة الأمان: ${r.safetyCopy}` : ''}`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message || 'فشلت الاستعادة', 'error');
      setRestoreBusy(false);
    }
  };

  const fmtSize = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

  const stat = [
    { l: 'اسم المستخدم', v: user?.full_name || '—' },
    { l: 'الدور', v: user?.role === 'manager' ? 'مدير' : 'موظف' },
    { l: 'إجمالي الحاويات', v: 'محمّل من لوحة التحكم' },
  ];

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="toolbar">
        <div>
          <h1 className="page-title">إعدادات النظام</h1>
          <p className="page-sub">بيانات المؤسسة وتفضيلات النظام</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">🖼️ شعار الشركة (يظهر في صندوق الدخول، القائمة الجانبية والمطبوعات)</div></div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 96, height: 96, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <CompanyLogo alt="الشعار الحالي" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={pickLogo} />
            <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>PNG، JPG، WEBP، GIF أو SVG — حد أقصى 3MB</p>
            {logoPreview ? (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <img src={logoPreview} alt="معاينة الشعار" style={{ height: 56, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: 4 }} />
                <button className="btn btn-primary btn-sm" onClick={saveLogo} disabled={logoBusy}>{logoBusy ? 'جارٍ الحفظ...' : '💾 حفظ الشعار'}</button>
                <button className="btn btn-outline btn-sm" onClick={() => setLogoPreview(null)}>إلغاء</button>
              </div>
            ) : (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={resetLogo}>↩️ استعادة الشعار الافتراضي</button>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">🏢 بيانات المؤسسة (تُعرض في التقارير والمطبوعات)</div></div>
        <form onSubmit={save} className="grid grid-2" style={{ gap: 14 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">الاسم بالعربية</label>
            <input className="input" dir="rtl" value={form.nameAr} onChange={setF('nameAr')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">الاسم بالفرنسية</label>
            <input className="input" dir="ltr" value={form.nameFr} onChange={setF('nameFr')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">الصيغة (الاسم المختصر)</label>
            <input className="input" dir="ltr" value={form.form} onChange={setF('form')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">الهاتف</label>
            <input className="input" dir="ltr" value={form.tel} onChange={setF('tel')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">البريد</label>
            <input className="input" dir="ltr" value={form.email} onChange={setF('email')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">NIF / RC / Agrément</label>
            <input className="input" dir="ltr" value={form.nifRcAgrement} onChange={setF('nifRcAgrement')} />
          </div>
          <div className="modal-actions" style={{ gridColumn: '1 / -1', justifyContent: 'flex-start' }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ البيانات'}</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">💾 النسخ الاحتياطي والاستعادة</div></div>
        <p className="muted" style={{ marginTop: 4, fontSize: 13, lineHeight: 1.7 }}>
          تُنشأ نسخة تلقائياً يومياً (تُحتفظ بآخر 14 نسخة). الاستعادة تستبدل كل البيانات — يُؤخذ نسخة أمان تلقائية قبل الاستعادة ويُغلق النظام لحظات.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={doCreateBackup} disabled={backupBusy || restoreBusy}>
            {backupBusy ? '⏳ جارٍ الإنشاء...' : '➕ إنشاء نسخة الآن'}
          </button>
          <label className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            ⬆️ استعادة من ملف <input type="file" accept=".dump" style={{ display: 'none' }} onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
          </label>
          {restoreFile && (
            <>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{restoreFile.name}</span>
              <button className="btn btn-danger btn-sm" onClick={doRestoreUpload} disabled={restoreBusy}>
                {restoreBusy ? '⏳ جارٍ الاستعادة...' : 'استعادة الملف'}
              </button>
            </>
          )}
        </div>

        {backups.length === 0 ? (
          <p className="muted" style={{ marginTop: 14 }}>لا توجد نسخ احتياطية بعد.</p>
        ) : (
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="table">
              <thead>
                <tr><th>النسخة</th><th>الحجم</th><th>التاريخ</th><th></th></tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td className="nowrap" style={{ fontFamily: 'monospace' }}>{b.name}</td>
                    <td className="nowrap">{fmtSize(b.size)}</td>
                    <td className="nowrap">{new Date(b.created).toLocaleString('ar')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => doDownloadBackup(b.name)}>تحميل</button>
                        <button className="btn btn-danger btn-sm" onClick={() => doRestoreBackup(b.name)} disabled={restoreBusy}>استعادة</button>
                        <button className="btn btn-outline btn-sm" onClick={() => doDeleteBackup(b.name)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">👤 الجلسة الحالية</div></div>
        <div className="grid grid-3">
          {stat.map((s, i) => (
            <div key={i}>
              <div className="kpi-label">{s.l}</div>
              <div className="kpi-value" style={{ fontSize: 17 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}