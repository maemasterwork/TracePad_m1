import { Fragment } from 'react';
import { useI18n } from '../i18n';
import { CodeBlock } from '../runner/CodeBlock';
import { Markdown } from './Markdown';
import type { Block, Lesson, ListPart, Section } from './types';

interface Ctx { lesson: Lesson; onAnchor: (hash: string) => void }

function codeMeta(lesson: Lesson, id: string) {
  const m = lesson.block_meta?.[id];
  const prelude = (m?.after ?? []).map((a) => findCode(lesson, a)).filter(Boolean).join('\n');
  return { prelude: prelude || undefined, stdin: m?.stdin, usesEarlier: !!m?.after?.length };
}

function findCode(lesson: Lesson, id: string): string | undefined {
  const scan = (blocks: Block[]): string | undefined => {
    for (const b of blocks) {
      if (b.type === 'code' && b.id === id) return b.code;
      if (b.type === 'list') for (const it of b.items) for (const p of it.parts) if (p.type === 'code' && p.id === id) return p.code;
    }
    return undefined;
  };
  for (const c of lesson.chapters) {
    const r = scan(c.blocks) ?? c.sections.map((s) => scan(s.blocks)).find(Boolean);
    if (r) return r;
  }
  return undefined;
}

function Code({ lesson, id, lang, code }: { lesson: Lesson; id: string; lang: string; code: string }) {
  if (lang !== 'python' || lesson.block_meta?.[id]?.skip) {
    return <pre className="codeblock" style={{ padding: '12px 14px', margin: '14px 0', overflow: 'auto' }}><code>{code}</code></pre>;
  }
  return <CodeBlock id={id} code={code} {...codeMeta(lesson, id)} />;
}

function ListItemParts({ parts, ctx }: { parts: ListPart[]; ctx: Ctx }) {
  return (
    <>
      {parts.map((p, i) => (p.type === 'text'
        ? <Markdown key={i} src={p.md} inline={i === 0} onAnchor={ctx.onAnchor} />
        : <Code key={i} lesson={ctx.lesson} id={p.id} lang={p.lang} code={p.code} />))}
    </>
  );
}

export function BlockView({ b, ctx }: { b: Block; ctx: Ctx }) {
  switch (b.type) {
    case 'code': return <Code lesson={ctx.lesson} id={b.id} lang={b.lang} code={b.code} />;
    case 'hr': return <hr />;
    case 'list': {
      const hasCode = b.items.some((it) => it.parts.some((p) => p.type === 'code'));
      if (!hasCode) return <Markdown src={b.raw} onAnchor={ctx.onAnchor} />;
      const List = b.ordered ? 'ol' : 'ul';
      return <List>{b.items.map((it, i) => <li key={i}><ListItemParts parts={it.parts} ctx={ctx} /></li>)}</List>;
    }
    case 'checklist':
      return <ul className="checklist" style={{ listStyle: 'none', paddingInlineStart: 0 }}>{b.items.map((it, i) => (
        <li key={i}><label className="switch"><input type="checkbox" defaultChecked={it.checked} /> <Markdown src={it.text} inline /></label></li>
      ))}</ul>;
    default: return <Markdown src={b.raw} onAnchor={ctx.onAnchor} />;
  }
}

export function SectionView({ s, ctx }: { s: Section; ctx: Ctx }) {
  const Heading = s.level <= 2 ? 'h2' : 'h3';
  return (
    <section id={'sec-' + s.id.replace(/\./g, '-')} aria-labelledby={'h-' + s.id.replace(/\./g, '-')}>
      <Heading id={'h-' + s.id.replace(/\./g, '-')}>{s.heading}</Heading>
      {s.blocks.map((b, i) => <BlockView key={i} b={b} ctx={ctx} />)}
    </section>
  );
}

export function ChapterBody({ lesson, chapterIndex, onAnchor }: { lesson: Lesson; chapterIndex: number; onAnchor: (h: string) => void }) {
  const { t } = useI18n();
  const ch = lesson.chapters[chapterIndex];
  const ctx: Ctx = { lesson, onAnchor };
  return (
    <article className="prose" lang="en" dir="ltr">
      <p className="chip" aria-hidden="true">{t('lesson.chapter', { n: ch.n })}</p>
      <h1 id="chapter-title" tabIndex={-1}>{ch.heading}</h1>
      {ch.blocks.map((b, i) => <Fragment key={i}><BlockView b={b} ctx={ctx} /></Fragment>)}
      {ch.sections.map((s) => <SectionView key={s.id} s={s} ctx={ctx} />)}
    </article>
  );
}

export function OverviewBody({ lesson, onAnchor }: { lesson: Lesson; onAnchor: (h: string) => void }) {
  const ctx: Ctx = { lesson, onAnchor };
  return (
    <article className="prose" lang="en" dir="ltr">
      <h1 id="chapter-title" tabIndex={-1}>{lesson.title}</h1>
      {lesson.preamble.blocks.map((b, i) => <BlockView key={i} b={b} ctx={ctx} />)}
      {lesson.preamble.sections.map((s) => <SectionView key={s.id} s={s} ctx={ctx} />)}
    </article>
  );
}
