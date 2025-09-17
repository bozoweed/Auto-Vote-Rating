// background/modules/scheduler.js
import { state, t } from './state.js';
import { sendNotification } from './notifications.js';
import { log } from './logs.js';
import { wait, getProjectPrefix } from './utils.js';
import { allProjects } from '../../js/projects.js';
import { runSilentVote } from './silent.js';
import { registerAll, unregisterAll, isCaptchaFrame, IGNORABLE_NAV_ERRORS } from './injection.js';
import { getDomainWithoutSubdomain } from '../../js/utils/url.js';

let groupId;
let notSupportedGroupTabs = false;
let check = true;
let doubleCheck = false;
let pendingProms = [];
let promiseGroup;
let promiseWindow;

let listenersActive = false;

const tabsOnRemovedListener = async (tabId) => {
  await state.init;
  const opened = state.openedProjects.get(tabId);
  if (!opened) return;
  await endVote({ closedTab: true }, { tab: { id: tabId } }, opened);
};

const webRequestOnCompletedListener = async (details) => {
  await state.init;
  const opened = state.openedProjects.get(details.tabId);
  if (!opened) return;
  if (allProjects[opened.rating]?.ignoreErrors?.()) return;
  if (details.type === 'main_frame' && (details.statusCode < 200 || details.statusCode > 299)) {
    if (details.statusCode === 503 || details.statusCode === 403) {
      opened.countInject = Math.max(0, (opened.countInject || 0) - 1);
      await state.db.put('other', state.openedProjects, 'openedProjects');
    } else {
      await endVote({ errorVote: [String(details.statusCode), details.url] }, { tab: { id: details.tabId }, url: details.url }, opened);
    }
  }
};

const webRequestOnErrorOccurredListener = async (details) => {
  await state.init;
  if (!state.openedProjects.has(details.tabId)) return;
  if (details.type === 'main_frame' || isCaptchaFrame(details.url)) {
    const opened = state.openedProjects.get(details.tabId);
    const e = details.error || '';
    if (IGNORABLE_NAV_ERRORS.some((str) => e.includes(str))) return;
    await endVote({ errorVoteNetwork: [e, details.url] }, { tab: { id: details.tabId }, url: details.url }, opened);
  }
};

export function updateListeners(enable) {
  if (enable) {
    if (listenersActive) return;
    if (state.settings?.debug) {
      log('info', '[listeners] enable', 'openedProjects.size', state.openedProjects.size, 'openedProjects', state.openedProjects);
    }
    registerAll();
    if (!chrome.tabs.onRemoved.hasListener(tabsOnRemovedListener)) {
      chrome.tabs.onRemoved.addListener(tabsOnRemovedListener);
    }
    if (!chrome.webRequest.onCompleted.hasListener(webRequestOnCompletedListener)) {
      chrome.webRequest.onCompleted.addListener(webRequestOnCompletedListener, { urls: ['<all_urls>'] });
    }
    if (!chrome.webRequest.onErrorOccurred.hasListener(webRequestOnErrorOccurredListener)) {
      chrome.webRequest.onErrorOccurred.addListener(webRequestOnErrorOccurredListener, { urls: ['<all_urls>'] });
    }
    listenersActive = true;
  } else {
    if (!listenersActive) return;
    if (state.settings?.debug) {
      log('info', '[listeners] disable', 'openedProjects.size', state.openedProjects.size, 'openedProjects', state.openedProjects);
    }
    unregisterAll();
    if (chrome.tabs.onRemoved.hasListener(tabsOnRemovedListener)) {
      chrome.tabs.onRemoved.removeListener(tabsOnRemovedListener);
    }
    if (chrome.webRequest.onCompleted.hasListener(webRequestOnCompletedListener)) {
      chrome.webRequest.onCompleted.removeListener(webRequestOnCompletedListener);
    }
    if (chrome.webRequest.onErrorOccurred.hasListener(webRequestOnErrorOccurredListener)) {
      chrome.webRequest.onErrorOccurred.removeListener(webRequestOnErrorOccurredListener);
    }
    listenersActive = false;
  }
}

