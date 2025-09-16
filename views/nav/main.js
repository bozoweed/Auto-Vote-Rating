/* view/nav/main.js — UMD provider "nav"
   - Barre latérale + burger
   - Host interne "content" (#app-content) pour monter les vues enfants
   - Chargement paresseux des vues: dashboard, projects, add, settings, stats (+ fast-add si URL)
*/
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], function () { return factory(root.AVRFW); });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('AVRFW'));
    else factory(root.AVRFW);
}(typeof self !== 'undefined' ? self : this, function (AVRFW) {

    function provide(name, def) {
        if (AVRFW && AVRFW.provide) { AVRFW.provide(name, def); return; }
        var g = (typeof self !== 'undefined' ? self : this);
        var hub = g.__AVRFW_PROVIDERS__ = g.__AVRFW_PROVIDERS__ || { defs: {}, waiters: {} };
        hub.defs[name] = def;
        var w = hub.waiters[name] || []; w.forEach(function (fn) { try { fn(def); } catch { } }); hub.waiters[name] = [];
    }

    function t(k, a) { try { return (root.chrome && root.chrome.i18n) ? root.chrome.i18n.getMessage(k, a) : ''; } catch (e) { return ''; } }

    var viewDef = {
        controller: function () { return { state: {}, methods: {} }; },
        onMounted: function (ctx) {
            AVRFW && AVRFW.translate && AVRFW.translate(ctx.root);

            // Register inner host for content
            var contentHost = ctx.root.querySelector('#app-content');
            if (contentHost) ctx.app.registerHost('content', contentHost);

            // Burger toggle
            var burger = ctx.root.querySelector('.burger');
            var nav = ctx.root.querySelector('#primaryNav');
            if (burger && nav) {
                burger.addEventListener('click', function () {
                    const active = nav.classList.toggle('active');
                    burger.classList.toggle('active', active);
                    burger.setAttribute('aria-expanded', String(active));
                    // optional i18n label switch
                    const openLbl = (AVRFW && AVRFW.t && AVRFW.t('openMenu')) || 'Open menu';
                    const closeLbl = (AVRFW && AVRFW.t && AVRFW.t('closeMenu')) || 'Close menu';
                    burger.setAttribute('aria-label', active ? closeLbl : openLbl);
                });
            }

            // Routes config (lazy load)
            var routes = {
                'dashboard': { path: 'views/dashboard/' },
                'projects': { path: 'views/projects/' },
                'add': { path: 'views/add/' },
                'settings': { path: 'views/settings/' },
                'stats': { path: 'views/stats/' },
                'fast-add': { path: 'views/fast-add/' }
            };
            var loaded = Object.create(null);

            async function ensure(viewName) {
                if (loaded[viewName]) return;
                var r = routes[viewName]; if (!r) throw new Error('Unknown view: ' + viewName);
                await ctx.app.loadView(viewName, r.path);
                loaded[viewName] = true;
            }
            async function go(viewName, params) {
                await ensure(viewName);
                ctx.app.mountHost('content', viewName, params || {});
                setActive(viewName);
                // Close nav on mobile when switching
                if (nav && nav.classList.contains('active')) nav.classList.remove('active');
                if (burger) burger.setAttribute('aria-expanded', 'false');
            }

            function setActive(viewName) {
                ctx.root.querySelectorAll('.nav-btn').forEach(function (btn) {
                    var on = (btn.getAttribute('data-view') === viewName);
                    btn.classList.toggle('active', on);
                    btn.setAttribute('aria-selected', String(on));
                });
            }

            // Bind buttons
            ctx.root.querySelectorAll('.nav-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var vn = btn.getAttribute('data-view');
                    go(vn);
                });
            });

            // Default route / Fast add shortcut
            (async function initRoute() {
                try {
                    var href = String(document.location.href);
                    if (href.includes('addFastProject')) {
                        await go('fast-add');
                        return;
                    }
                } catch (e) { }
                await go('dashboard');
            })();

            // Optional: external deep links via hash (#view=projects)
            try {
                var m = String(location.hash || '').match(/view=([a-z\-]+)/i);
                if (m && routes[m[1]]) go(m[1]);
            } catch (e) { }

            // Example chips (if you want to expose opening stats quickly)
            // document.querySelector('#generalStats')?.addEventListener('click', ()=> go('stats'));
            // document.querySelector('#todayStats')?.addEventListener('click', ()=> go('stats'));
        }
    };

    provide('nav', viewDef);
}));