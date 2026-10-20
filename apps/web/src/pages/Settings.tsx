import { Field } from '../design/ui';
import { useI18n } from '../i18n';
import { setPrefs, usePrefs, type Prefs } from '../prefs/store';

export function Settings() {
  const { t } = useI18n();
  const p = usePrefs();
  const sel = <K extends keyof Prefs>(key: K, values: Prefs[K][], ns: string, label: string) => (
    <Field label={label}>{(f) => (
      <select {...f} value={String(p[key])} onChange={(e) => setPrefs({ [key]: e.target.value } as Partial<Prefs>)}>
        {values.map((v) => <option key={String(v)} value={String(v)}>{t(`${ns}.${String(v)}`)}</option>)}
      </select>)}</Field>
  );
  return (
    <div style={{ maxWidth: 640, margin: '24px auto' }}>
      <h1>{t('settings.title')}</h1>
      <p>{t('settings.help')}</p>
      <div className="card">
        {sel('theme', ['system', 'light', 'dark', 'contrast'], 'settings.theme', t('settings.theme'))}
        <Field label={t('settings.fontSize', { pct: p.fontSize })}>{(f) => <input {...f} type="range" min={80} max={200} step={10} value={p.fontSize} onChange={(e) => setPrefs({ fontSize: Number(e.target.value) })} />}</Field>
        {sel('spacing', ['normal', 'relaxed', 'wide'], 'settings.spacing', t('settings.spacing'))}
        {sel('palette', ['default', 'cb'], 'settings.palette', t('settings.palette'))}
        <label className="switch"><input type="checkbox" checked={p.dyslexia} onChange={(e) => setPrefs({ dyslexia: e.target.checked })} /> {t('settings.dyslexia')}</label><br />
        <label className="switch"><input type="checkbox" checked={p.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /> {t('settings.motion')}</label><br />
        <label className="switch"><input type="checkbox" checked={p.simpleLanguage} onChange={(e) => setPrefs({ simpleLanguage: e.target.checked })} /> {t('settings.simple')}</label>
      </div>
      <div className="card"><p style={{ margin: 0 }}>{t('settings.preview')}</p></div>
    </div>
  );
}