export async function checkVote() {
  await state.init;

  // Opera guard
  const ua = navigator?.userAgentData?.brands?.[0]?.brand;
  if (!state.settings.operaAttention2 && (ua === 'Opera' || (!!self.opr && !!opr.addons) || !!self.opera || navigator.userAgent.indexOf(' OPR/') >= 0)) {
    return;
  }

  // Online guard
  if (!state.settings.disabledCheckInternet && !state.onLine) {
    if (navigator.onLine) {
      log('info', t('internetRestored') || 'Internet restored');
      state.onLine = true;
      state.db.put('other', state.onLine, 'onLine');
    } else {
      chrome.alarms.create('checkVote', { when: Date.now() + 65000 });
      return;
    }
  }

  if (check) check = false;
  else { doubleCheck = true; return; }

  const tx = state.db.transaction('projects');
  let cursor = await tx.objectStore('projects').openCursor();
  while (cursor) {
    const project = cursor.value;
    const next = cursor.continue();
    if (!project.time || project.time < Date.now()) {
      await checkOpen(project, tx);
    }
    cursor = await next;
  }

  check = true;
  if (doubleCheck) { doubleCheck = false; checkVote(); }
  else {
    if (!state.openedProjects.size) {
      pendingProms = [];
      updateListeners(false);
    }
  }
}

export async function reloadAllAlarms() {
  await chrome.alarms.clearAll();
  const tx = state.db.transaction('projects');
  let cursor = await tx.store.openCursor();
  const times = [];
  while (cursor) {
    const project = cursor.value;
    const next = cursor.continue();
    if (project.time != null && project.time > Date.now() && !times.includes(project.time)) {
      let when = project.time;
      if (when - Date.now() < 65000) when = Date.now() + 65000;
      try { chrome.alarms.create(String(cursor.key), { when }); }
      catch (e) { log('warn', getProjectPrefix(project, true), 'alarms.create error', e.message); }
      times.push(project.time);
    }
    cursor = await next;
  }
}

