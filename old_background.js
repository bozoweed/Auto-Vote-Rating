/* eslint-env serviceworker */

// MV3 module SW: manifest -> { background: { service_worker: "background.js", type: "module" } }

import {
  initializeConfig,
  db,
  dbLogs,
  settings,
  generalStats,
  todayStats,
  openedProjects,
  onLine as onLineInitial
} from './js/main.js';

import { allProjects } from './js/projects.js';
import { getDomainWithoutSubdomain, extractHostname } from './js/utils/url.js';

// Connectivity (primitive) local cache
let onLine = (typeof onLineInitial === 'boolean') ? onLineInitial : true;

// Preload optional polyfills (ESM) during install
self.addEventListener('install', (evt) => {
  evt.waitUntil((async () => {
    // Try ESM build of linkedom if you use DOMParser in SW for silentVote
    try { await import(chrome.runtime.getURL('libs/linkedom.mjs')); } catch (_) {}
    // Optional: preload a few silentvote scripts (only if they can be imported as modules)
    const preloadList = [
      'mcserver-list.eu_silentvote.js',
      'misterlauncher.org_silentvote.js',
      'serverpact.com_silentvote.js',
      'genshindrop.com_silentvote.js'
    ];
    await Promise.allSettled(preloadList.map(f =>
      import(chrome.runtime.getURL(`scripts/${f}`)).catch(() => null)
    ));
  })());
});

// Initialize app state for background
const initPromise = initializeConfig({ background: true });
initPromise.finally(() => (initPromise.done = true));

// -------------------- Vote scheduler core --------------------

let groupId;
let notSupportedGroupTabs = false;
let check = true;
let doubleCheck = false;
let silentResponseBody = {};
let pendingProms = [];

async function checkVote() {
  await initPromise;

  // Opera special case
  // noinspection JSUnresolvedReference
  if (!settings.operaAttention2 && (navigator?.userAgentData?.brands?.[0]?.brand === 'Opera' || (!!self.opr && !!opr.addons) || !!self.opera || navigator.userAgent.indexOf(' OPR/') >= 0)) {
    return;
  }

  // Online guard
  if (!settings.disabledCheckInternet && !onLine) {
    if (navigator.onLine) {
      console.log(chrome.i18n.getMessage('internetRestored'));
      onLine = true;
      db.put('other', onLine, 'onLine');
    } else {
      chrome.alarms.create('checkVote', { when: Date.now() + 65000 });
      return;
    }
  }

  if (check) check = false;
  else { doubleCheck = true; return; }

  // Eager-continue to keep tx alive
  const tx = db.transaction('projects');
  let cursor = await tx.objectStore('projects').openCursor();
  while (cursor) {
    const project = cursor.value;
    const next = cursor.continue(); // schedule next before await
    if (!project.time || project.time < Date.now()) {
      await checkOpen(project, tx);
    }
    cursor = await next;
  }

  check = true;
  if (doubleCheck) { doubleCheck = false; checkVote(); }
  else {
    if (!openedProjects.size) {
      pendingProms = [];
      updateListeners(false);
    }
  }
}

chrome.alarms.onAlarm.addListener(() => {
  if (settings?.debug) console.log('chrome.alarms.onAlarm fired');
  checkVote();
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'active') checkVote();
});

async function reloadAllAlarms() {
  await chrome.alarms.clearAll();
  const tx = db.transaction('projects');
  let cursor = await tx.store.openCursor();
  const times = [];
  while (cursor) {
    const project = cursor.value;
    const next = cursor.continue();
    if (project.time != null && project.time > Date.now() && !times.includes(project.time)) {
      let when = project.time;
      if (when - Date.now() < 65000) when = Date.now() + 65000;
      try { chrome.alarms.create(String(cursor.key), { when }); }
      catch (error) {
        console.warn(getProjectPrefix(project, true), 'Ошибка при создании chrome.alarms', error.message);
      }
      times.push(project.time);
    }
    cursor = await next;
  }
}

async function checkOpen(project, transaction) {
  // Internet guard
  if (!settings.disabledCheckInternet) {
    if (!navigator.onLine && onLine) {
      chrome.alarms.create('checkVote', { when: Date.now() + 65000 });
      sendNotification(getProjectPrefix(project, false), chrome.i18n.getMessage('internetDisconnected'), 'error', 'openProject_' + project.key);
      console.warn(getProjectPrefix(project, true), chrome.i18n.getMessage('internetDisconnected'));
      onLine = false;
      db.put('other', onLine, 'onLine');
      return;
    } else if (!onLine) {
      return;
    }
  }

  // Handle concurrent per-rating voting
  for (const [tab, value] of openedProjects) {
    if (value.timeoutQueue && Date.now() >= value.timeoutQueue) {
      openedProjects.delete(tab);
      db.put('other', openedProjects, 'openedProjects');
      continue;
    }
    if (project.rating === value.rating || (value.randomize && project.randomize) || settings.disabledOneVote) {
      if (settings.disabledRestartOnTimeout || tab.startsWith?.('queue_') || Date.now() < value.nextAttempt) {
        return;
      } else {
        openedProjects.delete(tab);
        db.put('other', openedProjects, 'openedProjects');

        const projectTimeout = await transaction.objectStore('projects').get(value.key);
        if (!value.nextAttempt) {
          console.warn(getProjectPrefix(projectTimeout, true), 'nextAttempt is undefined, maybe it\'s an error');
        }
        console.warn(getProjectPrefix(projectTimeout, true), chrome.i18n.getMessage('timeout'));
        sendNotification(getProjectPrefix(projectTimeout, false), chrome.i18n.getMessage('timeout'), 'warn', 'openProject_' + project.key);

        if (!settings.disableCloseTabsOnError) tryCloseTab(tab, projectTimeout, 0);
        break;
      }
    }
  }

  delete project.timeoutQueue;
  delete project.nextAttempt;
  delete project.countInject;

  const opened = { key: project.key, rating: project.rating, countInject: 0 };
  if (project.randomize) opened.randomize = project.randomize;

  if (!settings.disabledRestartOnTimeout) {
    let retryCoolDown;
    if (project.randomize) retryCoolDown = Math.floor(Math.random() * 600000 + 1800000); // 30-40 min
    else { if (!settings.timeoutVote) settings.timeoutVote = 900000; retryCoolDown = settings.timeoutVote; }
    opened.nextAttempt = Date.now() + retryCoolDown;
  }

  if (!openedProjects.size) updateListeners(true);

  openedProjects.set('start_' + project.key, opened);
  db.put('other', openedProjects, 'openedProjects');

  if (settings.debug) console.log(getProjectPrefix(project, true), 'пред запуск');

  // Example: clear cookies for monitoringminecraft.ru
  if (project.rating === 'monitoringminecraft.ru') {
    pendingProms.push((async () => {
      const cookies = await chrome.cookies.getAll({ domain: '.monitoringminecraft.ru' });
      if (settings.debug) console.log(chrome.i18n.getMessage('deletingCookies', '.monitoringminecraft.ru'));
      for (const c of cookies) {
        const domain = c.domain.charAt(0) === '.' ? c.domain.substring(1) : c.domain;
        await chrome.cookies.remove({ url: 'https://' + domain + c.path, name: c.name });
      }
    })());
  }

  newWindow(project, opened);
}

