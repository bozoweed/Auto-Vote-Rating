(async function () {
  if (window.AVRFW && AVRFW.translate) AVRFW.translate(document);

  const app = AVRFW.createApp({ defaultHost: '#app' });

  const pendingOpenProjects = [];
  let navReady = false;
  let drainingOpenProjects = false;

  async function openProjectByKey(projectKey) {
    try {
      await app.loadView('projects', 'views/projects/');
      await app.mountHost('content', 'projects', { focusProject: projectKey });
      location.hash = '#view=projects';
      const navBtns = document.querySelectorAll('.nav-btn');
      navBtns.forEach((btn) => {
        const isTarget = btn.getAttribute('data-view') === 'projects';
        btn.classList.toggle('active', isTarget);
        btn.setAttribute('aria-selected', String(isTarget));
      });
      const nav = document.getElementById('primaryNav');
      const burger = document.querySelector('.burger');
      nav?.classList.remove('active');
      if (burger) {
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', 'false');
      }
    } catch (e) {
      console.warn('[options] failed to open project', e);
    }
  }

  function queueProjectFocus(projectKey) {
    pendingOpenProjects.push(projectKey);
    drainOpenProjects();
  }

  async function drainOpenProjects() {
    if (!navReady || drainingOpenProjects) return;
    drainingOpenProjects = true;
    try {
      while (pendingOpenProjects.length) {
        const key = pendingOpenProjects.shift();
        await openProjectByKey(key);
      }
    } finally {
      drainingOpenProjects = false;
    }
  }

  function relayNotification(notification) {
    try {
      const core = window.OptionsCore;
      if (!core) return;
      core.ensureContainers?.();
      const notif = core.getNotif?.();
      if (!notif) return;
      const notifId = notification.notificationId || '';
      const notifType = (['warn', 'error'].includes(notification.type)) ? notification.type : 'hint';
      let onClick = null;
      if (notifId.startsWith('openTab_')) {
        onClick = async () => {
          try {
            const tabId = Number(notifId.replace('openTab_', ''));
            if (!tabId) return;
            const tab = await chrome.tabs.update(tabId, { active: true });
            if (tab && tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
          } catch (_) {}
        };
      } else if (notifId.startsWith('openProject_')) {
        const projectKey = Number(notifId.replace('openProject_', ''));
        if (!Number.isNaN(projectKey)) {
          onClick = () => { queueProjectFocus(projectKey); };
        }
      } else if (notifId.startsWith('openSettings')) {
        onClick = () => { try { chrome.runtime.openOptionsPage(); } catch (_) {}; };
      }
      const createOpts = { onClick };
      const errorMeta = notification.error && typeof notification.error === 'object' ? notification.error : null;
      const errorMessage = notification.errorMessage || (typeof notification.error === 'string' ? notification.error : null) || (errorMeta && errorMeta.message) || null;
      const errorStack = notification.errorStack || notification.stack || (errorMeta && errorMeta.stack) || null;
      if (errorMessage || errorStack) {
        const err = new Error(errorMessage || notification.message || notification.title || 'Notification error');
        if (errorStack) err.stack = errorStack;
        createOpts.error = err;
        createOpts.errorStack = err.stack;
      }
      if (notification.request != null) createOpts.request = notification.request;
      if (notification.meta != null) createOpts.meta = notification.meta;
      if (notification.context != null) createOpts.context = notification.context;
      notif.create([notification.title, document.createElement('br'), notification.message], notifType, createOpts);
    } catch (err) {
      try { console.warn('[options] notification relay failed', err); } catch (_) {}
    }
  }

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((req) => {
      if (req && req.installed) {
        try {
          const msg = chrome?.i18n?.getMessage ? chrome.i18n.getMessage('firstInstall') : null;
          alert(msg || 'Auto Vote Rating installed successfully.');
        } catch (_) {
          alert('Auto Vote Rating installed successfully.');
        }
      } else if (req && req.openProject != null) {
        queueProjectFocus(req.openProject);
      } else if (req && req.updateValue === 'projects') {
        try { window.OptionsCore?.usageSpace?.(); } catch (_) {}
      } else if (req && req.notification) {
        relayNotification(req.notification);
      }
    });
  }

  // Install the backend service once (live getters for DB/SETTINGS/...)
  if (window.AVRFW_installBackend) {
    await window.AVRFW_installBackend(app, { background: false });
  }

  await app.loadView('nav', 'views/nav/');
  app.mountHost('default', 'nav');
  navReady = true;
  await drainOpenProjects();

  document.getElementById('btnDashboard')?.addEventListener('click', () => {
    location.hash = '#view=dashboard';
  });
})();
