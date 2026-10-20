import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { loadCourse } from '../content/api';
import type { Course } from '../content/types';
import { Notice, Spinner } from '../design/ui';
import { useI18n } from '../i18n';

export function Home() {
  const { t, pick, num } = useI18n();
  const { status, configured } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadCourse().then(setCourse).catch(() => setFailed(true)); }, []);
  const first = course?.lessons.find((l) => l.status === 'published');
  return (
    <>
      <section className="hero">
        <h1>{course ? pick(course.course.title) : t('home.title')}</h1>
        <p className="lead">{course ? pick(course.course.tagline) : t('home.lead')}</p>
        {first && <Link className="btn" to={`/lesson/${first.id}`}>{t('home.start')}</Link>}
      </section>
      {!configured && <Notice kind="info">{t('home.notConfigured')}</Notice>}
      {configured && status === 'guest' && <Notice kind="info">{t('home.guest')}</Notice>}
      {failed && <Notice kind="bad" live>{t('lesson.loadFailed')}</Notice>}
      {!course && !failed && <Spinner label={t('app.loading')} />}
      {course && (
        <ul className="lesson-list">
          {course.lessons.map((l) => (
            <li key={l.id}>
              <div className={'card' + (l.status === 'planned' ? ' planned' : '')}>
                <span className="num" aria-hidden="true">{num(l.number)}</span>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}><span className="sr-only">{t('home.lesson', { n: num(l.number) })}: </span>{pick(l.title)}</h2>
                {l.status === 'published'
                  ? <>
                      <span className="chip">{t('home.chapters', { n: l.chapters?.length ?? 0 })}</span>
                      <Link className="btn small" style={{ marginTop: 'auto' }} to={`/lesson/${l.id}`}>{t('home.open')}</Link>
                    </>
                  : <span className="chip warn" style={{ marginTop: 'auto' }}>{t('home.planned')}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