let promiseGroup;
let promiseWindow;

async function newWindow(project, opened) {
  // Wait cookie cleanup
  let result = await Promise.all(pendingProms);
  while (result.length < pendingProms.length) result = await Promise.all(pendingProms);

  console.log(getProjectPrefix(project, true), chrome.i18n.getMessage('startedAutoVote'));
  sendNotification(getProjectPrefix(project, false), chrome.i18n.getMessage('startedAutoVote'), 'start', 'openProject_' + project.key);

  // month rollover
  if (new Date(project.stats.lastAttemptVote).getMonth() < new Date().getMonth() || new Date(project.stats.lastAttemptVote).getFullYear() < new Date().getFullYear()) {
    project.stats.lastMonthSuccessVotes = project.stats.monthSuccessVotes;
    project.stats.monthSuccessVotes = 0;
  }
  project.stats.lastAttemptVote = Date.now();

  if (new Date(generalStats.lastAttemptVote).getMonth() < new Date().getMonth() || new Date(generalStats.lastAttemptVote).getFullYear() < new Date().getFullYear()) {
    generalStats.lastMonthSuccessVotes = generalStats.monthSuccessVotes;
    generalStats.monthSuccessVotes = 0;
  }
  generalStats.lastAttemptVote = Date.now();

  if (new Date(todayStats.lastAttemptVote).getDay() < new Date().getDay()) {
    todayStats.successVotes = 0;
    todayStats.errorVotes = 0;
    todayStats.laterVotes = 0;
    todayStats.lastSuccessVote = null;
    todayStats.lastAttemptVote = null;
  }
  todayStats.lastAttemptVote = Date.now();

  await db.put('other', generalStats, 'generalStats');
  await db.put('other', todayStats, 'todayStats');
  await updateValue('projects', project);

  // Retry alarm
  if (!settings.disabledRestartOnTimeout) {
    let create = true;
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) if (alarm.scheduledTime === opened.nextAttempt) { create = false; break; }
    if (create) {
      let when = opened.nextAttempt;
      if (when - Date.now() < 65000) when = Date.now() + 65000;
      try { await chrome.alarms.create('nextAttempt_' + project.key, { when }); }
      catch (error) { console.warn(getProjectPrefix(project, true), 'Ошибка при создании chrome.alarms', error.message); }
    }
  }

  // Silent vote?
  let silentVoteMode = false;
  if (project.rating === 'Custom') silentVoteMode = true;
  else if (!project.emulateMode && allProjects[project.rating].silentVote?.(project)) silentVoteMode = true;

  if (silentVoteMode) {
    openedProjects.set('background_' + project.key, opened);
    openedProjects.delete('start_' + project.key);
    db.put('other', openedProjects, 'openedProjects');
    silentVote(project);
  } else {
    let res = await promiseWindow;
    if (res === false) return;
    promiseWindow = checkWindow(project);
    res = await promiseWindow;
    if (res === false) return;

    const url = allProjects[project.rating].voteURL(project);
    const tab = await tryOpenTab({ url, active: settings.disabledFocusedTab || Boolean(allProjects[project.rating].focusedTab?.(project)) }, project, 0);
    if (tab == null) return;

    openedProjects.set(tab.id, opened);
    openedProjects.delete('start_' + project.key);
    db.put('other', openedProjects, 'openedProjects');

    if (notSupportedGroupTabs) return;
    try {
      await promiseGroup;
      promiseGroup = groupTabs(tab);
      await promiseGroup;
    } catch (error) {
      if (error.message === 'Tabs cannot be edited right now (user may be dragging a tab).') {
        console.warn(getProjectPrefix(project, true), 'Error when grouping tabs,', error.message);
      } else {
        notSupportedGroupTabs = true;
        console.warn(chrome.i18n.getMessage('notSupportedGroupTabs'), error.message);
      }
    }
  }
}

async function checkWindow(project) {
  const windows = await chrome.windows.getAll().catch(error => console.warn(chrome.i18n.getMessage('errorOpenTab', error.message)));
  if (!windows?.length) {
    try {
      const w = await chrome.windows.create({ focused: false });
      await chrome.windows.update(w.id, { focused: false, drawAttention: false });
    } catch (error) {
      endVote({ errorOpenTab: error.message }, null, project);
      return false;
    }
  }
  return true;
}

async function groupTabs(tab) {
  if (groupId == null) {
    const groups = await chrome.tabGroups.query({ title: 'Auto Vote Rating' });
    if (groups.length) groupId = groups[0].id;
  }
  if (groupId != null) {
    try { await tryGroupTabs({ groupId, tabIds: tab.id }, 0); return; }
    catch (error) { if (!error.message.includes('No tab with id') && !error.message.includes('No group with id')) throw error; }
  }
  try {
    groupId = await tryGroupTabs({ tabIds: tab.id }, 0);
    await chrome.tabGroups.update(groupId, { color: 'blue', title: 'Auto Vote Rating' });
  } catch (error) {
    if (!error.message.includes('No tab with id') && !error.message.includes('No group with id')) throw error;
  }
}

async function silentVote(project) {
  if (!globalThis.DOMParser) {
    try { await import(chrome.runtime.getURL('libs/linkedom.mjs')); } catch (_) {}
  }
  try {
    if (project.rating === 'Custom') {
      const response = await fetch(project.responseURL, { ...project.body });
      await response.text();
      if (response.ok) endVote({ successfully: true }, null, project);
      else endVote({ errorVote: [String(response.status), response.url] }, null, project);
      return;
    }

    const key = (project.ratingMain || project.rating);
    const file = `scripts/${key}_silentvote.js`;
    if (!globalThis['silentVote_' + key]) {
      await import(chrome.runtime.getURL(file)); // expects the script to attach self/globalThis.silentVote_<key>
    }
    await globalThis['silentVote_' + key](project);
  } catch (error) {
    if (error.message?.includes?.('Failed to fetch') || error.message?.includes?.('NetworkError when attempting to fetch resource')) {
      endVote({ notConnectInternet: true }, null, project);
    } else {
      let message = error.stack ? error.stack : error.message;
      const request = { errorVoteNoElement: message };
      if (silentResponseBody[project.rating]) {
        request.html = silentResponseBody[project.rating].doc.body.outerHTML;
        request.url = silentResponseBody[project.rating].url;
      }
      endVote(request, null, project);
    }
  } finally {
    delete silentResponseBody[project.rating];
  }
}

