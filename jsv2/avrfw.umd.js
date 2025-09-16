/* avrfw.umd.js
   AVRFW — micro framework UMD
   - Views manager (per-view CSS + global CSS)
   - Tiny reactivity + directives (av-model, av-text, av-html, av-show, av-class-*, av-attr-*, av-on-*, av-each)
   - Mustache {{ expr }}
   - Multi-host (options, popup, …)
   - Dynamic loader: app.loadView(name, baseUrl) → loads index.html, style.css, main.js
   - i18n: chrome.i18n.getMessage support + [data-resource]/[placeholder]/data-i18n-*
   MIT — 2025
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AVRFW = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // ---------- Providers hub ----------
  const Global = (typeof self !== 'undefined' ? self : this);
  const HUB_KEY = '__AVRFW_PROVIDERS__';
  if (!Global[HUB_KEY]) Global[HUB_KEY] = { defs: Object.create(null), waiters: Object.create(null) };
  const Providers = {
    provide(name, def) {
      Global[HUB_KEY].defs[name] = def;
      const w = Global[HUB_KEY].waiters[name] || [];
      w.forEach(fn => { try { fn(def); } catch {} });
      Global[HUB_KEY].waiters[name] = [];
    },
    wait(name) {
      const def = Global[HUB_KEY].defs[name];
      if (def) return Promise.resolve(def);
      return new Promise(res => {
        (Global[HUB_KEY].waiters[name] ||= []).push(res);
      });
    }
  };

  // ---------- i18n ----------
  const hasChromeI18n = !!(Global && Global.chrome && Global.chrome.i18n && typeof Global.chrome.i18n.getMessage === 'function');
  let i18nFn = function t(key, args) {
    try {
      if (hasChromeI18n) {
        const msg = Global.chrome.i18n.getMessage(String(key || ''), args);
        return msg || '';
      }
    } catch {}
    return ''; // fallback: empty if non trouvé (comportement proche chrome.i18n)
  };
  function setI18n(fn) { if (typeof fn === 'function') i18nFn = fn; }
  function t(key, args) { return i18nFn(key, args); }

  function translate(root) {
    const scope = root && root.querySelectorAll ? root : (root && root.documentElement) ? root : document;
    if (!scope) return;

    // data-resource → prepend
    scope.querySelectorAll('[data-resource]').forEach(el => {
      if (el.dataset.i18nApplied === '1') return;
      const key = el.getAttribute('data-resource');
      if (!key) return;
      let args = undefined;
      const rawArgs = el.getAttribute('data-i18n-args');
      if (rawArgs) { try { args = JSON.parse(rawArgs); } catch {} }
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

    // placeholder="key" → trad si trouvé
    scope.querySelectorAll('[placeholder]').forEach(el => {
      const ph = el.getAttribute('placeholder');
      if (!ph) return;
      const msg = t(ph);
      if (msg) el.setAttribute('placeholder', msg);
    });

    // attributs ciblés
    const attrs = ['title','aria-label','aria-description','aria-placeholder'];
    attrs.forEach(attr => {
      scope.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
        const key = el.getAttribute(`data-i18n-${attr}`);
        if (!key) return;
        const msg = t(key);
        if (msg) el.setAttribute(attr, msg);
      });
    });
  }

  // ---------- Utils ----------
  const isObj = (v) => v !== null && typeof v === 'object';
  const isFn  = (v) => typeof v === 'function';
  const noop  = () => {};
  const toArray = (list) => Array.prototype.slice.call(list);

  function parsePath(path) {
    const segs = [];
    let i = 0, cur = '';
    while (i < path.length) {
      const ch = path[i];
      if (ch === '.') { if (cur) { segs.push(cur); cur=''; } i++; continue; }
      if (ch === '[') {
        if (cur) { segs.push(cur); cur=''; }
        i++;
        let token = '', quote = null;
        if (path[i] === '"' || path[i] === "'") quote = path[i++];
        while (i < path.length) {
          const c = path[i++]; if (quote){ if (c===quote) break; token+=c; }
          else if (c===']') break; else token+=c;
        }
        token = token.trim();
        if (token !== '') segs.push(quote ? token : String(+token));
        continue;
      }
      cur += ch; i++;
    }
    if (cur) segs.push(cur);
    return segs.filter(Boolean);
  }
  function deepSet(obj, path, val) {
    const segs = Array.isArray(path) ? path : parsePath(String(path));
    if (!segs.length) return false;
    let cur = obj;
    for (let i=0;i<segs.length-1;i++){
      const k = segs[i];
      if (!isObj(cur[k])) cur[k] = {};
      cur = cur[k];
    }
    cur[segs[segs.length-1]] = val; return true;
  }

  // ---------- Reactivity ----------
  const targetMap = new WeakMap();
  let activeEffect = null;
  function track(target, key) {
    if (!activeEffect) return;
    let deps = targetMap.get(target);
    if (!deps) targetMap.set(target, (deps = new Map()));
    let dep = deps.get(key);
    if (!dep) deps.set(key, (dep = new Set()));
    if (!dep.has(activeEffect)) { dep.add(activeEffect); activeEffect.deps.push(dep); }
  }
  function trigger(target, key) {
    const deps = targetMap.get(target); if (!deps) return;
    const effs = deps.get(key); if (effs) effs.forEach(queueJob);
    const all = deps.get('*'); if (all) all.forEach(queueJob);
  }
  const jobQueue = new Set(); let flushing=false;
  function flushJobs(){ flushing=true; jobQueue.forEach(fn=>fn()); jobQueue.clear(); flushing=false; }
  function queueJob(job){ jobQueue.add(job); if(!flushing) Promise.resolve().then(flushJobs); }
  function cleanup(eff){ eff.deps.forEach(d=>d.delete(eff)); eff.deps.length=0; }
  function effect(fn, opts={}) {
    const eff = function(){ cleanup(eff); activeEffect=eff; try{ return fn(); } finally{ activeEffect=null; } };
    eff.deps = []; if (!opts.lazy) eff(); return eff;
  }
  const reactiveCache = new WeakMap();
  function reactive(obj) {
    if (!isObj(obj)) return obj;
    if (reactiveCache.has(obj)) return reactiveCache.get(obj);
    const proxy = new Proxy(obj, {
      get(t,k,r){ if (k==='__isReactive') return true; const v = Reflect.get(t,k,r); track(t,k); return isObj(v)? reactive(v): v; },
      set(t,k,v,r){ const old=t[k]; const res = Reflect.set(t,k,v,r); if (old!==v){ trigger(t,k); trigger(t,'*'); } return res; },
      deleteProperty(t,k){ const res = Reflect.deleteProperty(t,k); trigger(t,k); trigger(t,'*'); return res; }
    });
    reactiveCache.set(obj, proxy); return proxy;
  }

  // ---------- Expr compiler ----------
  const exprCache = new Map();
  function compileExpr(expr) {
    const key = String(expr||'').trim();
    if (exprCache.has(key)) return exprCache.get(key);
    const fn = new Function('state','ctx','methods','event',
      // eslint-disable-next-line no-with
      `try{ with(state){ with(ctx){ return (${key}); } } }catch(e){ return undefined }`);
    exprCache.set(key, fn); return fn;
  }

  // ---------- Directives ----------
  const hasAttr = (el, n) => el.hasAttribute('av-'+n) || el.hasAttribute('data-av-'+n);
  const getAttr = (el, n) => el.getAttribute('av-'+n) ?? el.getAttribute('data-av-'+n);
  const setDisplay = (el, show) => { if (show) el.style.removeProperty('display'); else el.style.display='none'; };

  function compileNode(el, ctx, wiring) {
    const { state, methods, cleanups } = wiring;

    // av-each
    if (hasAttr(el, 'each')) {
      const def = (getAttr(el, 'each')||'');
      const m = def.match(/^\s*([a-zA-Z_$][\w$]*)(?:\s*,\s*([a-zA-Z_$][\w$]*))?\s+in\s+(.+)\s*$/);
      if (!m) return;
      const varItem=m[1], varIdx=m[2]||'$index', listExpr=m[3];
      const listGetter = compileExpr(listExpr);
      const tplNodes = toArray(el.childNodes).map(n=>n.cloneNode(true));
      el.innerHTML='';
      const render = () => {
        const arr = listGetter(state, ctx, methods) || [];
        el.innerHTML='';
        arr.forEach((item,i)=>{
          const rowCtx = Object.create(ctx||null);
          rowCtx[varItem]=item; rowCtx[varIdx]=i;
          const frag = document.createDocumentFragment();
          tplNodes.forEach(n=>frag.appendChild(n.cloneNode(true)));
          el.appendChild(frag);
          compileChildren(el.lastChild, rowCtx, wiring);
        });
      };
      const eff = effect(render); cleanups.push(()=>cleanup(eff)); return;
    }

    // av-model
    if (hasAttr(el, 'model')) {
      const modelExpr = (getAttr(el,'model')||'').trim();
      const segs = parsePath(modelExpr);
      const isInputLike = ('value' in el) || (el.tagName==='SELECT');
      const isCheck = (el.type==='checkbox');
      const isRadio = (el.type==='radio');
      const isMulti = (el.tagName==='SELECT' && el.multiple);
      const getter = compileExpr(modelExpr);
      const syncFromState = () => {
        const v = getter(state, ctx, methods);
        if (!isInputLike) return;
        if (isCheck) el.checked = !!v;
        else if (isRadio) el.checked = (String(el.value) === String(v));
        else if (isMulti && Array.isArray(v)) toArray(el.options).forEach(o=>o.selected = v.includes(o.value));
        else el.value = (v ?? '');
      };
      const eff = effect(syncFromState); cleanups.push(()=>cleanup(eff));
      const onDom = () => {
        let v;
        if (isCheck) v = !!el.checked;
        else if (isRadio) { if(!el.checked) return; v = el.value; }
        else if (isMulti) v = toArray(el.selectedOptions).map(o=>o.value);
        else v = el.value;
        deepSet(state, segs, v);
      };
      el.addEventListener(isRadio?'change':'input', onDom);
      cleanups.push(()=>el.removeEventListener(isRadio?'change':'input', onDom));
    }

    // av-text
    if (hasAttr(el, 'text')) {
      const getter = compileExpr(getAttr(el,'text'));
      const eff = effect(()=>{ el.textContent = getter(state, ctx, methods) ?? ''; });
      cleanups.push(()=>cleanup(eff));
    }
    // av-html
    if (hasAttr(el, 'html')) {
      const getter = compileExpr(getAttr(el,'html'));
      const eff = effect(()=>{ el.innerHTML = getter(state, ctx, methods) ?? ''; });
      cleanups.push(()=>cleanup(eff));
    }
    // av-show
    if (hasAttr(el,'show')) {
      const getter = compileExpr(getAttr(el,'show'));
      const eff = effect(()=> setDisplay(el, !!getter(state, ctx, methods)));
      cleanups.push(()=>cleanup(eff));
    }
    // av-class-*
    Array.from(el.attributes).forEach(a=>{
      if (!/^data-av-class-|^av-class-/.test(a.name)) return;
      const cls = a.name.replace(/^data-av-class-|^av-class-/, '');
      const getter = compileExpr(a.value);
      const eff = effect(()=> el.classList.toggle(cls, !!getter(state, ctx, methods)));
      cleanups.push(()=>cleanup(eff));
    });
    // av-attr-*
    Array.from(el.attributes).forEach(a=>{
      if (!/^data-av-attr-|^av-attr-/.test(a.name)) return;
      const name = a.name.replace(/^data-av-attr-|^av-attr-/, '');
      const getter = compileExpr(a.value);
      const eff = effect(()=>{
        const v = getter(state, ctx, methods);
        if (v === false || v == null) el.removeAttribute(name);
        else el.setAttribute(name, String(v));
      });
      cleanups.push(()=>cleanup(eff));
    });
    // av-on / av-on-*
    if (hasAttr(el,'on')) {
      const def = (getAttr(el,'on')||'').split(';').map(s=>s.trim()).filter(Boolean);
      def.forEach(w=>{
        const [evt, expr] = w.split(':').map(s=>s.trim());
        if(!evt||!expr) return;
        const handler = compileExpr(expr);
        const fn = (e)=>handler(state, ctx, methods, e);
        el.addEventListener(evt, fn);
        cleanups.push(()=>el.removeEventListener(evt, fn));
      });
    }
    Array.from(el.attributes).forEach(a=>{
      if (!/^data-av-on-|^av-on-/.test(a.name)) return;
      const evt = a.name.replace(/^data-av-on-|^av-on-/, '');
      const handler = compileExpr(a.value);
      const fn = (e)=>handler(state, ctx, methods, e);
      el.addEventListener(evt, fn);
      cleanups.push(()=>el.removeEventListener(evt, fn));
    });

    // Text mustache
    toArray(el.childNodes).forEach(n=>{
      if (n.nodeType !== 3) return;
      const raw = n.nodeValue; if (!raw || raw.indexOf('{{') === -1) return;
      const parts=[]; const re=/{{([^}]+)}}/g; let last=0, m;
      while((m=re.exec(raw))){
        if (m.index>last) parts.push({type:'text', v: raw.slice(last, m.index)});
        parts.push({type:'expr', v: m[1].trim(), fn: compileExpr(m[1].trim())});
        last = re.lastIndex;
      }
      if (last < raw.length) parts.push({type:'text', v: raw.slice(last)});
      const eff = effect(()=>{
        const out = parts.map(p=> p.type==='text'? p.v : (p.fn(state, ctx, methods) ?? '')).join('');
        n.nodeValue = out;
      });
      cleanups.push(()=>cleanup(eff));
    });
  }

  function compileChildren(root, ctx, wiring) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    if (root.nodeType===1) nodes.unshift(root);
    nodes.forEach(el=>compileNode(el, ctx, wiring));
  }

  // ---------- CSS ----------
  function injectStyle(id, css) {
    if (!css) return null;
    let el = document.querySelector(`style[data-avrfw-style="${id}"]`);
    if (el) { el.textContent = css; return el; }
    el = document.createElement('style');
    el.setAttribute('data-avrfw-style', id);
    el.textContent = css;
    document.head.appendChild(el);
    return el;
  }

  // ---------- App / Views ----------
  function createApp(opts={}) {
    const app = {
      name: opts.name || 'app',
      views: new Map(),
      hosts: new Map(),
      globalStyleId: `global-${Math.random().toString(36).slice(2)}`,
      globalCSS: '',
      bus: new Map(),
      // core
      reactive, effect, createStore,
      defineView, setGlobalCSS, registerHost, mountHost, unmountHost, navigate,
      on, off, emit,
      // loader
      loadView,
    };

    function createStore(initial={}) { return reactive(initial); }

    function defineView(name, def) {
      const norm = {
        name,
        template: def.template,
        css: def.css || '',
        controller: def.controller || (()=>({ state:{}, methods:{} })),
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

    function registerHost(hostName, root) {
      const el = typeof root === 'string' ? document.querySelector(root) : root;
      if (!el) throw new Error(`Host root not found: ${root}`);
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
        try{ host.cleanup.onBeforeUnmount?.(); }catch{}
        try{ host.cleanup.teardown?.(); }catch{}
        try{ host.cleanup.onUnmounted?.(); }catch{}
      }
      host.root.innerHTML=''; if (host.styleEl) { host.styleEl.remove(); host.styleEl=null; }
      host.current=null; host.cleanup=null;
    }

    async function navigate(viewName, params={}, hostName='default') {
      const host = app.hosts.get(hostName);
      if (!host) throw new Error(`Host not registered: ${hostName}`);
      const view = app.views.get(viewName);
      if (!view) throw new Error(`View not found: ${viewName}`);

      // unmount
      if (host.cleanup) {
        try{ host.cleanup.onBeforeUnmount?.(); }catch{}
        try{ host.cleanup.teardown?.(); }catch{}
        try{ host.cleanup.onUnmounted?.(); }catch{}
        host.cleanup=null;
      }
      if (host.styleEl) { host.styleEl.remove(); host.styleEl=null; }
      host.root.innerHTML='';

      // template
      const tpl = isFn(view.template) ? view.template(params, hostName) : view.template;
      let rootNode;
      if (typeof tpl === 'string') {
        const wrap = document.createElement('div');
        wrap.innerHTML = tpl;
        rootNode = wrap.childElementCount===1 ? wrap.firstElementChild : wrap;
      } else if (tpl instanceof HTMLElement || tpl instanceof DocumentFragment) {
        rootNode = tpl;
      } else rootNode = document.createElement('div');
      host.root.appendChild(rootNode);

      // i18n pass (static nodes)
      translate(rootNode);

      // controller
      const ctrl = view.controller({ app, params, host: hostName }) || {};
      const state = ctrl.state ? (ctrl.state.__isReactive ? ctrl.state : reactive(ctrl.state)) : reactive({});
      const methods = Object.assign({ t }, ctrl.methods || {});
      const ctx = Object.create(null);

      // CSS
      if (view.css) host.styleEl = injectStyle(`view-${hostName}-${view.name}`, view.css);

      // lifecycle + compile
      try{ view.onBeforeMount?.({ app, params, host: hostName, state, methods, root: rootNode }); }catch{}
      const cleanups=[];
      compileChildren(rootNode, ctx, { state, methods, cleanups });
      const teardown = ()=>{ cleanups.forEach(fn=>{try{fn();}catch{}}); cleanups.length=0; };
      host.cleanup = {
        teardown,
        onBeforeUnmount: ()=>view.onBeforeUnmount?.({ app, params, host: hostName, state, methods, root: rootNode }),
        onUnmounted: ()=>view.onUnmounted?.({ app, params, host: hostName, state, methods, root: rootNode })
      };
      host.current = { name: viewName, state, methods, params, root: rootNode };
      try{ view.onMounted?.({ app, params, host: hostName, state, methods, root: rootNode }); }catch{}
      return host.current;
    }

    // Event bus
    function on(evt, fn){ if(!app.bus.has(evt)) app.bus.set(evt,new Set()); app.bus.get(evt).add(fn); return ()=>off(evt,fn); }
    function off(evt, fn){ const s=app.bus.get(evt); if(!s) return; s.delete(fn); if(!s.size) app.bus.delete(evt); }
    function emit(evt, payload){ const s=app.bus.get(evt); if(!s) return; s.forEach(fn=>{try{fn(payload);}catch{}}); }

    // Loader (view folder)
    async function loadView(name, baseUrl, opt={}) {
      const htmlPath = opt.html || 'index.html';
      const cssPath  = opt.css  || 'style.css';
      const jsPath   = opt.js   || 'main.js';

      const fetchText = async (url) => {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
        return res.text();
      };

      const [html, css] = await Promise.all([
        fetchText(baseUrl + htmlPath),
        fetch(baseUrl + cssPath, { cache:'no-cache' }).then(r=> r.ok ? r.text() : '').catch(()=> '')
      ]);

      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.async = true; s.defer = false; s.src = baseUrl + jsPath;
        s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${s.src}`));
        document.head.appendChild(s);
      });

      const mod = (Global[HUB_KEY] && Global[HUB_KEY].defs[name]) ? Global[HUB_KEY].defs[name] : await Providers.wait(name);
      const viewDef = {
        template: html,
        css,
        controller: mod.controller || (()=>({ state:{}, methods:{} })),
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

  // Public API
  return {
    createApp,
    reactive, effect,
    deepSet,
    // i18n
    setI18n, t, translate,
    // providers for dynamic views
    provide: Providers.provide
  };
}));