// js/main.js
// ESM module. Works from options.html (type="module") and MV3 module service worker.
// Uses idb ESM (openDB) and your OOP projects registry.
//
// Exports:
// - initializeConfig({ background = false, version })
// - upgrade(db, oldVersion, newVersion, transaction)  // migrations (unchanged logic)
// - attachGlobalErrorHandlers(uiNotify)
// - live bindings: db, dbLogs, settings, generalStats, todayStats, openedProjects, onLine
//
// Notes:
// - Imports idb ESM from ../libs/idb.mjs (place idb ESM there; e.g. from https://unpkg.com/idb@7/build/index.js)
// - Imports allProjects + getDomainWithoutSubdomain for migrations
// - Guards background-only notifications

import { openDB } from '../libs/idb.mjs';
import { allProjects } from './projects.js';
import { getDomainWithoutSubdomain } from './utils/url.js';

// Live module bindings (can be imported and read elsewhere)
export let db;           // IDB database "avr"
export let dbLogs;       // IDB database "logs"
export let settings;     // user settings object
export let generalStats; // global stats
export let todayStats;   // today's stats
export let openedProjects = new Map(); // Map of opened projects (tabs)
export let onLine;       // cached connectivity state

let onLineInit;

// -------------------- Global error handling --------------------
export function attachGlobalErrorHandlers(uiNotify) {
  self.addEventListener('error', (event) => onUnhandledError(event));
  self.addEventListener('unhandledrejection', (event) => onUnhandledError(event));

  async function onUnhandledError(event) {
    let error;
    if (event.reason) error = event.reason;
    else if (event.error) error = event.error;
    else {
      error = 'Unidentified error, see details in console';
      if (console._error) console._error(event);
      else console.error(event);
      error += JSON.stringify(event);
    }

    try {
      if (uiNotify) uiNotify(error);
      else if (self.createNotif) createNotif(error, 'error', { dontLog: true });
    } catch (_) {}

    try {
      document?.querySelectorAll?.('button[disabled]')?.forEach((el) => (el.disabled = false));
    } catch (_) {}

    if (!dbLogs) return;
    const time = new Date().toLocaleString().replace(',', '');
    if (error.stack) error = error.stack;
    const log = '[' + time + ' ERROR]: ' + error;
    try {
      dbLogs.put('logs', log).catch((e) => {
        if (console._error) console._error(e);
        else console.error(e);
      });
    } catch (e) {
      if (console._error) console._error(e);
      else console.error(e);
    }
  }
}

// -------------------- Logs DB --------------------
async function initLogsDB() {
  if (!dbLogs) {
    dbLogs = await openDB('logs', 1, {
      upgrade(dbase /*, oldVersion, newVersion, transaction */) {
        dbase.createObjectStore('logs', { autoIncrement: true });
      },
    });
  }
  return dbLogs;
}

// -------------------- Initialize main config DB and load state --------------------
export async function initializeConfig({ background = false, version } = {}) {
  await initLogsDB();

  try {
    db = await openDB('avr', version ? version : 15, { upgrade });
  } catch (error) {
    if (error.name === 'VersionError') {
      if (version) {
        dbError({ target: { source: { name: 'avr' }, error } }, false);
        throw error;
      }
      console.log('DB VersionError: maybe you are on MultiVote; trying to open schema 150');
      db = await openDB('avr', 150, { upgrade });
    } else {
      dbError({ target: { source: { name: 'avr' }, error } }, false);
      throw error;
    }
  }

  db.onerror = (event) => dbError(event, false);
  dbLogs.onerror = (event) => dbError(event, true);

  // Load persisted state
  settings = await db.get('other', 'settings');
  generalStats = await db.get('other', 'generalStats');
  todayStats = await db.get('other', 'todayStats');
  openedProjects = await db.get('other', 'openedProjects');
  onLine = await db.get('other', 'onLine');

  if (!(openedProjects instanceof Map)) {
    // Structured clone of Map should restore as Map, but normalize just in case
    openedProjects = new Map(openedProjects || []);
  }

  // Return live snapshot helper (optional)
  return {
    get db() { return db; },
    get dbLogs() { return dbLogs; },
    get settings() { return settings; },
    get generalStats() { return generalStats; },
    get todayStats() { return todayStats; },
    get openedProjects() { return openedProjects; },
    get onLine() { return onLine; },
  };
}

