/* view/settings/main.js - uses injected backend service (ctx.app.inject('backend')) */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], function(){ return factory(root.AVRFW, root.OptionsCore); });
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('AVRFW'), require('OptionsCore'));
  else factory(root.AVRFW, root.OptionsCore);
}(typeof self !== 'undefined' ? self : this, function(AVRFW, OptionsCore){

  

  const t = (AVRFW && typeof AVRFW.createTranslator === 'function')
    ? AVRFW.createTranslator()
    : function(key, args){
        try{
          if (AVRFW && typeof AVRFW.t === 'function'){
            var res = AVRFW.t(key, args);
            if (res) return res;
          }
        } catch(e){}
        try{
          if (chrome && chrome.i18n){
            return chrome.i18n.getMessage(key, args) || '';
          }
        } catch(e){}
        return '';
      };

  AVRFW.createViewProvider('settings', {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){

      AVRFW && AVRFW.translate && AVRFW.translate(ctx.root);
      OptionsCore.ensureContainers();
      var notif = OptionsCore.getNotif();
      (async function initSettings(){
        try {

        const backend = await AVRFW.ensureBackend(ctx, { install: true, waitFor: true, retries: 20, delay: 120 });
        if (!backend) { notif.create('Backend not available', 'error'); return; }

        // live bindings (after backend install)
        var db = backend.DB, dbLogs = backend.DB_LOGS, settings = backend.SETTINGS;

        // Helpers
        function setChecked(id, v){ var el = ctx.root.querySelector('#'+id); if (el) el.checked = !!v; }
        function setValue(id, v){ var el = ctx.root.querySelector('#'+id); if (el) el.value = (v ?? ''); }
        function getValue(id){ var el = ctx.root.querySelector('#'+id); return el ? el.value : ''; }

        function persistSettings() {
          var liveDB = be.DB || db;
          if (!liveDB) { notif.create('DB not initialized', 'error'); return Promise.resolve(); }
          return liveDB.put('other', settings, 'settings')
            .then(function(){ try { chrome.runtime.sendMessage('reloadSettings'); } catch(e){} })
            .then(function(){ OptionsCore.usageSpace(); });
        }

        function toggleExpert(on) {
          var row = function(sel) {
            var el = ctx.root.querySelector(sel);
            return el && el.closest('.input-block, .check-block');
          };
          var show = function(sel){ var r=row(sel); if (r) r.style.display=''; };
          var hide = function(sel){ var r=row(sel); if (r) r.style.display='none'; };

          if (on) {
            show('#timeout'); show('#timeoutError'); show('#timeoutVote');
            show('#disabledOneVote'); show('#disabledDebug');
            show('#disableCloseTabsOnSuccess'); show('#disableCloseTabsOnError');
          } else {
            hide('#timeout'); hide('#timeoutError'); hide('#timeoutVote');
            hide('#disabledOneVote'); hide('#disabledDebug');
            hide('#disableCloseTabsOnSuccess'); hide('#disableCloseTabsOnError');
          }
        }

        async function restoreOptions(first){
          // fill switches/inputs
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

          toggleExpert(!!settings.expertMode);
        }

        function wireSettingsCheckboxes() {
          ctx.root.querySelectorAll('input[name=checkbox]').forEach(function(check){
            check.addEventListener('change', function(e){
              check.disabled = true;
              var id = check.id;

              // map id -> settings fields (explicit where needed)
              const map = {
                disabledNotifStart: 'disabledNotifStart',
                disabledNotifInfo: 'disabledNotifInfo',
                disabledNotifWarn: 'disabledNotifWarn',
                disabledNotifError: 'disabledNotifError',
                disabledCheckInternet: 'disabledCheckInternet',
                disabledOneVote: 'disabledOneVote',
                disabledRestartOnTimeout: 'disabledRestartOnTimeout',
                disabledFocusedTab: 'disabledFocusedTab',
                disabledWarnCaptcha: 'disabledWarnCaptcha',
                disabledClickCaptcha: 'disabledClickCaptcha',
                disabledDebug: 'debug',
                disableCloseTabsOnSuccess: 'disableCloseTabsOnSuccess',
                disableCloseTabsOnError: 'disableCloseTabsOnError',
                expertMode: 'expertMode',
              };
              const key = map[id];
              if (key) settings[key] = check.checked;
              if (key === 'disabledNotifError' && check.checked && !confirm(t('confirmDisableErrors') || 'Disable error notifications?')) { check.checked=false; check.disabled=false; return; }
              if (key === 'expertMode') toggleExpert(check.checked);

              persistSettings().finally(function(){ check.disabled=false; });
        } catch (error) { notif.create(error, 'error'); }
      })();
          });
        });
      }

      function wireTimeoutForms() {
        var f1 = ctx.root.querySelector('#timeout');
        var f2 = ctx.root.querySelector('#timeoutError');
        var f3 = ctx.root.querySelector('#timeoutVote');

        if (f1) f1.addEventListener('submit', function(e){
          e.preventDefault(); e.submitter && (e.submitter.disabled=true);
          settings.timeout = Number(getValue('timeoutValue')) || 0;
          persistSettings().then(function(){ notif.create(t('successSave') || 'Saved', 'success'); })
            .finally(function(){ e.submitter && (e.submitter.disabled=false); });
        });
        if (f2) f2.addEventListener('submit', function(e){
          e.preventDefault(); e.submitter && (e.submitter.disabled=true);
          settings.timeoutError = Number(getValue('timeoutErrorValue')) || 0;
          persistSettings().then(function(){ notif.create(t('successSave') || 'Saved', 'success'); })
            .finally(function(){ e.submitter && (e.submitter.disabled=false); });
        });
        if (f3) f3.addEventListener('submit', function(e){
          e.preventDefault(); e.submitter && (e.submitter.disabled=true);
          settings.timeoutVote = Number(getValue('timeoutVoteValue')) || 1000;
          persistSettings().then(function(){ notif.create(t('successSave') || 'Saved', 'success'); })
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
            notif.create(t('exporting') || 'Exporting...', 'hint');
            var generalStats = await db.get('other','generalStats') || {};
            var todayStats   = await db.get('other','todayStats') || {};
            var allSetting   = { settings, generalStats, todayStats, version: db.version };
            allSetting.projects = await db.getAll('projects');
            var text  = JSON.stringify(allSetting, null, '\t');
            var blob  = new Blob([text], { type:'text/json;charset=UTF-8' });
            var a = document.createElement('a');
            a.download='AVR.json';
            a.href = (window.webkitURL || window.URL).createObjectURL(blob);
            a.dataset.downloadurl = ['text/json;charset=UTF-8;', a.download, a.href].join(':');
            a.click();
            notif.create(t('exportingEnd') || 'Export done', 'success');
          } catch (e) { notif.create(e, 'error'); }
        });

        if (btnLogs) btnLogs.addEventListener('click', async function(){
          try {
            notif.create(t('exporting') || 'Exporting...', 'hint');
            var logs = dbLogs ? await dbLogs.getAll('logs') : [];
            var text = logs.map(function(l){return l;}).join('\n');
            var blob = new Blob([text], { type:'text/plain;charset=UTF-8' });
            var a = document.createElement('a');
            a.download = 'console_history.txt';
            a.href = (window.webkitURL || window.URL).createObjectURL(blob);
            a.dataset.downloadurl = ['text/plain;charset=UTF-8;', a.download, a.href].join(':');
            a.click();
            notif.create(t('exportingEnd') || 'Export done', 'success');
          } catch(e){ notif.create(e, 'error'); }
        });

        if (btnClear) btnClear.addEventListener('click', async function(){
          notif.create(t('clearingLogs') || 'Clearing logs...', 'info', { delay: 1500 });
          if (dbLogs) await dbLogs.clear('logs');
          OptionsCore.usageSpace();
          notif.create(t('clearedLogs') || 'Logs cleared', 'success');
        });

        if (fileInput) fileInput.addEventListener('change', async function(ev){
          notif.create(t('importing') || 'Importing...', 'hint');
          try {
            if (!ev.target.files || ev.target.files.length === 0) return;
            var file = ev.target.files[0];
            var data = await new Response(file).json();
            var projects = data.projects || [];

            var tx = db.transaction(['projects','other'], 'readwrite');
            await tx.objectStore('projects').clear();
            var key = 0;
            for (var i=0;i<projects.length;i++){
              var p = projects[i]; if (p.key == null){ key++; p.key = key; }
              await tx.objectStore('projects').add(p, p.key);
            }
            await tx.objectStore('other').put(data.settings, 'settings');
            await tx.objectStore('other').put(data.generalStats, 'generalStats');
            await tx.objectStore('other').put(data.todayStats, 'todayStats');
            if (tx.done) await tx.done;

            // refresh live bindings
            Object.assign(settings, data.settings || settings);
            try { chrome.runtime.sendMessage('reloadAllSettings'); } catch(e){}
            await restoreOptions(false);
            notif.create(t('importingEnd') || 'Import done', 'success');
          } catch(e){ notif.create(e, 'error'); }
          finally { ev.target.value = ''; }
        });
      }

      // Init view
      (async function init(){
        try {
          await restoreOptions(true);
          wireSettingsCheckboxes();
          wireTimeoutForms();
          wireImportExport();
          OptionsCore.usageSpace();
          OptionsCore.i18nInjectExtras();
        } catch(e){ notif.create(e, 'error'); }
      })();
    }
  });
}));







