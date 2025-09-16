/* view/settings/main.js — UMD provider "settings"
   - Lit/écrit les réglages
   - Timeouts (cooldowns)
   - Import/export settings + logs
   - i18n injection + notifications
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

  function i18n(k,a){ try{ return (root.chrome && root.chrome.i18n) ? root.chrome.i18n.getMessage(k,a) : ''; } catch(e){ return ''; } }

  var viewDef = {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){
      // i18n for static nodes
      if (AVRFW && AVRFW.translate) AVRFW.translate(ctx.root);
      // ensure containers and services
      OptionsCore.ensureContainers();
      var notif = OptionsCore.getNotif();

      // Backend
      var be = root.AVRFW_OPTIONS_BACKEND || null;
      var db = null, dbLogs = null, settings = null;

      async function init() {
        try {
          if (be && be.attachGlobalErrorHandlers) be.attachGlobalErrorHandlers(function(err){ notif.create(String(err && err.message || err), 'error'); });
        } catch(e){}
        if (be && be.initializeConfig) await be.initializeConfig({ background:false });
        db = be && be.DB; dbLogs = be && be.DB_LOGS;
        settings = be && be.SETTINGS || {};
        // fill UI
        await restoreOptions(true);
        // wire handlers
        wireSettingsCheckboxes();
        wireTimeoutForms();
        wireImportExport();
        OptionsCore.usageSpace();
        OptionsCore.i18nInjectExtras();
      }

      function setChecked(id, v){ var el = ctx.root.querySelector('#'+id); if (el) el.checked = !!v; }
      function setValue(id, v){ var el = ctx.root.querySelector('#'+id); if (el) el.value = (v==null?'':v); }

      async function restoreOptions(first){
        if (!settings) settings = {};
        setChecked('disabledNotifStart', settings.disabledNotifStart);
        setChecked('disabledNotifInfo', settings.disabledNotifInfo);
        setChecked('disabledNotifWarn', settings.disabledNotifWarn);
        setChecked('disabledNotifError', settings.disabledNotifError);
        setChecked('disabledCheckInternet', settings.disabledCheckInternet);
        setChecked('disabledOneVote', settings.disabledOneVote);
        setChecked('disabledRestartOnTimeout', settings.disabledRestartOnTimeout);
        setChecked('disabledFocusedTab', settings.disabledFocusedTab);
        setChecked('disabledWarnCaptcha', settings.disabledWarnCaptcha);
        setChecked('disabledClickCaptcha', settings.disabledClickCaptcha);
        setChecked('disabledDebug', settings.debug || false);
        setChecked('disableCloseTabsOnSuccess', settings.disableCloseTabsOnSuccess || false);
        setChecked('disableCloseTabsOnError', settings.disableCloseTabsOnError || false);
        setChecked('expertMode', settings.expertMode || false);
        setValue('timeoutValue', settings.timeout || 0);
        setValue('timeoutErrorValue', settings.timeoutError || 0);
        setValue('timeoutVoteValue', settings.timeoutVote || 1000);

        // Toggle expert UI visibility
        toggleExpert(settings.expertMode);
      }

      function toggleExpert(on){
        var show = function(id){ var el=ctx.root.querySelector('#'+id); if (el) el.parentElement.style.display=''; };
        var hide = function(id){ var el=ctx.root.querySelector('#'+id); if (el) el.parentElement.style.display='none'; };
        if (on) {
          show('timeoutValue'); ctx.root.querySelector('#timeout').parentElement.style.display='';
          show('timeoutErrorValue'); ctx.root.querySelector('#timeoutError').parentElement.style.display='';
          show('timeoutVoteValue'); ctx.root.querySelector('#timeoutVote').parentElement.style.display='';
          show('disabledOneVote'); show('disabledDebug'); show('disableCloseTabsOnSuccess'); show('disableCloseTabsOnError');
        } else {
          hide('timeoutValue'); ctx.root.querySelector('#timeout').parentElement.style.display='none';
          hide('timeoutErrorValue'); ctx.root.querySelector('#timeoutError').parentElement.style.display='none';
          hide('timeoutVoteValue'); ctx.root.querySelector('#timeoutVote').parentElement.style.display='none';
          hide('disabledOneVote'); hide('disabledDebug'); hide('disableCloseTabsOnSuccess'); hide('disableCloseTabsOnError');
        }
      }

      function persistSettings() {
        if (!db) return Promise.resolve();
        return db.put('other', settings, 'settings').then(function(){
          try { root.chrome && root.chrome.runtime && root.chrome.runtime.sendMessage && root.chrome.runtime.sendMessage('reloadSettings'); } catch(e){}
          OptionsCore.usageSpace();
        });
      }

      function wireSettingsCheckboxes() {
        ctx.root.querySelectorAll('input[name=checkbox]').forEach(function(check){
          check.addEventListener('change', function(e){
            check.disabled = true;
            var id = check.id;
            if (id === 'disabledNotifStart') settings.disabledNotifStart = check.checked;
            else if (id === 'disabledNotifInfo') settings.disabledNotifInfo = check.checked;
            else if (id === 'disabledNotifWarn') settings.disabledNotifWarn = check.checked;
            else if (id === 'disabledNotifError') {
              if (check.checked && !confirm(i18n('confirmDisableErrors') || 'Disable error notifications?')) { check.checked=false; check.disabled=false; return; }
              settings.disabledNotifError = check.checked;
            } else if (id === 'disabledCheckInternet') settings.disabledCheckInternet = check.checked;
            else if (id === 'disabledOneVote') settings.disabledOneVote = check.checked;
            else if (id === 'disabledRestartOnTimeout') settings.disabledRestartOnTimeout = check.checked;
            else if (id === 'disabledFocusedTab') settings.disabledFocusedTab = check.checked;
            else if (id === 'disabledWarnCaptcha') settings.disabledWarnCaptcha = check.checked;
            else if (id === 'disabledClickCaptcha') settings.disabledClickCaptcha = check.checked;
            else if (id === 'disabledDebug') settings.debug = check.checked;
            else if (id === 'disableCloseTabsOnSuccess') settings.disableCloseTabsOnSuccess = check.checked;
            else if (id === 'disableCloseTabsOnError') settings.disableCloseTabsOnError = check.checked;
            else if (id === 'expertMode') {
              settings.expertMode = check.checked;
              toggleExpert(check.checked);
            }
            persistSettings().finally(function(){ check.disabled=false; });
          });
        });
      }

      function wireTimeoutForms() {
        var f1 = ctx.root.querySelector('#timeout');
        var f2 = ctx.root.querySelector('#timeoutError');
        var f3 = ctx.root.querySelector('#timeoutVote');
        if (f1) f1.addEventListener('submit', function(e){
          e.preventDefault(); e.submitter && (e.submitter.disabled=true);
          settings.timeout = Number(ctx.root.querySelector('#timeoutValue').value) || 0;
          persistSettings().then(function(){ notif.create(i18n('successSave') || 'Saved', 'success'); })
            .finally(function(){ e.submitter && (e.submitter.disabled=false); });
        });
        if (f2) f2.addEventListener('submit', function(e){
          e.preventDefault(); e.submitter && (e.submitter.disabled=true);
          settings.timeoutError = Number(ctx.root.querySelector('#timeoutErrorValue').value) || 0;
          persistSettings().then(function(){ notif.create(i18n('successSave') || 'Saved', 'success'); })
            .finally(function(){ e.submitter && (e.submitter.disabled=false); });
        });
        if (f3) f3.addEventListener('submit', function(e){
          e.preventDefault(); e.submitter && (e.submitter.disabled=true);
          settings.timeoutVote = Number(ctx.root.querySelector('#timeoutVoteValue').value) || 1000;
          persistSettings().then(function(){ notif.create(i18n('successSave') || 'Saved', 'success'); })
            .finally(function(){ e.submitter && (e.submitter.disabled=false); });
        });
      }

      function wireImportExport() {
        var btnExport = ctx.root.querySelector('#file-download');
        var btnLogs = ctx.root.querySelector('#logs-download');
        var btnClear = ctx.root.querySelector('#logs-clear');
        var fileInput = ctx.root.querySelector('#file-upload');

        if (btnExport) btnExport.addEventListener('click', async function(){
          try {
            notif.create(i18n('exporting') || 'Exporting…', 'hint');
            var generalStats = db ? await db.get('other','generalStats') : {};
            var todayStats = db ? await db.get('other','todayStats') : {};
            var allSetting = { settings: settings, generalStats: generalStats, todayStats: todayStats, version: db && db.version };
            allSetting.projects = db ? await db.getAll('projects') : [];
            var text = JSON.stringify(allSetting, null, '\t');
            var blob = new Blob([text], { type: 'text/json;charset=UTF-8;' });
            var a = document.createElement('a'); a.download='AVR.json';
            a.href = (window.webkitURL || window.URL).createObjectURL(blob);
            a.dataset.downloadurl = ['text/json;charset=UTF-8;', a.download, a.href].join(':');
            a.click();
            notif.create(i18n('exportingEnd') || 'Export done', 'success');
          } catch(e){ notif.create(e, 'error'); }
        });

        if (btnLogs) btnLogs.addEventListener('click', async function(){
          try {
            notif.create(i18n('exporting') || 'Exporting…', 'hint');
            var logs = dbLogs ? await dbLogs.getAll('logs') : [];
            var text = logs.map(function(l){return l;}).join('\n');
            var blob = new Blob([text], { type:'text/plain;charset=UTF-8;' });
            var a = document.createElement('a'); a.download='console_history.txt';
            a.href = (window.webkitURL || window.URL).createObjectURL(blob);
            a.dataset.downloadurl = ['text/plain;charset=UTF-8;', a.download, a.href].join(':');
            a.click();
            notif.create(i18n('exportingEnd') || 'Export done', 'success');
          } catch(e){ notif.create(e,'error'); }
        });

        if (btnClear) btnClear.addEventListener('click', async function(){
          notif.create(i18n('clearingLogs') || 'Clearing logs…', 'hint');
          if (dbLogs) await dbLogs.clear('logs');
          OptionsCore.usageSpace();
          notif.create(i18n('clearedLogs') || 'Logs cleared', 'success');
        });

        if (fileInput) fileInput.addEventListener('change', async function(ev){
          notif.create(i18n('importing') || 'Importing…', 'hint');
          try {
            if (!ev.target.files || ev.target.files.length === 0) return;
            var file = ev.target.files[0];
            var data = await new Response(file).json();
            var projects = data.projects || [];
            if (!db) throw new Error('DB not available');

            var tx = db.transaction(['projects','other'], 'readwrite');
            await tx.objectStore('projects').clear();
            var key=0;
            for (var i=0;i<projects.length;i++){
              var p = projects[i]; if (p.key == null){ key++; p.key = key; }
              await tx.objectStore('projects').add(p, p.key);
            }
            await tx.objectStore('other').put(data.settings, 'settings');
            await tx.objectStore('other').put(data.generalStats, 'generalStats');
            await tx.objectStore('other').put(data.todayStats, 'todayStats');
            if (tx.done) await tx.done;

            // refresh local
            settings = data.settings || settings;

            // try permissions (laissé aux autres vues via checkPermissions)
            try { root.chrome && root.chrome.runtime && root.chrome.runtime.sendMessage && root.chrome.runtime.sendMessage('reloadAllSettings'); } catch(e){}
            await restoreOptions(false);
            notif.create(i18n('importingEnd') || 'Import done', 'success');
          } catch(e){ notif.create(e, 'error'); }
          finally { ev.target.value=''; }
        });
      }

      init();
    }
  };

  provide('settings', viewDef);
}));