async function checkOpen(project, transaction) {
  // Network guard
  if (!state.settings.disabledCheckInternet) {
    if (!navigator.onLine && state.onLine) {
      chrome.alarms.create('checkVote', { when: Date.now() + 65000 });
      sendNotification(getProjectPrefix(project, false), t('internetDisconnected') || 'Internet disconnected', 'error', 'openProject_' + project.key);
      log('warn', getProjectPrefix(project, true), t('internetDisconnected') || 'Internet disconnected');
      state.onLine = false;
      state.db.put('other', state.onLine, 'onLine');
      return;
    } else if (!state.onLine) {
      return;
    }
  }

  // Concurrency: same rating in progress?
  for (const [tab, value] of state.openedProjects) {
    if (value.timeoutQueue && Date.now() >= value.timeoutQueue) {
      state.openedProjects.delete(tab);
      state.db.put('other', state.openedProjects, 'openedProjects');
      continue;
    }
    if (project.rating === value.rating || (value.randomize && project.randomize) || state.settings.disabledOneVote) {
      if (state.settings.disabledRestartOnTimeout || tab.startsWith?.('queue_') || Date.now() < value.nextAttempt) {
        return;
      } else {
        state.openedProjects.delete(tab);
        state.db.put('other', state.openedProjects, 'openedProjects');

        const projectTimeout = await transaction.objectStore('projects').get(value.key);
        log('warn', getProjectPrefix(projectTimeout, true), t('timeout') || 'Timeout');
        sendNotification(getProjectPrefix(projectTimeout, false), t('timeout') || 'Timeout', 'warn', 'openProject_' + project.key);

        if (!state.settings.disableCloseTabsOnError) tryCloseTab(tab, projectTimeout, 0);
        break;
      }
    }
  }

  delete project.timeoutQueue;
  delete project.nextAttempt;
  delete project.countInject;

  const opened = { key: project.key, rating: project.rating, countInject: 0 };
  if (project.randomize) opened.randomize = project.randomize;

  if (!state.settings.disabledRestartOnTimeout) {
    let retryCoolDown;
    if (project.randomize) retryCoolDown = Math.floor(Math.random() * 600000 + 1800000); // 30‑40 min
    else { if (!state.settings.timeoutVote) state.settings.timeoutVote = 900000; retryCoolDown = state.settings.timeoutVote; }
    opened.nextAttempt = Date.now() + retryCoolDown;
  }

  if (!state.openedProjects.size) updateListeners(true);

  state.openedProjects.set('start_' + project.key, opened);
  state.db.put('other', state.openedProjects, 'openedProjects');

  if (project.rating === 'monitoringminecraft.ru') {
    pendingProms.push((async () => {
      try {
        const cookies = await chrome.cookies.getAll({ domain: '.monitoringminecraft.ru' });
        if (state.settings?.debug) {
          log('info', getProjectPrefix(project, true), t('deletingCookies', '.monitoringminecraft.ru') || 'deletingCookies .monitoringminecraft.ru');
        }
        for (const cookie of cookies) {
          const domain = cookie.domain?.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          const url = 'https://' + domain + cookie.path;
          try {
            await chrome.cookies.remove({ url, name: cookie.name });
          } catch (error) {
            log('warn', getProjectPrefix(project, true), '[cookie remove]', error?.message || error);
          }
        }
      } catch (error) {
        log('warn', getProjectPrefix(project, true), '[cookie list]', error?.message || error);
      }
    })());
  }

  await waitPendingProms();

  log('info', getProjectPrefix(project, true), t('startedAutoVote') || 'Auto vote started');
  sendNotification(getProjectPrefix(project, false), t('startedAutoVote') || 'Auto vote started', 'start', 'openProject_' + project.key);

  // Update stats timestamps
  const timeNow = Date.now();
  rolloverMonths(project.stats);
  project.stats.lastAttemptVote = timeNow;
  rolloverMonths(state.generalStats);
  state.generalStats.lastAttemptVote = timeNow;
  resetTodayIfNewDay(state.todayStats);
  state.todayStats.lastAttemptVote = timeNow;

  await state.db.put('other', state.generalStats, 'generalStats');
  await state.db.put('other', state.todayStats, 'todayStats');
  await updateValue('projects', project);

  // Retry alarm (nextAttempt)
  if (!state.settings.disabledRestartOnTimeout) {
    let create = true;
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) if (alarm.scheduledTime === opened.nextAttempt) { create = false; break; }
    if (create) {
      let when = opened.nextAttempt;
      if (when - Date.now() < 65000) when = Date.now() + 65000;
      try { await chrome.alarms.create('nextAttempt_' + project.key, { when }); }
      catch (e) { log('warn', getProjectPrefix(project, true), 'alarms.create error', e.message); }
    }
  }

  // Silent vs visible
  let silentVoteMode = false;
  if (project.rating === 'Custom') silentVoteMode = true;
  else if (!project.emulateMode && allProjects[project.rating].silentVote?.(project)) silentVoteMode = true;

  if (silentVoteMode) {
    state.openedProjects.set('background_' + project.key, opened);
    state.openedProjects.delete('start_' + project.key);
    state.db.put('other', state.openedProjects, 'openedProjects');
    // Run silent
    const result = await runSilentVote(project);
    await endVote(result, null, opened);
  } else {
    let ok = await checkWindow(project);
    if (!ok) return;
    promiseWindow = checkWindow(project); // keep ref for next time
    ok = await promiseWindow; if (!ok) return;

    const url = allProjects[project.rating].voteURL(project);
    const tab = await tryOpenTab({ url, active: state.settings.disabledFocusedTab || Boolean(allProjects[project.rating].focusedTab?.(project)) }, project, 0);
    if (tab == null) return;

    state.openedProjects.set(tab.id, opened);
    state.openedProjects.delete('start_' + project.key);
    state.db.put('other', state.openedProjects, 'openedProjects');

    if (notSupportedGroupTabs) return;
    try {
      await promiseGroup;
      promiseGroup = groupTabs(tab);
      await promiseGroup;
    } catch (e) {
      const msg = e?.message || '';
      if (msg === 'Tabs cannot be edited right now (user may be dragging a tab).') {
        log('warn', getProjectPrefix(project, true), 'groupTabs', msg);
      } else {
        notSupportedGroupTabs = true;
        log('warn', t('notSupportedGroupTabs') || 'Tab grouping not supported', msg);
      }
    }
  }
}

