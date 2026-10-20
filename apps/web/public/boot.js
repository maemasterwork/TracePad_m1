/* Runs before first paint (an external file so the strict CSP needs no inline script): applies saved theme, language
   direction and reading preferences so there is no flash of the wrong theme. */
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('tracepad.prefs') || '{}');
    var d = document.documentElement;
    if (p.theme && p.theme !== 'system') d.setAttribute('data-theme', p.theme);
    var lang = p.locale || ((navigator.language || 'en').slice(0, 2) === 'fa' ? 'fa' : 'en');
    d.lang = lang; d.dir = lang === 'fa' ? 'rtl' : 'ltr';
    if (p.fontSize) d.style.setProperty('--user-font-scale', String(p.fontSize / 100));
    if (p.dyslexia) d.setAttribute('data-dyslexia', '1');
    if (p.spacing) d.setAttribute('data-spacing', p.spacing);
    if (p.reduceMotion) d.setAttribute('data-motion', 'reduce');
    if (p.palette) d.setAttribute('data-palette', p.palette);
  } catch (e) {}
})();
