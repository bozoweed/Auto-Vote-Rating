/* modules/options-core.umd.js — UMD
   Expose: window.OptionsCore
   - ensureContainers(): crée #notifBlock et #modals si manquants
   - getNotif(): singleton NotificationService
   - getModals(): singleton ModalManager
   - usageSpace(): calcule l’espace (i18n: storageUsed)
   - i18nInjectExtras(): placeholders spécifiques (nick/load)
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OptionsCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  var d = document;

  // Timer
  function Timer(cb, delay) {
    this._cb = cb; this._remaining = delay; this._id = null; this._start = 0; this.resume();
  }
  Timer.prototype.pause = function(){ clearTimeout(this._id); this._remaining -= Date.now() - this._start; };
  Timer.prototype.resume = function(){ this._start = Date.now(); clearTimeout(this._id); var self=this; this._id = setTimeout(function(){ self._cb(); }, this._remaining); };

  // Ensure containers
  function ensureContainers() {
    if (!d.getElementById('notifBlock')) {
      var nb = d.createElement('div'); nb.id = 'notifBlock'; d.body.appendChild(nb);
    }
    if (!d.getElementById('modals')) {
      var m = d.createElement('div'); m.id='modals';
      m.innerHTML = '<div class="overlay"></div>'; d.body.appendChild(m);
    }
  }

  // NotificationService
  function NotificationService(rootEl) {
    this.root = rootEl || d.getElementById('notifBlock');
  }
  NotificationService.prototype.create = function(message, type, opts) {
    type = type || 'hint'; opts = opts || {};
    if (!message) message = 'Empty error, see console for details';
    var delay = opts.delay || (type === 'error' ? 30000 : 5000);

    if (opts.element) {
      var el = opts.element;
      el.textContent = '';
      if (message && typeof message === 'object' && typeof message[Symbol.iterator] === 'function') {
        for (var it of message) el.append(it);
      } else { el.textContent = String(message); }
      el.className = type;
      if (!opts.dontLog && type === 'error') console.error('[error]', message);
      return;
    }

    var notif = d.createElement('div');
    notif.classList.add('notif','show',type);

    if (type !== 'hint') {
      var img = d.createElement('img'); img.src = 'images/notif/'+type+'.png'; notif.append(img);
      var prog = d.createElement('div'); prog.classList.add('progress');
      var bar = d.createElement('div'); bar.style.animation = 'notif-progress '+(delay/1000)+'s linear';
      prog.append(bar); notif.append(prog);
    }
    var mes = d.createElement('div');
    if (message && typeof message === 'object' && typeof message[Symbol.iterator] === 'function') {
      for (var it2 of message) mes.append(it2);
    } else { mes.append(String(message)); }
    notif.append(mes);
    this.root.append(notif);

    var timer;
    if (type !== 'hint') timer = new Timer(this.remove.bind(this, notif), delay);

    notif.addEventListener('click', function(e){
      if (notif.querySelector('a') || notif.querySelector('button') || opts.onClick) {
        if (opts.onClick) opts.onClick();
        if (e.detail === 2) remove();
      } else remove();
      function remove(){ if (!notif) return; notif.classList.remove('show'); notif.classList.add('hide'); setTimeout(function(){ notif.remove(); }, 600); }
    });
    if (type !== 'hint') {
      notif.addEventListener('mouseover', function(){
        timer.pause(); var barEl = notif.querySelector('.progress div'); if (barEl) barEl.style.animationPlayState='paused';
      });
      notif.addEventListener('mouseout', function(){
        timer.resume(); var barEl = notif.querySelector('.progress div'); if (barEl) barEl.style.animationPlayState='running';
      });
    }
    if (!opts.dontLog && type === 'error') console.error('[error]', message);
  };
  NotificationService.prototype.remove = function(elem){
    if (!elem) return; elem.classList.remove('show'); elem.classList.add('hide'); setTimeout(function(){ elem.remove(); }, 600);
  };

  // ModalManager
  function ModalManager(rootEl) {
    this.root = rootEl || d.querySelector('#modals');
    this.overlay = this.root && this.root.querySelector('.overlay');
    this._bind();
  }
  ModalManager.prototype._bind = function(){
    var self=this;
    if (!this.root) return;
    this.root.querySelectorAll('.modal .close').forEach(function(btn){
      btn.addEventListener('click', function(){
        var modal = btn.closest('.modal'); if (!modal) return;
        if (modal.id === 'addFastProject') location.href='options.html';
        self.toggle(modal.id);
      });
    });
    if (this.overlay) this.overlay.addEventListener('click', function(){
      var active = self.root.querySelector('.modal.active'); if (!active) return;
      if (active.id === 'stats' || active.id === 'statsToday') { active.querySelector('.close')?.click(); return; }
      active.style.transform='scale(1.1)'; setTimeout(function(){ active.style.transform=''; }, 100);
    });
  };
  ModalManager.prototype.toggle = function(modalID){
    if (!this.root) return;
    var modal = this.root.querySelector('#'+modalID); if (!modal) return;
    this.overlay?.classList.toggle('active'); modal.classList.toggle('active');
  };

  // usageSpace + i18n extras
  function i18nMessage(k, a) {
    try { return (chrome && chrome.i18n && chrome.i18n.getMessage) ? chrome.i18n.getMessage(k, a) : ''; } catch(e){ return ''; }
  }
  async function usageSpace() {
    try {
      var quota = await navigator.storage.estimate();
      var v = quota.usage || 0, unit;
      if (v < 1e3) unit = 'genericBytes';
      else if (v < 1e6) { v/=1e3; unit='KB'; }
      else if (v < 1e9) { v/=1e6; unit='MB'; }
      else { v/=1e9; unit='GB'; }
      var el = d.getElementById('storageUsed');
      if (el) el.textContent = i18nMessage('storageUsed', [v.toFixed(1), unit]) || ('Storage used: ' + v.toFixed(1) + ' ' + unit);
    } catch(e){ console.warn('storage.estimate failed', e); }
  }
  function i18nInjectExtras() {
    try {
      var nick = d.getElementById('nick'); if (nick) nick.setAttribute('placeholder', i18nMessage('enterNick') || 'Enter your nick');
      var loadDiv = d.querySelector('#load div'); if (loadDiv) loadDiv.textContent = i18nMessage('load') || 'Loading...';
    } catch(e){}
  }

  // Singletons
  var _notif=null, _modals=null;
  function getNotif(){ ensureContainers(); if (!_notif) _notif = new NotificationService(d.getElementById('notifBlock')); return _notif; }
  function getModals(){ ensureContainers(); if (!_modals) _modals = new ModalManager(d.getElementById('modals')); return _modals; }

  return {
    ensureContainers,
    getNotif,
    getModals,
    usageSpace,
    i18nInjectExtras,
    Timer
  };
}));