async function checkWindow(project) {
  try {
    const windows = await chrome.windows.getAll();
    if (!windows?.length) {
      const w = await chrome.windows.create({ focused: false });
      await chrome.windows.update(w.id, { focused: false, drawAttention: false });
    }
    return true;
  } catch (e) {
    await endVote({ errorOpenTab: e.message }, null, project);
    return false;
  }
}

async function groupTabs(tab) {
  if (groupId == null) {
    const groups = await chrome.tabGroups.query({ title: 'Auto Vote Rating' });
    if (groups.length) groupId = groups[0].id;
  }
  if (groupId != null) {
    try { await tryGroupTabs({ groupId, tabIds: tab.id }, 0); return; }
    catch (e) { const m = e?.message || ''; if (!m.includes('No tab with id') && !m.includes('No group with id')) throw e; }
  }
  try {
    groupId = await tryGroupTabs({ tabIds: tab.id }, 0);
    await chrome.tabGroups.update(groupId, { color: 'blue', title: 'Auto Vote Rating' });
  } catch (e) {
    const m = e?.message || ''; if (!m.includes('No tab with id') && !m.includes('No group with id')) throw e;
  }
}

async function tryOpenTab(request, project, attempt) {
  try { return await chrome.tabs.create(request); }
  catch (e) {
    if (e.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await wait(500); return await tryOpenTab(request, project, ++attempt);
    }
    await endVote({ errorOpenTab: e.message }, null, project);
    return null;
  }
}
async function tryCloseTab(tabId, project, attempt) {
  if (!Number.isInteger(tabId)) return;
  try { await chrome.tabs.remove(tabId); }
  catch (e) {
    if (e.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await wait(500); await tryCloseTab(tabId, project, ++attempt); return;
    }
    if (!e.message.includes('No tab with id')) {
      sendNotification(getProjectPrefix(project, false), e.message, 'error', 'openProject_' + project.key, { errorMessage: e?.message, errorStack: e?.stack });
    }
  }
}
async function tryGroupTabs(options, attempt) {
  try { return await chrome.tabs.group(options); }
  catch (e) {
    if (e.message === 'Tabs cannot be edited right now (user may be dragging a tab).' && attempt < 3) {
      await wait(500); return await tryGroupTabs(options, ++attempt);
    }
    throw e;
  }
}

export async function endVote(request, sender, openedOrProject) {
  await state.init;
  // openedOrProject is opened (from Opened map)
  let opened = openedOrProject;
  let project = await state.db.get('projects', opened.key);

  let timeout = state.settings.timeout || 10000;

  for (const [tab, value] of state.openedProjects) {
    if (project.key === value.key) {
      if (!Number.isInteger(tab) && !tab.startsWith('background_') && !tab.startsWith('start_')) {
        log('warn', 'Double complete? endVote', request, sender, project);
        return;
      } else {
        if (value.randomize) timeout += Math.floor(Math.random() * (60000 - 10000) + 10000);
        value.timeoutQueue = Date.now() + timeout;
        delete value.nextAttempt;
        delete value.countInject;
        state.openedProjects.set('queue_' + value.key, value);
        state.openedProjects.delete(tab);
        await state.db.put('other', state.openedProjects, 'openedProjects');
      }
      break;
    }
  }

  // compute result and schedule next time, update stats (same logic as your original)
  await handleResultAndSchedule(project, request, sender);

  // cleanup queue after timeout
  setTimeout(async () => {
    for (const [tab, value] of state.openedProjects) {
      if (tab.startsWith?.('queue_') && project.key === value.key) state.openedProjects.delete(tab);
    }
    await state.db.put('other', state.openedProjects, 'openedProjects');
    checkVote();
  }, timeout);

  // backup alarm to wake SW
  const alarmTimeout = timeout < 65000 ? 65000 : timeout;
  try { await chrome.alarms.create('checkVote', { when: Date.now() + alarmTimeout }); }
  catch (e) { log('warn', getProjectPrefix(project, true), 'alarms.create error', e.message); }
}

