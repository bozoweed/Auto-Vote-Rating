(async function () {
  if (window.AVRFW && AVRFW.translate) AVRFW.translate(document);

  const app = AVRFW.createApp({ defaultHost: '#app' });

  // Install the backend service once (live getters for DB/SETTINGS/…)
  if (window.AVRFW_installBackend) {
    await window.AVRFW_installBackend(app, { background: false });
  }

  await app.loadView('nav', 'views/nav/');
  app.mountHost('default', 'nav');

  document.getElementById('btnDashboard')?.addEventListener('click', () => {
    location.hash = '#view=dashboard';
  });
})();