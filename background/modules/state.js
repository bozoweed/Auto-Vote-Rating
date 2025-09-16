// background/modules/state.js
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
} from '../../js/main.js';

export const state = {
  init: null,
  db: null,
  dbLogs: null,
  settings: null,
  generalStats: null,
  todayStats: null,
  openedProjects: null,
  onLine: true
};

export async function ensureState() {
  if (state.init) return state.init;
  // Attach error sink -> logs DB
  attachGlobalErrorHandlers((err) => console.error('[Unhandled]', err));
  state.init = initializeConfig({ background: true }).then(() => {
    state.db = DB;
    state.dbLogs = DB_LOGS;
    state.settings = SETTINGS;
    state.generalStats = GENERAL_STATS;
    state.todayStats = TODAY_STATS;
    state.openedProjects = OPENED;
    state.onLine = typeof ONLINE === 'boolean' ? ONLINE : true;
  }).finally(() => { state.init.done = true; });
  return state.init;
}

// Utility for i18n (safe)
export function t(key, args) {
  try { return chrome.i18n.getMessage(key, args) || ''; } catch { return ''; }
}