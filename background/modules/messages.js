// background/modules/messages.js
import { state, t } from './state.js';
import { sendNotification } from './notifications.js';
import { log } from './logs.js';
import { wait, getProjectPrefix } from './utils.js';
import { checkVote, reloadAllAlarms, endVote } from './scheduler.js';

const fakeIdToId = Object.create(null);

export async function onRuntimeMessage(request, sender, sendResponse) {
  await state.init;

  const tab = (sender && sender.tab) || null;
  const tabId = (tab && typeof tab.id === "number") ? tab.id : null;

  if (request && request.notification) {
    return;
  }

  // Captcha reload
  if (request.reloadCaptcha) {
    if (!Number.isInteger(tabId)) return;
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const f of frames) {
      if (/google\.com\/recaptcha\/api.+\/anchor|recaptcha\.net\/recaptcha\/api.+\/anchor|recaptcha\.enterprise\/anchor/.test(f.url)) {
        await chrome.scripting.executeScript({ target: { tabId, frameIds: [f.frameId] }, func: () => document.location.reload() });
      }
    }
    return;
  }

  // Captcha passed messages (double)
  if (request.captchaPassed) {
    if (!Number.isInteger(tabId)) return;
    try { await chrome.tabs.sendMessage(tabId, request); } catch (e) {}
    if (request.captchaPassed !== 'double') return;
  }

  // HackTimer
  if (request.HackTimer) {
    if (!Number.isInteger(tabId)) return;
    if (request.name === 'setInterval') {
      fakeIdToId[request.fakeId] = setInterval(() => triggerTimer(request.name, tabId, sender, request.fakeId), request.time);
    } else if (request.name === 'clearInterval') {
      clearInterval(fakeIdToId[request.fakeId]); delete fakeIdToId[request.fakeId];
    } else if (request.name === 'setTimeout') {
      fakeIdToId[request.fakeId] = setTimeout(() => { triggerTimer(request.name, tabId, sender, request.fakeId); delete fakeIdToId[request.fakeId]; }, request.time);
    } else if (request.name === 'clearTimeout') {
      clearTimeout(fakeIdToId[request.fakeId]); delete fakeIdToId[request.fakeId];
    }
    return;
  }

  // Simple string commands
  if (request === 'checkVote') { checkVote(); return; }
  if (request === 'reloadSettings') {
    const latest = await state.db.get('other', 'settings');
    if (latest) Object.assign(state.settings, latest);
    return;
  }
  if (request === 'reloadAllSettings') {
    const store = state.db.transaction('other', 'readwrite').store;
    const s = await store.get('settings') || {};
    const g = await store.get('generalStats') || {};
    const tstats = await store.get('todayStats') || {};
    Object.assign(state.settings, s); Object.assign(state.generalStats, g); Object.assign(state.todayStats, tstats);
    for (const [key, value] of state.openedProjects) {
      state.openedProjects.delete(key);
      tryCloseTab(key, value, 0);
    }
    await store.put(state.openedProjects, 'openedProjects');
    reloadAllAlarms();
    checkVote();
    return;
  }

  // Project deletion
  if (request.projectDeleted) {
    const tx = state.db.transaction(['projects', 'other'], 'readwrite');
    let nowVoting = false;
    for (const [key, value] of state.openedProjects) {
      if (request.projectDeleted.key === value.key) {
        if (key === 'start_' + request.projectDeleted.key) { sendResponse('reject'); return; }
        nowVoting = true;
        state.openedProjects.delete(key);
        tryCloseTab(key, request.projectDeleted, 0);
        await tx.objectStore('other').put(state.openedProjects, 'openedProjects');
        break;
      }
    }
    await tx.objectStore('projects').delete(request.projectDeleted.key);
    await chrome.alarms.clear(String(request.projectDeleted.key));
    if (nowVoting) { checkVote(); log('info', getProjectPrefix(request.projectDeleted, true), t('projectDeleted') || 'Project deleted'); }
    sendResponse('success');
    return;
  }

  // Project restart
  if (request.projectRestart) {
    const tx = state.db.transaction(['projects', 'other'], 'readwrite');
    for (const [key, value] of state.openedProjects) {
      if (request.projectRestart.key === value.key) {
        if (!request.confirmed) { sendResponse('confirmNow'); return; }
        state.openedProjects.delete(key);
        tx.objectStore('other').put(state.openedProjects, 'openedProjects');
        tryCloseTab(key, request.projectRestart, 0);
        log('info', getProjectPrefix(request.projectRestart, true), t('canceledVote') || 'Canceled vote');
      }
    }
    for (const [key, value] of state.openedProjects) {
      if (request.projectRestart.rating === value.rating || state.settings.disabledOneVote) {
        if (!request.confirmed) { sendResponse('confirmQueue'); return; }
        state.openedProjects.delete(key);
        await tx.objectStore('other').put(state.openedProjects, 'openedProjects');
        const proj = await tx.objectStore('projects').get(value.key);
        tryCloseTab(key, proj, 0);
        log('info', getProjectPrefix(proj, true), t('canceledVote') || 'Canceled vote');
      }
    }

    await chrome.alarms.clear(String(request.projectRestart.key));
    request.projectRestart.time = null;
    await updateValue('projects', request.projectRestart);
    log('info', getProjectPrefix(request.projectRestart, true), t('projectRestarted') || 'Project restarted');
    checkVote();
    sendResponse('success');
    return;
  }

  // Project inline changes
  if (request.changeProject) {
    await updateValue('projects', request.changeProject);
    return;
  }

  // Vote completion (from content scripts)
  if (!Number.isInteger(tabId)) {
    if (state.settings?.debug) log('warn', '[runtime] message without tab context', request);
    return;
  }
  if (!state.openedProjects.has(tabId)) {
    log('warn', 'Double attempt to complete vote?', request, sender);
    return;
  }
  const opened = state.openedProjects.get(tabId);

  if (request.captcha || request.authSteam || request.discordLogIn || request.auth || request.requiredConfirmTOS || (request.errorCaptcha && !request.restartVote) || request.restartVote === false || request.captchaPassed === 'double') {
    const project = await state.db.get('projects', opened.key);
    let message = request.message || null;
    if (!message) {
      const key = Object.keys(request)[0];
      message = Object.values(request)[0] !== true ? t(key, Object.values(request)[0]) : t(key);
    }
    if (!(request.captcha && state.settings.disabledWarnCaptcha)) {
      log('warn', getProjectPrefix(project, true), message);
      sendNotification(getProjectPrefix(project, false), message, 'warn', 'openTab_' + tabId);
      project.error = message;
    }
    await updateValue('projects', project);
    return;
  }

  await endVote(request, sender, opened);
}

async function triggerTimer(name, tabId, sender, fakeId) {
  try {
    if (!Number.isInteger(tabId)) return;
    await chrome.tabs.sendMessage(tabId, { HackTimer: true, fakeId }, { documentId: sender.documentId, frameId: sender.frameId });
  } catch (_) {
    if (name === 'setInterval') clearInterval(fakeIdToId[fakeId]);
    delete fakeIdToId[fakeId];
  }
}

async function tryCloseTab(tabId, project, attempt) {
  if (!Number.isInteger(tabId)) return;
  try { await chrome.tabs.remove(tabId); }
  catch (e) {
    if (e.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await new Promise(r => setTimeout(r, 500)); await tryCloseTab(tabId, project, ++attempt); return;
    }
  }
}

async function updateValue(storeName, value) {
  const store = state.db.transaction(storeName, 'readwrite').store;
  const found = await store.count(value.key);
  if (found) {
    await store.put(value, value.key);
    chrome.runtime.sendMessage({ updateValue: storeName, value }).catch(()=>{});
  } else {
    log('warn', 'Store', storeName, 'key not found', value.key);
  }
}