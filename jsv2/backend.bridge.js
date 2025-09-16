// jsv2/backend.bridge.js (ESM) — bridges your ESM backend to UMD views
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
} from './main.js';

import { allProjects } from '../js/projects.js';
import { getDomainWithoutSubdomain } from '../js/utils/url.js';

// Make everything available to UMD views (dashboard/projects/add/settings/fast-add…)
window.AVRFW_OPTIONS_BACKEND = {
  initializeConfig,
  attachGlobalErrorHandlers,

  // live bindings
  DB,
  DB_LOGS,
  SETTINGS,
  GENERAL_STATS,
  TODAY_STATS,
  OPENED,
  ONLINE,

  allProjects,
  utils: { getDomainWithoutSubdomain }
};