/* eslint-env serviceworker */
// background/index.js (MV3 module service worker)

import { ensureState, state } from './modules/state.js';
import { registerAll, unregisterAll, onCommitted, onCompleted, onNavError } from './modules/injection.js';
import { onRuntimeMessage } from './modules/messages.js';
import { sendNotification, onNotificationClicked } from './modules/notifications.js';
import { checkVote, reloadAllAlarms } from './modules/scheduler.js';
import { log } from './modules/logs.js';

// Optional ESM preloads during install
self.addEventListener('install', (evt) => {
  evt.waitUntil((async () => {
    // Example: linkedom for DOMParser in SW (silentVote)
    try { await import(chrome.runtime.getURL('libs/linkedom.mjs')); } catch {}
    // Preload some silent-vote scripts (optional)
    const preload = [
      'mcserver-list.eu_silentvote.js',
      'misterlauncher.org_silentvote.js',
      'serverpact.com_silentvote.js',
      'genshindrop.com_silentvote.js'
    ];
    await Promise.allSettled(preload.map(f =>
      import(chrome.runtime.getURL(`scripts/${f}`)).catch(() => null)
    ));
  })());
});

await ensureState(); // initializeConfig + load live bindings

// Alarms/idle -> scheduler
chrome.alarms.onAlarm.addListener(() => {
  if (state.settings?.debug) log('info', 'chrome.alarms.onAlarm fired');
  checkVote();
});
chrome.idle.onStateChanged.addListener((st) => { if (st === 'active') checkVote(); });

// WebNavigation/WebRequest/tabs listeners
registerAll();
chrome.webNavigation.onCommitted.addListener(onCommitted);
chrome.webNavigation.onCompleted.addListener(onCompleted);
chrome.webNavigation.onErrorOccurred.addListener(onNavError);

// Runtime messages (async responses covered inside)
chrome.runtime.onMessage.addListener((req, snd, sendRsp) => {
  onRuntimeMessage(req, snd, sendRsp);
  if (req.projectDeleted || req.projectRestart) return true; // async
  return undefined;
});

// Notifications click
chrome.notifications.onClicked.addListener(onNotificationClicked);

// On installed/updated
chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureState();
  if (!state.settings.operaAttention2 && (navigator?.userAgentData?.brands?.[0]?.brand === 'Opera' || (!!self.opr && !!opr.addons) || !!self.opera || navigator.userAgent.indexOf(' OPR/') >= 0)) {
    chrome.runtime.openOptionsPage(); return;
  }
  if (details.reason === 'install') {
    await chrome.runtime.openOptionsPage();
    chrome.runtime.sendMessage({ installed: true }).catch(()=>{});
  } else if (details.reason === 'update') {
    checkVote();
  }
});

// Expose helper if you want to trigger checkVote from DevTools
self.__AVR_checkVote = checkVote;
self.__AVR_reloadAllAlarms = reloadAllAlarms;