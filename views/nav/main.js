/* view/nav/main.js — UMD provider "nav"
   - Barre latérale + burger
   - Host interne "content" (#app-content) pour monter les vues enfants
   - Chargement paresseux des vues: dashboard, projects, add, settings, stats (+ fast-add si URL)
   - DI backend: ctx.app.inject('backend'), auto-install fallback if missing
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], function(){ return factory(root.AVRFW); });
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('AVRFW'));
  else factory(root.AVRFW);
}(typeof self !== 'undefined' ? self : this, function(AVRFW){

  function provide(name, def){
    if (AVRFW && AVRFW.provide) { AVRFW.provide(name, def); return; }
    var g = (typeof self !== 'undefined' ? self : this);
    var hub = g.__AVRFW_PROVIDERS__ = g.__AVRFW_PROVIDERS__ || { defs:{}, waiters:{} };
    hub.defs[name] = def;
    var w = hub.waiters[name] || []; w.forEach(function(fn){ try{fn(def);}catch{} }); hub.waiters[name] = [];
  }

  function t(k,a){ try{ return (chrome && chrome.i18n) ? chrome.i18n.getMessage(k,a) : ''; } catch(e){ return ''; } }

  var viewDef = {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){
      AVRFW && AVRFW.translate && AVRFW.translate(ctx.root);

      // Register inner host for content
      var contentHost = ctx.root.querySelector('#app-content');
      if (contentHost && ctx.app && ctx.app.registerHost) ctx.app.registerHost('content', contentHost);

      // Burger toggle
      var burger = ctx.root.querySelector('.burger');
      var nav = ctx.root.querySelector('#primaryNav');
      if (burger && nav) {
        burger.addEventListener('click', function(){
          var active = nav.classList.toggle('active');
          burger.classList.toggle('active', active);
          burger.setAttribute('aria-expanded', String(active));
          var openLbl  = AVRFW.t ? AVRFW.t('openMenu')  : (t('openMenu')  || 'Open menu');
          var closeLbl = AVRFW.t ? AVRFW.t('closeMenu') : (t('closeMenu') || 'Close menu');
          burger.setAttribute('aria-label', active ? closeLbl : openLbl);
        });
      }

      // Lazy routes (adjust if you use "views/" instead of "view/")
      var routes = {
        'dashboard': { path: 'views/dashboard/' },
        'projects' : { path: 'views/projects/'  },
        'add'      : { path: 'views/add/'       },
        'settings' : { path: 'views/settings/'  },
        'stats'    : { path: 'views/stats/'     },
        'fast-add' : { path: 'views/fast-add/'  }
      };
      var loaded = Object.create(null);

      // Ensure backend is installed (DI) before loading children
      (async function initNav(){
        try {
          // Injected backend or fallback registry from backend.service.js
          var be = (ctx.app && ctx.app.inject && ctx.app.inject('backend')) ||
                   (root.__AVRFW_SERVICES__ && root.__AVRFW_SERVICES__.backend) || null;

          if (!be && root.AVRFW_installBackend) {
            // Auto-install backend if not present (no-op if already installed)
            await root.AVRFW_installBackend(ctx.app, { background: false });
            be = (ctx.app && ctx.app.inject && ctx.app.inject('backend')) ||
                 (root.__AVRFW_SERVICES__ && root.__AVRFW_SERVICES__.backend) || null;
          }

          if (!be) {
            // If still not available, render a small error panel in content
            if (contentHost) {
              contentHost.innerHTML = '<div style="padding:12px;color:#ff6b6b;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,107,107,.08)">' +
                (t('backendNotAvailable') || 'Backend not available. Reload the page.') + '</div>';
            }
            // continue anyway: dashboard might not need DB immediately
          }

          // Navigation helpers
          async function ensure(viewName) {
            if (loaded[viewName]) return;
            var r = routes[viewName]; if (!r) throw new Error('Unknown view: ' + viewName);
            await ctx.app.loadView(viewName, r.path);
            loaded[viewName] = true;
          }
          async function go(viewName, params) {
            await ensure(viewName);
            ctx.app.mountHost && ctx.app.mountHost('content', viewName, params || {});
            setActive(viewName);
            // Close nav on mobile when switching
            if (nav && nav.classList.contains('active')) nav.classList.remove('active');
            if (burger) burger.setAttribute('aria-expanded', 'false');
          }
          function setActive(viewName) {
            ctx.root.querySelectorAll('.nav-btn').forEach(function(btn){
              var on = (btn.getAttribute('data-view') === viewName);
              btn.classList.toggle('active', on);
              btn.setAttribute('aria-selected', String(on));
            });
          }

          // Bind sidebar buttons
          ctx.root.querySelectorAll('.nav-btn').forEach(function(btn){
            btn.addEventListener('click', function(){
              var vn = btn.getAttribute('data-view');
              go(vn);
            });
          });

          // Default routing: fast-add if URL indicates, else hash, else dashboard
          (async function initRoute(){
            try {
              var href = String(document.location.href);
              if (href.includes('addFastProject')) { await go('fast-add'); return; }
            } catch(e){}
            try {
              var m = String(location.hash || '').match(/view=([a-z\-]+)/i);
              if (m && routes[m[1]]) { await go(m[1]); return; }
            } catch(e){}
            await go('dashboard');
          })();

        } catch (e) {
          // If something goes wrong, show a minimal error
          if (contentHost) {
            contentHost.innerHTML = '<div style="padding:12px;color:#ff6b6b;border:1px solid rgba(255,255,255,.15);border-radius:8px;background:rgba(255,107,107,.08)">' +
              (t('loadError') || 'Navigation load error') + ': ' + (e && e.message || e) + '</div>';
          }
          // console fallback
          try { console.error('[nav] init failed:', e); } catch {}
        }
      })();
    }
  };

  provide('nav', viewDef);
}));