async function checkResponseError(project, response, url, bypassCodes, vk) {
  let host = extractHostname(response.url);
  if (vk && host.includes('vk.com')) {
    if (response.headers.get('Content-Type')?.includes('windows-1251')) {
      response = await new Response(new TextDecoder('windows-1251').decode(await response.arrayBuffer()));
    }
  }
  response.html = await response.text();
  response.doc = new DOMParser().parseFromString(response.html, 'text/html');
  silentResponseBody[project.rating] = { doc: response.doc, url: response.url };

  if (vk && host.includes('vk.com')) {
    let text;
    const d = response.doc;
    if (d.querySelector('div.oauth_form_access')) {
      text = d.querySelector('div.oauth_form_access').textContent.replace(d.querySelector('div.oauth_access_items').textContent, '').trim();
    } else if (d.querySelector('div.oauth_content > div')) {
      text = d.querySelector('div.oauth_content > div').textContent;
    } else if (d.querySelector('#login_blocked_wrap')) {
      text = d.querySelector('#login_blocked_wrap div.header').textContent + ' ' + d.querySelector('#login_blocked_wrap div.content').textContent.trim();
    } else if (d.querySelector('div.login_blocked_panel')) {
      text = d.querySelector('div.login_blocked_panel').textContent.trim();
    } else if (d.querySelector('.profile_deleted_text')) {
      text = d.querySelector('.profile_deleted_text').textContent.trim();
    } else if (response.html.length < 500) {
      text = response.html;
    } else {
      text = 'null';
    }
    endVote({ errorAuthVK: text }, null, project);
    return false;
  }

  if (!host.includes(url)) {
    endVote({ message: chrome.i18n.getMessage('errorRedirected', response.url) }, null, project);
    return false;
  }

  if (bypassCodes?.length) {
    for (const code of bypassCodes) if (response.status === code) return true;
  }

  if (!response.ok) {
    endVote({ errorVote: [String(response.status), response.url] }, null, project);
    return false;
  }

  if (response.statusText && !['', 'ok', 'OK'].includes(response.statusText)) {
    endVote(response.statusText, null, project);
    return false;
  }

  return true;
}

// -------------------- Injection listeners --------------------

