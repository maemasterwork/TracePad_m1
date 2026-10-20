// One source of truth for response headers. Used by the dev server, `vite preview`, and generates public/_headers
// (Netlify / Cloudflare Pages format) at build time. COOP+COEP make SharedArrayBuffer available, which the Python
// worker needs for a live input() prompt and for the interrupt button.
export function csp(connectSrc: string[], development = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${development ? " 'unsafe-inline'" : ''}`,
    `style-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${connectSrc.join(' ')}`.trim(),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(connectSrc: string[], development = false): Record<string, string> {
  return {
    'Content-Security-Policy': csp(connectSrc, development),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  };
}
