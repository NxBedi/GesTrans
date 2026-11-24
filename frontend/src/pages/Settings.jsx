import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCompany } from '../contexts/CompanyContext.jsx';
import { useFeedback } from '../components/Feedback.jsx';
import { useI18n } from '../i18n/I18nContext.jsx';
import { settingsApi, backupsApi } from '../utils/api.js';
import { bumpLogo } from '../utils/logo.js';
import CompanyLogo from '../components/CompanyLogo.jsx';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export default function Settings() {
  const { user } = useAuth();
  const { company, saveCompany } = useCompany();
  const { toast, confirm } = useFeedback();
  const { t, fmt, dtm, companyName, roleLabel } = useI18n();
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
      toast(t('settings.savedCompany'), 'success');
    } catch (err) {
      toast(err.message || t('settings.saveCompanyError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast(t('settings.logoTypeError'), 'error');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast(t('settings.logoSizeError'), 'error');
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
      toast(t('settings.logoUpdated'), 'success');
    } catch (err) {
      toast(err.message || t('settings.logoError'), 'error');
    } finally {
      setLogoBusy(false);
    }
  };

  const resetLogo = async () => {
    const ok = await confirm(t('settings.confirmResetLogo'));
    if (!ok) return;
    try {
      await settingsApi.resetLogo();
      bumpLogo();
      toast(t('settings.resetLogoDone'), 'success');
    } catch (err) {
      toast(err.message || t('settings.resetLogoError'), 'error');
    }
  };

  const doCreateBackup = async () => {
    setBackupBusy(true);
    try {
      const b = await backupsApi.create();
      toast(t('settings.backupCreated', { name: b.name }), 'success');
      await refreshBackups();
    } catch (err) {
      toast(err.message || t('settings.backupCreateError'), 'error');
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
      toast(err.message || t('errors.downloadFailed'), 'error');
    }
  };

  const doDeleteBackup = async (name) => {
    const ok = await confirm(t('settings.confirmDeleteBackup', { name }));
    if (!ok) return;
    try {
      await backupsApi.remove(name);
      toast(t('settings.backupDeleted'), 'success');
      await refreshBackups();
    } catch (err) {
      toast(err.message || t('settings.backupDeleteError'), 'error');
    }
  };

  const doRestoreBackup = async (name) => {
    const ok = await confirm(t('settings.confirmRestore'));
    if (!ok) return;
    setRestoreBusy(true);
    try {
      const r = await backupsApi.restore(name);
      toast(r.safetyCopy
        ? t('settings.restoreSuccessSafety', { name, safety: r.safetyCopy })
        : t('settings.restoreSuccess', { name }), 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message || t('errors.restoreFailed'), 'error');
      setRestoreBusy(false);
    }
  };

  const doRestoreUpload = async () => {
    if (!restoreFile) return;
    const ok = await confirm(t('settings.confirmRestoreFile', { name: restoreFile.name }));
    if (!ok) return;
    setRestoreBusy(true);
    try {
      const r = await backupsApi.upload(restoreFile);
      toast(r.safetyCopy
        ? t('settings.restoreUploadSuccessSafety', { safety: r.safetyCopy })
        : t('settings.restoreUploadSuccess'), 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast(err.message || t('errors.restoreFailed'), 'error');
      setRestoreBusy(false);
    }
  };

  const fmtSize = (n) => (n > 1024 * 1024
    ? `${fmt(n / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t('settings.unitMb')}`
    : `${fmt(n / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t('settings.unitKb')}`);

  const stat = [
    { l: t('auth.username'), v: user?.full_name || '—' },
    { l: t('settings.statRole'), v: user?.role ? roleLabel(user.role) : '—' },
    { l: t('settings.statContainers'), v: t('settings.statContainersValue') },
  ];

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="toolbar">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-sub">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">{t('settings.logoTitle')}</div></div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 96, height: 96, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <CompanyLogo alt={companyName(company)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={pickLogo} />
            <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>{t('settings.logoHint')}</p>
            {logoPreview ? (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <img src={logoPreview} alt={t('settings.preview')} style={{ height: 56, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: 4 }} />
                <button className="btn btn-primary btn-sm" onClick={saveLogo} disabled={logoBusy}>{logoBusy ? t('settings.saving') : t('settings.saveLogo')}</button>
                <button className="btn btn-outline btn-sm" onClick={() => setLogoPreview(null)}>{t('common.cancel')}</button>
              </div>
            ) : (
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={resetLogo}>{t('settings.resetLogo')}</button>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">{t('settings.companyTitle')}</div></div>
        <form onSubmit={save} className="grid grid-2" style={{ gap: 14 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('settings.nameAr')}</label>
            <input className="input" dir="rtl" value={form.nameAr} onChange={setF('nameAr')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('settings.nameFr')}</label>
            <input className="input" dir="ltr" value={form.nameFr} onChange={setF('nameFr')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('settings.formLabel')}</label>
            <input className="input" dir="ltr" value={form.form} onChange={setF('form')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('common.phone')}</label>
            <input className="input" dir="ltr" value={form.tel} onChange={setF('tel')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('common.email')}</label>
            <input className="input" dir="ltr" value={form.email} onChange={setF('email')} />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('settings.nifLabel')}</label>
            <input className="input" dir="ltr" value={form.nifRcAgrement} onChange={setF('nifRcAgrement')} />
          </div>
          <div className="modal-actions" style={{ gridColumn: '1 / -1', justifyContent: 'flex-start' }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('settings.saving') : t('settings.saveCompany')}</button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header"><div className="card-title">{t('settings.backupTitle')}</div></div>
        <p className="muted" style={{ marginTop: 4, fontSize: 13, lineHeight: 1.7 }}>
          {t('settings.backupHint')}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={doCreateBackup} disabled={backupBusy || restoreBusy}>
            {backupBusy ? t('settings.creatingBackup') : t('settings.createBackup')}
          </button>
          <label className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            {t('settings.restoreFromFile')} <input type="file" accept=".dump" style={{ display: 'none' }} onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
          </label>
          {restoreFile && (
            <>
              <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{restoreFile.name}</span>
              <button className="btn btn-danger btn-sm" onClick={doRestoreUpload} disabled={restoreBusy}>
                {restoreBusy ? t('settings.restoring') : t('settings.restoreFile')}
              </button>
            </>
          )}
        </div>

        {backups.length === 0 ? (
          <p className="muted" style={{ marginTop: 14 }}>{t('settings.noBackups')}</p>
        ) : (
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="table">
              <thead>
                <tr><th>{t('settings.colBackup')}</th><th>{t('settings.colSize')}</th><th>{t('common.date')}</th><th></th></tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.name}>
                    <td className="nowrap" style={{ fontFamily: 'monospace' }}>{b.name}</td>
                    <td className="nowrap">{fmtSize(b.size)}</td>
                    <td className="nowrap">{dtm(b.created)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => doDownloadBackup(b.name)}>{t('settings.download')}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => doRestoreBackup(b.name)} disabled={restoreBusy}>{t('settings.restore')}</button>
                        <button className="btn btn-outline btn-sm" onClick={() => doDeleteBackup(b.name)}>{t('common.delete')}</button>
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
        <div className="card-header"><div className="card-title">{t('settings.sessionTitle')}</div></div>
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