// -------------------- DB error handler --------------------
function dbError(event, logs) {
  const { source, error } = event.target;
  const name = source?.name ?? 'unknown';
  const msg = error?.message ?? String(error);

  const isBackground = typeof window === 'undefined' || !('document' in self);

  if (isBackground) {
    try {
      if (typeof sendNotification === 'function') {
        sendNotification(
          chrome.i18n.getMessage('errordbTitle', name),
          msg,
          'error',
          'openSettings'
        );
      }
      if (logs && console._error) console._error(chrome.i18n.getMessage('errordb', [name, msg]));
      else console.error(chrome.i18n.getMessage('errordb', [name, msg]));
    } catch {
      console.error(`[DB ERROR ${name}]`, msg);
    }
  } else {
    if (self.createNotif) {
      // noinspection JSIgnoredPromiseFromCall
      createNotif(chrome.i18n.getMessage('errordb', [name, msg]), 'error');
    } else {
      console.error(chrome.i18n.getMessage('errordb', [name, msg]));
    }
  }
}

// -------------------- Schema migrations (unchanged behavior) --------------------
export async function upgrade(dbase, oldVersion, newVersion, transaction) {
  if (oldVersion == null) oldVersion = 1;

  if (oldVersion !== newVersion) {
    if (self.createNotif) {
      // noinspection ES6MissingAwait
      createNotif(chrome.i18n.getMessage('oldSettings', [oldVersion, newVersion]), 'hint');
    } else {
      console.log(chrome.i18n.getMessage('oldSettings', [oldVersion, newVersion]));
    }
  }

  if (oldVersion === 0) {
    const projects = dbase.createObjectStore('projects', { autoIncrement: true });
    projects.createIndex('rating, id, nick', ['rating', 'id', 'nick']);
    projects.createIndex('rating, id', ['rating', 'id']);
    projects.createIndex('rating', 'rating');

    const other = dbase.createObjectStore('other');
    settings = {
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
    };
    await other.add(settings, 'settings');

    generalStats = {
      successVotes: 0,
      monthSuccessVotes: 0,
      lastMonthSuccessVotes: 0,
      errorVotes: 0,
      laterVotes: 0,
      lastSuccessVote: null,
      lastAttemptVote: null,
      added: Date.now(),
    };
    todayStats = {
      successVotes: 0,
      errorVotes: 0,
      laterVotes: 0,
      lastSuccessVote: null,
      lastAttemptVote: null,
    };
    await other.add(generalStats, 'generalStats');
    await other.add(todayStats, 'todayStats');
    await other.add(openedProjects, 'openedProjects');
    onLineInit = true;
    other.add(onLineInit, 'onLine');
    return;
  }

  if (!transaction) transaction = dbase.transaction(['projects', 'other'], 'readwrite');

  if (oldVersion <= 1) {
    todayStats = {
      successVotes: 0,
      errorVotes: 0,
      laterVotes: 0,
      lastSuccessVote: null,
      lastAttemptVote: null,
    };
    const store = transaction.objectStore('other');
    await store.put(todayStats, 'todayStats');
    settings = await store.get('settings');
    settings.timeout = 10000;
    await transaction.objectStore('other').put(settings, 'settings');
  }

  if (oldVersion <= 3) {
    const store = transaction.objectStore('projects');
    let cursor = await store.index('rating').openCursor('DiscordBotList');
    while (cursor) {
      const project = cursor.value;
      project.game = 'bots';
      await cursor.update(project);
      cursor = await cursor.continue();
    }
    cursor = await store.index('rating').openCursor('MinecraftRating');
    while (cursor) {
      const project = cursor.value;
      project.game = 'projects';
      await cursor.update(project);
      cursor = await cursor.continue();
    }
    cursor = await store.index('rating').openCursor('PixelmonServers');
    while (cursor) {
      const project = cursor.value;
      project.game = 'pixelmonservers.com';
      project.rating = 'MineServers';
      await cursor.update(project);
      cursor = await cursor.continue();
    }
  }

  if (oldVersion <= 4) {
    const store = transaction.objectStore('projects');
    let cursor = await store.index('rating').openCursor('MCServerList');
    while (cursor) {
      const project = cursor.value;
      project.maxCountVote = 5;
      project.countVote = 0;
      await cursor.update(project);
      cursor = await cursor.continue();
    }
    let cursor2 = await store.index('rating').openCursor('CzechCraft');
    while (cursor2) {
      const project = cursor2.value;
      project.maxCountVote = 5;
      project.countVote = 0;
      await cursor2.update(project);
      cursor2 = await cursor2.continue();
    }
    let cursor3 = await store.index('rating').openCursor('MinecraftServery');
    while (cursor3) {
      const project = cursor3.value;
      project.maxCountVote = 5;
      project.countVote = 0;
      await cursor3.update(project);
      cursor3 = await cursor3.continue();
    }
  }

  if (oldVersion <= 7) {
    settings = await transaction.objectStore('other').get('settings');
    settings.timeoutError = 900000;
    settings.disabledOneVote = false;
    settings.disabledFocusedTab = false;
    await transaction.objectStore('other').put(settings, 'settings');
  }

  if (oldVersion <= 8) {
    const store = transaction.objectStore('projects');
    let cursor = await store.index('rating').openCursor('WARGM');
    while (cursor) {
      const project = cursor.value;
      project.randomize = { min: 0, max: 14400000 };
      await cursor.update(project);
      cursor = await cursor.continue();
    }
  }

  if (oldVersion <= 9) {
    openedProjects = new Map();
    await transaction.objectStore('other').put(openedProjects, 'openedProjects');
  }

  if (oldVersion <= 10) {
    settings = await transaction.objectStore('other').get('settings');
    settings.timeoutVote = 900000;
    await transaction.objectStore('other').put(settings, 'settings');
  }

  if (oldVersion <= 11) {
    onLineInit = true;
    await transaction.objectStore('other').put(onLineInit, 'onLine');
  }

  if (oldVersion <= 12) {
    const store = transaction.objectStore('projects');
    let cursor = await store.index('rating').openCursor('CraftList');
    while (cursor) {
      const project = cursor.value;
      project.randomize = { min: 0, max: 3600000 };
      await cursor.update(project);
      cursor = await cursor.continue();
    }
  }

  if (oldVersion <= 13) {
    const oldNames = new Map([
      ['TopCraft', 'topcraft.ru'],
      ['McTOP', 'mctop.su'],
      ['MCRate', 'mcrate.su'],
      ['MinecraftRating', 'minecraftrating.ru'],
      ['MonitoringMinecraft', 'monitoringminecraft.ru'],
      ['IonMc', 'ionmc.top'],
      ['MinecraftServersOrg', 'minecraftservers.org'],
      ['ServeurPrive', 'serveur-prive.net'],
      ['PlanetMinecraft', 'planetminecraft.com'],
      ['TopG', 'topg.org'],
      ['ListForge', 'listforge.net'],
      ['MinecraftServerList', 'minecraft-server-list.com'],
      ['ServerPact', 'serverpact.com'],
      ['MinecraftIpList', 'minecraftiplist.com'],
      ['TopMinecraftServers', 'topminecraftservers.org'],
      ['MinecraftServersBiz', 'minecraftservers.biz'],
      ['HotMC', 'hotmc.ru'],
      ['MinecraftServerNet', 'minecraft-server.net'],
      ['TopGames', 'top-games.net'],
      ['TMonitoring', 'tmonitoring.com'],
      ['TopGG', 'top.gg'],
      ['DiscordBotList', 'discordbotlist.com'],
      ['Discords', 'discords.com'],
      ['MMoTopRU', 'mmotop.ru'],
      ['MCServers', 'mc-servers.com'],
      ['MinecraftList', 'minecraftlist.org'],
      ['MinecraftIndex', 'minecraft-index.com'],
      ['ServerList101', 'serverlist101.com'],
      ['MCServerList', 'mcserver-list.eu'],
      ['CraftList', 'craftlist.org'],
      ['CzechCraft', 'czech-craft.eu'],
      ['MinecraftBuzz', 'minecraft.buzz'],
      ['MinecraftServery', 'minecraftservery.eu'],
      ['RPGParadize', 'rpg-paradize.com'],
      ['MinecraftServerListNet', 'minecraft-serverlist.net'],
      ['MinecraftServerEu', 'minecraft-server.eu'],
      ['MinecraftKrant', 'minecraftkrant.nl'],
      ['TrackyServer', 'trackyserver.com'],
      ['MCListsOrg', 'mc-lists.org'],
      ['TopMCServersCom', 'topmcservers.com'],
      ['BestServersCom', 'bestservers.com'],
      ['CraftListNet', 'craft-list.net'],
      ['MinecraftServersListOrg', 'minecraft-servers-list.org'],
      ['ServerListe', 'serverliste.net'],
      ['gTop100', 'gtop100.com'],
      ['WARGM', 'wargm.ru'],
      ['MineStatus', 'minestatus.net'],
      ['MisterLauncher', 'misterlauncher.org'],
      ['MinecraftServersDe', 'minecraft-servers.de'],
      ['DiscordBoats', 'discord.boats'],
      ['ServerListGames', 'serverlist.games'],
      ['BestMinecraftServers', 'best-minecraft-servers.co'],
      ['MinecraftServers100', 'minecraftservers100.com'],
      ['MCServerListCZ', 'mc-serverlist.cz'],
      ['MineServers', 'mineservers.com'],
      ['ATLauncher', 'atlauncher.com'],
      ['ServersMinecraft', 'servers-minecraft.net'],
      ['MinecraftListCZ', 'minecraft-list.cz'],
      ['ListeServeursMinecraft', 'liste-serveurs-minecraft.org'],
      ['MCServidores', 'mcservidores.com'],
      ['XtremeTop100', 'xtremetop100.com'],
      ['MinecraftServerSk', 'minecraft-server.sk'],
      ['ServeursMinecraftOrg', 'serveursminecraft.org'],
      ['ServeursMCNet', 'serveurs-mc.net'],
      ['ServeursMinecraftCom', 'serveur-minecraft.com'],
      ['ServeurMinecraftVoteFr', 'serveur-minecraft-vote.fr'],
      ['MineBrowseCom', 'minebrowse.com'],
      ['MCServerListCom', 'mc-server-list.com'],
      ['ServerLocatorCom', 'serverlocator.com'],
      ['TopMmoGamesRu', 'top-mmogames.ru'],
      ['MmoRpgTop', 'mmorpg.top'],
      ['MmoVoteRu', 'mmovote.ru'],
      ['McMonitoringInfo', 'mc-monitoring.info'],
      ['McServerTimeCom', 'mcservertime.com'],
      ['ListeServeursFr', 'liste-serveurs.fr'],
      ['ServeurMinecraftFr', 'serveur-minecraft.fr'],
      ['MineServTop', 'mineserv.top'],
      ['Top100ArenaCom', 'top100arena.com'],
      ['MinecraftBestServersCom', 'minecraftbestservers.com'],
      ['MCLikeCom', 'mclike.com'],
      ['PixelmonServerListCom', 'pixelmon-server-list.com'],
      ['MinecraftServerSk2', 'minecraftserver.sk'],
      ['ServidoresdeMinecraftEs', 'servidoresdeminecraft.es'],
      ['MinecraftSurvivalServersCom', 'minecraftsurvivalservers.com'],
      ['MinecraftGlobal', 'minecraft.global'],
      ['Warface', 'warface.com'],
      ['CurseForge', 'curseforge.com'],
      ['HoYoLAB', 'hoyolab.com'],
      ['TrackingServers', 'trackingservers.cloud'],
      ['McListIo', 'mclist.io'],
      ['LoliLand', 'loliland.ru'],
      ['MCServersTOP', 'mcservers.top'],
      ['Discadia', 'discadia.com'],
      ['MinecraftSurvivalServers', 'minecraftsurvivalservers.net'],
      ['TopServersCom', 'topservers.com'],
      ['GenshinDrop', 'genshindrop.com'],
      ['EmeraldServers', 'emeraldservers.com'],
      ['ServidoresMC', '40servidoresmc.es'],
      ['MinecraftServersBiz2', 'minecraft-servers.biz'],
      ['TopMCServersNet', 'top-mc-servers.net'],
      ['MinecraftServerListCom', 'minecraft-serverlist.com'],
      ['FindMCServer', 'findmcserver.com'],
      ['ServeurListe', 'serveurliste.com'],
      ['CraftBook', 'craftbook.cz'],
      ['RovelStars', 'rovelstars.com'],
      ['InfinityBots', 'infinitybots.gg'],
      ['BotListMe', 'botlist.me'],
      ['TopMinecraftIo', 'topminecraft.io'],
      ['MineListNet', 'minelist.net'],
      ['ListeServMinecraftFr', 'liste-serv-minecraft.fr'],
      ['PlayMinecraftServersCom', 'play-minecraft-servers.com'],
      ['MinecraftMenu', 'minecraft.menu'],
      ['Custom', 'Custom'],
    ]);

    let cursor = await transaction.objectStore('projects').openCursor();
    while (cursor) {
      const project = cursor.value;

      const domain = oldNames.get(project.rating);
      const voteURL = allProjects[domain]?.voteURL?.(project);
      if (!domain || !voteURL) {
        console.warn(
          'DB upgrade: failed to map rating; removing project',
          JSON.stringify(project),
          'domain',
          domain,
          'voteURL',
          voteURL
        );
        await cursor.delete();
        cursor = await cursor.continue();
        continue;
      }
      const domain2 = getDomainWithoutSubdomain(voteURL);
      if (domain2 && domain !== domain2 && domain !== 'Custom') {
        project.rating = domain2;
        project.ratingMain = domain;
      } else {
        project.rating = domain;
      }

      if (project.rating === 'topg.org') {
        if (!isNaN(project.id.at(0))) {
          project.id = 'server-' + project.id;
        }
      } else if (
        project.rating === 'minecraftrating.ru' ||
        project.rating === 'top.gg' ||
        project.rating === 'discordbotlist.com' ||
        project.rating === 'discords.com' ||
        project.rating === 'misterlauncher.org'
      ) {
        project.listing = project.game;
        delete project.game;
      } else if (project.rating === 'minecraftkrant.nl') {
        if (!project.game) project.game = 'www.minecraftkrant.nl';
        project.lang = project.game;
        delete project.game;
      }

      if (
        ((project.rating === 'topcraft.club' || project.rating === 'topcraft.ru') && project.id === '7666') ||
        (project.id === 'arago' &&
          (project.rating === 'minecraftrating.ru' || project.rating === 'tmonitoring.com'))
      ) {
        project.error = chrome.i18n.getMessage('disabledSite', 'Проект закрыт');
        project.time = Infinity;
      }

      if (project.rating === 'craftlist.org') {
        project.error = chrome.i18n.getMessage(
          'disabledSite',
          'There is a high risk of being blocked for auto-voting, vote on this site manually'
        );
        project.time = Infinity;
      }

      if (project.key == null) {
        project.key = cursor.key;
      }

      delete project.openedTimeoutQueue;
      delete project.openedNextAttempt;
      delete project.openedCountInject;

      await cursor.update(project);
      cursor = await cursor.continue();
    }
  }

  if (oldVersion <= 14) {
    let cursor = await transaction.objectStore('projects').index('rating').openCursor('topcraft.club');
    while (cursor) {
      const project = cursor.value;
      project.error = chrome.i18n.getMessage(
        'disabledSite',
        'Высокий риск быть заблокированным за авто-голосование, голосуйте на данном сайте вручную'
      );
      project.time = Infinity;
      await cursor.update(project);
      cursor = await cursor.continue();
      if (!cursor)
        cursor = await transaction.objectStore('projects').index('rating').openCursor('topcraft.ru');
    }

    let cursor2 = await transaction.objectStore('projects').index('rating').openCursor('mctop.su');
    while (cursor2) {
      const project = cursor2.value;
      project.error = chrome.i18n.getMessage(
        'disabledSite',
        'Высокий риск быть заблокированным за авто-голосование, голосуйте на данном сайте вручную'
      );
      project.time = Infinity;
      await cursor2.update(project);
      cursor2 = await cursor2.continue();
    }

    let cursor3 = await transaction.objectStore('projects').index('rating').openCursor('monitoringminecraft.ru');
    while (cursor3) {
      const project = cursor3.value;
      project.error = chrome.i18n.getMessage('disabledSite', 'Сайт не работает');
      project.time = Infinity;
      await cursor3.update(project);
      cursor3 = await cursor3.continue();
    }
  }

  // Ensure stats exist
  if (!todayStats) {
    const other = transaction.objectStore('other');
    todayStats = {
      successVotes: 0,
      errorVotes: 0,
      laterVotes: 0,
      lastSuccessVote: null,
      lastAttemptVote: null,
    };
    await other.put(todayStats, 'todayStats');
  }

  if (!generalStats) {
    const other = transaction.objectStore('other');
    generalStats = {
      successVotes: 0,
      monthSuccessVotes: 0,
      lastMonthSuccessVotes: 0,
      errorVotes: 0,
      laterVotes: 0,
      lastSuccessVote: null,
      lastAttemptVote: null,
      added: Date.now(),
    };
    await other.put(generalStats, 'generalStats');
  }
}