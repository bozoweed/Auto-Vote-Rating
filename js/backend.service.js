// js/backend.service.js
// Install a single backend service on the AVRFW app and expose live getters

import {
  initializeConfig,
  attachGlobalErrorHandlers,
  db as DB,
  dbLogs as DB_LOGS,
  settings as SETTINGS,
  generalStats as GENERAL_STATS,
  todayStats as TODAY_STATS,
  openedProjects as OPENED,
  onLine as ONLINE
} from './main.js'; // FIXED: was ../js/main.js

import { allProjects } from './projects.js';
import { getDomainWithoutSubdomain } from './utils/url.js';

// Global fallback registry (in case app.inject isn't available yet)
window.__AVRFW_SERVICES__ = window.__AVRFW_SERVICES__ || Object.create(null);

// Live backend object (getters always reflect current values after initializeConfig)
const be = {};
Object.defineProperties(be, {
  initializeConfig: { value: initializeConfig, enumerable: true },
  attachGlobalErrorHandlers: { value: attachGlobalErrorHandlers, enumerable: true },
  utils: { value: { getDomainWithoutSubdomain }, enumerable: true },

  DB: { get: () => DB, enumerable: true },
  DB_LOGS: { get: () => DB_LOGS, enumerable: true },
  SETTINGS: { get: () => SETTINGS, enumerable: true },
  GENERAL_STATS: { get: () => GENERAL_STATS, enumerable: true },
  TODAY_STATS: { get: () => TODAY_STATS, enumerable: true },
  OPENED: { get: () => OPENED, enumerable: true },
  ONLINE: { get: () => ONLINE, enumerable: true },
  allProjects: { get: () => allProjects, enumerable: true }
});

// Ensure DI methods exist on the app, even if framework wasn't patched
function ensureDI(app) {
  if (typeof app.provide === 'function' && typeof app.inject === 'function') return app;
  // Tiny local registry attached to the app instance
  const registry = app.__services || new Map();
  app.__services = registry;
  app.provide = (name, value) => { registry.set(name, value); return app; };
  app.inject = (name) => registry.get(name) || window.__AVRFW_SERVICES__?.[name];
  return app;
}

// Install helper: init once and register the service on the app
export async function installBackend(app, { background = false } = {}) {
  ensureDI(app);

  // Route unhandled errors to console/logs
  be.attachGlobalErrorHandlers?.((err) => {
    try { console.error('[Unhandled]', err); } catch { }
  });

  await be.initializeConfig({ background });

  // Provide the service to the app (DI) and a global fallback
  app.provide('backend', be);
  window.__AVRFW_SERVICES__.backend = be;

  return be;
}

// Allow non-module boot to call it
window.AVRFW_installBackend = installBackend;