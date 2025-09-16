// background/modules/logs.js
import { state } from './state.js';

export function log(type, ...args) {
  console[type === 'error' ? 'error' : type || 'log'](...args);
  try {
    if (!state.dbLogs) return;
    const time = new Date().toLocaleString().replace(',', '');
    const out = '[' + time + ' ' + String(type || 'log').toUpperCase() + ']: ' + args.map(a => a?.stack || (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    state.dbLogs.add('logs', out).catch(()=>{});
  } catch {}
}