const webNavigationOnCommittedListener = (details) => {
  if (!initPromise.done) {
    (async () => {
      await initPromise;
      const opened = openedProjects.get(details.tabId);
      if (!opened) return;
      const project = await db.get('projects', opened.key);
      const message = chrome.i18n.getMessage('notReadyInject');
      if (project.error === message) return;
      console.warn(getProjectPrefix(project, true), message);
      sendNotification(getProjectPrefix(project, false), message, 'warn', 'openProject_' + project.key);
      project.error = message;
      updateValue('projects', project);
    })();
    return;
  }

  const opened = openedProjects.get(details.tabId);
  if (!opened) return;
  if (details.url.startsWith('blob:')) return;

  const filesIsolated = [];
  const filesMain = [];

  if (details.frameId === 0) {
    // Allow OAuth pages
    if (details.url.match(/facebook.com\/*/) || details.url.match(/google.com\/*/) || details.url.match(/accounts.google.com\/*/) || details.url.match(/reddit.com\/*/) || details.url.match(/twitter.com\/*/)) {
      return;
    }
    filesMain.push('scripts/main/visible.js');
    if (allProjects[getDomainWithoutSubdomain(details.url)]?.needIsTrusted?.()) {
      filesIsolated.push('scripts/main/istrusted_isolated.js');
      filesMain.push('scripts/main/istrusted_main.js');
    }
    if (!allProjects[getDomainWithoutSubdomain(details.url)]?.dontUseAlert?.()) {
      filesIsolated.push('scripts/main/alert_isolated.js');
      filesMain.push('scripts/main/alert_main.js');
    }
  } else if (
    details.url.match(/hcaptcha.com\/captcha\/*/) ||
    details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api.\/anchor*/) ||
    details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api.\/bframe*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api.\/anchor*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api.\/bframe*/) ||
    details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api\/fallback*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api\/fallback*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/enterprise\/fallback*/) ||
    details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/enterprise\/anchor*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/enterprise\/bframe*/) ||
    details.url.match(/https:\/\/challenges.cloudflare.com\/*/)
  ) {
    filesMain.push('scripts/main/visible.js');
    filesIsolated.push('scripts/main/alert_isolated.js');
    filesMain.push('scripts/main/alert_main.js');
  }

  if (!filesIsolated.length && !filesMain.length) return;

  if (settings.debug) console.log('Injecting ' + JSON.stringify(filesIsolated) + ', ' + JSON.stringify(filesMain) + ' to ' + details.url);

  const target = { tabId: details.tabId };
  if (details.frameId) target.frameIds = [details.frameId];

  if (filesIsolated.length) {
    chrome.scripting.executeScript({ target, files: filesIsolated, injectImmediately: true }, () => {
      const error = chrome.runtime.lastError;
      if (error) catchTabError(error, opened);
    });
  }
  if (filesMain.length) {
    chrome.scripting.executeScript({ target, files: filesMain, world: 'MAIN', injectImmediately: true }, () => {
      const error = chrome.runtime.lastError;
      if (error) catchTabError(error, opened);
    });
  }
};

const webNavigationOnCompletedListener = async (details) => {
  await initPromise;

  const opened = openedProjects.get(details.tabId);
  if (!opened) return;

  if (details.frameId === 0) {
    if (details.url.match(/facebook.com\/*/) || details.url.match(/google.com\/*/) || details.url.match(/accounts.google.com\/*/) || details.url.match(/reddit.com\/*/) || details.url.match(/twitter.com\/*/)) {
      return;
    }
    const project = await db.get('projects', opened.key);
    if (opened.countInject >= 10) {
      endVote({ tooManyVoteAttempts: true }, { tab: { id: details.tabId }, url: details.url }, opened);
      return;
    }

    try {
      if (allProjects[project.rating]?.needPrompt?.()) {
        const funcPrompt = function (nick) {
          window.prompt = new Proxy(window.prompt, { apply(target, thisArg, argArray) { return nick; } });
        };
        if (settings.debug) console.log('Injecting funcPrompt to ' + details.url);
        await chrome.scripting.executeScript({ target: { tabId: details.tabId }, world: 'MAIN', func: funcPrompt, args: [project.nick] });
      }

      if (settings.debug) console.log('Injecting scripts/' + (project.ratingMain || project.rating)+'.js, scripts/main/api.js to ' + details.url);
      await chrome.scripting.executeScript({ target: { tabId: details.tabId }, files: ['scripts/main/hacktimer.js', 'scripts/' + (project.ratingMain || project.rating)+'.js' , 'scripts/main/api.js'] });
      if (allProjects[project.rating]?.needWorld?.()) {
        if (settings.debug) console.log('Injecting scripts/' + (project.ratingMain || project.rating) + '_world.js in MAIN');
        await chrome.scripting.executeScript({ target: { tabId: details.tabId }, world: 'MAIN', files: ['scripts/' + (project.ratingMain || project.rating) + '_world.js'] });
      }

      await chrome.tabs.sendMessage(details.tabId, { sendProject: true, project, settings });

      if (openedProjects.has(details.tabId)) {
        opened.countInject++;
        db.put('other', openedProjects, 'openedProjects');
      }
    } catch (error) {
      catchTabError(error, project);
    }
  } else if (
    details.frameId !== 0 && (
      details.url.match(/hcaptcha.com\/captcha\/*/) ||
      details.url.includes('smartcaptcha.yandexcloud.net') ||
      details.url.includes('service.mtcaptcha.com') ||
      details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api.\/anchor*/) ||
      details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api.\/bframe*/) ||
      details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api.\/anchor*/) ||
      details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api.\/bframe*/) ||
      details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api\/fallback*/) ||
      details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api\/fallback*/) ||
      details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/enterprise\/fallback*/) ||
      details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/enterprise\/anchor*/) ||
      details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/enterprise\/bframe*/) ||
      details.url.match(/https:\/\/challenges.cloudflare.com\/*/)
    )
  ) {
    const project = await db.get('projects', opened.key);
    try {
      if (settings.debug) console.log('Injecting scripts/main/captchaclicker.js to ' + details.url);
      await chrome.scripting.executeScript({ target: { tabId: details.tabId, frameIds: [details.frameId] }, files: ['scripts/main/hacktimer.js', 'scripts/main/audio_captcha.js', 'scripts/main/captchaclicker.js'] });

      const tab = await chrome.tabs.get(details.tabId);
      // Kiwi browser quirk: tab.status may be undefined
      if (tab.status != null && tab.status !== 'complete') return;
      await chrome.tabs.sendMessage(details.tab.id, { sendProject: true, project, settings });
    } catch (error) {
      catchTabError(error, project);
    }
  }
};

async function catchTabError(error, project) {
  const msg = error?.message || '';
  if (
    msg !== 'The frame was removed.' &&
    !msg.includes('No frame with id') &&
    msg !== 'The tab was closed.' &&
    !msg.includes('PrecompiledScript.executeInGlobal') &&
    !msg.includes('Could not establish connection. Receiving end does not exist') &&
    !msg.includes('The message port closed before a response was received') &&
    (!msg.includes('Frame with ID') && !msg.includes('was removed'))
  ) {
    project = await db.get('projects', project.key);
    let message = msg;
    if (message.includes('This page cannot be scripted due to an ExtensionsSettings policy')) {
      message += ' Try this solution: https://github.com/Serega007RU/Auto-Vote-Rating/wiki/Problems-with-Opera';
    }
    console.error(getProjectPrefix(project, true), message);
    sendNotification(getProjectPrefix(project, false), message, 'error', 'openProject_' + project.key);
    project.error = message;
    updateValue('projects', project);
  }
}

const tabsOnRemovedListener = async (tabId) => {
  await initPromise;
  const opened = openedProjects.get(tabId);
  if (!opened) return;
  endVote({ closedTab: true }, { tab: { id: tabId } }, opened);
};

const webRequestOnCompletedListener = async (details) => {
  await initPromise;
  const opened = openedProjects.get(details.tabId);
  if (!opened) return;

  if (allProjects[opened.rating].ignoreErrors?.()) return;

  if (details.type === 'main_frame' && (details.statusCode < 200 || details.statusCode > 299)) {
    if (details.statusCode === 503 || details.statusCode === 403) {
      opened.countInject--;
      db.put('other', openedProjects, 'openedProjects');
    } else {
      endVote({ errorVote: [String(details.statusCode), details.url] }, { tab: { id: details.tabId }, url: details.url }, opened);
    }
  }
};

const webRequestOnErrorOccurredListener = async (details) => {
  await initPromise;
  if (!openedProjects.has(details.tabId)) return;

  if (
    details.type === 'main_frame' ||
    details.url.match(/hcaptcha.com\/captcha\/*/) ||
    details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/*/) ||
    details.url.match(/https:\/\/challenges.cloudflare.com\/*/)
  ) {
    const opened = openedProjects.get(details.tabId);
    const e = details.error || '';
    if (
      e.includes('net::ERR_ABORTED') || e.includes('net::ERR_CONNECTION_RESET') || e.includes('net::ERR_NETWORK_CHANGED') || e.includes('net::ERR_CACHE_MISS') || e.includes('net::ERR_BLOCKED_BY_CLIENT') || e.includes('net::ERR_QUIC_PROTOCOL_ERROR') ||
      e.includes('NS_BINDING_ABORTED') || e.includes('NS_ERROR_NET_ON_RESOLVED') || e.includes('NS_ERROR_NET_ON_RESOLVING') || e.includes('NS_ERROR_NET_ON_WAITING_FOR') || e.includes('NS_ERROR_NET_ON_CONNECTING_TO') || e.includes('NS_ERROR_FAILURE') || e.includes('NS_ERROR_DOCSHELL_DYING') || e.includes('NS_ERROR_NET_ON_TRANSACTION_CLOSE')
    ) { return; }
    endVote({ errorVoteNetwork: [e, details.url] }, { tab: { id: details.tabId }, url: details.url }, opened);
  }
};

const webNavigationOnErrorOccurredListener = async (details) => {
  await initPromise;
  if (!openedProjects.has(details.tabId)) return;

  if (
    details.frameId === 0 ||
    details.url.match(/hcaptcha.com\/captcha\/*/) ||
    details.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/*/) ||
    details.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/*/) ||
    details.url.match(/https:\/\/challenges.cloudflare.com\/*/)
  ) {
    const opened = openedProjects.get(details.tabId);
    const e = details.error || '';
    if (
      e.includes('net::ERR_ABORTED') || e.includes('net::ERR_CONNECTION_RESET') || e.includes('net::ERR_NETWORK_CHANGED') || e.includes('net::ERR_CACHE_MISS') || e.includes('net::ERR_BLOCKED_BY_CLIENT') ||
      e.includes('NS_BINDING_ABORTED') || e.includes('NS_ERROR_NET_ON_RESOLVED') || e.includes('NS_ERROR_NET_ON_RESOLVING') || e.includes('NS_ERROR_NET_ON_WAITING_FOR') || e.includes('NS_ERROR_NET_ON_CONNECTING_TO') || e.includes('NS_ERROR_FAILURE') || e.includes('NS_ERROR_DOCSHELL_DYING') || e.includes('NS_ERROR_NET_ON_TRANSACTION_CLOSE')
    ) { return; }
    endVote({ errorVoteNetwork: [e, details.url] }, { tab: { id: details.tabId }, url: details.url }, opened);
  }
};

