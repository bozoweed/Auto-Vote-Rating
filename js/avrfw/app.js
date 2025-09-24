(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before app');

  env.register('app', (api) => {
    const { isFn, noop } = api.require('utils');
    const { reactive, effect } = api.require('reactivity');
    const { compileChildren } = api.require('compiler');
    const { injectStyle } = api.require('css');
    const { translate, t } = api.require('i18n');
    const providers = api.require('providers');

    const Global = api.global;
    const HUB_KEY = providers.HUB_KEY;

    function createApp(opts = {}) {
      const services = new Map();
      function provide(name, value) { services.set(name, value); return app; }
      function inject(name) { return services.get(name); }
      const app = {
        name: opts.name || 'app',
        views: new Map(),
        hosts: new Map(),
        globalStyleId: `global-${Math.random().toString(36).slice(2)}`,
        globalCSS: '',
        bus: new Map(),
        reactive, effect,
        createStore,
        defineView, setGlobalCSS, registerHost, mountHost, unmountHost, navigate,
        on, off, emit,
        provide, inject,
        loadView
      };

      function createStore(initial = {}) { return reactive(initial); }

      function defineView(name, def) {
        const norm = {
          name,
          template: def.template,
          css: def.css || '',
          controller: def.controller || (() => ({ state: {}, methods: {} })),
          onBeforeMount: def.onBeforeMount || noop,
          onMounted: def.onMounted || noop,
          onBeforeUnmount: def.onBeforeUnmount || noop,
          onUnmounted: def.onUnmounted || noop
        };
        app.views.set(name, norm);
        return app;
      }

      function setGlobalCSS(css) {
        app.globalCSS = css || '';
        injectStyle(app.globalStyleId, app.globalCSS);
        return app;
      }

      function registerHost(hostName, rootEl) {
        const el = typeof rootEl === 'string' ? document.querySelector(rootEl) : rootEl;
        if (!el) throw new Error(`Host root not found: ${rootEl}`);
        app.hosts.set(hostName, { root: el, current: null, cleanup: null, styleEl: null });
        injectStyle(app.globalStyleId, app.globalCSS);
        return app;
      }

      async function mountHost(hostName, viewName, params) {
        if (!app.hosts.has(hostName)) throw new Error(`Host not registered: ${hostName}`);
        return navigate(viewName, params, hostName);
      }

      function unmountHost(hostName) {
        const host = app.hosts.get(hostName);
        if (!host) return;
        if (host.cleanup) {
          try { host.cleanup.onBeforeUnmount?.(); } catch (e) { }
          try { host.cleanup.teardown?.(); } catch (e) { }
          try { host.cleanup.onUnmounted?.(); } catch (e) { }
        }
        host.root.innerHTML = '';
        if (host.styleEl) { host.styleEl.remove(); host.styleEl = null; }
        host.current = null;
        host.cleanup = null;
      }

      async function navigate(viewName, params = {}, hostName = 'default') {
        const host = app.hosts.get(hostName);
        if (!host) throw new Error(`Host not registered: ${hostName}`);
        const view = app.views.get(viewName);
        if (!view) throw new Error(`View not found: ${viewName}`);

        if (host.cleanup) {
          try { host.cleanup.onBeforeUnmount?.(); } catch (e) { }
          try { host.cleanup.teardown?.(); } catch (e) { }
          try { host.cleanup.onUnmounted?.(); } catch (e) { }
          host.cleanup = null;
        }
        if (host.styleEl) { host.styleEl.remove(); host.styleEl = null; }
        host.root.innerHTML = '';

        const tpl = isFn(view.template) ? view.template(params, hostName) : view.template;
        let rootNode;
        if (typeof tpl === 'string') {
          const wrap = document.createElement('div');
          wrap.innerHTML = tpl;
          rootNode = wrap.childElementCount === 1 ? wrap.firstElementChild : wrap;
        } else if (tpl instanceof HTMLElement || tpl instanceof DocumentFragment) {
          rootNode = tpl;
        } else {
          rootNode = document.createElement('div');
        }
        host.root.appendChild(rootNode);

        translate(rootNode);

        const ctrl = view.controller({ app, params, host: hostName }) || {};
        const state = ctrl.state ? (ctrl.state.__isReactive ? ctrl.state : reactive(ctrl.state)) : reactive({});
        const methods = Object.assign({ t }, ctrl.methods || {});
        const ctx = Object.create(null);

        if (view.css) host.styleEl = injectStyle(`view-${hostName}-${view.name}`, view.css);

        try { view.onBeforeMount?.({ app, params, host: hostName, state, methods, root: rootNode }); } catch (e) { }
        const cleanups = [];
        compileChildren(rootNode, ctx, { state, methods, cleanups });
        const teardown = () => {
          cleanups.forEach(fn => { try { fn(); } catch (e) { } });
          cleanups.length = 0;
        };
        host.cleanup = {
          teardown,
          onBeforeUnmount: () => view.onBeforeUnmount?.({ app, params, host: hostName, state, methods, root: rootNode }),
          onUnmounted: () => view.onUnmounted?.({ app, params, host: hostName, state, methods, root: rootNode })
        };
        host.current = { name: viewName, state, methods, params, root: rootNode };
        try { view.onMounted?.({ app, params, host: hostName, state, methods, root: rootNode }); } catch (e) { }
        return host.current;
      }

      function on(evt, fn) {
        if (!app.bus.has(evt)) app.bus.set(evt, new Set());
        app.bus.get(evt).add(fn);
        return () => off(evt, fn);
      }

      function off(evt, fn) {
        const set = app.bus.get(evt);
        if (!set) return;
        set.delete(fn);
        if (!set.size) app.bus.delete(evt);
      }

      function emit(evt, payload) {
        const set = app.bus.get(evt);
        if (!set) return;
        set.forEach(fn => { try { fn(payload); } catch (e) { } });
      }

      async function loadView(name, baseUrl, opt = {}) {
        const htmlPath = opt.html || 'index.html';
        const cssPath = opt.css || 'style.css';
        const jsPath = opt.js || 'main.js';

        const base = new URL(baseUrl, location.href);
        const url = (p) => new URL(p, base).href;

        const fetchText = async (u) => {
          const res = await fetch(u, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`Failed to fetch ${u} (${res.status})`);
          return res.text();
        };

        const [html, css] = await Promise.all([
          fetchText(url(htmlPath)),
          fetch(url(cssPath), { cache: 'no-cache' }).then(r => r.ok ? r.text() : '').catch(() => '')
        ]);

        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.async = true;
          s.defer = false;
          s.src = url(jsPath);
          s.onload = resolve;
          s.onerror = () => reject(new Error(`Failed to load ${s.src}`));
          document.head.appendChild(s);
        });

        const mod = (Global[HUB_KEY] && Global[HUB_KEY].defs[name]) ? Global[HUB_KEY].defs[name] : await providers.wait(name);
        const viewDef = {
          template: html,
          css,
          controller: mod.controller || (() => ({ state: {}, methods: {} })),
          onBeforeMount: mod.onBeforeMount,
          onMounted: mod.onMounted,
          onBeforeUnmount: mod.onBeforeUnmount,
          onUnmounted: mod.onUnmounted
        };
        defineView(name, viewDef);
        return viewDef;
      }

      if (opts.defaultHost) registerHost('default', opts.defaultHost);
      if (opts.popupHost) registerHost('popup', opts.popupHost);
      if (opts.globalCSS) setGlobalCSS(opts.globalCSS);

      return app;
    }

    return { createApp };
  });
})(typeof self !== 'undefined' ? self : this);