async function handleResultAndSchedule(project, request, sender) {
  const urlForDomain = sender?.url || request.url;
  if (!request.successfully && request.later == null && urlForDomain) {
    const domain = getDomainWithoutSubdomain(urlForDomain);
    if (domain && domain !== project.rating) request.incorrectDomain = domain;
  }

  const closeTab = async (id) => {
    if (id == null) return;
    if (!request.successfully && request.later == null) {
      if (!state.settings.disableCloseTabsOnError) await tryCloseTab(id, project, 0);
    } else {
      if (!state.settings.disableCloseTabsOnSuccess) await tryCloseTab(id, project, 0);
    }
  };
  if (sender?.tab?.id && !request.closedTab) await closeTab(sender.tab.id);

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
      project.time += Math.floor(Math.random() * (project.randomize.max - project.randomize.min) + project.randomize.min);
    } else if ((project.rating === 'topcraft.ru' || project.rating === 'topcraft.club' || project.rating === 'mctop.su' || (project.rating === 'minecraftrating.ru' && project.listing === 'projects')) && !project.priority && project.timeoutHour == null) {
      project.time += Math.floor(Math.random() * (600000 - 300000) + 300000);
    }

    delete project.error;
    delete project.warn;

    if (request.successfully) {
      if (typeof request.successfully === 'string') {
        project.warn = request.successfully;
        sendMessage = t('successAutoVoteWarn', request.successfully) || ('successAutoVoteWarn ' + request.successfully);
      } else {
        sendMessage = t('successAutoVote') || 'successAutoVote';
      }
      sendNotification(getProjectPrefix(project, false), sendMessage, 'info', 'openProject_' + project.key);

      project.stats.successVotes = (project.stats.successVotes || 0) + 1;
      project.stats.monthSuccessVotes = (project.stats.monthSuccessVotes || 0) + 1;
      project.stats.lastSuccessVote = Date.now();

      state.generalStats.successVotes = (state.generalStats.successVotes || 0) + 1;
      state.generalStats.monthSuccessVotes = (state.generalStats.monthSuccessVotes || 0) + 1;
      state.generalStats.lastSuccessVote = Date.now();
      state.todayStats.successVotes = (state.todayStats.successVotes || 0) + 1;
      state.todayStats.lastSuccessVote = Date.now();
    } else {
      if (typeof request.later === 'string') {
        project.warn = request.later;
        sendMessage = t('alreadyVotedWarn', request.later) || ('alreadyVotedWarn ' + request.later);
      } else {
        sendMessage = t('alreadyVoted') || 'alreadyVoted';
      }
      sendNotification(getProjectPrefix(project, false), sendMessage, project.warn ? 'warn' : 'info', 'openProject_' + project.key);

      project.stats.laterVotes = (project.stats.laterVotes || 0) + 1;
      state.generalStats.laterVotes = (state.generalStats.laterVotes || 0) + 1;
      state.todayStats.laterVotes = (state.todayStats.laterVotes || 0) + 1;
    }
    log('info', getProjectPrefix(project, true), sendMessage + ', ' + (t('timeStamp') || 'timeStamp') + ' ' + project.time);
  } else {
    let message;
    if (!request.message) {
      const name = Object.keys(request)[0];
      const value = request[name];
      message = value === true || value == null ? (t(name) || name) : (t(name, value) || (name + ': ' + value));
      if (request.usedTranslator && name !== 'usedTranslator') message += ' ' + (t('usedTranslator') || 'usedTranslator');
    } else {
      message = t('siteError', request.message) || ('siteError ' + request.message);
    }
    if (!message || message.length === 0) message = t('emptyError') || 'emptyError';
    if (request.incorrectDomain) message += ' Incorrect domain ' + request.incorrectDomain;

    let retryCoolDown;
    if (request.retryCoolDown) retryCoolDown = request.retryCoolDown;
    else if ((request.errorVote && request.errorVote[0] === '404') || (request.message && project.rating === 'wargm.ru' && project.randomize)) retryCoolDown = 21600000;
    else if (request.closedTab) retryCoolDown = 60000;
    else retryCoolDown = state.settings.timeoutError || 60000;

    if (project.randomize) retryCoolDown += Math.floor(Math.random() * 900000);
    const minutes = (Math.round(retryCoolDown / 1000 / 60 * 100) / 100).toString();
    const nextVoteMsg = t('errorNextVote', minutes) || ('errorNextVote ' + minutes);
    sendMessage = message + '. ' + nextVoteMsg;

    project.time = Date.now() + retryCoolDown;
    project.error = message;

    log('error', getProjectPrefix(project, true), sendMessage + ', ' + (t('timeStamp') || 'timeStamp') + ' ' + project.time);
    if (!(request.errorVote && request.errorVote[0]?.charAt(0) === '5')) {
      sendNotification(getProjectPrefix(project, false), sendMessage, 'error', 'openProject_' + project.key, { request });
    }

    project.stats.errorVotes = (project.stats.errorVotes || 0) + 1;
    state.generalStats.errorVotes = (state.generalStats.errorVotes || 0) + 1;
    state.todayStats.errorVotes = (state.todayStats.errorVotes || 0) + 1;
  }

  await state.db.put('other', state.generalStats, 'generalStats');
  await state.db.put('other', state.todayStats, 'todayStats');
  await updateValue('projects', project);

  await chrome.alarms.clear('nextAttempt_' + project.key);
  if (project.time != null && project.time > Date.now()) {
    let create = true;
    let when = project.time;
    if (when - Date.now() < 65000) when = Date.now() + 65000;
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) {
      if (!Number.isNaN(Number(alarm.name)) && alarm.scheduledTime === when) { create = false; break; }
    }
    if (create) {
      try { await chrome.alarms.create(String(project.key), { when }); }
      catch (e) { log('warn', getProjectPrefix(project, true), 'alarms.create error', e.message); }
    }
  }
}

