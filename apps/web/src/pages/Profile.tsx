import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthError } from '../auth/api';
import { useAuth } from '../auth/AuthProvider';
import { Field, Notice } from '../design/ui';
import { useI18n } from '../i18n';
import { setPrefs } from '../prefs/store';

const k = (e: unknown) => (e instanceof AuthError ? e.key : 'auth.errGeneric');

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Profile() {
  const { t, locale } = useI18n();
  const { api, user, profile, refreshProfile, status } = useAuth();
  const [name, setName] = useState(''); const [saved, setSaved] = useState(false); const [msg, setMsg] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const [code, setCode] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null); const [mfaCode, setMfaCode] = useState('');
  const [del, setDel] = useState(''); const [showDel, setShowDel] = useState(false);

  useEffect(() => { if (profile) setName(profile.full_name); }, [profile]);
  useEffect(() => { void api?.mfaFactors().then(setFactors).catch(() => undefined); }, [api]);
  if (status === 'loading') return null;
  if (!user || !api) return <Navigate to="/signin" replace />;
  const flash = (kind: 'good' | 'bad', text: string) => setMsg({ kind, text });
  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => { e?.preventDefault(); setMsg(null); try { await fn(); } catch (x) { flash('bad', t(k(x))); } };
  const verified = factors.filter((f) => f.status === 'verified');

  return (
    <div style={{ maxWidth: 720, margin: '24px auto' }}>
      <h1>{t('profile.title')}</h1>
      <p>{t('profile.signedInAs', { who: profile?.username ?? user.email ?? '' })}{profile && <> · <span className="chip">{t('profile.role.' + profile.role)}</span></>}</p>
      {msg && <Notice kind={msg.kind} live>{msg.text}</Notice>}

      <section className="card" aria-labelledby="p-details">
        <h2 id="p-details" style={{ marginTop: 0 }}>{t('profile.details')}</h2>
        <form onSubmit={run(async () => { await api.updateProfile(user.id, { full_name: name.trim().slice(0, 80), locale }); await refreshProfile(); setSaved(true); setTimeout(() => setSaved(false), 2000); })}>
          <Field label={t('auth.fullName')}>{(p) => <input {...p} type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label={t('profile.language')}>{(p) => (
            <select {...p} value={locale} onChange={(e) => setPrefs({ locale: e.target.value === 'fa' ? 'fa' : 'en' })}>
              <option value="en">English</option><option value="fa">فارسی</option>
            </select>)}</Field>
          <button className="btn" disabled={!name.trim()}>{saved ? t('app.saved') : t('app.save')}</button>
        </form>
      </section>

      {profile?.role === 'student' && (
        <section className="card" aria-labelledby="p-teacher">
          <h2 id="p-teacher" style={{ marginTop: 0 }}>{t('profile.teacherTitle')}</h2>
          <p>{t('profile.teacherHelp')}</p>
          <form onSubmit={run(async () => { const ok = await api.claimTeacher(code); if (ok) { await refreshProfile(); flash('good', t('profile.teacherOk')); } else flash('bad', t('profile.teacherBad')); setCode(''); })}>
            <Field label={t('profile.teacherCode')}>{(p) => <input {...p} type="password" autoComplete="off" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
            <button className="btn alt" disabled={!code}>{t('profile.teacherClaim')}</button>
          </form>
        </section>
      )}

      <section className="card" aria-labelledby="p-sec">
        <h2 id="p-sec" style={{ marginTop: 0 }}>{t('profile.security')}</h2>
        <form onSubmit={run(async () => { await api.changeEmail(email); setEmail(''); flash('good', t('profile.emailChangeSent')); })}>
          <Field label={t('profile.changeEmail')}>{(p) => <input {...p} type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <button className="btn alt" disabled={!email}>{t('app.save')}</button>
        </form>
        <form onSubmit={run(async () => { await api.updatePassword(pw); setPw(''); flash('good', t('auth.passwordChanged')); })}>
          <Field label={t('profile.changePassword')} hint={t('auth.passwordHint')}>{(p) => <input {...p} type="password" autoComplete="new-password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <button className="btn alt" disabled={!pw}>{t('app.save')}</button>
        </form>
        <h3>{t('profile.sessions')}</h3>
        <button type="button" className="btn quiet" onClick={run(async () => { await api.signOutOthers(); flash('good', t('profile.signedOutOthers')); })}>{t('profile.signOutOthers')}</button>
        <h3>{t('profile.mfaTitle')}</h3>
        <p>{t('profile.mfaWhy')}</p>
        {verified.length > 0 ? (
          <div className="row"><span className="chip good">{t('profile.mfaOn')}</span>
            <button type="button" className="btn small quiet" onClick={run(async () => { for (const f of verified) await api.mfaRemove(f.id); setFactors(await api.mfaFactors()); })}>{t('profile.mfaOff')}</button></div>
        ) : enroll ? (
          <form onSubmit={run(async () => { try { await api.mfaVerify(enroll.id, mfaCode); setEnroll(null); setMfaCode(''); setFactors(await api.mfaFactors()); } catch (x) { flash('bad', t(k(x))); } })}>
            <p>{t('profile.mfaScan')}</p>
            <img src={enroll.qr} alt="" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
            <p className="code-ltr"><code>{t('profile.mfaSecret', { secret: enroll.secret })}</code></p>
            <Field label={t('profile.mfaCode')}>{(p) => <input {...p} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} />}</Field>
            <button className="btn" disabled={mfaCode.length !== 6}>{t('profile.mfaVerify')}</button>
          </form>
        ) : <button type="button" className="btn alt" onClick={run(async () => setEnroll(await api.mfaEnroll()))}>{t('profile.mfaEnable')}</button>}
      </section>

      <section className="card" aria-labelledby="p-priv">
        <h2 id="p-priv" style={{ marginTop: 0 }}>{t('profile.privacy')}</h2>
        <p>{t('profile.privacyHelp')}</p>
        <div className="row">
          <button type="button" className="btn alt" onClick={run(async () => download('tracepad-my-data.json', await api.exportData()))}>{t('profile.export')}</button>
          <button type="button" className="btn danger" onClick={() => setShowDel(true)} aria-expanded={showDel}>{t('profile.delete')}</button>
        </div>
        {showDel && (
          <form onSubmit={run(async () => { await api.deleteAccount(); })} style={{ marginTop: 12 }}>
            <Notice kind="warn">{t('profile.deleteConfirm')}</Notice>
            <Field label={t('profile.deleteWord')}>{(p) => <input {...p} type="text" autoComplete="off" dir="ltr" value={del} onChange={(e) => setDel(e.target.value)} />}</Field>
            <div className="row"><button className="btn danger" disabled={del !== t('profile.deleteWord')}>{t('profile.delete')}</button>
              <button type="button" className="btn quiet" onClick={() => { setShowDel(false); setDel(''); }}>{t('app.cancel')}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
