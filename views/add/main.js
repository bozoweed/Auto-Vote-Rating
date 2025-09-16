/* view/add/main.js — UMD provider "add"
   - Mode lien / manuel avec champs conditionnels par rating (allProjects)
   - Vérification permissions + présence (fetch), notFound, projectName
   - Sauvegarde DB (add / edit), scheduling, timeout, randomize, vote modes, Custom body
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
      var w = hub.waiters[name] || []; w.forEach(function(fn){ try{fn(def);}catch{} }); hub.waiters[name] = [];
    }
  }

  function t(k,a){ try{ return (root.chrome && root.chrome.i18n) ? root.chrome.i18n.getMessage(k,a) : ''; } catch(e){ return ''; } }
  function $(rootEl, sel){ return rootEl.querySelector(sel); }
  function toArr(nl){ return Array.prototype.slice.call(nl||[]); }

  function parseDomain(getDomainWithoutSubdomain, url){
    try { return getDomainWithoutSubdomain(url); } catch(e){ try{ return new URL(url).hostname; } catch(e2){ return ''; } }
  }

  async function checkPermissions(projects, element, be) {
    var allProjects = be.allProjects || {};
    var getDomainWithoutSubdomain = (be.utils && be.utils.getDomainWithoutSubdomain) || (u => { try { var h=new URL(u).hostname; var p=h.split('.'); return p.slice(-2).join('.'); } catch(e){ return u; } });
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

    var granted = await chrome.permissions.contains({ origins: origins, permissions: permissions });
    if (!granted) {
      var button = document.createElement('button'); button.textContent = t('grant') || 'Grant'; button.classList.add('submitBtn');
      OptionsCore.getNotif().create([t('grantUrl') || 'Grant access to required sites', button], 'hint', { element: element });
      granted = await new Promise(function(resolve){
        button.addEventListener('click', async function(){
          try {
            var ok = await chrome.permissions.request({ origins: origins, permissions: permissions });
            if (!ok) { OptionsCore.getNotif().create(t('notGrantUrl') || 'Permission denied', 'error', { element: element }); resolve(false); }
            else { if (element) OptionsCore.getNotif().create(t('granted') || 'Permission granted', 'success', { element: element }); resolve(true); }
          } catch(e){ OptionsCore.getNotif().create(e, 'error', { element: element }); resolve(false); }
        });
      });
    } else if (element) OptionsCore.getNotif().create(t('granted') || 'Permission granted', 'success', { element: element });

    return granted;
  }

  var viewDef = {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){
      if (AVRFW && AVRFW.translate) AVRFW.translate(ctx.root);
      OptionsCore.ensureContainers();
      var notif = OptionsCore.getNotif();

      var be = root.AVRFW_OPTIONS_BACKEND || {};
      var db = be.DB, settings = be.SETTINGS || {}, allProjects = be.allProjects || {};
      var getDomainWithoutSubdomain = be.utils && be.utils.getDomainWithoutSubdomain;

      var editingProject = null;

      function E(sel){ return $(ctx.root, sel); }

      function show(elId,on){ var el=E(elId); if (!el) return; el.style.display = on ? '' : 'none'; }
      function showBlock(id,on){ var el=E(id); if (!el) return; if (on) el.removeAttribute('style'); else el.style.display='none'; }
      function setReq(id,on){ var el=E(id); if (el) el.required = !!on; }

      function generateDataList(){
        var datalist = E('#ratingList'); if (!datalist) return; datalist.replaceChildren();
        Object.keys(allProjects).forEach(function(rating){
          var option = document.createElement('option');
          option.setAttribute('name', rating); option.value = rating;
          if (rating === 'Custom') { option.disabled = !settings.enableCustom; option.textContent = t('Custom') || 'Custom'; }
          datalist.append(option);
        });
      }

      function resetVisibility() {
        showBlock('#blk-rating', false);
        showBlock('#blk-nick', false);
        showBlock('#blk-id', false);
        showBlock('#blk-addition', false);
        showBlock('#blk-game', false);
        showBlock('#blk-listing', false);
        showBlock('#blk-lang', false);
        showBlock('#blk-countVote', false);
        showBlock('#blk-ordinalWorld', false);

        showBlock('#blk-selectTime', false);
        showBlock('#blk-time', false);
        showBlock('#blk-hour', false);
        showBlock('#blk-week', false);
        showBlock('#blk-month', false);
        showBlock('#blk-schedule', false);
        showBlock('#blk-random', false);
        showBlock('#blk-voteMode', false);

        showBlock('#blk-responseURL', false);
        showBlock('#blk-customBody', false);

        setReq('#nick', false); setReq('#id', false);
        setReq('#chooseGame', false); setReq('#chooseListing', false);
        setReq('#chooseLang', false); setReq('#countVote', false); setReq('#ordinalWorld', false);
        setReq('#time', false); setReq('#hour', false); setReq('#week', false); setReq('#month', false);
        setReq('#scheduleTime', false);

        E('#banAttention').style.display='none';
        E('#rewardAttention').style.display='none';
        E('#operaAttention').style.display='none';

        var voteMode = E('#voteMode'); if (voteMode){ voteMode.disabled = true; voteMode.checked = false; }
        E('#voteModeSelect') && (E('#voteModeSelect').value='silentMode');
      }

      function onSwitchMode() {
        var manual = E('#switchAddMode').checked;
        if (manual) {
          resetVisibility();
          showBlock('#blk-rating', true);
          setReq('#rating', true);
          showBlock('#blk-link', false);
          setReq('#link', false);
        } else {
          resetVisibility();
          showBlock('#blk-link', true);
          setReq('#link', true);
          showBlock('#blk-rating', false);
          setReq('#rating', false);
        }
      }

      function toggleCustomTimeout(on) {
        showBlock('#blk-selectTime', on);
        if (!on){ showBlock('#blk-time', false); showBlock('#blk-hour', false); showBlock('#blk-week', false); showBlock('#blk-month', false); setReq('#time',false); setReq('#hour',false); setReq('#week',false); setReq('#month',false); }
        else onSelectTime();
        E('#lastDayMonth').disabled = !on;
      }

      function onSelectTime() {
        var v = E('#selectTime').value;
        showBlock('#blk-time', v==='ms');
        setReq('#time', v==='ms');

        var hourMode = (v==='hour'||v==='week'||v==='month');
        showBlock('#blk-hour', hourMode); setReq('#hour', hourMode);
        showBlock('#blk-week', v==='week'); setReq('#week', v==='week');
        showBlock('#blk-month', v==='month'); setReq('#month', v==='month');
      }

      function onRandomizeChange() {
        var on = E('#randomize').checked;
        showBlock('#blk-random', on);
        setReq('#randomizeMin', on); setReq('#randomizeMax', on);
      }

      function onScheduleToggle() {
        var on = E('#scheduleTimeCheckbox').checked;
        showBlock('#blk-schedule', on); setReq('#scheduleTime', on);
      }

      function onVoteModeToggle() {
        var on = E('#voteMode').checked;
        showBlock('#blk-voteMode', on);
      }

      // Link mode parsing
      var laterChoose=false;
      function onLinkInput() {
        if (!E('#link').value) { resetVisibility(); return; }
        if (laterChoose) { resetVisibility(); laterChoose=false; }

        var domain, project={}, funcRating;
        try {
          domain = parseDomain(getDomainWithoutSubdomain, E('#link').value);
          funcRating = allProjects[domain];
          if (!funcRating) return;
          project = funcRating.parseURL(new URL(E('#link').value)) || {};
        } catch(e){ return; }
        laterChoose=true; project.rating = domain;

        // conditional fields
        if (!(funcRating.notRequiredNick && funcRating.notRequiredNick(project))) {
          showBlock('#blk-nick', true); setReq('#nick', true);
          if (funcRating.optionalNick && funcRating.optionalNick()) E('#nick').placeholder = t('enterNickOptional') || 'Enter your nick (optional)';
        }
        if (funcRating.limitedCountVote && funcRating.limitedCountVote()) { showBlock('#blk-countVote', true); setReq('#countVote', true); }
        if (funcRating.ordinalWorld && funcRating.ordinalWorld()) { showBlock('#blk-ordinalWorld', true); setReq('#ordinalWorld', true); }
        if (funcRating.silentVote && funcRating.silentVote(project)) { var vm=E('#voteMode'); vm.disabled=false; }
        if (funcRating.banAttention && funcRating.banAttention(project)) { E('#banAttention').style.display=''; }
        if (project.rating==='minecraftrating.ru' && project.listing==='servers') { E('#rewardAttention').style.display=''; }
      }

      // Manual rating selection
      var laterChooseManual=false;
      function onRatingInput(reset) {
        if (laterChooseManual || reset) { resetVisibility(); laterChooseManual=false; if (reset) return; }

        var rating = E('#rating').value;
        var func = allProjects[rating];
        if (!func) return;
        laterChooseManual=true;

        if (rating === 'Custom') {
          E('#customTimeOut').checked = false; E('#customTimeOut').disabled = true; toggleCustomTimeout(false);
          E('#lastDayMonth').disabled = true; E('#lastDayMonth').checked=false;
          var vm=E('#voteMode'); vm.disabled=true; vm.checked=false; onVoteModeToggle();

          showBlock('#blk-nick', true); setReq('#nick', true);
          E('[data-resource="yourNick"]') && (E('[data-resource="yourNick"]').textContent = t('name') || 'Name');
          E('#nick').placeholder = t('enterName') || 'Enter name';

          showBlock('#blk-selectTime', true); onSelectTime();
          showBlock('#blk-responseURL', true);
          showBlock('#blk-customBody', true);
          return;
        }

        // ID requis
        if (!(func.notRequiredId && func.notRequiredId())) {
          showBlock('#blk-id', true); setReq('#id', true);
          var ex = func.exampleURL && func.exampleURL();
          if (ex){ E('#projectIDTooltip1').textContent = ex[0]||''; E('#projectIDTooltip2').textContent = ex[1]||''; E('#projectIDTooltip3').textContent = ex[2]||''; }
          E('#id').name = 'id_' + rating;
        }

        if (!(func.notRequiredNick && func.notRequiredNick())) {
          showBlock('#blk-nick', true); setReq('#nick', true);
          if (func.optionalNick && func.optionalNick()) E('#nick').placeholder = t('enterNickOptional') || 'Enter your nick (optional)';
        }

        if (func.URLMain && E('#rating').value !== func.URLMain()) {
          if (func.exampleURLGame && !func.defaultGame) E('#chooseGame').value = E('#rating').value;
          E('#rating').value = func.URLMain();
        }

        // Game
        if (func.exampleURLGame) {
          showBlock('#blk-game', true); E('#chooseGame').name = 'chooseGame_' + rating;
          var exg = func.exampleURLGame(); if (exg){ E('#urlGameTooltip1').textContent=exg[0]||''; E('#urlGameTooltip2').textContent=exg[1]||''; E('#urlGameTooltip3').textContent=exg[2]||''; }
          if (func.gameList) {
            var gl=E('#gameList'); gl.replaceChildren();
            for (var it of func.gameList()) { var o = document.createElement('option'); o.value=it[0]; o.textContent=it[1]; gl.append(o); }
          }
        }
        // Listing
        if (func.exampleURLListing) {
          showBlock('#blk-listing', true); E('#chooseListing').name = 'chooseListing_' + rating;
          var exl = func.exampleURLListing(); if (exl){ E('#urlListingTooltip1').textContent=exl[0]||''; E('#urlListingTooltip2').textContent=exl[1]||''; E('#urlListingTooltip3').textContent=exl[2]||''; }
          if (func.listingList) {
            var ll=E('#listingList'); ll.replaceChildren();
            for (var it2 of func.listingList()) { var o2=document.createElement('option'); o2.value=it2[0]; o2.textContent=it2[1]; ll.append(o2); }
          }
        }
        // Lang
        if (func.langList) {
          showBlock('#blk-lang', true); E('#chooseLang').name = 'chooseLang_' + rating;
          var l=E('#langList'); l.replaceChildren();
          for (var it3 of func.langList()) { var o3=document.createElement('option'); o3.value=it3[0]; o3.textContent=it3[1]; l.append(o3); }
        }

        if (func.limitedCountVote && func.limitedCountVote()) { showBlock('#blk-countVote', true); setReq('#countVote', true); }
        if (func.ordinalWorld && func.ordinalWorld()) { showBlock('#blk-ordinalWorld', true); setReq('#ordinalWorld', true); }
        if (func.silentVote && func.silentVote()) { var vm=E('#voteMode'); vm.disabled=false; }
        if (func.banAttention && func.banAttention()) {
          E('#banAttention').style.display='';
          if (!E('#randomize').checked) {
            E('#randomize').checked=true; onRandomizeChange();
            E('#randomizeMin').value = '0'; E('#randomizeMax').value = '14400000';
          }
        }
        if (func.additionExampleURL) {
          showBlock('#blk-addition', true); E('#additionURL').name = 'additionURL_' + rating;
          var exa = func.additionExampleURL(); if (exa){ E('#additionURLTooltip1').textContent=exa[0]||''; E('#additionURLTooltip2').textContent=exa[1]||''; E('#additionURLTooltip3').textContent=exa[2]||''; }
        }
      }

      // chooseListing special case
      E('#chooseListing')?.addEventListener('change', function(){
        if (this.name === 'chooseListing_minecraftrating.ru') {
          if (this.value === 'servers') {
            E('#nick').required = false; showBlock('#blk-nick', false);
            E('#rewardAttention').style.display='';
          } else {
            E('#nick').required = true; showBlock('#blk-nick', true);
            E('#rewardAttention').style.display='none';
          }
        }
      });

      // Submit (add/edit)
      E('#addProject').addEventListener('submit', async function(ev){
        ev.preventDefault(); var btn = ev.submitter; if (btn) btn.disabled = true;

        var manual = E('#switchAddMode').checked;
        var project = (btn && btn.id === 'submitEditProject') ? (editingProject || {}) : {};

        try {
          var domain, funcRating;

          if (!manual) {
            // Link
            var url = E('#link').value;
            try {
              domain = parseDomain(getDomainWithoutSubdomain, url);
              funcRating = allProjects[domain];
              if (!funcRating) { OptionsCore.getNotif().create(t('errorLink', domain) || ('Unsupported: '+domain), 'error'); return; }
              project = funcRating.parseURL(new URL(url)) || {};
              project.rating = domain;
              if (funcRating.URLMain) {
                var domain2 = funcRating.URLMain(); if (domain2 && domain2 !== domain) project.ratingMain = domain2;
              }
              if (!(funcRating.notRequiredId && funcRating.notRequiredId()) && !project.id) { OptionsCore.getNotif().create(t('errorLinkParam','id') || 'Missing id', 'error'); return; }
              if (funcRating.exampleURLGame && project.game == null) { OptionsCore.getNotif().create(t('errorLinkParam','game') || 'Missing game', 'error'); return; }
              if (funcRating.exampleURLListing && project.listing == null) { OptionsCore.getNotif().create(t('errorLinkParam','listing') || 'Missing listing', 'error'); return; }
              if (funcRating.langList && project.lang == null) { OptionsCore.getNotif().create(t('errorLinkParam','lang') || 'Missing lang', 'error'); return; }
            } catch(e){ OptionsCore.getNotif().create(e, 'error'); return; }
          } else {
            // Manual
            domain = E('#rating').value; funcRating = allProjects[domain];
            if (!funcRating) { OptionsCore.getNotif().create(t('errorSelectSiteRating') || 'Select a site', 'error'); return; }
            project.rating = domain;
            if (domain === 'Custom') project.id = E('#nick').value;
            else if (!(funcRating.notRequiredId && funcRating.notRequiredId())) project.id = E('#id').value;

            if (funcRating.exampleURLGame) project.game = E('#chooseGame').value;
            if (funcRating.exampleURLListing) project.listing = E('#chooseListing').value;
            if (funcRating.langList) project.lang = E('#chooseLang').value;
            if (funcRating.additionExampleURL) project.addition = E('#additionURL').value;

            var domain2 = (function(){ try { return parseDomain(getDomainWithoutSubdomain, funcRating.voteURL(project)); } catch(e){ return domain; } })();
            if (domain2 !== domain && domain !== 'Custom') {
              if (!allProjects[domain2]) {
                if (!confirm(t('notSupportedSiteRating', domain2) || ('Not supported: ' + domain2))) return;
              } else { project.rating = domain2; project.ratingMain = domain; }
            }
          }

          if (project.rating !== 'Custom' && !(funcRating.notRequiredNick && funcRating.notRequiredNick(project))) {
            project.nick = E('#nick').value;
            if (project.nick && project.nick.indexOf(' ') >= 0) {
              OptionsCore.getNotif().create(t('nickWithSpace') || 'Nick has spaces', 'warn');
              if (!confirm(t('nickWithSpaceConfirm') || 'Proceed anyway?')) return;
            }
          }
          if (funcRating.limitedCountVote && funcRating.limitedCountVote()) {
            project.maxCountVote = E('#countVote').valueAsNumber || 5;
            project.countVote = project.countVote || 0;
          }
          if (funcRating.ordinalWorld && funcRating.ordinalWorld()) {
            project.ordinalWorld = E('#ordinalWorld').valueAsNumber;
          }

          // Permissions
          OptionsCore.getNotif().create(t('adding') || 'Adding…', 'hint');
          var statusEl = null;
          if (!(await checkPermissions([project], statusEl, be))) return;

          // Presence check
          if (!E('#disableCheckProjects').checked && project.rating !== 'Custom') {
            OptionsCore.getNotif().create(t('checkHasProject') || 'Checking project…', 'hint');
            var response, url = funcRating.pageURL(project);
            try {
              response = await fetch(url, { credentials: (project.rating === 'minecraftiplist.com' ? 'omit' : 'include') });
            } catch(error){
              if (String(error).includes('Failed to fetch')) OptionsCore.getNotif().create(t('notConnectInternet') || 'No internet', 'error');
              else OptionsCore.getNotif().create(error, 'error');
              return;
            }
            var ignoreErrors = funcRating.ignoreErrors && funcRating.ignoreErrors();
            if (!ignoreErrors) {
              if (response.status === 404) { OptionsCore.getNotif().create(t('notFoundProjectCode', String(response.status)) || 'Not found (404)', 'error'); return; }
              else if (response.redirected) { OptionsCore.getNotif().create(t('notFoundProjectRedirect', response.url) || 'Redirected', 'error'); return; }
              else if (response.status === 503 || response.status === 403) { /* ignore CF */ }
              else if (!response.ok) { OptionsCore.getNotif().create(t('notConnect', [project.rating, String(response.status)]) || ('Error ' + response.status), 'error'); return; }
            }
            var html = await response.text();
            var doc = new DOMParser().parseFromString(html, 'text/html');
            try {
              var notFound = funcRating.notFound && funcRating.notFound(doc, project);
              if (notFound) { OptionsCore.getNotif().create(notFound===true ? (t('notFoundProject')||'Project not found') : notFound, 'error'); return; }
              project.name = (funcRating.projectName && funcRating.projectName(doc, project) || '').trim();
            } catch(e){ project.name = project.name || ''; }
            OptionsCore.getNotif().create(t('checkHasProjectSuccess') || 'Project found', 'hint');
          }

          // Stats default if new
          if (!editingProject || (btn && btn.id !== 'submitEditProject')) {
            project.stats = project.stats || {
              successVotes: 0, monthSuccessVotes: 0, lastMonthSuccessVotes: 0,
              errorVotes: 0, laterVotes: 0, lastSuccessVote: null, lastAttemptVote: null, added: Date.now()
            };
          }

          // Advanced
          // schedule
          if (E('#scheduleTimeCheckbox').checked && E('#scheduleTime').value) {
            project.time = new Date(E('#scheduleTime').value).getTime();
          } else project.time = null;

          // timeout
          if (E('#customTimeOut').checked || project.rating === 'Custom') {
            if (E('#selectTime').value === 'ms') {
              delete project.timeoutHour; delete project.timeoutMinute; delete project.timeoutSecond; delete project.timeoutMS;
              delete project.timeoutWeek; delete project.timeoutMonth;
              project.timeout = E('#time').valueAsNumber || 0;
            } else {
              delete project.timeout;
              var hhmmss = String(E('#hour').value || '0:0:0.0').split(':');
              var hh = Number(hhmmss[0])||0, mm = Number(hhmmss[1])||0;
              var ssms = String(hhmmss[2]||'0.0').split('.');
              var ss = Number(ssms[0])||0, ms = Number(ssms[1])||0;
              project.timeoutHour = hh; project.timeoutMinute = mm; project.timeoutSecond = ss; project.timeoutMS = ms;
              if (E('#selectTime').value === 'week') project.timeoutWeek = Number(E('#week').value);
              else delete project.timeoutWeek;
              if (E('#selectTime').value === 'month') project.timeoutMonth = E('#month').valueAsNumber;
              else delete project.timeoutMonth;
            }
          } else {
            delete project.timeout; delete project.timeoutHour; delete project.timeoutMinute; delete project.timeoutSecond; delete project.timeoutMS;
            delete project.timeoutWeek; delete project.timeoutMonth;
          }
          if (E('#lastDayMonth').checked) project.lastDayMonth = true; else delete project.lastDayMonth;

          delete project.silentMode; delete project.emulateMode;
          if (project.rating !== 'Custom' && E('#voteMode').checked) {
            if (E('#voteModeSelect').value === 'silentMode') project.silentMode = true;
            else if (E('#voteModeSelect').value === 'emulateMode') project.emulateMode = true;
          }

          delete project.randomize;
          if (E('#randomize').checked) {
            project.randomize = { min: E('#randomizeMin').valueAsNumber || 0, max: E('#randomizeMax').valueAsNumber || 0 };
          }

          if (project.rating === 'Custom') {
            var body;
            try { body = JSON.parse(String(E('#customBody').value || '{}')); } catch(e){ OptionsCore.getNotif().create(e, 'error'); return; }
            project.body = body;
            project.responseURL = E('#responseURL').value || '';
            if (!settings.enableCustom) {
              settings.enableCustom = true;
              await db.put('other', settings, 'settings');
              try { chrome.runtime.sendMessage('reloadSettings'); } catch(e){}
            }
          }

          if (btn && btn.id === 'submitEditProject') {
            // editing
            if (E('#priority').checked && !project.priority) {
              project.priority = true;
              // emulate "move to top" key
              var store = db.transaction('projects','readwrite').store;
              var cursor = await store.openCursor();
              project.key = (!cursor || cursor.key===1) ? -1 : cursor.key - 1;
              await store.put(project, project.key);
            } else if (!E('#priority').checked && project.priority) {
              delete project.priority;
              var store2 = db.transaction('projects','readwrite').store;
              project.key = await store2.put(project); await store2.put(project, project.key);
            } else {
              await db.put('projects', project, project.key);
            }

            // schedule alarm if needed
            if (project.time == null || project.time < Date.now()) {
              try { chrome.runtime.sendMessage('checkVote'); } catch(e){}
            } else {
              var when = project.time; if (when - Date.now() < 65000) when = Date.now() + 65000;
              try { await chrome.alarms.create(String(project.key), { when: when }); } catch(e){ OptionsCore.getNotif().create('chrome.alarms create error ' + e.message, 'warn'); }
            }

            // UI reset
            setEditMode(null);
            OptionsCore.getNotif().create(t('successSave') || 'Saved', 'success');
          } else {
            // Add new
            var store3 = db.transaction('projects','readwrite').store;
            var newKey = await store3.put(project); project.key = newKey;
            await store3.put(project, project.key);
            OptionsCore.usageSpace();
            try { chrome.runtime.sendMessage('reloadAllSettings'); chrome.runtime.sendMessage('checkVote'); } catch(e){}
            OptionsCore.getNotif().create((t('addSuccess') || 'Added') + ' ' + (project.name||''), 'success');
          }

        } catch(e){ OptionsCore.getNotif().create(e, 'error'); }
        finally { if (btn) btn.disabled=false; }
      });

      function setEditMode(project) {
        editingProject = project || null;
        var title = E('.editSubtitle');
        var btnAdd = E('#submitAddProject');
        var btnBlock = E('.editProjectButtons');

        if (!project) {
          E('#switchAddMode').disabled = false; E('#switchAddMode').checked = false; onSwitchMode();
          E('#disableCheckProjects').disabled = false;
          E('#rating').disabled = false;
          title.style.display='none'; title.textContent=''; title.id='';
          btnAdd.style.display=''; btnBlock.style.display='none';
          // reset fields
          E('#addProject').reset();
          resetVisibility();
          // keep defaults
          E('#selectTime').value = 'ms'; onSelectTime();
        } else {
          // switch to edit
          E('#switchAddMode').checked = true; onSwitchMode();
          E('#switchAddMode').disabled = true;
          E('#disableCheckProjects').checked = false; E('#disableCheckProjects').disabled = true;
          E('#rating').disabled = true;
          btnAdd.style.display='none'; btnBlock.style.display='';

          // fill values
          var funcRating = allProjects[project.rating];
          E('#rating').value = project.rating; onRatingInput();

          if (project.rating === 'Custom') {
            E('#nick').value = project.id;
          } else if (!(funcRating.notRequiredId && funcRating.notRequiredId())) {
            E('#id').value = project.id || '';
          }
          if (funcRating.exampleURLGame) E('#chooseGame').value = project.game || '';
          if (funcRating.exampleURLListing) E('#chooseListing').value = project.listing || '';
          if (funcRating.langList) E('#chooseLang').value = project.lang || '';
          if (funcRating.additionExampleURL) E('#additionURL').value = project.addition || '';
          if (project.rating !== 'Custom' && !(funcRating.notRequiredNick && funcRating.notRequiredNick(project))) E('#nick').value = project.nick || '';
          if (funcRating.limitedCountVote && funcRating.limitedCountVote()) E('#countVote').value = project.maxCountVote || 5;
          if (funcRating.ordinalWorld && funcRating.ordinalWorld()) E('#ordinalWorld').value = project.ordinalWorld || '';

          // schedule
          if (project.time && project.time > Date.now()) {
            E('#scheduleTimeCheckbox').checked = true; onScheduleToggle();
            var time = new Date(project.time); if (!isNaN(time)) {
              time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
              E('#scheduleTime').value = time.toISOString().slice(0, 23);
            }
          }

          // timeouts
          if (project.timeout != null || project.timeoutHour != null || project.rating === 'Custom') {
            E('#customTimeOut').checked = true; toggleCustomTimeout(true);
            if (project.timeout) {
              E('#selectTime').value = 'ms'; onSelectTime();
              E('#time').valueAsNumber = project.timeout;
            } else {
              if (project.timeoutWeek != null) { E('#selectTime').value = 'week'; }
              else if (project.timeoutMonth != null) { E('#selectTime').value = 'month'; }
              else { E('#selectTime').value = 'hour'; }
              onSelectTime();
              var d = new Date(1980,0,1, project.timeoutHour||0, project.timeoutMinute||0, project.timeoutSecond||0, project.timeoutMS||0);
              d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
              E('#hour').value = d.toISOString().slice(11, 23);
              if (project.timeoutWeek != null) E('#week').value = String(project.timeoutWeek);
              if (project.timeoutMonth != null) E('#month').valueAsNumber = project.timeoutMonth;
            }
          }
          if (project.lastDayMonth) E('#lastDayMonth').checked = true;

          // vote mode
          var vm=E('#voteMode'); if (project.rating !== 'Custom' && !(funcRating.silentVote && funcRating.silentVote(project))) { vm.disabled = true; }
          if (project.rating !== 'Custom' && (project.silentMode || project.emulateMode)) {
            E('#voteModeSelect').value = project.silentMode ? 'silentMode' : 'emulateMode';
            vm.checked = true; onVoteModeToggle();
          }

          if (project.priority) E('#priority').checked = true;
          if (project.randomize) {
            E('#randomize').checked = true; onRandomizeChange();
            E('#randomizeMin').value = project.randomize.min;
            E('#randomizeMax').value = project.randomize.max;
          }

          if (project.rating === 'Custom') {
            E('#customBody').value = JSON.stringify(project.body || {}, null, '\t');
            E('#responseURL').value = project.responseURL || '';
          }

          // subtitle
          var text = project.rating;
          if (project.nick) text += ' – ' + project.nick;
          if (project.game) text += ' – ' + project.game;
          if (project.name) text += ' – ' + project.name; else if (project.id) text += ' – ' + project.id;
          var sub = E('.editSubtitle'); sub.textContent = text; sub.id = 'edit'+project.key; sub.style.display='';
          E('h4').textContent = t('editTitle') || 'Edit project';
        }
      }

      // Cancel edit
      E('#submitCancelProject').addEventListener('click', function(){ setEditMode(null); });

      // Wire UI
      E('#switchAddMode').addEventListener('change', onSwitchMode);
      E('#customTimeOut').addEventListener('change', function(){ toggleCustomTimeout(this.checked); });
      E('#selectTime').addEventListener('change', onSelectTime);
      E('#randomize').addEventListener('change', onRandomizeChange);
      E('#scheduleTimeCheckbox').addEventListener('change', onScheduleToggle);
      E('#voteMode').addEventListener('change', onVoteModeToggle);
      E('#disableCheckProjects').addEventListener('change', function(){
        if (this.checked && !confirm(t('confirmDisableCheckProjects') || 'Disable presence check?')) this.checked=false;
      });
      E('#priority').addEventListener('change', function(){
        if (this.checked && !confirm(t('confirmPriority') || 'Mark as priority?')) this.checked=false;
      });
      E('#link').addEventListener('input', onLinkInput);
      E('#rating').addEventListener('input', function(){ onRatingInput(false); });

      // Defaults
      onSwitchMode();
      toggleCustomTimeout(false);
      onRandomizeChange();
      onScheduleToggle();
      onVoteModeToggle();
      generateDataList();
      OptionsCore.i18nInjectExtras();

      // Edit mode if params.key
      (async function boot(){
        try { be.attachGlobalErrorHandlers && be.attachGlobalErrorHandlers(function(err){ OptionsCore.getNotif().create(err, 'error'); }); } catch(e){}
        if (be.initializeConfig) await be.initializeConfig({ background:false });
        if (ctx.params && ctx.params.key != null) {
          var proj = await db.get('projects', Number(ctx.params.key));
          if (proj) setEditMode(proj);
        } else setEditMode(null);
      })();
    }
  };

  provide('add', viewDef);
}));