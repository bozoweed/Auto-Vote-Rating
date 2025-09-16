// js/main.js (ESM) — MV3 friendly, maintainable core
// Exports:
//   - initializeConfig({ background = false, version }?)
//   - upgrade(dbase, oldVersion, newVersion, transaction)
//   - attachGlobalErrorHandlers(uiNotify?)
//   - live bindings: db, dbLogs, settings, generalStats, todayStats, openedProjects, onLine
//
// Requires: idb ESM at ../libs/idb.mjs
// Optional: allProjects + getDomainWithoutSubdomain (used in migrations)

import { openDB } from '../libs/idb.mjs';
import { allProjects } from '../js/projects.js';
import { getDomainWithoutSubdomain } from '../js/utils/url.js';
import { OLD_TO_DOMAIN } from './migrations/v13-oldnames.js';

// -------------------- Live bindings --------------------
export let db;           // IDB "avr"
export let dbLogs;       // IDB "logs"
export let settings;     // object
export let generalStats; // object
export let todayStats;   // object
export let openedProjects = new Map(); // Map
export let onLine = true;

// -------------------- Consts --------------------
const DB_NAME = 'avr';
const DB_VERSION = 15; // keep parity with previous schema
const LOGS_DB = 'logs';

// -------------------- Error handling --------------------
export function attachGlobalErrorHandlers(uiNotify) {
  self.addEventListener('error', onUnhandled);
  self.addEventListener('unhandledrejection', onUnhandled);

  async function onUnhandled(event) {
    let error = event?.reason || event?.error || event?.message || event;
    try {
      (uiNotify || self.createNotif)?.(String(error), 'error', { dontLog: true });
    } catch {}
    try {
      document?.querySelectorAll?.('button[disabled]')?.forEach(el => (el.disabled = false));
    } catch {}
    if (!dbLogs) return;
    try {
      const time = new Date().toLocaleString().replace(',', '');
      const text = '[' + time + ' ERROR]: ' + (error?.stack || String(error));
      await dbLogs.put('logs', text);
    } catch (e) {
      console.error(e);
    }
  }
}

// -------------------- Logs DB --------------------
async function ensureLogsDB() {
  if (dbLogs) return dbLogs;
  dbLogs = await openDB(LOGS_DB, 1, {
    upgrade(dbase) {
      dbase.createObjectStore('logs', { autoIncrement: true });
    }
  });
  return dbLogs;
}

// -------------------- Initialize --------------------
export async function initializeConfig({ background = false, version } = {}) {
  await ensureLogsDB();

  try {
    db = await openDB(DB_NAME, version ?? DB_VERSION, { upgrade });
  } catch (error) {
    if (error?.name === 'VersionError') {
      if (version) throw error;
      // Legacy MultiVote fallback (schema 150)
      db = await openDB(DB_NAME, 150, { upgrade });
    } else {
      throw error;
    }
  }

  db.onerror = (ev) => dbError(ev);
  dbLogs.onerror = (ev) => dbError(ev, true);

  // Load persisted state
  settings = await db.get('other', 'settings');
  generalStats = await db.get('other', 'generalStats');
  todayStats = await db.get('other', 'todayStats');
  openedProjects = await db.get('other', 'openedProjects');
  onLine = await db.get('other', 'onLine');

  // Normalize Map
  if (!(openedProjects instanceof Map)) {
    openedProjects = new Map(openedProjects || []);
  }
  // Ensure defaults exist (older installs)
  if (!settings) {
    settings = defaultSettings();
    await db.put('other', settings, 'settings');
  }
  if (!generalStats) {
    generalStats = defaultGeneralStats();
    await db.put('other', generalStats, 'generalStats');
  }
  if (!todayStats) {
    todayStats = defaultTodayStats();
    await db.put('other', todayStats, 'todayStats');
  }
  if (onLine == null) {
    onLine = true;
    await db.put('other', onLine, 'onLine');
  }
  if (!openedProjects) {
    openedProjects = new Map();
    await db.put('other', openedProjects, 'openedProjects');
  }

  // Snapshot helper
  return {
    get db() { return db; },
    get dbLogs() { return dbLogs; },
    get settings() { return settings; },
    get generalStats() { return generalStats; },
    get todayStats() { return todayStats; },
    get openedProjects() { return openedProjects; },
    get onLine() { return onLine; }
  };
}

