(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before utils');

  env.register('utils', (api) => {
    const { translate } = api.require('i18n');
    const providers = api.require('providers');
    const globalScope = api.global;

    const isObj = (v) => v !== null && typeof v === 'object';
    const isFn = (v) => typeof v === 'function';
    const noop = () => { };
    const toArray = (list) => Array.prototype.slice.call(list || []);

    function createViewProvider(name, hooks = {}) {
      if (!name) throw new Error('View name is required');
      const autoTranslate = hooks.autoTranslate !== false;
      const baseController = typeof hooks.controller === 'function' ? hooks.controller : null;
      const controller = function () {
        const res = baseController ? (baseController.apply(this, arguments) || {}) : {};
        if (hooks.state && res.state == null) res.state = { ...hooks.state };
        else if (!res.state) res.state = {};
        else if (hooks.state && res.state === hooks.state) res.state = { ...res.state };
        if (hooks.methods) {
          if (!res.methods) res.methods = { ...hooks.methods };
          else if (res.methods === hooks.methods) res.methods = { ...res.methods };
          else res.methods = Object.assign({}, hooks.methods, res.methods);
        } else if (!res.methods) {
          res.methods = {};
        }
        return res;
      };
      const userOnMounted = typeof hooks.onMounted === 'function' ? hooks.onMounted : null;
      const viewDef = {
        controller,
        onBeforeMount: hooks.onBeforeMount || noop,
        onMounted(ctx) {
          if (autoTranslate && ctx && ctx.root) {
            try { translate(ctx.root); } catch (e) { }
          }
          if (userOnMounted) userOnMounted(ctx);
        },
        onBeforeUnmount: hooks.onBeforeUnmount || noop,
        onUnmounted: hooks.onUnmounted || noop
      };
      providers.provide(name, viewDef);
      return viewDef;
    }

    function createTranslator(config = {}) {
      const fallback = config && config.fallback;
      const fallbackFn = typeof fallback === 'function' ? fallback : null;
      const fallbackMap = fallback && typeof fallback === 'object' && !Array.isArray(fallback) && typeof fallback !== 'function' ? fallback : null;
      const defaultValue = config && config.defaultValue;
      return function translator(key, args) {
        try {
          const fw = globalScope && globalScope.AVRFW;
          if (fw && typeof fw.t === 'function') {
            const res = fw.t(key, args);
            if (res) return res;
          }
        } catch (e) { }
        try {
          const chromeI18n = globalScope && globalScope.chrome && globalScope.chrome.i18n;
          if (chromeI18n && typeof chromeI18n.getMessage === 'function') {
            const res = chromeI18n.getMessage(String(key || ''), args);
            if (res) return res;
          }
        } catch (e) { }
        try {
          if (fallbackFn) {
            const res = fallbackFn(key, args);
            if (res != null) return res;
          } else if (fallbackMap && Object.prototype.hasOwnProperty.call(fallbackMap, key)) {
            const val = fallbackMap[key];
            if (typeof val === 'function') {
              const derived = val(args, key);
              if (derived != null) return derived;
            } else if (val != null) {
              return val;
            }
          }
        } catch (e) { }
        if (defaultValue != null) {
          if (typeof defaultValue === 'function') {
            const def = defaultValue(key, args);
            if (def != null) return def;
          } else {
            return defaultValue;
          }
        }
        return '';
      };
    }


    function resolveApp(source) {
      if (!source) return null;
      if (source.app) return source.app;
      if (typeof source.inject === 'function') return source;
      return null;
    }

    function getBackend(source) {
      const app = resolveApp(source);
      if (app && typeof app.inject === 'function') {
        try {
          const service = app.inject('backend');
          if (service) return service;
        } catch (e) { }
      }
      const registry = globalScope && globalScope.__AVRFW_SERVICES__;
      return registry && registry.backend ? registry.backend : null;
    }

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
    }

    async function ensureBackend(source, options = {}) {
      let backend = getBackend(source);
      if (backend) return backend;
      const install = options.install !== false;
      const app = resolveApp(source);
      if (install && typeof globalScope.AVRFW_installBackend === 'function' && app) {
        try {
          await globalScope.AVRFW_installBackend(app, { background: options.background !== false });
        } catch (e) { }
        backend = getBackend(source);
        if (backend) return backend;
      }
      if (options.waitFor) {
        const retries = Number.isFinite(options.retries) ? options.retries : 20;
        const delay = Number.isFinite(options.delay) ? options.delay : 100;
        for (let attempt = 0; attempt < Math.max(0, retries); attempt++) {
          await sleep(delay);
          backend = getBackend(source);
          if (backend) return backend;
        }
      }
      return backend || null;
    }

    function parsePath(path) {
      const segs = [];
      let i = 0; let cur = '';
      while (i < path.length) {
        const ch = path[i];
        if (ch === '.') { if (cur) { segs.push(cur); cur = ''; } i++; continue; }
        if (ch === '[') {
          if (cur) { segs.push(cur); cur = ''; }
          i++;
          let token = ''; let quote = null;
          if (path[i] === '"' || path[i] === "'") quote = path[i++];
          while (i < path.length) {
            const c = path[i++];
            if (quote) { if (c === quote) break; token += c; }
            else if (c === ']') break;
            else token += c;
          }
          token = token.trim();
          if (token !== '') segs.push(quote ? token : String(+token));
          continue;
        }
        cur += ch;
        i++;
      }
      if (cur) segs.push(cur);
      return segs.filter(Boolean);
    }

    function deepSet(obj, path, val) {
      const segs = Array.isArray(path) ? path : parsePath(String(path));
      if (!segs.length) return false;
      let cur = obj;
      for (let i = 0; i < segs.length - 1; i++) {
        const k = segs[i];
        const next = segs[i + 1];
        const needArray = typeof next === 'number' || (typeof next === 'string' && /^\d+$/.test(next));
        if (!isObj(cur[k])) cur[k] = needArray ? [] : {};
        cur = cur[k];
      }
      cur[segs[segs.length - 1]] = val;
      return true;
    }

    return { isObj, isFn, noop, toArray, parsePath, deepSet, createViewProvider, createTranslator, getBackend, ensureBackend };
  });
})(typeof self !== 'undefined' ? self : this);
