import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { loadLesson } from '../content/api';
import { ChapterBody, OverviewBody } from '../content/LessonView';
import type { Lesson } from '../content/types';
import { Notice, Spinner } from '../design/ui';
import { useI18n } from '../i18n';

export function LessonPage() {
  const { lessonId = '', chapterId } = useParams();
  const nav = useNavigate();
  const { t, num, locale } = useI18n();
  const { progress } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState(false);
  const [read, setRead] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLesson(null); setError(false);
    loadLesson(lessonId).then(setLesson).catch(() => setError(true));
  }, [lessonId]);

  useEffect(() => {
    let alive = true;
    void progress.list('read:').then((rows) => { if (alive) setRead(Object.fromEntries(rows.map((r) => [r.key, r.data.done === true]))); });
    return () => { alive = false; };
  }, [progress, lessonId, chapterId]);

  // In-lesson links like "#3-strings" go to that chapter.
  const onAnchor = useCallback((hash: string) => {
    if (!lesson) return;
    const ch = lesson.chapters.find((c) => c.id === hash);
    if (ch) nav(`/lesson/${lessonId}/${ch.id}`);
    else document.getElementById(hash)?.scrollIntoView();
  }, [lesson, lessonId, nav]);

  if (error) return <Notice kind="bad" live>{t('lesson.loadFailed')}</Notice>;
  if (!lesson) return <Spinner label={t('app.loading')} />;
  const idx = chapterId ? lesson.chapters.findIndex((c) => c.id === chapterId) : -1;
  if (chapterId && idx < 0) return <Notice kind="warn" live>{t('lesson.notFound')}</Notice>;
  const prev = idx > 0 ? lesson.chapters[idx - 1] : idx === 0 ? null : null;
  const next = idx >= 0 ? lesson.chapters[idx + 1] : lesson.chapters[0];
  const key = idx >= 0 ? `read:${lesson.chapters[idx].n}` : '';
  const isRead = key ? read[key] === true : false;

  const mark = async () => { await progress.save(key, { done: true }); setRead((r) => ({ ...r, [key]: true })); };

  return (
    <div className="layout">
      <nav className="rail" aria-label={t('lesson.contents')}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>{t('lesson.contents')}</h2>
        <ol>
          <li><Link to={`/lesson/${lessonId}`} aria-current={idx < 0 ? 'true' : undefined}>{t('lesson.overview')}</Link></li>
          {lesson.chapters.map((c) => (
            <li key={c.id}>
              <Link to={`/lesson/${lessonId}/${c.id}`} aria-current={c.id === chapterId ? 'true' : undefined} lang="en" dir="ltr">
                {num(c.n)}. {c.title}{read[`read:${c.n}`] ? ' ✓' : ''}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      <div>
        {locale === 'fa' && <Notice kind="info">{t('lesson.notTranslated')}</Notice>}
        {idx < 0 ? <OverviewBody lesson={lesson} onAnchor={onAnchor} /> : <ChapterBody lesson={lesson} chapterIndex={idx} onAnchor={onAnchor} />}
        <div className="row" style={{ marginTop: 28, justifyContent: 'space-between' }}>
          {prev ? <Link className="btn quiet" to={`/lesson/${lessonId}/${prev.id}`}>← {t('lesson.prev')}</Link> : idx === 0 ? <Link className="btn quiet" to={`/lesson/${lessonId}`}>← {t('lesson.overview')}</Link> : <span />}
          {key && <button type="button" className="btn alt" onClick={mark} disabled={isRead}>{isRead ? '✓ ' + t('lesson.isRead') : t('lesson.markRead')}</button>}
          {next ? <Link className="btn" to={`/lesson/${lessonId}/${next.id}`}>{t('lesson.next')} →</Link> : <span />}
        </div>
      </div>
    </div>
  );
}