// -------------------- Defaults --------------------
function defaultSettings() {
  return {
    disabledNotifStart: true,
    disabledNotifInfo: false,
    disabledNotifWarn: false,
    disabledNotifError: false,
    enabledSilentVote: true,
    disabledCheckInternet: false,
    disabledOneVote: false,
    disabledRestartOnTimeout: false,
    disabledFocusedTab: false,
    enableCustom: false,
    timeout: 10000,
    timeoutError: 900000,
    timeoutVote: 900000,
    disabledWarnCaptcha: false,
    debug: false,
    expertMode: false,
    disableCloseTabsOnSuccess: false,
    disableCloseTabsOnError: false
  };
}
function defaultGeneralStats() {
  return {
    successVotes: 0,
    monthSuccessVotes: 0,
    lastMonthSuccessVotes: 0,
    errorVotes: 0,
    laterVotes: 0,
    lastSuccessVote: null,
    lastAttemptVote: null,
    added: Date.now()
  };
}
function defaultTodayStats() {
  return {
    successVotes: 0,
    errorVotes: 0,
    laterVotes: 0,
    lastSuccessVote: null,
    lastAttemptVote: null
  };
}

// -------------------- DB Errors --------------------
function dbError(event, logs) {
  try {
    const { source, error } = event?.target || {};
    const name = source?.name ?? 'unknown';
    const msg = error?.message ?? String(error);
    console.error(`[DB ERROR ${name}]`, msg);
  } catch (e) {
    console.error('[DB ERROR]', event);
  }
}

// -------------------- Upgrade (Migrations) --------------------
export async function upgrade(dbase, oldVersion, newVersion, transaction) {
  const tx = transaction || dbase.transaction(['projects', 'other'], 'readwrite');
  const other = tx.objectStore('other');

  // v1 — initial schema
  if (oldVersion < 1) {
    const projects = dbase.createObjectStore('projects', { autoIncrement: true });
    projects.createIndex('rating, id, nick', ['rating', 'id', 'nick']);
    projects.createIndex('rating, id', ['rating', 'id']);
    projects.createIndex('rating', 'rating');

    dbase.createObjectStore('other');

    await other.put(defaultSettings(), 'settings');
    await other.put(defaultGeneralStats(), 'generalStats');
    await other.put(defaultTodayStats(), 'todayStats');
    await other.put(new Map(), 'openedProjects');
    await other.put(true, 'onLine');
  }

  // v2 — ensure todayStats + timeout
  if (oldVersion < 2) {
    let s = await other.get('settings');
    if (!s) s = defaultSettings();
    s.timeout = s.timeout ?? 10000;
    await other.put(defaultTodayStats(), 'todayStats');
    await other.put(s, 'settings');
  }

  // v3 — fix some ratings (DiscordBotList, MinecraftRating, PixelmonServers)
  if (oldVersion < 3) {
    await fixGameField(tx, 'rating', 'DiscordBotList', (p) => { p.game = 'bots'; });
    await fixGameField(tx, 'rating', 'MinecraftRating', (p) => { p.game = 'projects'; });
    await switchRating(tx, 'rating', 'PixelmonServers', (p) => { p.game = 'pixelmonservers.com'; p.rating = 'MineServers'; });
  }

  // v4 — maxCountVote for several
  if (oldVersion < 4) {
    await setCountDefaults(tx, 'MCServerList');
    await setCountDefaults(tx, 'CzechCraft');
    await setCountDefaults(tx, 'MinecraftServery');
  }

  // v7 — timeouts & flags
  if (oldVersion < 7) {
    const s = await other.get('settings') || defaultSettings();
    s.timeoutError = 900000;
    s.disabledOneVote = false;
    s.disabledFocusedTab = false;
    await other.put(s, 'settings');
  }

  // v8 — randomize for WARGM
  if (oldVersion < 8) {
    await setRandomize(tx, 'WARGM', { min: 0, max: 14400000 });
  }

  // v9 — openedProjects Map
  if (oldVersion < 9) {
    await other.put(new Map(), 'openedProjects');
  }

  // v10 — timeoutVote
  if (oldVersion < 10) {
    const s = await other.get('settings') || defaultSettings();
    s.timeoutVote = 900000;
    await other.put(s, 'settings');
  }

  // v11 — onLine flag
  if (oldVersion < 11) {
    await other.put(true, 'onLine');
  }

  // v12 — randomize for CraftList
  if (oldVersion < 12) {
    await setRandomize(tx, 'CraftList', { min: 0, max: 3600000 });
  }

  // v13 — remap legacy names to domains + special fixes
  if (oldVersion < 13) {
    await migrateLegacyRatingsToDomains(tx);
  }

  // v14 — disable some ratings
  if (oldVersion < 14) {
    await disableRating(tx, 'topcraft.club', chrome.i18n?.getMessage?.('disabledSite', 'Auto-vote blocked, vote manually') || 'Auto-vote blocked, vote manually');
    await disableRating(tx, 'topcraft.ru',   chrome.i18n?.getMessage?.('disabledSite', 'Auto-vote blocked, vote manually') || 'Auto-vote blocked, vote manually');
    await disableRating(tx, 'mctop.su',      chrome.i18n?.getMessage?.('disabledSite', 'Auto-vote blocked, vote manually') || 'Auto-vote blocked, vote manually');
    await disableRating(tx, 'monitoringminecraft.ru', chrome.i18n?.getMessage?.('disabledSite', 'Site down') || 'Site down');
  }

  // v15 — ensure stats exist (safety)
  if (oldVersion < 15) {
    const t = await other.get('todayStats'); if (!t) await other.put(defaultTodayStats(), 'todayStats');
    const g = await other.get('generalStats'); if (!g) await other.put(defaultGeneralStats(), 'generalStats');
  }
}