// -------------------- Listener registration --------------------

function updateListeners(enable) {
  if (settings?.debug) console.log('Регистрация слушателей, включение', enable, 'openedProjects.size', openedProjects.size, 'openedProjects', openedProjects);
  if (enable) {
    if (!chrome.webNavigation.onErrorOccurred.hasListeners()) {
      if (settings?.debug) console.log('Регистрация слушателя webNavigation.onErrorOccurred');
      chrome.webNavigation.onErrorOccurred.addListener(webNavigationOnErrorOccurredListener);
    }
    if (!chrome.webNavigation.onCommitted.hasListeners()) {
      if (settings?.debug) console.log('Регистрация слушателя webNavigation.onCommitted');
      chrome.webNavigation.onCommitted.addListener(webNavigationOnCommittedListener);
    }
    if (!chrome.webNavigation.onCompleted.hasListeners()) {
      if (settings?.debug) console.log('Регистрация слушателя webNavigation.onCompleted');
      chrome.webNavigation.onCompleted.addListener(webNavigationOnCompletedListener);
    }
    if (!chrome.tabs.onRemoved.hasListeners()) {
      if (settings?.debug) console.log('Регистрация слушателя tabs.onRemoved');
      chrome.tabs.onRemoved.addListener(tabsOnRemovedListener);
    }
    if (!chrome.webRequest.onCompleted.hasListeners()) {
      if (settings?.debug) console.log('Регистрация слушателя webRequest.onCompleted');
      chrome.webRequest.onCompleted.addListener(webRequestOnCompletedListener, { urls: ['<all_urls>'] });
    }
    if (!chrome.webRequest.onErrorOccurred.hasListeners()) {
      if (settings?.debug) console.log('Регистрация слушателя webRequest.onErrorOccurred');
      chrome.webRequest.onErrorOccurred.addListener(webRequestOnErrorOccurredListener, { urls: ['<all_urls>'] });
    }
  } else {
    chrome.webNavigation.onErrorOccurred.removeListener(webNavigationOnErrorOccurredListener);
    chrome.webNavigation.onCommitted.removeListener(webNavigationOnCommittedListener);
    chrome.webNavigation.onCompleted.removeListener(webNavigationOnCompletedListener);
    chrome.tabs.onRemoved.removeListener(tabsOnRemovedListener);
    chrome.webRequest.onCompleted.removeListener(webRequestOnCompletedListener);
    chrome.webRequest.onErrorOccurred.removeListener(webRequestOnErrorOccurredListener);
  }
}

// Register initially (SW can start while voting)
updateListeners(true);

// -------------------- Messaging --------------------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // run async; return true for async responses on certain branches
  onRuntimeMessage(request, sender, sendResponse);
  if (request.projectDeleted || request.projectRestart) return true;
});

let fakeIdToId = {};
async function onRuntimeMessage(request, sender, sendResponse) {
  await initPromise;

  if (request.reloadCaptcha) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: sender.tab.id });
    for (const frame of frames) {
      if (
        frame.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/api.\/anchor*/) ||
        frame.url.match(/https?:\/\/(.+?\.)?recaptcha.net\/recaptcha\/api.\/anchor*/) ||
        frame.url.match(/https?:\/\/(.+?\.)?google.com\/recaptcha\/enterprise\/anchor*/)
      ) {
        const reload = function () { document.location.reload(); };
        if (settings.debug) console.log('Injecting funcReloadCaptcha to ' + frame.url);
        await chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [frame.frameId] }, func: reload });
      }
    }
    return;
  } else if (request.captchaPassed) {
    try { await chrome.tabs.sendMessage(sender.tab.id, request); }
    catch (error) {
      if (!error.message.includes('Could not establish connection. Receiving end does not exist') && !error.message.includes('The message port closed before a response was received')) {
        console.warn(error.message);
      }
    }
    if (request.captchaPassed !== 'double') return;
  } else if (request.HackTimer) {
    if (request.name === 'setInterval') {
      fakeIdToId[request.fakeId] = setInterval(() => triggerTimer(request.name, sender, request.fakeId), request.time);
    } else if (request.name === 'clearInterval') {
      clearInterval(fakeIdToId[request.fakeId]); delete fakeIdToId[request.fakeId];
    } else if (request.name === 'setTimeout') {
      fakeIdToId[request.fakeId] = setTimeout(() => { triggerTimer(request.name, sender, request.fakeId); delete fakeIdToId[request.fakeId]; }, request.time);
    } else if (request.name === 'clearTimeout') {
      clearTimeout(fakeIdToId[request.fakeId]); delete fakeIdToId[request.fakeId];
    }
    return;
  }

  if (request === 'checkVote') {
    checkVote();
    return;
  } else if (request === 'reloadAllSettings') {
    const store = db.transaction('other', 'readwrite').store;
    const newSettings = await store.get('settings') || {};
    const newGeneral  = await store.get('generalStats') || {};
    const newToday    = await store.get('todayStats') || {};
    Object.assign(settings, newSettings);
    Object.assign(generalStats, newGeneral);
    Object.assign(todayStats, newToday);
    for (const [key, value] of openedProjects) {
      openedProjects.delete(key);
      tryCloseTab(key, value, 0);
    }
    await store.put(openedProjects, 'openedProjects');
    reloadAllAlarms();
    checkVote();
    return;
  } else if (request === 'reloadSettings') {
    const latest = await db.get('other', 'settings');
    if (latest) Object.assign(settings, latest);
    return;
  } else if (request.projectDeleted) {
    const transaction = db.transaction(['projects', 'other'], 'readwrite');
    let nowVoting = false;
    for (const [key, value] of openedProjects) {
      if (request.projectDeleted.key === value.key) {
        if (key === 'start_' + request.projectDeleted.key) {
          sendResponse('reject');
          return;
        }
        nowVoting = true;
        openedProjects.delete(key);
        tryCloseTab(key, request.projectDeleted, 0);
        await transaction.objectStore('other').put(openedProjects, 'openedProjects');
        break;
      }
    }
    await transaction.objectStore('projects').delete(request.projectDeleted.key);
    await chrome.alarms.clear(String(request.projectDeleted.key));
    if (nowVoting) {
      checkVote();
      console.log(getProjectPrefix(request.projectDeleted, true), chrome.i18n.getMessage('projectDeleted'));
    }
    sendResponse('success');
    return;
  } else if (request.projectRestart) {
    const transaction = db.transaction(['projects', 'other'], 'readwrite');
    for (const [key, value] of openedProjects) {
      if (request.projectRestart.key === value.key) {
        if (request.confirmed) {
          openedProjects.delete(key);
          transaction.objectStore('other').put(openedProjects, 'openedProjects');
          tryCloseTab(key, request.projectRestart, 0);
          console.log(getProjectPrefix(request.projectRestart, true), chrome.i18n.getMessage('canceledVote'));
        } else {
          sendResponse('confirmNow');
          return;
        }
      }
    }
    for (const [key, value] of openedProjects) {
      if (request.projectRestart.rating === value.rating || settings.disabledOneVote) {
        if (request.confirmed) {
          openedProjects.delete(key);
          await transaction.objectStore('other').put(openedProjects, 'openedProjects');
          const proj = await transaction.objectStore('projects').get(value.key);
          tryCloseTab(key, proj, 0);
          console.log(getProjectPrefix(proj, true), chrome.i18n.getMessage('canceledVote'));
        } else {
          sendResponse('confirmQueue');
          return;
        }
      }
    }

    await chrome.alarms.clear(String(request.projectRestart.key));
    request.projectRestart.time = null;
    await updateValue('projects', request.projectRestart);
    console.log(getProjectPrefix(request.projectRestart, true), chrome.i18n.getMessage('projectRestarted'));
    checkOpen(request.projectRestart);
    checkVote();
    sendResponse('success');
    return;
  }

  if (request.changeProject) {
    updateValue('projects', request.changeProject);
    return;
  }

  if (!openedProjects.has(sender.tab.id)) {
    console.warn('Double attempt to complete vote? chrome.runtime.onMessage', JSON.stringify(request), JSON.stringify(sender));
    return;
  }

  const opened = openedProjects.get(sender.tab.id);
  if (request.captcha || request.authSteam || request.discordLogIn || request.auth || request.requiredConfirmTOS || (request.errorCaptcha && !request.restartVote) || request.restartVote === false || request.captchaPassed === 'double') {
    const project = await db.get('projects', opened.key);
    let message;
    if (request.captcha) {
      message = chrome.i18n.getMessage('requiresCaptcha');
    } else if (request.captchaPassed === 'double') {
      message = chrome.i18n.getMessage('captchaPassedDouble');
    } else if (request.message) {
      message = request.message;
    } else {
      const key = Object.keys(request)[0];
      message = Object.values(request)[0] !== true
        ? chrome.i18n.getMessage(key, Object.values(request)[0])
        : chrome.i18n.getMessage(key);
    }
    if (!(request.captcha && settings.disabledWarnCaptcha)) {
      console.warn(getProjectPrefix(project, true), message);
      sendNotification(getProjectPrefix(project, false), message, 'warn', 'openTab_' + sender.tab.id);
      project.error = message;
    }
    updateValue('projects', project);
  } else {
    endVote(request, sender, opened);
  }
}

