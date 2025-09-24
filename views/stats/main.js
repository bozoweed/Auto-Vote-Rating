/* view/stats/main.js - UMD provider "stats"
   - Two modals (#stats and #statsToday) + two buttons to open them
   - Rules: reset day, rollover month (lastMonthSuccessVotes <- monthSuccessVotes when month changes)
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], function () { return factory(root.AVRFW, root.OptionsCore); });
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('AVRFW'), require('OptionsCore'));
  else factory(root.AVRFW, root.OptionsCore);
}(typeof self !== 'undefined' ? self : this, function (AVRFW, OptionsCore) {

  
  const t = (AVRFW && typeof AVRFW.createTranslator === 'function')
    ? AVRFW.createTranslator()
    : function(key, args){
        try{
          if (chrome && chrome.i18n){
            return chrome.i18n.getMessage(key, args) || '';
          }
        } catch(e){}
        return '';
      };
  function fmtDate(v) { return v ? new Date(v).toLocaleString().replace(',', '') : (t('none') || 'None'); }

  function injectModals() {
    OptionsCore.ensureContainers();
    var modals = document.getElementById('modals');

    if (!modals.querySelector('#stats')) {
      var stats = document.createElement('div');
      stats.className = 'modal'; stats.id = 'stats';
      stats.innerHTML =
        '<div class="head">' +
        '<div class="title"><h3  data-i18n-mode="replace" data-resource="stats2">Stats</h3><div class="statsSubtitle"></div></div>' +
        '<div class="close"></div>' +
        '</div>' +
        '<div class="content"><div class="message"><table><tbody>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsSuccessVotes">Success votes</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsMonthSuccessVotes">Success (this month)</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLastMonthSuccessVotes">Success (last month)</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLaterVotes">Later votes</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsErrorVotes">Error votes</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLastSuccessVote">Last success</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLastAttemptVote">Last attempt</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsAdded">Installed</td><th></th></tr>' +
        '</tbody></table></div></div>';
      modals.appendChild(stats);
      AVRFW && AVRFW.translate && AVRFW.translate(stats);
    }

    if (!modals.querySelector('#statsToday')) {
      var today = document.createElement('div');
      today.className = 'modal'; today.id = 'statsToday';
      today.innerHTML =
        '<div class="head">' +
        '<div class="title"><h3  data-i18n-mode="replace" data-resource="stats2">Stats</h3><div class="statsSubtitle"  data-i18n-mode="replace" data-resource="todayStats">Today stats</div></div>' +
        '<div class="close"></div>' +
        '</div>' +
        '<div class="content"><div class="message"><table><tbody>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsSuccessVotes">Success votes</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLaterVotes">Later votes</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsErrorVotes">Error votes</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLastSuccessVote">Last success</td><th></th></tr>' +
        '<tr><td  data-i18n-mode="replace" data-resource="statsLastAttemptVote">Last attempt</td><th></th></tr>' +
        '</tbody></table></div></div>';
      modals.appendChild(today);
      AVRFW && AVRFW.translate && AVRFW.translate(today);
    }

    OptionsCore.getModals(); // rebinder les boutons de fermeture au besoin
  }

  AVRFW.createViewProvider('stats', {
    controller: function () { return { state: {}, methods: {} }; },
    onMounted: function (ctx) {
      AVRFW && AVRFW.translate && AVRFW.translate(ctx.root);
      injectModals();
      var modals = OptionsCore.getModals();
      var notif = OptionsCore.getNotif();
      (async function initStats(){
        try {

        // Injected backend (via app DI or global fallback from backend.service)
        const backend = await AVRFW.ensureBackend(ctx, { install: true, waitFor: true, retries: 15, delay: 120 });
        if (!backend) { notif.create('Backend not available', 'error'); return; }

        // Live bindings (post-init from backend.service)
        var db = backend.DB, dbLogs = backend.DB_LOGS, settings = backend.SETTINGS || {}, allProjects = backend.allProjects || {};

        function getMonthRoll(general) {
          if (!general || !general.lastAttemptVote) return general;
          var last = new Date(general.lastAttemptVote);
          var now = new Date();
          if (last.getFullYear() < now.getFullYear() || last.getMonth() < now.getMonth()) {
            // nouvelle periode: decalage des compteurs
            general.lastMonthSuccessVotes = Number(general.monthSuccessVotes || 0);
            general.monthSuccessVotes = 0;
          }
          return general;
        }

        async function openGeneral() {

          var general = await db.get('other', 'generalStats') || {};
          general = getMonthRoll(general);
          await db.put('other', general, 'generalStats');

          modals.toggle('stats');

          var sub = document.querySelector('#stats .statsSubtitle');
          sub.textContent = t('generalStats') || 'General stats';

          var q = function (key) { return document.querySelector('#stats td[data-resource="' + key + '"]').nextElementSibling; };

          q('statsSuccessVotes').textContent = Number(general.successVotes || 0);
          q('statsMonthSuccessVotes').textContent = Number(general.monthSuccessVotes || 0);
          q('statsLastMonthSuccessVotes').textContent = Number(general.lastMonthSuccessVotes || 0);
          q('statsErrorVotes').textContent = Number(general.errorVotes || 0);
          q('statsLaterVotes').textContent = Number(general.laterVotes || 0);
          q('statsLastSuccessVote').textContent = fmtDate(general.lastSuccessVote);
          q('statsLastAttemptVote').textContent = fmtDate(general.lastAttemptVote);

          // label "Installed"
          var tdAdded = document.querySelector('#stats td[data-resource="statsAdded"]');
          if (tdAdded) tdAdded.textContent = t('statsInstalled') || 'Installed';
          q('statsAdded').textContent = fmtDate(general.added);
        }

        async function openToday() {
          if (backend.initializeConfig) await backend.initializeConfig({ background: false });

          var today = await db.get('other', 'todayStats') || {};
          var now = new Date(); var last = today.lastAttemptVote ? new Date(today.lastAttemptVote) : null;
          if (last && last.getDate() !== now.getDate()) {
            today = { successVotes: 0, errorVotes: 0, laterVotes: 0, lastSuccessVote: null, lastAttemptVote: null };
          }
          await db.put('other', today, 'todayStats');

          modals.toggle('statsToday');

          var q = function (key) { return document.querySelector('#statsToday td[data-resource="' + key + '"]').nextElementSibling; };
          q('statsSuccessVotes').textContent = Number(today.successVotes || 0);
          q('statsErrorVotes').textContent = Number(today.errorVotes || 0);
          q('statsLaterVotes').textContent = Number(today.laterVotes || 0);
          q('statsLastSuccessVote').textContent = fmtDate(today.lastSuccessVote);
          q('statsLastAttemptVote').textContent = fmtDate(today.lastAttemptVote);
        }

        // Bind buttons
        var btnGeneral = ctx.root.querySelector('#btnGeneral');
        var btnToday = ctx.root.querySelector('#btnToday');
        btnGeneral && btnGeneral.addEventListener('click', openGeneral);
        btnToday && btnToday.addEventListener('click', openToday);
      }
        } catch (error) { notif.create(error, 'error'); }
      })();
  });
}));