// -------------------- Migration helpers --------------------
async function withIndexCursor(tx, indexName, key, cb) {
  const store = tx.objectStore('projects');
  let cursor = await store.index(indexName).openCursor(key);
  while (cursor) {
    const project = cursor.value;
    await cb(project, cursor);
    cursor = await cursor.continue();
  }
}
async function fixGameField(tx, indexName, key, updateFn) {
  await withIndexCursor(tx, indexName, key, async (p, c) => { updateFn(p); await c.update(p); });
}
async function switchRating(tx, indexName, key, updateFn) {
  await withIndexCursor(tx, indexName, key, async (p, c) => { updateFn(p); await c.update(p); });
}
async function setCountDefaults(tx, rating) {
  await withIndexCursor(tx, 'rating', rating, async (p, c) => {
    p.maxCountVote = 5; p.countVote = p.countVote || 0; await c.update(p);
  });
}
async function setRandomize(tx, rating, range) {
  await withIndexCursor(tx, 'rating', rating, async (p, c) => { p.randomize = { ...range }; await c.update(p); });
}
async function disableRating(tx, rating, message) {
  await withIndexCursor(tx, 'rating', rating, async (p, c) => {
    p.error = message; p.time = Infinity; await c.update(p);
  });
}

async function migrateLegacyRatingsToDomains(tx) {
  const store = tx.objectStore('projects');
  let cursor = await store.openCursor();
  while (cursor) {
    const project = cursor.value;
    const legacy = OLD_TO_DOMAIN.get(project.rating);
    const voteURL = (legacy && allProjects[legacy]?.voteURL?.(project)) || null;

    if (!legacy || !voteURL) {
      console.warn('DB upgrade: failed to map rating; removing project', project);
      await cursor.delete();
      cursor = await cursor.continue();
      continue;
    }

    const domain2 = getDomainWithoutSubdomain(voteURL);
    if (domain2 && legacy !== domain2 && legacy !== 'Custom') {
      project.rating = domain2;
      project.ratingMain = legacy;
    } else {
      project.rating = legacy;
    }

    // Special cases
    if (project.rating === 'topg.org') {
      const id = String(project.id || '');
      if (id && id[0] >= '0' && id[0] <= '9') project.id = 'server-' + id;
    } else if (
      project.rating === 'minecraftrating.ru' ||
      project.rating === 'top.gg' ||
      project.rating === 'discordbotlist.com' ||
      project.rating === 'discords.com' ||
      project.rating === 'misterlauncher.org'
    ) {
      project.listing = project.game; delete project.game;
    } else if (project.rating === 'minecraftkrant.nl') {
      if (!project.game) project.game = 'www.minecraftkrant.nl';
      project.lang = project.game; delete project.game;
    }

    // Temporary disables
    if (
      ((project.rating === 'topcraft.club' || project.rating === 'topcraft.ru') && project.id === '7666') ||
      (project.id === 'arago' && (project.rating === 'minecraftrating.ru' || project.rating === 'tmonitoring.com'))
    ) {
      project.error = chrome.i18n?.getMessage?.('disabledSite', 'Project closed') || 'Project closed';
      project.time = Infinity;
    }
    if (project.rating === 'craftlist.org') {
      project.error = chrome.i18n?.getMessage?.(
        'disabledSite',
        'There is a high risk of being blocked for auto-voting, vote on this site manually'
      ) || 'High block risk: vote manually';
      project.time = Infinity;
    }

    // Ensure key
    if (project.key == null) project.key = cursor.key;

    // Cleanup legacy fields
    delete project.openedTimeoutQueue;
    delete project.openedNextAttempt;
    delete project.openedCountInject;

    await cursor.update(project);
    cursor = await cursor.continue();
  }
}