async function triggerTimer(name, sender, fakeId) {
  try {
    await chrome.tabs.sendMessage(sender.tab.id, { HackTimer: true, fakeId }, { documentId: sender.documentId, frameId: sender.frameId });
  } catch (_) {
    if (name === 'setInterval') clearInterval(fakeIdToId[fakeId]);
    delete fakeIdToId[fakeId];
  }
}

async function tryOpenTab(request, project, attempt) {
  try {
    return await chrome.tabs.create(request);
  } catch (error) {
    if (error.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await wait(500); return await tryOpenTab(request, project, ++attempt);
    }
    endVote({ errorOpenTab: error.message }, null, project);
    return null;
  }
}
async function tryCloseTab(tabId, project, attempt) {
  if (!Number.isInteger(tabId)) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    if (error.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await wait(500); await tryCloseTab(tabId, project, ++attempt); return;
    }
    if (!error.message.includes('No tab with id')) {
      console.warn(getProjectPrefix(project, true), error.message);
      sendNotification(getProjectPrefix(project, false), error.message, 'error', 'openProject_' + project.key);
    }
  }
}
async function tryGroupTabs(options, attempt) {
  try {
    return await chrome.tabs.group(options);
  } catch (error) {
    if (error.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await wait(500); return await tryGroupTabs(options, ++attempt);
    }
    throw error;
  }
}

// -------------------- End vote & bookkeeping --------------------

