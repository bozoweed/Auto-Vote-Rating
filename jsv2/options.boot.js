// jsv2/options.boot.js — mount Nav only; Nav loads children lazily
(function () {
  // translate static header labels
  if (window.AVRFW && AVRFW.translate) AVRFW.translate(document);

  // Provide global createNotif (used by main.js on DB upgrade paths)
  if (!window.createNotif && window.OptionsCore && OptionsCore.getNotif) {
    window.createNotif = (...args) => OptionsCore.getNotif().create(...args);
  }

  const app = AVRFW.createApp({ defaultHost: '#app' });

  // Load only Nav; it will lazy-load dashboard/projects/add/settings/stats/fast-add
  app.loadView('nav', 'views/nav/').then(() => {
    app.mountHost('default', 'nav');

    // Header button -> ask Nav to go dashboard (simplest: use hash route)
    const btnDash = document.getElementById('btnDashboard');
    if (btnDash) btnDash.addEventListener('click', () => { location.hash = '#view=dashboard'; });
  });
})();