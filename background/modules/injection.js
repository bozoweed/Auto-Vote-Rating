// background/modules/injection.js
import { state, t } from './state.js';
import { sendNotification } from './notifications.js';
import { log } from './logs.js';
import { getDomainWithoutSubdomain } from '../../js/utils/url.js';
import { allProjects } from '../../js/projects.js';
import { getProjectPrefix } from './utils.js';

// Register/unregister guards
let registered = false;

export function registerAll() {
  if (registered) return;
  if (!chrome.webNavigation.onCommitted.hasListener(onCommitted)) {
    chrome.webNavigation.onCommitted.addListener(onCommitted);
  }
  if (!chrome.webNavigation.onCompleted.hasListener(onCompleted)) {
    chrome.webNavigation.onCompleted.addListener(onCompleted);
  }
  if (!chrome.webNavigation.onErrorOccurred.hasListener(onNavError)) {
    chrome.webNavigation.onErrorOccurred.addListener(onNavError);
  }
  registered = true;
}
export function unregisterAll() {
  if (!registered) return;
  registered = false;
  try {
    if (chrome.webNavigation.onErrorOccurred.hasListener(onNavError)) {
      chrome.webNavigation.onErrorOccurred.removeListener(onNavError);
    }
    if (chrome.webNavigation.onCommitted.hasListener(onCommitted)) {
      chrome.webNavigation.onCommitted.removeListener(onCommitted);
    }
    if (chrome.webNavigation.onCompleted.hasListener(onCompleted)) {
      chrome.webNavigation.onCompleted.removeListener(onCompleted);
    }
  } catch { }
}


// onCommitted -> pre-injection staging and “not ready inject” guard
export const onCommitted = (details) => {
  (async () => {
    if (!state.init?.done) {
      const opened = state.openedProjects.get(details.tabId);
      if (!opened) return;
      const project = await state.db.get('projects', opened.key);
      const message = t('notReadyInject') || 'Not ready to inject';
      if (project.error === message) return;
      log('warn', getProjectPrefix(project, true), message);
      sendNotification(getProjectPrefix(project, false), message, 'warn', 'openProject_' + project.key);
      project.error = message;
      await updateValue('projects', project);
      return;
    }
    // Prepare files to inject
    const filesMain = [];
    const filesIsolated = [];
    if (details.frameId === 0) {
      // OAuth allow-list: skip
      if (isOAuth(details.url)) return;
      filesMain.push('scripts/main/visible.js');
      const proj = allProjects[getDomainWithoutSubdomain(details.url)];
      if (proj?.needIsTrusted?.()) {
        filesIsolated.push('scripts/main/istrusted_isolated.js');
        filesMain.push('scripts/main/istrusted_main.js');
      }
      if (!proj?.dontUseAlert?.()) {
        filesIsolated.push('scripts/main/alert_isolated.js');
        filesMain.push('scripts/main/alert_main.js');
      }
    } else if (isCaptchaFrame(details.url)) {
      filesMain.push('scripts/main/visible.js');
      filesIsolated.push('scripts/main/alert_isolated.js');
      filesMain.push('scripts/main/alert_main.js');
    }
    if (!filesMain.length && !filesIsolated.length) return;

    const target = { tabId: details.tabId };
    if (details.frameId) target.frameIds = [details.frameId];

    if (state.settings.debug) log('info', 'Injecting', filesIsolated, filesMain, 'to', details.url);

    if (filesIsolated.length) {
      chrome.scripting.executeScript({ target, files: filesIsolated, injectImmediately: true }, () => {
        const error = chrome.runtime.lastError;
        if (error) catchTabError(error, details.tabId);
      });
    }
    if (filesMain.length) {
      chrome.scripting.executeScript({ target, files: filesMain, world: 'MAIN', injectImmediately: true }, () => {
        const error = chrome.runtime.lastError;
        if (error) catchTabError(error, details.tabId);
      });
    }
  })();
};

