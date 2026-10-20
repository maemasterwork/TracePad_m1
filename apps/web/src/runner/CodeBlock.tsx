import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { tokenize } from './highlight';
import { useEngineStatus, useRunner } from './RunnerProvider';
import type { RunResult } from './types';

export interface CodeBlockProps {
  id: string;
  code: string;
  prelude?: string;
  stdin?: string;
  /** Shown to explain that earlier lesson code runs first, silently. */
  usesEarlier?: boolean;
}

export function CodeBlock({ id, code, prelude, stdin = '', usesEarlier }: CodeBlockProps) {
  const { t, num } = useI18n();
  const runner = useRunner();
  const engine = useEngineStatus(runner);
  const [value, setValue] = useState(code);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [stdinText, setStdinText] = useState(stdin);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState<{ text: string; resolve: (v: string | null) => void } | null>(null);
  const [typed, setTyped] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const uid = useId();

  useEffect(() => setValue(code), [code]);

  const needsInput = /\binput\s*\(/.test(value);
  const toks = useMemo(() => tokenize(value), [value]);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    runner.setInputHandler((p) => new Promise<string | null>((resolve) => { setPrompt({ text: p, resolve }); setTyped(''); }));
    try {
      const r = await runner.run({ code: value, stdin: stdinText, prelude });
      setResult(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ ok: false, exit_code: 1, stdout: '', stderr: msg, events: [], error: { type: 'EngineError', message: msg, line: null, col: null, frames: [], traceback: msg }, ms: 0 });
    } finally {
      runner.setInputHandler(null);
      setPrompt((p) => { p?.resolve(null); return null; });
      setRunning(false);
    }
  }, [running, runner, value, stdinText, prelude]);

  const stop = () => { prompt?.resolve(null); runner.interrupt(); };
  const reset = () => { setValue(code); setResult(null); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  const syncScroll = () => { if (preRef.current && taRef.current) { preRef.current.scrollLeft = taRef.current.scrollLeft; preRef.current.scrollTop = taRef.current.scrollTop; } };
  const lines = Math.max(value.split('\n').length, 2);
  const changed = value !== code;
  const err = result?.error;

  return (
    <div className="codeblock" data-block={id}>
      <div className="bar">
        <button type="button" className="btn small" onClick={run} disabled={running} aria-describedby={uid + '-st'}>
          {running ? t('code.running') : t('code.run')}
        </button>
        {running && <button type="button" className="btn small quiet" onClick={stop}>{t('code.stop')}</button>}
        <span className="grow" />
        {changed && <button type="button" className="btn small quiet" onClick={reset}>{t('code.reset')}</button>}
        <button type="button" className="btn small quiet" onClick={copy}>{copied ? t('code.copied') : t('code.copy')}</button>
      </div>
      <div className="editor">
        <pre ref={preRef} aria-hidden="true" style={{ overflow: 'hidden' }}><code>{toks.map((k, i) => (k.cls ? <span key={i} className={k.cls}>{k.text}</span> : k.text))}{'\n'}</code></pre>
        <textarea
          ref={taRef} value={value} rows={lines} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" wrap="off"
          aria-label={t('code.editLabel')} onScroll={syncScroll} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run(); } }}
          style={{ overflowX: 'auto', overflowY: 'hidden' }}
        />
      </div>
      {usesEarlier && <p className="hint" style={{ margin: '4px 14px', color: 'var(--muted)', fontSize: '0.85rem' }}>{t('code.usesEarlier')}</p>}
      {needsInput && !runner.live && (
        <div style={{ padding: '6px 14px' }}>
          <label htmlFor={uid + '-in'} style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t('code.inputLabel')}</label>
          <textarea id={uid + '-in'} className="code-ltr" rows={2} value={stdinText} onChange={(e) => setStdinText(e.target.value)} aria-describedby={uid + '-inh'} />
          <span id={uid + '-inh'} className="hint" style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{t('code.inputHelp')}</span>
        </div>
      )}
      <div id={uid + '-st'} className="sr-only" role="status" aria-live="polite">
        {running ? t('code.running') : result ? (result.ok ? t('code.ran', { ms: num(result.ms) }) : err ? t('code.errorTitle', { type: err.type, line: err.line ?? 0 }) : '') : ''}
      </div>
      {running && engine.state === 'loading' && <p className="outbox dim" role="status">{t('code.loadingEngine')}</p>}
      {engine.state === 'failed' && <p className="outbox err" role="alert">{t('code.engineFailed', { reason: engine.message })}</p>}
      {prompt && (
        <form className="outbox" onSubmit={(e) => { e.preventDefault(); const p = prompt; setPrompt(null); p.resolve(typed); }}>
          <label htmlFor={uid + '-live'} style={{ fontWeight: 600 }}>{t('code.inputPrompt')}{prompt.text ? ': ' : ''}<span className="code-ltr">{prompt.text}</span></label>
          <div className="row" style={{ marginTop: 6 }}>
            <input id={uid + '-live'} type="text" className="code-ltr" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <button type="submit" className="btn small">{t('code.send')}</button>
          </div>
        </form>
      )}
      <div className={'outbox' + (result ? '' : ' dim')} aria-label={t('code.output')} tabIndex={0} role="region">
        {!result && !running && t('code.pressRun')}
        {result && result.events.length === 0 && !err && <span className="note">{t('code.noOutput')}</span>}
        {result?.events.map((ev, i) => <span key={i} className={ev[0]}>{ev[1]}{ev[0] === 'in' ? '\n' : ''}</span>)}
        {result?.timedOut && <div className="note">{t('code.timeout', { s: Math.round(runner.timeoutMs / 1000) })}</div>}
        {result?.interrupted && <div className="note">{t('code.stopped')}</div>}
      </div>
      {err && err.type !== 'KeyboardInterrupt' && (
        <div className="errorcoach" role="note">
          <strong>{err.line ? t('code.errorTitle', { type: err.type, line: num(err.line) }) : t('code.errorNoLine', { type: err.type })}</strong>
          <div className="code-ltr" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.86rem' }}>{err.message}</div>
        </div>
      )}
    </div>
  );
}
