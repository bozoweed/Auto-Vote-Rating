/* view/projects/main.js — UMD provider "projects"
   Fonctionnalités:
   - Groupes par rating (boutons) + listes paresseuses
   - Actions par projet: restart, stats, delete, accès permissions (si erreur d'accès)
   - Modales "stats" auto-injectées dans #modals
   Dépendances via DI:
   ctx.app.inject('backend') → {
     DB, DB_LOGS, SETTINGS, allProjects,
     attachGlobalErrorHandlers, utils: { getDomainWithoutSubdomain }
   }
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], function(){ return factory(root.AVRFW, root.OptionsCore); });
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('AVRFW'), require('OptionsCore'));
  else factory(root.AVRFW, root.OptionsCore);
}(typeof self !== 'undefined' ? self : this, function(AVRFW, OptionsCore){

  function provide(name, def){
    if (AVRFW && AVRFW.provide) AVRFW.provide(name, def);
    else {
      var g = (typeof self !== 'undefined' ? self : this);
      var hub = g.__AVRFW_PROVIDERS__ = g.__AVRFW_PROVIDERS__ || { defs:{}, waiters:{} };
      hub.defs[name] = def;
      (hub.waiters[name]||[]).forEach(function(fn){ try{fn(def);}catch{} });
      hub.waiters[name] = [];
    }
  }

  function t(k,a){ try{ return (root.chrome && root.chrome.i18n) ? root.chrome.i18n.getMessage(k,a) : ''; } catch(e){ return ''; } }
  function highlight(el){ if (!el) return; el.classList.add('highlight'); setTimeout(function(){ el.classList.remove('highlight'); }, 1200); }
  function toArr(x){ return Array.prototype.slice.call(x||[]); }

  function ensureStatsModals() {
    OptionsCore.ensureContainers();
    var modals = document.getElementById('modals');
    if (!modals.querySelector('#stats')) {
      var stats = document.createElement('div');
      stats.className = 'modal'; stats.id = 'stats';
      stats.innerHTML =
      '<div class="head">' +
        '<div class="title"><h3 data-i18n-mode="replace" data-resource="stats2">Stats</h3><div class="statsSubtitle"></div></div>' +
        '<div class="close"></div>' +
      '</div>' +
      '<div class="content"><div class="message"><table><tbody>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsSuccessVotes">Success votes</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsMonthSuccessVotes">Success (this month)</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsLastMonthSuccessVotes">Success (last month)</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsLaterVotes">Later votes</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsErrorVotes">Error votes</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsLastSuccessVote">Last success</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsLastAttemptVote">Last attempt</td><th></th></tr>' +
        '<tr><td data-i18n-mode="replace" data-resource="statsAdded">Installed</td><th></th></tr>' +
      '</tbody></table></div></div>';
      modals.appendChild(stats);
      AVRFW && AVRFW.translate && AVRFW.translate(stats);
      OptionsCore.getModals();
    }
  }

  function domainOf(url){
    try { return new URL(url).hostname; } catch(e){ return url; }
  }

  function textToLinks(text, element) {
    var urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#()?&//=]*)/igm;
    if (text && text.match && text.match(urlRegex)) {
      var tokens = text.match(/(?:http(s)?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_\+.~#?&//=]*)|\s*\S+\s*/g);
      for (var i=0;i<tokens.length;i++) {
        var tkn = tokens[i];
        if (tkn.match(urlRegex)) {
          var a = document.createElement('a');
          a.classList.add('link'); a.target = 'blank_'; a.href = tkn;
          a.textContent = (tkn.length > 64 ? tkn.substring(0,64)+'…' : tkn);
          element.append(a);
        } else element.append(tkn);
      }
    } else {
      element.textContent = text || '';
    }
  }

  async function checkPermissions(projects, element, be) {
    var allProjects = (be && be.allProjects) || {};
    var getDomainWithoutSubdomain = (be && be.utils && be.utils.getDomainWithoutSubdomain) || (function(u){
      try { var h = new URL(u).hostname; var p = h.split('.'); return p.slice(-2).join('.'); }
      catch(e){ return domainOf(u); }
    });

    var origins = [], permissions = [];
    projects.forEach(function(project){
      var fn = allProjects[project.rating]; if (!fn) return;
      var url = fn.pageURL(project);
      var domain = getDomainWithoutSubdomain(url);
      var originPattern = '*://*.' + domain + '/*';
      if (!origins.includes(originPattern)) origins.push(originPattern);

      if (!(fn.notRequiredCaptcha && fn.notRequiredCaptcha(project))) {
        var hp = (root.chrome && root.chrome.runtime && root.chrome.runtime.getManifest && root.chrome.runtime.getManifest().host_permissions) || [];
        hp.forEach(function(o){ if (!origins.includes(o)) origins.push(o); });
      }
      if (fn.needAdditionalOrigins) (fn.needAdditionalOrigins(project) || []).forEach(function(o){ if (!origins.includes(o)) origins.push(o); });
      if (fn.needAdditionalPermissions) (fn.needAdditionalPermissions(project) || []).forEach(function(p){ if (!permissions.includes(p)) permissions.push(p); });
    });

    var granted = await chrome.permissions.contains({ origins: origins, permissions: permissions });
    if (!granted) {
      var button = document.createElement('button');
      button.textContent = t('grant') || 'Grant';
      button.classList.add('submitBtn');
      OptionsCore.getNotif().create([t('grantUrl') || 'Grant access to required sites', button], 'hint', { element: element });

      granted = await new Promise(function(resolve){
        button.addEventListener('click', async function(){
          try {
            var ok = await chrome.permissions.request({ origins: origins, permissions: permissions });
            if (!ok) {
              OptionsCore.getNotif().create(t('notGrantUrl') || 'Permission denied', 'error', { element: element });
              resolve(false);
            } else {
              if (element) OptionsCore.getNotif().create(t('granted') || 'Permission granted', 'success', { element: element });
              resolve(true);
            }
          } catch (e) {
            OptionsCore.getNotif().create(e, 'error', { element: element });
            resolve(false);
          }
        });
      });
    } else {
      if (element) OptionsCore.getNotif().create(t('granted') || 'Permission granted', 'success', { element: element });
    }
    return granted;
  }

  var viewDef = {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){
      // i18n + services
      AVRFW && AVRFW.translate && AVRFW.translate(ctx.root);
      OptionsCore.ensureContainers();
      ensureStatsModals();
      var notif = OptionsCore.getNotif();
      OptionsCore.getModals();

      // Use injected backend (installed once in boot)
      var be = (ctx.app && ctx.app.inject && ctx.app.inject('backend')) ||
               (root.__AVRFW_SERVICES__ && root.__AVRFW_SERVICES__.backend) || null;
      if (!be) { notif.create('Backend not available', 'error'); return; }

      // Live bindings
      var db = be.DB;
      var dbLogs = be.DB_LOGS;
      var settings = be.SETTINGS || {};
      var allProjects = be.allProjects || {};
      var generateLock = false;

      function $(sel){ return ctx.root.querySelector(sel); }
      function $all(sel){ return toArr(ctx.root.querySelectorAll(sel)); }

      // Fill groups
      async function reloadProjectList() {
        if (generateLock) return; generateLock = true;
        var buttonBlock = ctx.root.querySelector('.projectsBlock .buttonBlock');
        var contentBlock = ctx.root.querySelector('.projectsBlock .contentBlock');
        buttonBlock.innerHTML=''; contentBlock.innerHTML='';

        var all = await (db ? db.getAll('projects') : Promise.resolve([]));
        var byRating = new Map();
        all.forEach(function(p){ var r=p.rating||'unknown'; var arr=byRating.get(r)||[]; arr.push(p); byRating.set(r, arr); });

        Object.keys(allProjects).forEach(function(r){
          var list = byRating.get(r) || [];
          if (list.length>0) generateBtnListRating(r, list.length);
        });

        var notAdded = $('#notAddedAll');
        var loading = $('#addedLoading');
        if (loading) loading.style.display = 'none';
        if (buttonBlock.childElementCount > 0) { notAdded && (notAdded.style.display='none'); }
        else { if (notAdded) notAdded.style.display='block'; }

        generateLock = false;
      }

      function generateBtnListRating(rating, count) {
        var button = document.createElement('button');
        button.className = 'selectsite';
        button.setAttribute('data-rating-button', rating);
        button.textContent = rating;
        var span = document.createElement('span'); span.textContent = String(count); button.append(span);
        ctx.root.querySelector('.buttonBlock').append(button);

        var ul = document.createElement('ul');
        ul.setAttribute('data-rating-tab', rating);
        ul.className = 'listcontent';
        ul.style.display = 'none';

        try {
          var fn = allProjects[rating];
          if (!(fn && fn.notRequiredCaptcha && fn.notRequiredCaptcha())) {
            var label = document.createElement('label');
            label.setAttribute('data-resource','passageCaptcha'); label.textContent = t('passageCaptcha') || 'If captcha is required, follow the guide';
            var link = document.createElement('a'); link.className='link'; link.target='blank_';
            link.href = 'https://github.com/Serega007RU/Auto-Vote-Rating/wiki/Guide-how-to-automate-the-passage-of-captcha-(reCAPTCHA-and-hCaptcha)';
            link.textContent = t('here') || 'here';
            label.append(' ', link); ul.append(label);
          }
        } catch(e){}

        var listDiv = document.createElement('div');
        listDiv.setAttribute('data-rating-list', rating);
        ul.append(listDiv);

        var delAll = document.createElement('button');
        delAll.className = 'submitBtn redBtn';
        delAll.textContent = t('deleteAll') || 'Delete all';
        delAll.addEventListener('click', async function(){
          if (!confirm(t('deleteAllRating') || 'Delete all projects for this rating?')) return;
          var all = await db.getAll('projects');
          var toDel = all.filter(function(p){ return p.rating===rating; });
          var tx = db.transaction('projects','readwrite');
          for (var i=0;i<toDel.length;i++){
            await tx.store.delete(toDel[i].key);
            try { chrome.alarms && chrome.alarms.clear && chrome.alarms.clear(String(toDel[i].key)); } catch(e){}
          }
          if (tx.done) await tx.done;
          ul.remove(); button.remove();
          if (ctx.root.querySelector('.buttonBlock').childElementCount <= 0) {
            var notAdded = $('#notAddedAll'); if (notAdded) notAdded.style.display='block';
          }
          OptionsCore.usageSpace();
        });
        ul.append(delAll);

        ctx.root.querySelector('.contentBlock').append(ul);
        button.addEventListener('click', function(ev){ listSelect(ev, rating); });
      }

      async function listSelect(event, rating) {
        toArr(ctx.root.getElementsByClassName('listcontent')).forEach(function(el){ el.style.display='none'; });
        toArr(ctx.root.getElementsByClassName('selectsite')).forEach(function(el){ el.classList.remove('activeList'); });

        var targetList = ctx.root.querySelector('[data-rating-tab="'+rating+'"]');
        targetList.style.display='block';
        event.currentTarget.classList.add('activeList');

        var list = ctx.root.querySelector('[data-rating-list="'+rating+'"]');
        if (!list) return;
        if (list.childElementCount === 0) {
          var div = document.createElement('div');
          div.setAttribute('data-resource','load'); div.textContent = t('load') || 'Loading…';
          list.append(div);

          var all = await db.getAll('projects');
          var projects = all.filter(function(p){ return p.rating===rating; });

          div.remove();
          for (var i=0;i<projects.length;i++) {
            await addProjectList(projects[i]);
          }
        }
      }

      async function addProjectList(project, preBend) {
        if (!ctx.root.querySelector('[data-rating-button="'+project.rating+'"]')) generateBtnListRating(project.rating, 0);
        if (!ctx.root.querySelector('[data-rating-tab="'+project.rating+'"]')) generateBtnListRating(project.rating, 0);

        var listProject = ctx.root.querySelector('[data-rating-list="'+project.rating+'"]');
        if (!listProject) return;

        var existing = document.getElementById('projects'+project.key);
        if (existing) {
          if (existing.parentElement !== listProject) listProject.appendChild(existing);
          await updateProjectText(project);
          if (preBend) listProject.prepend(existing);
          return;
        }

        var li = document.createElement('li'); li.id='projects'+project.key;

        var msg = document.createElement('div'); msg.className='message';
        var title = document.createElement('div'); msg.append(title);
        var errorDiv = document.createElement('div'); errorDiv.className='error'; msg.append(errorDiv);
        var warnDiv = document.createElement('div'); warnDiv.className='warn'; msg.append(warnDiv);
        var nextVote = document.createElement('div'); nextVote.className='textNextVote'; msg.append(nextVote);
        li.append(msg);

        var controls = document.createElement('div'); controls.className='controlItems';

        var restart = document.createElement('div'); restart.className='projectStats';
        var restartImg = document.createElement('img'); restartImg.src='images/icons/restart.svg';
        var restartTip = document.createElement('span'); restartTip.className='tooltiptext'; restartTip.textContent = t('restart') || 'Restart';
        restart.append(restartImg, restartTip); controls.append(restart);

        var stats = document.createElement('div'); stats.className='projectStats';
        var statsImg = document.createElement('img'); statsImg.src='images/icons/stats.svg';
        var statsTip = document.createElement('span'); statsTip.className='tooltiptext'; statsTip.textContent = t('stats2') || 'Stats';
        stats.append(statsImg, statsTip); controls.append(stats);

        var del = document.createElement('div'); del.className='projectStats';
        var delImg = document.createElement('img'); delImg.src='images/icons/delete.svg';
        var delTip = document.createElement('span'); delTip.className='tooltiptext'; delTip.textContent = t('deleteButton') || 'Delete';
        del.append(delImg, delTip); controls.append(del);

        if (settings && settings.expertMode) {
          var edit = document.createElement('div'); edit.className='projectStats';
          var eImg = document.createElement('img'); eImg.src='images/icons/edit.svg';
          var eTip = document.createElement('span'); eTip.className='tooltiptext'; eTip.textContent = t('edit') || 'Edit';
          edit.append(eImg, eTip); controls.append(edit);
          edit.addEventListener('click', async function(){
            try { root.chrome && chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.sendMessage({ openProject: project.key }); } catch(e){}
          });
        }

        li.append(controls);
        if (preBend) listProject.prepend(li); else listProject.append(li);
        await updateProjectText(project);

        del.addEventListener('click', async function(ev){
          if (ev.target.disabled) return; ev.target.disabled = true;
          var ok = await removeProjectList(project, false);
          ev.target.disabled = false; if (ok) OptionsCore.usageSpace();
        });

        restart.addEventListener('click', async function(ev){
          if (ev.target.disabled) return;
          ev.target.disabled = true;
          var timer = setTimeout(function(){
            var b = document.createElement('button'); b.className='btn'; b.id='restartBtn';
            b.textContent = t('restartExtension') || 'Restart extension';
            b.addEventListener('click', function(){ if (confirm(t('confirmRestartExtension') || 'Restart extension now?')) chrome.runtime.reload(); });
            OptionsCore.getNotif().create([t('lagServiceWorker') || 'Worker seems stuck', b], 'warn', 60000);
            ev.target.disabled=false;
          }, 5000);
          try{
            var fresh = await db.get('projects', project.key);
            var message = await chrome.runtime.sendMessage({ projectRestart: fresh });
            if (message === 'confirmNow' || message === 'confirmQueue') {
              clearTimeout(timer);
              if (confirm(chrome.i18n.getMessage(message))) {
                timer = setTimeout(function(){
                  var b = document.createElement('button'); b.className='btn'; b.id='restartBtn';
                  b.textContent = t('restartExtension') || 'Restart extension';
                  b.addEventListener('click', function(){ if (confirm(t('confirmRestartExtension') || 'Restart extension now?')) chrome.runtime.reload(); });
                  OptionsCore.getNotif().create([t('lagServiceWorker') || 'Worker seems stuck', b], 'warn', 60000);
                }, 5000);
                await chrome.runtime.sendMessage({ projectRestart: fresh, confirmed: true });
              } else { ev.target.disabled=false; return; }
            }
            OptionsCore.getNotif().create(t('restarted') || 'Restarted', 'success');
          } catch(e){ OptionsCore.getNotif().create(e, 'error'); }
          finally { clearTimeout(timer); ev.target.disabled=false; }
        });

        stats.addEventListener('click', function(){ updateModalStats(project, true); });
      }

      async function removeProjectList(project, editing) {
        var li = document.getElementById('projects'+project.key);
        if (li) {
          var timer = setTimeout(function(){
            var b = document.createElement('button'); b.className='btn'; b.id='restartBtn';
            b.textContent = t('restartExtension') || 'Restart extension';
            b.addEventListener('click', function(){ if (confirm(t('confirmRestartExtension') || 'Restart extension now?')) chrome.runtime.reload(); });
            OptionsCore.getNotif().create([t('lagServiceWorker') || 'Worker seems stuck', b], 'warn', 60000);
          }, 5000);
          try {
            var message = await chrome.runtime.sendMessage({ projectDeleted: project });
            if (message === 'reject') {
              OptionsCore.getNotif().create(t('rejectDelete') || 'Delete rejected', 'error');
              return false;
            }
          } catch(e){ OptionsCore.getNotif().create(e, 'error'); return false; }
          finally { clearTimeout(timer); }

          if (!editing) {
            var badge = ctx.root.querySelector('[data-rating-button="'+project.rating+'"] > span');
            var count = Math.max(0, Number(badge && badge.textContent || 0) - 1);
            var tab = ctx.root.querySelector('[data-rating-tab="'+project.rating+'"]');
            var btn = ctx.root.querySelector('[data-rating-button="'+project.rating+'"]');
            if (count <= 0) {
              tab && tab.remove(); btn && btn.remove();
              var notAdded = $('#notAddedAll');
              if (ctx.root.querySelector('.buttonBlock').childElementCount <= 0) notAdded && (notAdded.style.display='block');
            } else {
              li.remove(); if (badge) badge.textContent = String(count);
            }
          } else li.remove();
        }
        return true;
      }

      async function updateProjectText(project) {
        var el = document.getElementById('projects'+project.key);
        if (!el) return;

        var whenText = t('soon') || 'Soon';
        if (!(project.time == null || project.time === '') && Date.now() < project.time) {
          whenText = new Date(project.time).toLocaleString().replace(',', '');
        } else {
          var opened = await db.get('other','openedProjects') || null;
          var iterate = [];
          if (opened && typeof opened.values === 'function') iterate = opened.values();
          else if (Array.isArray(opened)) iterate = opened;
          else if (opened && typeof opened === 'object') iterate = Object.values(opened);
          for (var it of iterate) {
            var value = it;
            if (project.rating === value.rating) {
              whenText = (t('inQueue') || 'In queue');
              if (project.key === value.key) { whenText = (t('now') || 'Now'); break; }
            }
          }
        }

        var textProject = '';
        if (project.nick) textProject += ' – ' + project.nick;
        if (project.game) textProject += ' – ' + project.game;
        if (project.id) textProject += ' – ' + project.id;
        if (project.name) textProject += ' – ' + project.name;
        if (textProject === '') textProject = project.rating; else textProject = textProject.replace(' – ', '');
        if (project.priority) textProject += ' (' + (t('inPriority') || 'priority') + ')';
        if (project.randomize) textProject += ' (' + (t('inRandomize') || 'randomize') + ')';
        if (project.rating !== 'Custom' && (project.timeout != null || project.timeoutHour != null)) textProject += ' (' + (t('customTimeOut2') || 'custom timeout') + ')';
        if (project.lastDayMonth) textProject += ' (' + (t('lastDayMonth2') || 'last day of month') + ')';
        if (project.silentMode) textProject += ' (' + (t('enabledSilentVoteSilent') || 'silent vote') + ')';
        if (project.emulateMode) textProject += ' (' + (t('enabledSilentVoteNoSilent') || 'emulated vote') + ')';

        el.querySelector('div > div').textContent = textProject;
        el.querySelector('.textNextVote').textContent = (t('nextVote') || 'Next vote') + ' ' + whenText;

        var errorElement = el.querySelector('.error'); errorElement.textContent='';
        var warnElement = el.querySelector('.warn');  warnElement.textContent='';

        var controls = el.querySelector('.controlItems');
        var existingAccess = controls.querySelector('img.access') ? controls.querySelector('img.access').parentElement : null;

        if (project.error) {
          textToLinks(project.error, errorElement);
          if (String(project.error).includes('Cannot access contents of the page')) {
            if (!existingAccess) {
              var acc = document.createElement('div'); acc.className='projectStats';
              var accImg = document.createElement('img'); accImg.src='images/icons/access.svg'; accImg.className='access';
              var accTip = document.createElement('span'); accTip.className='tooltiptext'; accTip.textContent = t('access') || 'Grant access';
              acc.append(accImg, accTip); controls.prepend(acc);
              acc.addEventListener('click', async function(){
                if (await checkPermissions([project], null, be)) {
                  delete project.error;
                  await chrome.runtime.sendMessage({ projectRestart: project, confirmed: true });
                  OptionsCore.getNotif().create(t('restarted') || 'Restarted', 'success');
                }
              });
            }
          } else if (existingAccess) existingAccess.remove();
        } else if (existingAccess) existingAccess.remove();

        if (project.warn) textToLinks(project.warn, warnElement);
      }

      async function updateModalStats(project, toggle) {
        ensureStatsModals();
        if (toggle) {
          OptionsCore.getModals().toggle('stats');
          project = await db.get('projects', project.key);
        } else {
          var open = document.getElementById('stats').classList.contains('active');
          var same = document.querySelector('.statsSubtitle').id === ('stats'+project.key);
          if (!(open && same)) return;
        }
        var text = project.rating;
        if (project.nick) text += ' – ' + project.nick;
        if (project.game) text += ' – ' + project.game;
        if (project.name) text += ' – ' + project.name; else if (project.id) text += ' – ' + project.id;

        var sub = document.querySelector('.statsSubtitle');
        sub.textContent = text; sub.id = 'stats'+project.key;

        var orNone = function(v){ return v ? new Date(v).toLocaleString().replace(',', '') : (t('none') || 'None'); };

        document.querySelector('td[data-resource="statsSuccessVotes"]').nextElementSibling.textContent = project.stats.successVotes;
        document.querySelector('td[data-resource="statsMonthSuccessVotes"]').nextElementSibling.textContent = project.stats.monthSuccessVotes;
        document.querySelector('td[data-resource="statsLastMonthSuccessVotes"]').nextElementSibling.textContent = project.stats.lastMonthSuccessVotes;
        document.querySelector('td[data-resource="statsErrorVotes"]').nextElementSibling.textContent = project.stats.errorVotes;
        document.querySelector('td[data-resource="statsLaterVotes"]').nextElementSibling.textContent = project.stats.laterVotes;
        document.querySelector('td[data-resource="statsLastSuccessVote"]').nextElementSibling.textContent = orNone(project.stats.lastSuccessVote);
        document.querySelector('td[data-resource="statsLastAttemptVote"]').nextElementSibling.textContent = orNone(project.stats.lastAttemptVote);
        document.querySelector('td[data-resource="statsAdded"]').nextElementSibling.textContent = orNone(project.stats.added);
      }

      if (root.chrome && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(async function(request){
          try {
            if (request.updateValue === 'projects' && request.value) {
              await updateProjectText(request.value);
            } else if (request.openProject) {
              var p = await db.get('projects', request.openProject);
              var btn = ctx.root.querySelector('[data-rating-button="'+p.rating+'"]');
              if (btn) btn.click();
              var row = document.getElementById('projects'+p.key);
              if (!row) { await addProjectList(p); row = document.getElementById('projects'+p.key); }
              row && row.scrollIntoView({ block:'center' }); highlight(row);
            } else if (request.notification) {
              var typ = (['warn','error'].includes(request.notification.type)) ? request.notification.type : 'hint';
              OptionsCore.getNotif().create([request.notification.title, document.createElement('br'), request.notification.message], typ);
            }
          } catch(e){}
        });
      }

      (async function init(){
        try { be.attachGlobalErrorHandlers && be.attachGlobalErrorHandlers(function(err){ OptionsCore.getNotif().create(err, 'error'); }); } catch(e){}
        await reloadProjectList();
        OptionsCore.usageSpace();
      })();
    }
  };

  provide('projects', viewDef);
}));