async function waitPendingProms() {
  if (!pendingProms.length) return;
  await Promise.allSettled(pendingProms);
  pendingProms = [];
}

function rolloverMonths(stats) {
  if (!stats) return;
  const last = new Date(stats.lastAttemptVote ?? 0);
  const now = new Date();
  if (last.getMonth() < now.getMonth() || last.getFullYear() < now.getFullYear()) {
    stats.lastMonthSuccessVotes = stats.monthSuccessVotes || 0;
    stats.monthSuccessVotes = 0;
  }
}

function resetTodayIfNewDay(stats) {
  if (!stats) return;
  const last = new Date(stats.lastAttemptVote ?? 0);
  const now = new Date();
  if (last.getDay() < now.getDay()) {
    stats.successVotes = 0;
    stats.errorVotes = 0;
    stats.laterVotes = 0;
    stats.lastSuccessVote = null;
    stats.lastAttemptVote = null;
  }
}

async function updateValue(storeName, value) {
  const store = state.db.transaction(storeName, 'readwrite').store;
  const found = await store.count(value.key);
  if (found) {
    await store.put(value, value.key);
    chrome.runtime.sendMessage({ updateValue: storeName, value }).catch(() => {});
  } else {
    log('warn', 'Store', storeName, 'key not found', value.key);
  }
}
