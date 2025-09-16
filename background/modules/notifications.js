// background/modules/notifications.js
import { state, t } from './state.js';
import { log } from './logs.js';

export function sendNotification(title, message, type, notificationId='') {
  if (!message) message = '';
  if (state.settings?.disabledNotifStart && type === 'start') return;
  if (state.settings?.disabledNotifInfo && type === 'info') return;
  if (state.settings?.disabledNotifWarn && type === 'warn') return;
  if (state.settings?.disabledNotifError && type === 'error') return;

  // Also mirror to options UI via runtime message for consistency
  (async () => {
    try { await chrome.runtime.sendMessage({ notification: { title, message, type, notificationId } }); }
    catch (e) {
      const msg = e?.message || '';
      if (!msg.includes('Receiving end does not exist') && !msg.includes('The message port closed')) log('warn', '[notify relay]', msg);
    }
  })();

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title,
    message
  }, () => {});
}

export async function onNotificationClicked(notificationId) {
  await state.init;
  try {
    if (notificationId.startsWith('openTab_')) {
      const tabId = Number(notificationId.replace('openTab_', ''));
      if (!tabId) return;
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (tab) await chrome.windows.update(tab.windowId, { focused: true });
    } else if (notificationId.startsWith('openProject_')) {
      const projectKey = Number(notificationId.replace('openProject_', ''));
      const exists = await state.db.count('projects', projectKey);
      if (!exists) return;
      await chrome.runtime.openOptionsPage();
      await chrome.runtime.sendMessage({ openProject: projectKey }).catch(()=>{});
    } else if (notificationId.startsWith('openSettings')) {
      await chrome.runtime.openOptionsPage();
    }
  } catch (e) {
    const msg = e?.message || '';
    if (!msg.includes('No tab with id')) log('warn', '[notify click]', msg);
  }
}