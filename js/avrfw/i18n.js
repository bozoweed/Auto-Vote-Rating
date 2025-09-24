(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before i18n');

  env.register('i18n', (api) => {
    const Global = api.global;
    const hasChromeI18n = !!(Global && Global.chrome && Global.chrome.i18n && typeof Global.chrome.i18n.getMessage === 'function');
    let i18nFn = function translateKey(key, args) {
      try {
        if (hasChromeI18n) {
          const msg = Global.chrome.i18n.getMessage(String(key || ''), args);
          return msg || '';
        }
      } catch (e) { }
      return '';
    };

    function setI18n(fn) { if (typeof fn === 'function') i18nFn = fn; }
    function t(key, args) { return i18nFn(key, args); }

    function translate(target) {
      const scope = target && target.querySelectorAll ? target : (target && target.documentElement) ? target : document;
      if (!scope) return;

      scope.querySelectorAll('[data-resource]').forEach(el => {
        if (el.dataset.i18nApplied === '1') return;
        const key = el.getAttribute('data-resource');
        if (!key) return;
        let args;
        const rawArgs = el.getAttribute('data-i18n-args');
        if (rawArgs) {
          try { args = JSON.parse(rawArgs); } catch (e) { }
        }
        const msg = t(key, args);
        if (msg) {
          const mode = el.getAttribute('data-i18n-mode') || 'prepend';
          if (mode === 'replace') {
            el.textContent = msg;
          } else {
            el.insertBefore(document.createTextNode(msg), el.firstChild);
          }
          el.dataset.i18nApplied = '1';
        }
      });

      scope.querySelectorAll('[placeholder]').forEach(el => {
        const ph = el.getAttribute('placeholder');
        if (!ph) return;
        const msg = t(ph);
        if (msg) el.setAttribute('placeholder', msg);
      });

      const attrs = ['title', 'aria-label', 'aria-description', 'aria-placeholder'];
      attrs.forEach(attr => {
        scope.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
          const key = el.getAttribute(`data-i18n-${attr}`);
          if (!key) return;
          const msg = t(key);
          if (msg) el.setAttribute(attr, msg);
        });
      });
    }

    return { setI18n, t, translate };
  });
})(typeof self !== 'undefined' ? self : this);
