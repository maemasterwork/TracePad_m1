import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function NotFound() {
  const { t } = useI18n();
  return <div style={{ textAlign: 'center', padding: '60px 0' }}><h1>{t('notfound.title')}</h1><p>{t('notfound.body')}</p><Link className="btn" to="/">{t('nav.home')}</Link></div>;
}