// onCompleted -> main content scripts + per-rating world scripts
export const onCompleted = async (details) => {
  await state.init;
  const opened = state.openedProjects.get(details.tabId);
  if (!opened) return;

  if (details.frameId === 0) {
    if (isOAuth(details.url)) return;
    const project = await state.db.get('projects', opened.key);
    if (!project) {
      log('warn', '[inject] project not found for opened entry', opened);
      sendNotification('[inject]', 'Project data missing, aborting injection', 'error', 'openProject_' + opened.key, { context: { tabId: details.tabId, opened } });
      state.openedProjects.delete(details.tabId);
      await state.db.put('other', state.openedProjects, 'openedProjects');
      return;
    }

    if (opened.countInject >= 10) {
      const { endVote } = await import('./scheduler.js'); // lazy import to avoid cycles
      await endVote({ tooManyVoteAttempts: true }, { tab: { id: details.tabId }, url: details.url }, opened);
      return;
    }

    try {
      const ratingKey = (project.ratingMain || project.rating);
      // Prompt nick if needed
      if (allProjects[project.rating]?.needPrompt?.()) {
        const funcPrompt = function (nick) {
          window.prompt = new Proxy(window.prompt, {
            apply(target, thisArg, argArray) { return nick; }
          });
        };
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          world: 'MAIN',
          func: funcPrompt, args: [project.nick]
        });
      }

      // Main API + per-site script
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['scripts/main/hacktimer.js', `scripts/${ratingKey}.js`, 'scripts/main/api.js']
      });
      if (allProjects[project.rating]?.needWorld?.()) {
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          world: 'MAIN',
          files: [`scripts/${ratingKey}_world.js`]
        });
      }

      await chrome.tabs.sendMessage(details.tabId, { sendProject: true, project, settings: state.settings });
      if (state.openedProjects.has(details.tabId)) {
        opened.countInject = (opened.countInject || 0) + 1;
        await state.db.put('other', state.openedProjects, 'openedProjects');
      }
    } catch (error) {
      catchTabError(error, details.tabId);
    }
  } else if (isCaptchaFrame(details.url)) {
    const project = await state.db.get('projects', opened.key);
    if (!project) {
      log('warn', '[inject] project not found for captcha frame', opened);
      sendNotification('[inject]', 'Project data missing during captcha injection', 'error', 'openProject_' + opened.key, { context: { tabId: details.tabId, opened } });
      state.openedProjects.delete(details.tabId);
      await state.db.put('other', state.openedProjects, 'openedProjects');
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId, frameIds: [details.frameId] },
        files: ['scripts/main/hacktimer.js', 'scripts/main/audio_captcha.js', 'scripts/main/captchaclicker.js']
      });
      const tab = await chrome.tabs.get(details.tabId);
      if (tab.status == null || tab.status === 'complete') {
        await chrome.tabs.sendMessage(details.tab.id, { sendProject: true, project, settings: state.settings });
      }
    } catch (error) {
      catchTabError(error, details.tabId);
    }
  }
};

// onErrorOccurred for webNavigation
export const onNavError = async (details) => {
  await state.init;
  if (!state.openedProjects.has(details.tabId)) return;

  if (details.frameId === 0 || isCaptchaFrame(details.url)) {
    const opened = state.openedProjects.get(details.tabId);
    const e = details.error || '';
    if (IGNORABLE_NAV_ERRORS.some(s => e.includes(s))) return;
    const { endVote } = await import('./scheduler.js');
    await endVote({ errorVoteNetwork: [e, details.url] }, { tab: { id: details.tabId }, url: details.url }, opened);
  }
};

// Helpers
function isOAuth(url) {
  return /facebook\.com\/|accounts\.google\.com\/|google\.com\/|reddit\.com\/|twitter\.com\//.test(url);
}
export function isCaptchaFrame(url) {
  return /hcaptcha\.com\/captcha\/|google\.com\/recaptcha\/|recaptcha\.net\/recaptcha\/|challenges\.cloudflare\.com\//.test(url) ||
    url.includes('smartcaptcha.yandexcloud.net') || url.includes('service.mtcaptcha.com');
}
export const IGNORABLE_NAV_ERRORS = [
  'net::ERR_ABORTED', 'net::ERR_CONNECTION_RESET', 'net::ERR_NETWORK_CHANGED', 'net::ERR_CACHE_MISS', 'net::ERR_BLOCKED_BY_CLIENT', 'net::ERR_QUIC_PROTOCOL_ERROR',
  'NS_BINDING_ABORTED', 'NS_ERROR_NET_ON_RESOLVED', 'NS_ERROR_NET_ON_RESOLVING', 'NS_ERROR_NET_ON_WAITING_FOR', 'NS_ERROR_NET_ON_CONNECTING_TO', 'NS_ERROR_FAILURE', 'NS_ERROR_DOCSHELL_DYING', 'NS_ERROR_NET_ON_TRANSACTION_CLOSE'
];

async function catchTabError(error, tabId) {
  const opened = state.openedProjects.get(tabId);
  if (!opened) return;
  const project = await state.db.get('projects', opened.key);
  const msg = String(error?.message || error || '');
  if (!msg || [
    'The frame was removed.', 'The tab was closed.'
  ].some(x => msg.includes(x)) || msg.includes('No frame with id') || msg.includes('PrecompiledScript.executeInGlobal') ||
    msg.includes('Receiving end does not exist') || msg.includes('The message port closed before a response was received') ||
    /Frame with ID .* was removed/.test(msg)) {
    return;
  }
  if (msg.includes('ExtensionsSettings policy')) {
    sendNotification(getProjectPrefix(project, false), msg + ' https://github.com/Serega007RU/Auto-Vote-Rating/wiki/Problems-with-Opera', 'error', 'openProject_' + project.key, { errorMessage: msg, errorStack: error?.stack });
  } else {
    sendNotification(getProjectPrefix(project, false), msg, 'error', 'openProject_' + project.key, { errorMessage: msg, errorStack: error?.stack });
  }
  project.error = msg;
  await updateValue('projects', project);
}

// small helper (shared with scheduler)
async function updateValue(storeName, value) {
  const store = state.db.transaction(storeName, 'readwrite').store;
  const found = await store.count(value.key);
  if (found) {
    await store.put(value, value.key);
    chrome.runtime.sendMessage({ updateValue: storeName, value }).catch(() => { });
  }
}