import MarkdownIt from 'markdown-it';
import { useMemo } from 'react';
import { useI18n } from '../i18n';

// html:false means raw HTML in the lesson text is escaped, never rendered. markdown-it also refuses javascript: links.
const md = new MarkdownIt({ html: false, linkify: false, breaks: true, typographer: false });

// Tables can be wider than a phone. A scrollable region must be reachable by keyboard and have a name (WCAG 2.1.1, 4.1.2).
const esc = md.utils.escapeHtml;
md.renderer.rules.table_open = (_t, _i, _o, env) =>
  `<div class="table-wrap" role="region" tabindex="0" aria-label="${esc((env as { tableLabel?: string } | undefined)?.tableLabel ?? 'Table')}"><table>`;
md.renderer.rules.table_close = () => '</table></div>';

export function renderMarkdown(src: string, inline = false, tableLabel?: string): string {
  return inline ? md.renderInline(src) : md.render(src, { tableLabel });
}

/** Renders trusted-or-not markdown to sanitized HTML. `onAnchor` handles in-lesson links like #3-strings. */
export function Markdown({ src, inline = false, onAnchor }: { src: string; inline?: boolean; onAnchor?: (hash: string) => void }) {
  const { t } = useI18n();
  const label = t('lesson.table');
  const html = useMemo(() => renderMarkdown(src, inline, label), [src, inline, label]);
  const props = {
    dangerouslySetInnerHTML: { __html: html },
    onClick: (e: React.MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      const href = a?.getAttribute('href');
      if (a && href && href.startsWith('#') && onAnchor) {
        e.preventDefault();
        onAnchor(href.slice(1));
      }
    },
  };
  return inline ? <span {...props} /> : <div {...props} />;
}
