/* view/fast-add/main.js — UMD provider "fast-add"
   - Crée la modale #addFastProject et exécute l’ajout rapide via URL
   - Flags supportés: ?disableNotifInfo=true&disableNotifWarn=true&disableNotifStart=true
   - Paramètres projet: top|rating, nick, id, game, listing, lang, maxCountVote, ordinalWorld, addition
   - Backend via DI: ctx.app.inject('backend') (fallback __AVRFW_SERVICES__.backend)
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
  function el(sel, scope){ return (scope || document).querySelector(sel); }

  // Permissions checker (uses be.allProjects + be.utils.getDomainWithoutSubdomain)
  async function checkPermissions(projects, element, be) {
    var allProjects = be.allProjects || {};
    var getDomainWithoutSubdomain = (be.utils && be.utils.getDomainWithoutSubdomain) ||
      (u => { try { var h=new URL(u).hostname; var p=h.split('.'); return p.slice(-2).join('.'); } catch(e){ return u; } });
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
      if (fn.needAdditionalOrigins) (fn.needAdditionalOrigins(project)||[]).forEach(function(o){ if (!origins.includes(o)) origins.push(o); });
      if (fn.needAdditionalPermissions) (fn.needAdditionalPermissions(project)||[]).forEach(function(p){ if (!permissions.includes(p)) permissions.push(p); });
    });

    var granted = await chrome.permissions.contains({ origins, permissions });
    if (!granted) {
      var button = document.createElement('button'); button.textContent = t('grant') || 'Grant'; button.classList.add('btn');
      OptionsCore.getNotif().create([t('grantUrl') || 'Grant access to required sites', button], 'hint', { element: element });
      granted = await new Promise(function(resolve){
        button.addEventListener('click', async function(){
          try {
            var ok = await chrome.permissions.request({ origins, permissions });
            if (!ok) { OptionsCore.getNotif().create(t('notGrantUrl') || 'Permission denied', 'error', { element }); resolve(false); }
            else { if (element) OptionsCore.getNotif().create(t('granted') || 'Permission granted', 'success', { element }); resolve(true); }
          } catch(e){ OptionsCore.getNotif().create(e, 'error', { element }); resolve(false); }
        });
      });
    } else if (element) {
      OptionsCore.getNotif().create(t('granted') || 'Permission granted', 'success', { element });
    }
    return granted;
  }

  function parseProjectsFromURL(allProjects) {
    var projects = [];
    var project = {};
    var url = new URL(document.location.href);

    for (var [key, value] of url.searchParams) {
      if (key === 'top') key = 'rating';
      if (['rating','nick','id','game','listing','lang','maxCountVote','ordinalWorld','addition'].includes(key)) {
        if (key !== 'rating' && !project.rating) continue;
        if (key === 'rating' && Object.keys(project).length > 0) {
          project.time = null;
          project.stats = { successVotes:0, monthSuccessVotes:0, lastMonthSuccessVotes:0, errorVotes:0, laterVotes:0, lastSuccessVote:null, lastAttemptVote:null, added:Date.now() };
          if (allProjects[project.rating] && allProjects[project.rating].URLMain) {
            var domain2 = allProjects[project.rating].URLMain(); if (domain2 !== project.rating) project.ratingMain = domain2;
          }
          projects.push(project);
          project = {};
        }
        if (key === 'rating') {
          if (!allProjects[value]) {
            appendRow('error', t('failParseUrlFastAdd', [value, url.searchParams.get('name')]) || ('Unsupported rating: ' + value));
            continue;
          }
          project.rating = value;
        } else if (key === 'maxCountVote' || key === 'ordinalWorld') {
          var num = Number(value); project[key] = isNaN(num) ? 1 : num;
        } else {
          project[key] = value;
        }
      }
    }

    if (Object.keys(project).length > 0) {
      project.time = null;
      project.stats = { successVotes:0, monthSuccessVotes:0, lastMonthSuccessVotes:0, errorVotes:0, laterVotes:0, lastSuccessVote:null, lastAttemptVote:null, added:Date.now() };
      if (allProjects[project.rating] && allProjects[project.rating].URLMain) {
        var d2 = allProjects[project.rating].URLMain(); if (d2 !== project.rating) project.ratingMain = d2;
      }
      projects.push(project);
    }
    return projects;

    function appendRow(kind, text){
      var list = el('#addFastProject > .content .message');
      if (!list) return;
      var html = document.createElement('div'); html.className='fastAddEl';
      var img = document.createElement('img'); img.src = kind==='error' ? 'images/icons/error.svg' : 'images/icons/success.svg'; html.append(img);
      var div = document.createElement('div'); var p = document.createElement('p'); p.textContent = text; div.append(p); html.append(div);
      list.append(html); list.scrollTop = list.scrollHeight;
    }
  }

  async function addProjectToDB(project, be) {
    var db = be.DB;
    var allProjects = be.allProjects || {};
    var fn = allProjects[project.rating]; if (!fn) throw new Error('Unknown rating: ' + project.rating);

    // Pre-check presence
    var url = fn.pageURL(project);
    var response;
    try {
      response = await fetch(url, { credentials: (project.rating === 'minecraftiplist.com' ? 'omit' : 'include') });
    } catch (e) {
      if (String(e).includes('Failed to fetch')) throw new Error(t('notConnectInternet') || 'No internet');
      throw e;
    }
    var ignore = fn.ignoreErrors && fn.ignoreErrors();
    if (!ignore) {
      if (response.status === 404) throw new Error(t('notFoundProjectCode', String(response.status)) || 'Not found (404)');
      else if (response.redirected) throw new Error(t('notFoundProjectRedirect', response.url) || ('Redirected: ' + response.url));
      else if (![200,201,202,204,206,301,302,303,307,308,403,503].includes(response.status) && !response.ok) {
        throw new Error(t('notConnect', [project.rating, String(response.status)]) || ('Error ' + response.status));
      }
    }

    var html = await response.text();
    var doc = new DOMParser().parseFromString(html, 'text/html');

    try {
      var notFound = fn.notFound && fn.notFound(doc, project);
      if (notFound) throw new Error(notFound===true ? (t('notFoundProject')||'Project not found') : notFound);
      project.name = (fn.projectName && fn.projectName(doc, project) || '').trim();
    } catch(e){
      project.name = project.name || '';
    }

    // Insert DB
    var store = db.transaction('projects','readwrite').store;
    var key = await store.put(project); project.key = key;
    await store.put(project, project.key);
    try { chrome.runtime.sendMessage('reloadAllSettings'); chrome.runtime.sendMessage('checkVote'); } catch(e){}
    try { window.OptionsCore?.usageSpace?.(); } catch (_) {}
    return project;
  }

  function injectModal() {
    OptionsCore.ensureContainers();
    var modals = document.getElementById('modals');
    if (modals.querySelector('#addFastProject')) return;
    var m = document.createElement('div');
    m.className = 'modal'; m.id = 'addFastProject';
    m.innerHTML =
      '<div class="head">' +
        '<h3 data-i18n-mode="replace" data-resource="fastAdd">Fast add</h3>' +
        '<div class="close"></div>' +
      '</div>' +
      '<div class="content">' +
        '<div class="message"></div>' +
        '<div class="events"></div>' +
      '</div>';
    modals.appendChild(m);
    AVRFW && AVRFW.translate && AVRFW.translate(m);
    OptionsCore.getModals();
  }

  var viewDef = {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){
      AVRFW && AVRFW.translate && AVRFW.translate(ctx.root);
      injectModal();
      var modals = OptionsCore.getModals();
      modals.toggle('addFastProject');

      // Resolve backend via DI (auto-install if missing)
      (async function initFastAdd(){
        try {
          var be = (ctx.app && ctx.app.inject && ctx.app.inject('backend')) ||
                   (root.__AVRFW_SERVICES__ && root.__AVRFW_SERVICES__.backend) || null;
          if (!be && root.AVRFW_installBackend) {
            await root.AVRFW_installBackend(ctx.app, { background:false });
            be = (ctx.app && ctx.app.inject && ctx.app.inject('backend')) ||
                 (root.__AVRFW_SERVICES__ && root.__AVRFW_SERVICES__.backend) || null;
          }
          if (!be) {
            // Graceful error in modal
            var msgBox = el('#addFastProject > .content > .message');
            if (msgBox) {
              var row = document.createElement('div'); row.className='fastAddEl';
              var img = document.createElement('img'); img.src='images/icons/error.svg'; row.append(img);
              var div = document.createElement('div'); var p = document.createElement('p');
              p.textContent = 'Backend not available. Reload page.'; div.append(p); row.append(div); msgBox.append(row);
            }
            return;
          }

          var db = be.DB;
          var settings = be.SETTINGS || {};
          var allProjects = be.allProjects || {};
          var listFastAdd = el('#addFastProject > .content > .message');
          var events = el('#addFastProject > .content > .events');
          var hadError = false;

          function appendRow(kind, text, withStatusSpan) {
            var html = document.createElement('div'); html.className = 'fastAddEl';
            var img = document.createElement('img'); img.src = kind==='error' ? 'images/icons/error.svg' : 'images/icons/success.svg'; html.append(img);
            var div = document.createElement('div'); var p = document.createElement('p'); p.textContent = text;
            var status = null;
            if (withStatusSpan) { status = document.createElement('span'); p.append(document.createElement('br')); p.append(status); }
            div.append(p); html.append(div); listFastAdd.append(html); listFastAdd.scrollTop = listFastAdd.scrollHeight;
            return status;
          }

          async function persistSettings() {
            if (!db) return;
            await db.put('other', settings, 'settings');
            try { chrome.runtime.sendMessage('reloadSettings'); } catch(e){}
          }

          // Main run
          async function run() {
            // Flags notifications
            var sp = new URL(document.location.href).searchParams;
            var toggles = [
              ['disableNotifInfo','disabledNotifInfo'],
              ['disableNotifWarn','disabledNotifWarn'],
              ['disableNotifStart','disabledNotifStart']
            ];
            for (var i=0;i<toggles.length;i++){
              var param = toggles[i][0], field = toggles[i][1];
              if (sp.get(param) === 'true') {
                settings[field] = true; await persistSettings();
                appendRow('success', t(field) || field);
              }
            }

            // Permissions block
            var htmlPerm = document.createElement('div'); htmlPerm.className='fastAddEl';
            var fail = document.createElement('img'); fail.src='images/icons/error.svg'; htmlPerm.append(fail);
            var div2 = document.createElement('div'); var p2 = document.createElement('p'); p2.textContent = t('permissions') || 'Permissions';
            var status2 = document.createElement('span'); p2.append(document.createElement('br')); p2.append(status2);
            div2.append(p2); htmlPerm.append(div2); listFastAdd.append(htmlPerm); listFastAdd.scrollTop = listFastAdd.scrollHeight;

            var projects = parseProjectsFromURL(allProjects);
            var granted = await checkPermissions(projects, status2, be);
            if (!granted) {
              var retryBtn = document.createElement('button'); retryBtn.className='btn'; retryBtn.textContent = t('retry') || 'Retry';
              events.append(retryBtn);
              retryBtn.addEventListener('click', function(){ document.location.reload(true); });
              hadError = true;
              return;
            }

            for (var k=0;k<projects.length;k++){
              var p = projects[k];
              var label = p.rating + (p.nick ? ' – ' + p.nick : '') + (p.id ? ' – ' + p.id : '');
              var status = appendRow('error', label, true);
              try {
                await addProjectToDB(p, be);
                status.parentElement.parentElement.querySelector('img').src = 'images/icons/success.svg';
                status.textContent = t('addSuccess') || 'Added!';
              } catch(e) {
                hadError = true;
                status.textContent = String(e && e.message || e);
              }
            }

            if (hadError) {
              var r = document.createElement('button'); r.className='btn'; r.textContent = t('retry') || 'Retry';
              events.append(r); r.addEventListener('click', function(){ document.location.reload(true); });
            } else if (listFastAdd.childElementCount > 0) {
              var success = document.createElement('div'); success.className='successFastAdd';
              success.append(t('successFastAdd') || 'Fast add completed. You can close the tab.');
              success.append(document.createElement('br'));
              success.append(t('closeTab') || 'You can now close this tab.');
              listFastAdd.append(success); listFastAdd.scrollTop = listFastAdd.scrollHeight;
            }

            var closeBtn = document.createElement('button'); closeBtn.className='btn redBtn'; closeBtn.textContent = t('closeTabButton') || 'Close tab';
            events.append(closeBtn);
            closeBtn.addEventListener('click', function(){ window.close(); });
          }

          run().catch(function(e){ OptionsCore.getNotif().create(e, 'error'); });

        } catch (e) {
          OptionsCore.getNotif().create(e, 'error');
        }
      })();
    }
  };

  provide('fast-add', viewDef);
}));