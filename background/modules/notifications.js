// background/modules/notifications.js
import { state } from './state.js';
import { log } from './logs.js';

function sanitizeMetaValue(value) {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }
  if (value == null) return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeMetaValue);
  if (type === 'object') {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      try {
        const plain = {};
        for (const [k, v] of Object.entries(value)) { plain[k] = sanitizeMetaValue(v); }
        return plain;
      } catch (_) {
        return String(value);
      }
    }
  }
  try { return String(value); } catch (_) { return null; }
}

function normalizeNotificationType(value) {
  const type = (typeof value === 'string' ? value : '').toLowerCase().trim();
  switch (type) {
    case 'start':
    case 'started':
    case 'begin':
    case 'info':
    case 'information':
    case 'notice':
      return 'info';
    case 'success':
    case 'successful':
    case 'successfully':
    case 'ok':
    case 'done':
    case 'complete':
    case 'completed':
      return 'success';
    case 'warn':
    case 'warning':
    case 'alert':
    case 'caution':
      return 'warn';
    case 'error':
    case 'errors':
    case 'danger':
    case 'fail':
    case 'failed':
    case 'failure':
      return 'error';
    case 'hint':
      return 'hint';
    default:
      return 'hint';
  }
}
export function sendNotification(title, message, type, notificationId='', meta = null) {
  if (!message) message = '';
  const rawType = (typeof type === 'string' && type.trim()) ? type.trim() : 'info';
  const typeLower = rawType.toLowerCase();
  const isStartCategory = typeLower === 'start' || typeLower === 'started' || typeLower === 'begin';
  if (state.settings?.disabledNotifStart && isStartCategory) return;

  const normalizedType = normalizeNotificationType(typeLower);
  if (state.settings?.disabledNotifInfo) {
    const treatedAsInfo = normalizedType === 'info' && !isStartCategory;
    const treatedAsSuccess = normalizedType === 'success';
    if (treatedAsInfo || treatedAsSuccess) return;
  }
  if (state.settings?.disabledNotifWarn && normalizedType === 'warn') return;
  if (state.settings?.disabledNotifError && normalizedType === 'error') return;

  // Also mirror to options UI via runtime message for consistency
  const payload = { title, message, type: normalizedType, notificationId };
  if (normalizedType !== typeLower) payload.originalType = rawType;
  if (meta && typeof meta === 'object') {
    const safe = {};
    for (const [key, value] of Object.entries(meta)) {
      const targetKey = (key === 'title' || key === 'message' || key === 'type' || key === 'notificationId') ? `meta${key.charAt(0).toUpperCase()}${key.slice(1)}` : key;
      safe[targetKey] = sanitizeMetaValue(value);
    }
    Object.assign(payload, safe);
  }

  (async () => {
    try { await chrome.runtime.sendMessage({ notification: payload }); }
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