async function endVote(request, sender, project) {
  let timeout = settings.timeout;

  let opened;
  for (const [tab, value] of openedProjects) {
    if (project.key === value.key) {
      if (!Number.isInteger(tab) && !tab.startsWith('background_') && !tab.startsWith('start_')) {
        console.warn('Double attempt to complete? endVote, has openedProjects', JSON.stringify(request), JSON.stringify(sender), JSON.stringify(project));
        return;
      } else {
        opened = value;
        if (opened.randomize) timeout += Math.floor(Math.random() * (60000 - 10000) + 10000);
        opened.timeoutQueue = Date.now() + timeout;

        delete opened.nextAttempt;
        delete opened.countInject;

        openedProjects.set('queue_' + opened.key, opened);
        openedProjects.delete(tab);
        db.put('other', openedProjects, 'openedProjects');
      }
      break;
    }
  }
  if (!opened) {
    console.warn('Double attempt to complete? endVote, not found openedProjects', JSON.stringify(request), JSON.stringify(sender), JSON.stringify(project));
    return;
  }

  project = await db.get('projects', project.key);

  if (!request.successfully && request.later == null) {
    if (sender?.url || request.url) {
      const u = sender?.url || request.url;
      const domain = getDomainWithoutSubdomain(u);
      if (domain !== project.rating) request.incorrectDomain = domain;
    }
  }

  if (sender && !request.closedTab) {
    if (!request.successfully && request.later == null) {
      if (!settings.disableCloseTabsOnError) tryCloseTab(sender.tab.id, project, 0);
    } else {
      if (!settings.disableCloseTabsOnSuccess) tryCloseTab(sender.tab.id, project, 0);
    }
  }

  // Success or later
  let sendMessage;
  if (request.successfully || request.later != null) {
    let time = new Date();

    if (project.rating === 'Custom' || ((project.timeout != null || project.timeoutHour != null) && !Number.isInteger(request.later) && !(project.lastDayMonth && new Date(time.getFullYear(), time.getMonth(), time.getDay() + 1).getMonth() === new Date().getMonth()))) {
      if (project.timeoutHour != null) {
        if (project.timeoutMinute == null) project.timeoutMinute = 0;
        if (project.timeoutSecond == null) project.timeoutSecond = 0;
        if (project.timeoutMS == null) project.timeoutMS = 0;

        let month = time.getMonth();
        let date = time.getDate();
        let needCalculateDate = true;

        if (project.timeoutWeek != null) {
          const distance = (project.timeoutWeek + 7 - time.getDay()) % 7;
          if (distance > 0) { needCalculateDate = false; date += distance; }
        } else if (project.timeoutMonth != null) {
          if (time.getDate() !== project.timeoutMonth) {
            needCalculateDate = false;
            if (time.getDate() > project.timeoutMonth) month += 1;
            date = project.timeoutMonth;
          }
        }
        if (needCalculateDate) {
          if (time.getHours() > project.timeoutHour || (time.getHours() === project.timeoutHour && time.getMinutes() >= project.timeoutMinute)) {
            if (project.timeoutWeek != null) date += 7;
            else if (project.timeoutMonth != null) { month += 1; date = project.timeoutMonth; }
            else date += 1;
          }
        }
        time = new Date(time.getFullYear(), month, date, project.timeoutHour, project.timeoutMinute, project.timeoutSecond, project.timeoutMS);
      } else {
        time.setUTCMilliseconds(time.getUTCMilliseconds() + project.timeout);
      }
    } else if (request.later && Number.isInteger(request.later)) {
      let needSetTime = true;
      if (allProjects[project.rating]?.limitedCountVote?.()) {
        project.countVote = (project.countVote || 0) + 1;
        if (project.countVote >= project.maxCountVote) {
          needSetTime = false;
          time = new Date(time.getFullYear(), time.getMonth(), time.getDate() + 1, 0, (project.priority ? 0 : 10), 0, 0);
        }
      }
      if (needSetTime) time = new Date(request.later);
    } else {
      const timeoutRating = allProjects[project.rating]?.timeout?.(project);
      if (Number.isInteger(request.successfully)) {
        time = new Date(request.successfully);
      } else if (!timeoutRating) {
        time.setUTCDate(time.getUTCDate() + 1);
      } else if (timeoutRating.week != null) {
        let date = time.getUTCDate();
        const distance = (timeoutRating.week + 7 - time.getUTCDay()) % 7;
        if (distance > 0) date += distance;
        else if (time.getUTCHours() >= timeoutRating.hour) date += 7;
        time = new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), date, timeoutRating.hour, (project.priority ? 0 : 10), 0, 0));
      } else if (timeoutRating.month != null) {
        let month = time.getUTCMonth();
        let date = time.getUTCDate();
        if (time.getUTCDate() !== timeoutRating.month) {
          if (time.getUTCDate() > timeoutRating.month) month += 1;
          date = timeoutRating.month;
        } else if (time.getUTCHours() >= timeoutRating.hour) {
          month += 1; date = timeoutRating.month;
        }
        time = new Date(Date.UTC(time.getUTCFullYear(), month, date, timeoutRating.hour, (project.priority ? 0 : 10), 0, 0));
      } else if (timeoutRating.hour != null) {
        const date = time.getUTCHours() >= timeoutRating.hour ? time.getUTCDate() + 1 : time.getUTCDate();
        time = new Date(Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), date, timeoutRating.hour, (project.priority ? 0 : 10), 0, 0));
      } else if (timeoutRating.hours != null) {
        let needSetTime = true;
        if (allProjects[project.rating]?.limitedCountVote?.()) {
          project.countVote = (project.countVote || 0) + 1;
          if (project.countVote >= project.maxCountVote) {
            needSetTime = false;
            time = new Date(time.getFullYear(), time.getMonth(), time.getDate() + 1, 0, (project.priority ? 0 : 10), 0, 0);
            project.countVote = 0;
          }
        }
        if (needSetTime) {
          let hours = time.getHours() + timeoutRating.hours;
          let minutes = time.getMinutes();
          let seconds = time.getSeconds();
          let milliseconds = time.getMilliseconds();
          if (timeoutRating.minutes != null) minutes += timeoutRating.minutes;
          if (timeoutRating.seconds != null) seconds += timeoutRating.seconds;
          if (timeoutRating.milliseconds != null) milliseconds += timeoutRating.milliseconds;
          time = new Date(time.getFullYear(), time.getMonth(), time.getDate(), hours, minutes, seconds, milliseconds);
        }
      }
    }

    project.time = time.getTime();

    if (project.randomize) {
      if (project.randomize.min == null) project.randomize = { min: 0, max: 43200000 };
      project.time = project.time + Math.floor(Math.random() * (project.randomize.max - project.randomize.min) + project.randomize.min);
    } else if ((project.rating === 'topcraft.ru' || project.rating === 'topcraft.club' || project.rating === 'mctop.su' || (project.rating === 'minecraftrating.ru' && project.listing === 'projects')) && !project.priority && project.timeoutHour == null) {
      project.time = project.time + Math.floor(Math.random() * (600000 - 300000) + 300000);
    }

    delete project.error;
    delete project.warn;

    if (request.successfully) {
      if (typeof request.successfully === 'string') {
        project.warn = request.successfully;
        sendMessage = chrome.i18n.getMessage('successAutoVoteWarn', request.successfully);
      } else {
        sendMessage = chrome.i18n.getMessage('successAutoVote');
      }
      sendNotification(getProjectPrefix(project, false), sendMessage, 'info', 'openProject_' + project.key);

      project.stats.successVotes++;
      project.stats.monthSuccessVotes++;
      project.stats.lastSuccessVote = Date.now();

      generalStats.successVotes++;
      generalStats.monthSuccessVotes++;
      generalStats.lastSuccessVote = Date.now();
      todayStats.successVotes++;
      todayStats.lastSuccessVote = Date.now();
    } else {
      if (typeof request.later === 'string') {
        project.warn = request.later;
        sendMessage = chrome.i18n.getMessage('alreadyVotedWarn', request.later);
      } else {
        sendMessage = chrome.i18n.getMessage('alreadyVoted');
      }
      sendNotification(getProjectPrefix(project, false), sendMessage, project.warn ? 'warn' : 'info', 'openProject_' + project.key);

      project.stats.laterVotes++;
      generalStats.laterVotes++;
      todayStats.laterVotes++;
    }
    console.log(getProjectPrefix(project, true), sendMessage + ', ' + chrome.i18n.getMessage('timeStamp') + ' ' + project.time);
  } else {
    let message;
    if (!request.message) {
      const name = Object.keys(request)[0];
      message = Object.values(request)[0] === true ? chrome.i18n.getMessage(name) : chrome.i18n.getMessage(name, Object.values(request)[0]);
      if (request.usedTranslator && name !== 'usedTranslator') message += ' ' + chrome.i18n.getMessage('usedTranslator');
    } else {
      message = chrome.i18n.getMessage('siteError', request.message);
    }
    if (message.length === 0) message = chrome.i18n.getMessage('emptyError');
    if (request.incorrectDomain) message += ' Incorrect domain ' + request.incorrectDomain;

    let retryCoolDown;
    if (request.retryCoolDown) retryCoolDown = request.retryCoolDown;
    else if ((request.errorVote && request.errorVote[0] === '404') || (request.message && project.rating === 'wargm.ru' && project.randomize)) retryCoolDown = 21600000;
    else if (request.closedTab) retryCoolDown = 60000;
    else retryCoolDown = settings.timeoutError;

    sendMessage = message + '. ' + chrome.i18n.getMessage('errorNextVote', (Math.round(retryCoolDown / 1000 / 60 * 100) / 100).toString());

    if (project.randomize) retryCoolDown += Math.floor(Math.random() * 900000);
    project.time = Date.now() + retryCoolDown;
    project.error = message;

    console.error(getProjectPrefix(project, true), sendMessage + ', ' + chrome.i18n.getMessage('timeStamp') + ' ' + project.time);
    if (!(request.errorVote && request.errorVote[0].charAt(0) === '5')) sendNotification(getProjectPrefix(project, false), sendMessage, 'error', 'openProject_' + project.key);

    project.stats.errorVotes++;
    generalStats.errorVotes++;
    todayStats.errorVotes++;
  }

  await db.put('other', generalStats, 'generalStats');
  await db.put('other', todayStats, 'todayStats');
  await updateValue('projects', project);

  await chrome.alarms.clear('nextAttempt_' + project.key);
  if (project.time != null && project.time > Date.now()) {
    let create2 = true;
    let when = project.time;
    if (when - Date.now() < 65000) when = Date.now() + 65000;
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) {
      if (!isNaN(alarm.name) && alarm.scheduledTime === when) { create2 = false; break; }
    }
    if (create2) {
      try { await chrome.alarms.create(String(project.key), { when }); }
      catch (error) { console.warn(getProjectPrefix(project, true), 'Ошибка при создании chrome.alarms', error.message); }
    }
  }

  async function removeQueue() {
    for (const [tab, value] of openedProjects) {
      if (tab.startsWith?.('queue_') && project.key === value.key) openedProjects.delete(tab);
    }
    db.put('other', openedProjects, 'openedProjects');
    checkVote();
  }

  setTimeout(removeQueue, timeout);

  // backup alarm in case SW sleeps
  let alarmTimeout = timeout < 65000 ? 65000 : timeout;
  try { await chrome.alarms.create('checkVote', { when: Date.now() + alarmTimeout }); }
  catch (error) { console.warn(getProjectPrefix(project, true), 'Ошибка при создании chrome.alarms', error.message); }
}

