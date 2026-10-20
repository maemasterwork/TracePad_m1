import { useId, type ReactNode } from 'react';

/** A labelled form control. The label, hint and error are wired to the control with aria-describedby. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode }) {
  const id = useId();
  const described = [hint ? id + '-h' : '', error ? id + '-e' : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      {hint && <span className="hint" id={id + '-h'}>{hint}</span>}
      {error && <span className="err" id={id + '-e'} role="alert">{error}</span>}
    </div>
  );
}

export function Notice({ kind = 'info', children, live = false }: { kind?: 'info' | 'good' | 'bad' | 'warn'; children: ReactNode; live?: boolean }) {
  return <div className={`notice ${kind}`} role={live ? (kind === 'bad' ? 'alert' : 'status') : undefined}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return <span role="status" aria-live="polite">{label}</span>;
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <g fill="none" stroke="var(--accent-ink)" strokeWidth="4" strokeLinecap="round">
        <circle cx="18" cy="22" r="4" fill="var(--accent-ink)" /><circle cx="18" cy="44" r="4" fill="var(--accent-ink)" />
        <rect x="38" y="14" width="14" height="16" rx="3" /><rect x="38" y="36" width="14" height="16" rx="3" /><path d="M23 22h13M23 44h13" />
      </g>
    </svg>
  );
}