// -------------------- Notifications --------------------

function sendNotification(title, message, type, notificationId) {
  if (!message) message = '';
  if (!notificationId) notificationId = '';

  if (settings?.disabledNotifStart && type === 'start') return;
  if (settings?.disabledNotifInfo && type === 'info') return;

  if (type === 'warn' || type === 'error') {
    (async () => {
      try { await chrome.runtime.sendMessage({ notification: { title, message, type, notificationId } }); }
      catch (error) {
        if (!error.message.includes('Could not establish connection. Receiving end does not exist') && !error.message.includes('The message port closed before a response was received')) {
          console.warn(error.message);
        }
      }
    })();
  }

  if (settings?.disabledNotifWarn && type === 'warn') return;
  if (settings?.disabledNotifError && type === 'error') return;

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title,
    message
  }, function () {});
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  await initPromise;
  if (notificationId.startsWith('openTab_')) {
    try {
      const tabId = Number(notificationId.replace('openTab_', ''));
      if (!tabId) return;
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (!tab) return;
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (error) {
      if (!error.message.includes('No tab with id')) {
        console.warn('Ошибка при фокусировке на вкладку', error.message);
      }
    }
  } else if (notificationId.startsWith('openProject_')) {
    try {
      const projectKey = Number(notificationId.replace('openProject_', ''));
      const found = await db.count('projects', projectKey);
      if (!found) return;
      await openOptionsPage();
      await chrome.runtime.sendMessage({ openProject: projectKey });
    } catch (error) {
      console.warn('Ошибка открытия настроек с определённым проектом', error.message);
    }
  } else if (notificationId.startsWith('openSettings')) {
    await chrome.runtime.openOptionsPage();
  }
});

async function openOptionsPage() {
  await chrome.runtime.openOptionsPage();
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tabs.length) return;
  if (tabs[0].status !== 'complete') {
    for (let i = 0; i < 9; i++) {
      await wait(250);
      const t = await chrome.tabs.get(tabs[0].id);
      if (t.status === 'complete') break;
    }
  }
}

// -------------------- Helpers --------------------

function getProjectPrefix(project, detailed) {
  let text = '';
  if (project.nick && project.nick !== '') text += ' – ' + project.nick;
  if (detailed && project.game && project.game !== '') text += ' – ' + project.game;
  if (detailed) {
    if (project.id && project.id !== '') text += ' – ' + project.id;
    if (project.name && project.name !== '') text += ' – ' + project.name;
  } else {
    if (project.name && project.name !== '') text += ' – ' + project.name;
    else if (project.id && project.id !== '') text += ' – ' + project.id;
  }
  if (text === '') return '[' + project.rating + ']';
  text = text.replace(' – ', '');
  return '[' + project.rating + '] ' + text;
}

function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

async function updateValue(objStore, value) {
  const store = db.transaction(objStore, 'readwrite').store;
  const found = await store.count(value.key);
  if (found) {
    await store.put(value, value.key);
    (async () => {
      try { await chrome.runtime.sendMessage({ updateValue: objStore, value }); }
      catch (error) {
        if (!error.message.includes('Could not establish connection. Receiving end does not exist') && !error.message.includes('The message port closed before a response was received')) {
          console.error(error.message);
        }
      }
    })();
  } else {
    console.warn('The ' + objStore + ' could not be found, it may have been deleted', JSON.stringify(value));
  }
}

// -------------------- Console interception -> logs store --------------------

console._log = console.log;
console._info = console.info;
console._warn = console.warn;
console._error = console.error;
console._debug = console.debug;

console.log = function () { return console._intercept('log', arguments); };
console.info = function () { return console._intercept('info', arguments); };
console.warn = function () { return console._intercept('warn', arguments); };
console.error = function () { return console._intercept('error', arguments); };
console.debug = function () { return console._intercept('debug', arguments); };

console._intercept = function (type, args) {
  console._collect(type, args);
};

console._collect = function (type, args) {
  const time = new Date().toLocaleString().replace(',', '');
  if (!type) type = 'log';
  if (!args || args.length === 0) return;

  console['_' + type].apply(console, args);

  let log = '[' + time + ' ' + type.toUpperCase() + ']:';
  for (let arg of args) {
    if (arg?.stack) log += ' ' + arg.stack;
    else {
      if (typeof arg !== 'string') arg = JSON.stringify(arg);
      log += ' ' + arg;
    }
  }
  if (dbLogs) dbLogs.add('logs', log);
};

// -------------------- Install/update flow --------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  await initPromise;
  // Opera special case
  if (!settings.operaAttention2 && (navigator?.userAgentData?.brands?.[0]?.brand === 'Opera' || (!!self.opr && !!opr.addons) || !!self.opera || navigator.userAgent.indexOf(' OPR/') >= 0)) {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (details.reason === 'install') {
    await openOptionsPage();
    chrome.runtime.sendMessage({ installed: true });
  } else if (details.reason === 'update') {
    checkVote();
  }
});