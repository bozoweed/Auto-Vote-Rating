// js/options.js
// ESM entry for options.html
// Requires: libs/idb.umd.js (global), js/main.js, js/projects.js, js/utils/url.js
//
// This file provides:
// - i18n injection
// - Notifications and Modal managers
// - Settings UI handlers
// - Projects list (grouped by rating) with add/edit/delete/restart/stats
// - Import/export settings and logs
// - Permissions checks and "fast add" via URL params
//
// Note: This is a modernized, factorized version. It preserves the legacy API shape (allProjects).

import {
  initializeConfig,
  attachGlobalErrorHandlers,
  db as DB,
  dbLogs as DB_LOGS,
  settings as SETTINGS,
  generalStats as GENERAL_STATS,
  todayStats as TODAY_STATS,
  openedProjects as OPENED,
  onLine as ONLINE
} from './main.js';

import { allProjects } from './projects.js';
import { getDomainWithoutSubdomain, extractHostname } from './utils/url.js';

// Local state bindings (live via main.js exports)
let db, dbLogs, settings, generalStats, todayStats, openedProjects, onLine;

// -------------------- UI Services --------------------

class Timer {
  #timerId; #start; #remaining; #cb
  constructor(callback, delay) {
    this.#cb = callback;
    this.#remaining = delay;
    this.resume();
  }
  pause() { clearTimeout(this.#timerId); this.#remaining -= Date.now() - this.#start; }
  resume() { this.#start = Date.now(); clearTimeout(this.#timerId); this.#timerId = setTimeout(this.#cb, this.#remaining); }
}

class NotificationService {
  constructor(root = document.getElementById('notifBlock')) {
    this.root = root;
  }
  create(message, type = 'hint', { delay, element, onClick, dontLog } = {}) {
    if (!message) message = 'Empty error, see console for details';
    if (!delay) delay = type === 'error' ? 30000 : 5000;

    if (element != null) {
      element.textContent = '';
      if (typeof message[Symbol.iterator] === 'function' && typeof message === 'object') {
        for (const m of message) element.append(m);
      } else {
        element.textContent = message;
      }
      element.className = type;
      if (type === 'success') {
        element.parentElement?.parentElement?.parentElement?.firstElementChild?.setAttribute('src', 'images/icons/success.svg');
      }
      if (!dontLog && type === 'error') console.error('[error]', message);
      return;
    }

    const notif = document.createElement('div');
    notif.classList.add('notif', 'show', type);

    if (type !== 'hint') {
      const imgBlock = document.createElement('img');
      imgBlock.src = `images/notif/${type}.png`;
      notif.append(imgBlock);

      const progress = document.createElement('div');
      progress.classList.add('progress');
      const bar = document.createElement('div');
      bar.style.animation = `notif-progress ${delay / 1000}s linear`;
      progress.append(bar);
      notif.append(progress);
    }

    const mesBlock = document.createElement('div');
    if (typeof message[Symbol.iterator] === 'function' && typeof message === 'object') {
      for (const m of message) mesBlock.append(m);
    } else {
      mesBlock.append(message);
    }
    notif.append(mesBlock);

    this.root.append(notif);

    let timer;
    if (type !== 'hint') timer = new Timer(() => this.remove(notif), delay);

    notif.addEventListener('click', (e) => {
      if (notif.querySelector('a') || notif.querySelector('button') || onClick) {
        if (onClick) onClick();
        if (e.detail === 2) this.remove(notif);
      } else {
        this.remove(notif);
      }
    });
    notif.addEventListener('mouseover', () => {
      if (!notif.classList.contains('hint')) {
        timer.pause();
        notif.querySelector('.progress div').style.animationPlayState = 'paused';
      }
    });
    notif.addEventListener('mouseout', () => {
      if (!notif.classList.contains('hint')) {
        timer.resume();
        notif.querySelector('.progress div').style.animationPlayState = 'running';
      }
    });

    if (!dontLog && type === 'error') console.error('[error]', message);
  }
  remove(elem) {
    if (!elem) return;
    elem.classList.remove('show');
    elem.classList.add('hide');
    setTimeout(() => elem.classList.add('hidden'), 500);
    setTimeout(() => elem.remove(), 1000);
  }
}

class ModalManager {
  constructor(root = document.querySelector('#modals')) {
    this.root = root;
    this.overlay = root?.querySelector('.overlay');
    this.bind();
  }
  bind() {
    this.root?.querySelectorAll('.modal .close')?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (!modal) return;
        if (modal.id === 'addFastProject') location.href = 'options.html';
        this.toggle(modal.id);
      });
    });
    this.overlay?.addEventListener('click', () => {
      const activeModal = this.root.querySelector('.modal.active');
      if (!activeModal) return;
      if (activeModal.id === 'stats' || activeModal.id === 'statsToday') {
        activeModal.querySelector('.close')?.click();
        return;
      }
      activeModal.style.transform = 'scale(1.1)';
      setTimeout(() => activeModal.removeAttribute('style'), 100);
    });
  }
  toggle(modalID) {
    const modal = this.root.querySelector('#' + modalID);
    if (!modal) return;
    if (this.overlay.classList.contains('active')) {
      this.overlay.style.transition = '.3s';
      modal.style.transition = '.3s';
      setTimeout(() => {
        this.overlay.removeAttribute('style');
        modal.removeAttribute('style');
      }, 300);
    }
    this.overlay.classList.toggle('active');
    modal.classList.toggle('active');
  }
}

// Global services
const notif = new NotificationService(document.getElementById('notifBlock'));
const modals = new ModalManager();

// Expose legacy function name for main.js error handler compatibility
self.createNotif = (...args) => notif.create(...args);

// -------------------- Helpers --------------------

function i18nInject() {
  document.querySelectorAll('[data-resource]').forEach((el) => {
    el.prepend(chrome.i18n.getMessage(el.getAttribute('data-resource')));
  });
  document.querySelectorAll('[placeholder]').forEach((el) => {
    const msg = chrome.i18n.getMessage(el.placeholder);
    if (msg) el.placeholder = msg;
  });
  const nick = document.getElementById('nick');
  if (nick) nick.setAttribute('placeholder', chrome.i18n.getMessage('enterNick'));
  const loadDiv = document.querySelector('#load div');
  if (loadDiv) loadDiv.textContent = chrome.i18n.getMessage('load');
}

async function usageSpace() {
  try {
    const quota = await navigator.storage.estimate();
    let v = quota.usage, unit;
    if (v < 1e3) unit = 'genericBytes';
    else if (v < 1e6) { v /= 1e3; unit = 'KB'; }
    else if (v < 1e9) { v /= 1e6; unit = 'MB'; }
    else { v /= 1e9; unit = 'GB'; }
    document.getElementById('storageUsed').textContent = chrome.i18n.getMessage('storageUsed', [v.toFixed(1), unit]);
  } catch (e) {
    console.warn('storage.estimate failed:', e);
  }
}

function highlight(element) {
  if (!element) return;
  if (element.classList.contains('highlight')) return;
  element.classList.add('highlight');
  element.addEventListener('animationend', () => element.classList.remove('highlight'), { once: true });
  element.addEventListener('animationcancel', () => element.classList.remove('highlight'), { once: true });
}

function toggleModal(id) { modals.toggle(id); }

// -------------------- Projects UI --------------------

function generateDataList() {
  const datalist = document.getElementById('ratingList');
  if (!datalist) return;
  datalist.replaceChildren();
  for (const rating of Object.keys(allProjects)) {
    const option = document.createElement('option');
    option.setAttribute('name', rating);
    option.value = rating;
    if (rating === 'Custom') {
      option.disabled = !settings.enableCustom;
      option.textContent = chrome.i18n.getMessage('Custom');
    }
    datalist.append(option);
  }
}

async function reloadProjectList() {
  const buttonBlock = document.querySelector('.projectsBlock .buttonBlock');
  const contentBlock = document.querySelector('.projectsBlock .contentBlock');
  buttonBlock.replaceChildren();
  contentBlock.replaceChildren();

  const index = db.transaction('projects').store.index('rating');
  for (const item of Object.keys(allProjects)) {
    const count = await index.count(item);
    if (count > 0) {
      generateBtnListRating(item, count);
      if (item === 'Custom' && !settings.enableCustom) {
        settings.enableCustom = true;
        await db.put('other', settings, 'settings');
        chrome.runtime.sendMessage('reloadSettings');
      }
    }
  }
  document.getElementById('notAddedAll').textContent =
    buttonBlock.childElementCount > 0 ? '' : chrome.i18n.getMessage('notAddedAll');
}

function generateBtnListRating(rating, count) {
  const button = document.createElement('button');
  button.setAttribute('class', 'selectsite');
  button.setAttribute('data-rating-button', rating);
  button.style.order = String(Object.keys(allProjects).indexOf(rating));
  button.textContent = rating;

  const span = document.createElement('span');
  span.textContent = count;
  button.append(span);
  document.querySelector('.buttonBlock').append(button);
  button.addEventListener('click', (event) => listSelect(event, rating));

  const ul = document.createElement('ul');
  ul.setAttribute('data-rating-tab', rating);
  ul.classList.add('listcontent');
  ul.style.display = 'none';

  // Captcha tip (if required)
  if (!(allProjects[rating].notRequiredCaptcha?.())) {
    const label = document.createElement('label');
    label.setAttribute('data-resource', 'passageCaptcha');
    label.textContent = chrome.i18n.getMessage('passageCaptcha');
    label.style.color = '#f1af4c';
    const link = document.createElement('a');
    link.classList.add('link');
    link.target = 'blank_';
    link.href = 'https://github.com/Serega007RU/Auto-Vote-Rating/wiki/Guide-how-to-automate-the-passage-of-captcha-(reCAPTCHA-and-hCaptcha)';
    link.textContent = chrome.i18n.getMessage('here');
    link.setAttribute('data-resource', 'here');
    label.append(link);
    ul.append(label);
  }

  const div2 = document.createElement('div');
  div2.setAttribute('data-rating-list', rating);
  ul.append(div2);

  const delAll = document.createElement('button');
  delAll.className = 'submitBtn redBtn';
  delAll.textContent = chrome.i18n.getMessage('deleteAll');
  delAll.addEventListener('click', async () => {
    if (confirm(chrome.i18n.getMessage('deleteAllRating'))) {
      let cursor = await db.transaction('projects', 'readwrite').store.index('rating').openCursor(rating);
      while (cursor) {
        await cursor.delete();
        chrome.alarms.clear(String(cursor.primaryKey));
        cursor = await cursor.continue();
      }
      document.querySelector(`[data-rating-tab="${rating}"]`).remove();
      document.querySelector(`[data-rating-button="${rating}"]`).remove();
      if (document.querySelector('.buttonBlock').childElementCount <= 0) {
        document.getElementById('notAddedAll').textContent = chrome.i18n.getMessage('notAddedAll');
      }
      usageSpace();
    }
  });
  ul.append(delAll);

  document.querySelector('div.projectsBlock > div.contentBlock').append(ul);
  if (document.querySelector('.buttonBlock').childElementCount > 0) {
    document.getElementById('notAddedAll').textContent = '';
  }
}

async function listSelect(event, tabs) {
  // Hide all lists
  let listcontent = document.getElementsByClassName('listcontent');
  for (let x = 0; x < listcontent.length; x++) listcontent[x].style.display = 'none';

  // Buttons
  let selectsite = document.getElementsByClassName('selectsite');
  for (let x = 0; x < selectsite.length; x++)
    selectsite[x].className = selectsite[x].className.replace(' activeList', '');

  document.querySelector(`[data-rating-tab="${tabs}"]`).style.display = 'block';
  event.currentTarget.className += ' activeList';

  const list = document.querySelector(`[data-rating-list="${tabs}"]`);
  if (list.childElementCount === 0) {
    const div = document.createElement('div');
    div.setAttribute('data-resource', 'load');
    div.textContent = chrome.i18n.getMessage('load');
    list.append(div);

    // Read everything first, then render
    const tx = db.transaction(['projects', 'other']);
    openedProjects = await tx.objectStore('other').get('openedProjects') || new Map();

    const idx = tx.objectStore('projects').index('rating');
    const projects = await idx.getAll(tabs); // preload all items for this rating
    // Ensure the tx finishes cleanly (idb adds .done)
    if (tx.done) await tx.done;

    // Now render outside the transaction
    for (const project of projects) {
      await addProjectList(project);
    }

    div.remove();
  }
}

async function addProjectList(project, preBend) {
  // Ensure rating button/list exist
  if (!document.querySelector(`[data-rating-button="${project.rating}"]`)) {
    generateBtnListRating(project.rating, 0);
  }
  if (!document.querySelector(`[data-rating-tab="${project.rating}"]`)) {
    generateBtnListRating(project.rating, 0);
  }

  const listProject = document.querySelector(`[data-rating-list="${project.rating}"]`);
  if (!listProject) return;

  // If already rendered, just update/move it (no duplicates)
  let existing = document.getElementById('projects' + project.key);
  if (existing) {
    // If it’s under a different list (rating changed), move it
    if (existing.parentElement !== listProject) {
      listProject.appendChild(existing);
    }
    await updateProjectText(project);
    if (preBend) listProject.prepend(existing);
    return;
  }

  if (!project.key) {
    // add if missing key (should not happen here normally)
    const store = db.transaction('projects', 'readwrite').store;
    project.key = await store.put(project);
    await store.put(project, project.key);
    usageSpace();
  }

  // If the list is hidden and empty, don’t render yet (user hasn’t opened the tab)
  if (listProject.childElementCount === 0 && listProject.parentElement.style.display === 'none') return;

  const li = document.createElement('li');
  li.id = 'projects' + project.key;

  // Message block (left)
  const contDiv = document.createElement('div');
  contDiv.classList.add('message');
  const nameProjectMes = document.createElement('div'); // will be set by updateProjectText
  contDiv.append(nameProjectMes);
  const errorDiv = document.createElement('div'); errorDiv.classList.add('error'); contDiv.append(errorDiv);
  const warnDiv = document.createElement('div'); warnDiv.classList.add('warn'); contDiv.append(warnDiv);
  const nextVoteMes = document.createElement('div'); nextVoteMes.classList.add('textNextVote'); contDiv.append(nextVoteMes);
  li.append(contDiv);

  // Control items (right)
  const div = document.createElement('div'); div.classList.add('controlItems');

  // Restart
  const restartBtn = document.createElement('div');
  const restartSvg = document.createElement('img');
  const restartTip = document.createElement('span');
  restartTip.classList.add('tooltiptext');
  restartTip.textContent = chrome.i18n.getMessage('restart');
  restartBtn.classList.add('projectStats');
  restartSvg.src = 'images/icons/restart.svg';
  restartBtn.appendChild(restartSvg);
  restartBtn.appendChild(restartTip);
  div.appendChild(restartBtn);

  // Stats
  const statsBtn = document.createElement('div');
  const statsSvg = document.createElement('img');
  const statsTip = document.createElement('span');
  statsTip.classList.add('tooltiptext');
  statsTip.textContent = chrome.i18n.getMessage('stats2');
  statsBtn.classList.add('projectStats');
  statsSvg.src = 'images/icons/stats.svg';
  statsBtn.appendChild(statsSvg);
  statsBtn.appendChild(statsTip);
  div.appendChild(statsBtn);

  // Delete
  const delBtn = document.createElement('div');
  const delSvg = document.createElement('img');
  const delTip = document.createElement('span');
  delTip.classList.add('tooltiptext');
  delTip.textContent = chrome.i18n.getMessage('deleteButton');
  delBtn.classList.add('projectStats');
  delSvg.src = 'images/icons/delete.svg';
  delBtn.appendChild(delSvg);
  delBtn.appendChild(delTip);
  div.appendChild(delBtn);

  // Edit (Expert mode)
  let editBtn;
  if (settings.expertMode) {
    editBtn = document.createElement('div');
    const eSvg = document.createElement('img');
    const eTip = document.createElement('span');
    eTip.classList.add('tooltiptext');
    eTip.textContent = chrome.i18n.getMessage('edit');
    editBtn.classList.add('projectStats');
    eSvg.src = 'images/icons/edit.svg';
    editBtn.appendChild(eSvg);
    editBtn.appendChild(eTip);
    div.appendChild(editBtn);
  }

  li.append(div);
  if (preBend) listProject.prepend(li);
  else listProject.append(li);

  await updateProjectText(project);

  // Listeners
  delBtn.addEventListener('click', async (event) => {
    if (event.target.disabled) return;
    event.target.disabled = true;
    const ok = await removeProjectList(project, false, event);
    event.target.disabled = false;
    if (ok) usageSpace();
  });

  restartBtn.addEventListener('click', async (event) => {
    if (event.target.disabled) return;
    event.target.disabled = true;
    let timer = setTimeout(() => lagServiceWorker(event), 5000);
    try {
      const fresh = await db.get('projects', project.key);
      let message = await chrome.runtime.sendMessage({ projectRestart: fresh });
      if (message === 'confirmNow' || message === 'confirmQueue') {
        clearTimeout(timer);
        if (confirm(chrome.i18n.getMessage(message))) {
          timer = setTimeout(() => lagServiceWorker(event), 5000);
          await chrome.runtime.sendMessage({ projectRestart: fresh, confirmed: true });
        } else {
          return;
        }
      }
      notif.create(chrome.i18n.getMessage('restarted'), 'success');
    } catch (e) {
      notif.create(e, 'error');
    } finally {
      clearTimeout(timer);
      event.target.disabled = false;
    }
  });

  statsBtn.addEventListener('click', () => updateModalStats(project, true));

  if (settings.expertMode && editBtn) {
    editBtn.addEventListener('click', async () => {
      const fresh = await db.get('projects', project.key);
      editProject(fresh, true);
    });
  }
}

async function removeProjectList(project, editing) {
  if (!editing && editingProject?.key === project.key) resetEdit();

  const li = document.getElementById('projects' + project.key);
  if (li != null) {
    let timer = setTimeout(() => lagServiceWorker({ target: null }), 5000);
    try {
      const message = await chrome.runtime.sendMessage({ projectDeleted: project });
      if (message === 'reject') {
        notif.create(chrome.i18n.getMessage('rejectDelete'), 'error');
        return false;
      }
    } catch (e) {
      notif.create(e, 'error');
      return false;
    } finally {
      clearTimeout(timer);
    }

    if (!editing) {
      const badge = document.querySelector(`[data-rating-button="${project.rating}"] > span`);
      const count = Number(badge.textContent) - 1;
      if (count <= 0) {
        document.querySelector(`[data-rating-tab="${project.rating}"]`).remove();
        document.querySelector(`[data-rating-button="${project.rating}"]`).remove();
        if (document.querySelector('.buttonBlock').childElementCount <= 0) {
          document.getElementById('notAddedAll').textContent = chrome.i18n.getMessage('notAddedAll');
        }
      } else {
        li.remove();
        badge.textContent = String(count);
      }
    } else {
      li.remove();
    }
  }
  return true;
}

async function updateProjectText(project) {
  const el = document.getElementById('projects' + project.key);
  if (!el) return;

  let whenText = chrome.i18n.getMessage('soon');
  if (!(project.time == null || project.time === '') && Date.now() < project.time) {
    whenText = new Date(project.time).toLocaleString().replace(',', '');
  } else {
    openedProjects = await db.get('other', 'openedProjects') || new Map();
    for (const value of openedProjects.values()) {
      if (project.rating === value.rating) {
        whenText = chrome.i18n.getMessage('inQueue');
        if (project.key === value.key) {
          whenText = chrome.i18n.getMessage('now');
          break;
        }
      }
    }
  }

  let textProject = '';
  if (project.nick) textProject += ' – ' + project.nick;
  if (project.game) textProject += ' – ' + project.game;
  if (project.id) textProject += ' – ' + project.id;
  if (project.name) textProject += ' – ' + project.name;
  if (textProject === '') textProject = project.rating;
  else textProject = textProject.replace(' – ', '');
  if (project.priority) textProject += ' (' + chrome.i18n.getMessage('inPriority') + ')';
  if (project.randomize) textProject += ' (' + chrome.i18n.getMessage('inRandomize') + ')';
  if (project.rating !== 'Custom' && (project.timeout != null || project.timeoutHour != null))
    textProject += ' (' + chrome.i18n.getMessage('customTimeOut2') + ')';
  if (project.lastDayMonth) textProject += ' (' + chrome.i18n.getMessage('lastDayMonth2') + ')';
  if (project.silentMode) textProject += ' (' + chrome.i18n.getMessage('enabledSilentVoteSilent') + ')';
  if (project.emulateMode) textProject += ' (' + chrome.i18n.getMessage('enabledSilentVoteNoSilent') + ')';

  el.querySelector('div > div').textContent = textProject;
  el.querySelector('.textNextVote').textContent = chrome.i18n.getMessage('nextVote') + ' ' + whenText;

  const errorElement = el.querySelector('.error'); errorElement.textContent = '';
  const warnElement = el.querySelector('.warn'); warnElement.textContent = '';

  // permissions helper icon if "Cannot access contents of the page"
  const controlItems = el.querySelector('.controlItems');
  const existingAccess = controlItems.querySelector('img.access')?.parentElement;

  if (project.error) {
    conventPlainTextToLinks(project.error, errorElement);
    if (project.error.includes('Cannot access contents of the page')) {
      if (!existingAccess) {
        const img = document.createElement('div');
        const imgsvg = document.createElement('img');
        const imgtext = document.createElement('span');
        imgtext.classList.add('tooltiptext');
        imgtext.textContent = chrome.i18n.getMessage('access');
        img.classList.add('projectStats');
        imgsvg.src = 'images/icons/access.svg';
        imgsvg.classList.add('access');
        img.appendChild(imgsvg);
        img.appendChild(imgtext);
        controlItems.prepend(img);
        img.addEventListener('click', async () => {
          if (await checkPermissions([project])) {
            delete project.error;
            await chrome.runtime.sendMessage({ projectRestart: project, confirmed: true });
            notif.create(chrome.i18n.getMessage('restarted'), 'success');
          }
        });
      }
    } else if (existingAccess) existingAccess.remove();
  } else if (existingAccess) existingAccess.remove();

  if (project.warn) conventPlainTextToLinks(project.warn, warnElement);

  // If stats modal open for that project, update it
  updateModalStats(project);
  const el2 = document.getElementById('edit' + project.key);
  if (el2) editProject(project);
}

function conventPlainTextToLinks(text, element) {
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#()?&//=]*)/igm;
  if (text?.match && text.match(urlRegex)) {
    const tokens = text.match(/(?:http(s)?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b(?:[-a-zA-Z0-9@:%_\+.~#?&//=]*)|\s*\S+\s*/g);
    for (const t of tokens) {
      if (t.match(urlRegex)) {
        const link = document.createElement('a');
        link.classList.add('link'); link.target = 'blank_'; link.href = t;
        link.textContent = t.length > 64 ? t.substring(0, 64) + '...' : t;
        element.append(link);
      } else {
        element.append(t);
      }
    }
  } else {
    element.textContent = text ?? '';
  }
}

// -------------------- Stats Modals --------------------

async function updateModalStats(project, toggle) {
  if (toggle) {
    toggleModal('stats');
    project = await db.get('projects', project.key);
  } else {
    if (!document.getElementById('stats').classList.contains('active') || document.getElementById('stats' + project.key) == null) return;
  }
  let text = project.rating;
  if (project.nick) text += ' – ' + project.nick;
  if (project.game) text += ' – ' + project.game;
  if (project.name) text += ' – ' + project.name;
  else if (project.id) text += ' – ' + project.id;

  document.querySelector('.statsSubtitle').textContent = text;
  document.querySelector('.statsSubtitle').id = 'stats' + project.key;

  // Stats
  document.querySelector('td[data-resource="statsSuccessVotes"]').nextElementSibling.textContent = project.stats.successVotes;
  document.querySelector('td[data-resource="statsMonthSuccessVotes"]').nextElementSibling.textContent = project.stats.monthSuccessVotes;
  document.querySelector('td[data-resource="statsLastMonthSuccessVotes"]').nextElementSibling.textContent = project.stats.lastMonthSuccessVotes;
  document.querySelector('td[data-resource="statsErrorVotes"]').nextElementSibling.textContent = project.stats.errorVotes;
  document.querySelector('td[data-resource="statsLaterVotes"]').nextElementSibling.textContent = project.stats.laterVotes;
  document.querySelector('td[data-resource="statsLastSuccessVote"]').nextElementSibling.textContent =
    project.stats.lastSuccessVote ? new Date(project.stats.lastSuccessVote).toLocaleString().replace(',', '') : 'None';
  document.querySelector('td[data-resource="statsLastAttemptVote"]').nextElementSibling.textContent =
    project.stats.lastAttemptVote ? new Date(project.stats.lastAttemptVote).toLocaleString().replace(',', '') : 'None';
  document.querySelector('td[data-resource="statsAdded"]').nextElementSibling.textContent =
    project.stats.added ? new Date(project.stats.added).toLocaleString().replace(',', '') : 'None';
}

function resetModalStats() {
  if (document.querySelector('td[data-resource="statsSuccessVotes"]').nextElementSibling.textContent !== '') {
    document.querySelector('.statsSubtitle').firstChild?.remove?.();
    document.querySelector('.statsSubtitle').append('\u00A0');
    document.querySelector('.statsSubtitle').removeAttribute('id');
    document.querySelector('td[data-resource="statsSuccessVotes"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsMonthSuccessVotes"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsLastMonthSuccessVotes"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsErrorVotes"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsLaterVotes"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsLastSuccessVote"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsLastAttemptVote"]').nextElementSibling.textContent = '';
    document.querySelector('td[data-resource="statsAdded"]').textContent = chrome.i18n.getMessage('statsAdded');
    document.querySelector('td[data-resource="statsAdded"]').nextElementSibling.textContent = '';
  }
}

// -------------------- Settings / Forms --------------------

function wireSettingsCheckboxes() {
  for (const check of document.querySelectorAll('input[name=checkbox]')) {
    check.addEventListener('change', async function (event) {
      event.target.disabled = true;

      // map ids to settings fields
      const id = this.id;
      if (id === 'disabledNotifStart') settings.disabledNotifStart = this.checked;
      else if (id === 'disabledNotifInfo') settings.disabledNotifInfo = this.checked;
      else if (id === 'disabledNotifWarn') settings.disabledNotifWarn = this.checked;
      else if (id === 'disabledNotifError') {
        if (this.checked && confirm(chrome.i18n.getMessage('confirmDisableErrors'))) {
          settings.disabledNotifError = this.checked;
        } else if (this.checked) {
          this.checked = false; event.target.disabled = false; return;
        } else { settings.disabledNotifError = this.checked; }
      } else if (id === 'disabledCheckInternet') settings.disabledCheckInternet = this.checked;
      else if (id === 'disabledOneVote') settings.disabledOneVote = this.checked;
      else if (id === 'disabledRestartOnTimeout') settings.disabledRestartOnTimeout = this.checked;
      else if (id === 'disabledFocusedTab') settings.disabledFocusedTab = this.checked;
      else if (id === 'disabledWarnCaptcha') settings.disabledWarnCaptcha = this.checked;
      else if (id === 'disabledClickCaptcha') settings.disabledClickCaptcha = this.checked;
      else if (id === 'disabledDebug') settings.debug = this.checked;
      else if (id === 'disableCloseTabsOnSuccess') settings.disableCloseTabsOnSuccess = this.checked;
      else if (id === 'disableCloseTabsOnError') settings.disableCloseTabsOnError = this.checked;
      else if (id === 'expertMode') {
        settings.expertMode = this.checked;
        if (this.checked) {
          document.getElementById('timeout').parentElement.removeAttribute('style');
          document.getElementById('timeoutError').parentElement.removeAttribute('style');
          document.getElementById('timeoutVote').parentElement.removeAttribute('style');
          document.getElementById('disabledOneVote').parentElement.removeAttribute('style');
          document.getElementById('disabledDebug').parentElement.removeAttribute('style');
          document.getElementById('disableCloseTabsOnSuccess').parentElement.removeAttribute('style');
          document.getElementById('disableCloseTabsOnError').parentElement.removeAttribute('style');
          document.getElementById('addProject').classList.add('addProjectExpert');
          document.getElementById('addProject').classList.remove('addProjectExpertManual');
          document.getElementById('advSettingsAdd').removeAttribute('style');
          document.getElementById('emptyDiv')?.remove();
        } else {
          document.getElementById('timeout').parentElement.style.display = 'none';
          document.getElementById('timeoutError').parentElement.style.display = 'none';
          document.getElementById('timeoutVote').parentElement.style.display = 'none';
          document.getElementById('disabledOneVote').parentElement.style.display = 'none';
          document.getElementById('disabledDebug').parentElement.style.display = 'none';
          document.getElementById('disableCloseTabsOnSuccess').parentElement.style.display = 'none';
          document.getElementById('disableCloseTabsOnError').parentElement.style.display = 'none';
          document.getElementById('addProject').classList.add('addProjectExpertManual');
          document.getElementById('addProject').classList.remove('addProjectExpert');
          document.getElementById('advSettingsAdd').style.display = 'none';
          document.getElementById('advSettingsAdd').querySelectorAll('input[type="checkbox"]').forEach(el => {
            el.checked = false; el.dispatchEvent(new Event('change'));
          });
          if (!document.getElementById('emptyDiv')) {
            const div = document.createElement('div'); div.id = 'emptyDiv';
            document.getElementById('addProject').prepend(div);
          }
        }
        // Reload buttons ordering for expert switch
        reloadProjectList();
      } else {
        // Unknown setting id; ignore
      }

      await db.put('other', settings, 'settings');
      chrome.runtime.sendMessage('reloadSettings');
      usageSpace();
      event.target.disabled = false;
    });
  }
}

function wireTimeoutForms() {
  document.getElementById('timeout')?.addEventListener('submit', async (event) => {
    event.preventDefault(); event.submitter.disabled = true;
    settings.timeout = document.getElementById('timeoutValue').valueAsNumber;
    await db.put('other', settings, 'settings');
    notif.create(chrome.i18n.getMessage('successSave'), 'success');
    chrome.runtime.sendMessage('reloadSettings');
    event.submitter.disabled = false;
  });

  document.getElementById('timeoutError')?.addEventListener('submit', async (event) => {
    event.preventDefault(); event.submitter.disabled = true;
    settings.timeoutError = document.getElementById('timeoutErrorValue').valueAsNumber;
    await db.put('other', settings, 'settings');
    notif.create(chrome.i18n.getMessage('successSave'), 'success');
    chrome.runtime.sendMessage('reloadSettings');
    event.submitter.disabled = false;
  });

  document.getElementById('timeoutVote')?.addEventListener('submit', async (event) => {
    event.preventDefault(); event.submitter.disabled = true;
    settings.timeoutVote = document.getElementById('timeoutVoteValue').valueAsNumber;
    await db.put('other', settings, 'settings');
    notif.create(chrome.i18n.getMessage('successSave'), 'success');
    chrome.runtime.sendMessage('reloadSettings');
    event.submitter.disabled = false;
  });
}

// -------------------- Import / Export --------------------

function wireImportExport() {
  // Export settings
  document.getElementById('file-download')?.addEventListener('click', async () => {
    try {
      notif.create(chrome.i18n.getMessage('exporting'), 'hint');
      generalStats = await db.get('other', 'generalStats');
      todayStats = await db.get('other', 'todayStats');
      const allSetting = { settings, generalStats, todayStats, version: db.version };
      allSetting.projects = await db.getAll('projects');
      const text = JSON.stringify(allSetting, null, '\t');
      const blob = new Blob([text], { type: 'text/json;charset=UTF-8;' });
      const anchor = document.createElement('a');
      anchor.download = 'AVR.json';
      anchor.href = (window.webkitURL || window.URL).createObjectURL(blob);
      anchor.dataset.downloadurl = ['text/json;charset=UTF-8;', anchor.download, anchor.href].join(':');
      anchor.click();
      notif.create(chrome.i18n.getMessage('exportingEnd'), 'success');
    } catch (e) {
      notif.create(e, 'error');
    }
  });

  // Export logs
  document.getElementById('logs-download')?.addEventListener('click', async () => {
    try {
      notif.create(chrome.i18n.getMessage('exporting'), 'hint');
      const logs = await dbLogs.getAll('logs');
      let text = '';
      for (const log of logs) text += log + '\n';
      const blob = new Blob([text], { type: 'text/plain;charset=UTF-8;' });
      const anchor = document.createElement('a');
      anchor.download = 'console_history.txt';
      anchor.href = (window.webkitURL || window.URL).createObjectURL(blob);
      anchor.dataset.downloadurl = ['text/plain;charset=UTF-8;', anchor.download, anchor.href].join(':');
      anchor.click();
      notif.create(chrome.i18n.getMessage('exportingEnd'), 'success');
    } catch (e) {
      notif.create(e, 'error');
    }
  });

  // Clear logs
  document.getElementById('logs-clear')?.addEventListener('click', async () => {
    notif.create(chrome.i18n.getMessage('clearingLogs'), 'hint');
    await dbLogs.clear('logs');
    usageSpace();
    notif.create(chrome.i18n.getMessage('clearedLogs'), 'success');
  });

  // Import settings
  document.getElementById('file-upload')?.addEventListener('change', async (event) => {
    notif.create(chrome.i18n.getMessage('importing'), 'hint');
    try {
      if (event.target.files.length === 0) return;
      const [file] = event.target.files;
      const data = await new Response(file).json();
      const projects = data.projects;

      const transaction = db.transaction(['projects', 'other'], 'readwrite');
      await transaction.objectStore('projects').clear();
      let key = 0;
      for (const project of projects) {
        if (project.key == null) { key++; project.key = key; }
        await transaction.objectStore('projects').add(project, project.key);
      }
      await transaction.objectStore('other').put(data.settings, 'settings');
      await transaction.objectStore('other').put(data.generalStats, 'generalStats');
      await transaction.objectStore('other').put(data.todayStats, 'todayStats');

      // Refresh local
      settings = data.settings;
      generalStats = data.generalStats;
      todayStats = data.todayStats;

      // Run upgrade for safety
      await (await transaction.done); // ensure tx done before open new operations
      // Reload permissions
      if (!await checkPermissions(await db.getAll('projects'))) {
        await db.clear('projects');
        chrome.runtime.sendMessage('reloadAllSettings');
        await restoreOptions();
        return;
      }

      chrome.runtime.sendMessage('reloadAllSettings');
      await restoreOptions();
      notif.create(chrome.i18n.getMessage('importingEnd'), 'success');
    } catch (error) {
      notif.create(error, 'error');
    } finally {
      event.target.value = '';
    }
  }, false);
}

// -------------------- Permissions --------------------

async function checkPermissions(projects, element) {
  const origins = [];
  const permissions = [];
  for (const project of projects) {
    const funcProject = allProjects[project.rating];
    const url = funcProject.pageURL(project);
    const domain = getDomainWithoutSubdomain(url);
    const originPattern = '*://*.' + domain + '/*';
    if (!origins.includes(originPattern)) origins.push(originPattern);

    if (!funcProject.notRequiredCaptcha?.(project)) {
      for (const origin of chrome.runtime.getManifest().host_permissions) {
        if (!origins.includes(origin)) origins.push(origin);
      }
    }
    if (funcProject.needAdditionalOrigins) {
      for (const origin of funcProject.needAdditionalOrigins(project) || []) {
        if (!origins.includes(origin)) origins.push(origin);
      }
    }
    if (funcProject.needAdditionalPermissions) {
      for (const perm of funcProject.needAdditionalPermissions(project) || []) {
        if (!permissions.includes(perm)) permissions.push(perm);
      }
    }
  }

  let granted = await chrome.permissions.contains({ origins, permissions });
  if (!granted) {
    if (element == null) {
      try {
        granted = await chrome.permissions.request({ origins, permissions });
        if (!granted) {
          notif.create(chrome.i18n.getMessage('notGrantUrl'), 'error', { element });
          return false;
        } else {
          return true;
        }
      } catch (error) {
        if (!error.message?.includes?.('must be called during a user gesture') &&
          !error.message?.includes?.('may only be called from a user input handler')) {
          notif.create(error, 'error', { element });
          return false;
        }
      }
    }
    // UI button flow
    document.getElementById('submitAddProject').disabled = false;
    const button = document.createElement('button');
    button.textContent = chrome.i18n.getMessage('grant');
    button.classList.add('submitBtn');
    notif.create([chrome.i18n.getMessage('grantUrl'), button], 'hint', { element });
    granted = await new Promise(resolve => {
      button.addEventListener('click', async () => {
        try {
          granted = await chrome.permissions.request({ origins, permissions });
        } catch (error) {
          notif.create(error, 'error', { element });
          resolve(false);
          return;
        }
        if (element == null) notif.remove(button.parentElement.parentElement);
        if (!granted) {
          notif.create(chrome.i18n.getMessage('notGrantUrl'), 'error', { element });
          resolve(false);
        } else {
          if (element != null) notif.create(chrome.i18n.getMessage('granted'), 'success', { element });
          resolve(true);
        }
      });
    });
    return granted;
  }
  if (element != null) notif.create(chrome.i18n.getMessage('granted'), 'success', { element });
  return true;
}

// -------------------- Add / Edit Project --------------------

let editingProject = null;

function resetEdit(project) {
  editingProject = null;
  document.getElementById('lastDayMonth').checked = false;
  document.getElementById('customTimeOut').checked = false;
  document.getElementById('scheduleTimeCheckbox').checked = false;
  document.getElementById('priority').checked = false;
  document.getElementById('randomize').checked = false;
  document.getElementById('voteMode').checked = false;

  // trigger show/hide
  document.getElementById('lastDayMonth').dispatchEvent(new Event('change'));
  document.getElementById('customTimeOut').dispatchEvent(new Event('change'));
  document.getElementById('scheduleTimeCheckbox').dispatchEvent(new Event('change'));
  document.getElementById('randomize').dispatchEvent(new Event('change'));
  document.getElementById('voteMode').dispatchEvent(new Event('change'));

  // UI labels
  document.getElementById('rating').value = '';
  document.getElementById('rating').dispatchEvent(new Event('input'));
  document.querySelector('#addTab img').src = 'images/icons/addBtn.svg';
  document.querySelector('#addTab div').textContent = chrome.i18n.getMessage('addButton');
  document.querySelector('[data-resource="addTitle"]').textContent = chrome.i18n.getMessage('addTitle');
  document.querySelector('.editSubtitle').removeAttribute('id');
  document.querySelector('.editSubtitle').textContent = '';
  document.querySelector('.editSubtitle').style.display = 'none';
  document.getElementById('submitAddProject').removeAttribute('style');
  document.getElementById('submitEditProject').parentElement.style.display = 'none';
  document.getElementById('switchAddMode').disabled = false;
  document.getElementById('switchAddMode').checked = false;
  document.getElementById('switchAddMode').dispatchEvent(new Event('change'));
  document.getElementById('disableCheckProjects').disabled = false;
  document.getElementById('rating').disabled = false;

  if (project) {
    document.getElementById('addedTab').click();
    document.querySelector(`[data-rating-button="${project.rating}"]`)?.click();
    document.getElementById('projects' + project.key)?.scrollIntoView({ block: 'center' });
    highlight(document.getElementById('projects' + project.key));
  }
}

function editProject(project, switchToEdit) {
  resetEdit();
  editingProject = project;
  document.querySelector('#addTab div').textContent = chrome.i18n.getMessage('edit');
  document.querySelector('#addTab img').src = 'images/icons/edit.svg';
  if (switchToEdit) document.getElementById('addTab').click();

  // switch manual mode
  document.getElementById('switchAddMode').checked = true;
  document.getElementById('switchAddMode').dispatchEvent(new Event('change'));
  document.getElementById('switchAddMode').disabled = true;
  document.getElementById('disableCheckProjects').checked = false;
  document.getElementById('disableCheckProjects').disabled = true;
  document.getElementById('rating').disabled = true;

  const funcRating = allProjects[project.rating];
  document.getElementById('rating').value = project.rating;

  if (project.rating === 'Custom') {
    document.getElementById('nick').value = project.id;
  } else if (!funcRating.notRequiredId?.()) {
    document.getElementById('id').value = project.id;
  }
  if (funcRating.exampleURLGame) document.getElementById('chooseGame').value = project.game || '';
  if (funcRating.exampleURLListing) document.getElementById('chooseListing').value = project.listing || '';
  if (funcRating.langList) document.getElementById('chooseLang').value = project.lang || '';
  if (funcRating.additionExampleURL) document.getElementById('additionURL').value = project.addition || '';
  if (project.rating !== 'Custom' && !funcRating.notRequiredNick?.(project)) document.getElementById('nick').value = project.nick || '';
  if (funcRating.limitedCountVote?.()) document.getElementById('countVote').value = project.maxCountVote || 5;
  if (funcRating.ordinalWorld?.()) document.getElementById('ordinalWorld').value = project.ordinalWorld || '';

  // schedule
  if (project.time > Date.now()) {
    document.getElementById('scheduleTimeCheckbox').checked = true;
    document.getElementById('scheduleTimeCheckbox').dispatchEvent(new Event('change'));
    const time = new Date(project.time);
    if (!isNaN(time)) {
      time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
      document.getElementById('scheduleTime').value = time.toISOString().slice(0, 23);
    } else {
      document.getElementById('scheduleTime').value = null;
    }
  }

  // timeouts
  if (project.timeout != null || project.timeoutHour != null || project.rating === 'Custom') {
    document.getElementById('customTimeOut').checked = true;
    if (project.timeout) {
      document.getElementById('selectTime').value = 'ms';
      document.getElementById('time').valueAsNumber = project.timeout;
    } else {
      if (project.timeoutWeek != null) {
        document.getElementById('selectTime').value = 'week';
        document.getElementById('week').value = project.timeoutWeek;
      } else if (project.timeoutMonth != null) {
        document.getElementById('selectTime').value = 'month';
        document.getElementById('month').valueAsNumber = project.timeoutMonth;
      } else {
        document.getElementById('selectTime').value = 'hour';
      }
      const hours = new Date(1980, 0, 1, project.timeoutHour, project.timeoutMinute, project.timeoutSecond, project.timeoutMS);
      hours.setMinutes(hours.getMinutes() - hours.getTimezoneOffset());
      document.getElementById('hour').value = hours.toISOString().slice(11, 23);
    }
    document.getElementById('customTimeOut').dispatchEvent(new Event('change'));
  }
  if (project.lastDayMonth) {
    document.getElementById('lastDayMonth').checked = true;
    document.getElementById('lastDayMonth').dispatchEvent(new Event('change'));
  }

  if (project.rating !== 'Custom' && !funcRating.silentVote?.(project)) {
    document.getElementById('voteMode').disabled = true;
  }
  if (project.rating !== 'Custom' && (project.silentMode || project.emulateMode)) {
    document.getElementById('voteModeSelect').value = project.silentMode ? 'silentMode' : 'emulateMode';
    document.getElementById('voteMode').checked = true;
    document.getElementById('voteMode').dispatchEvent(new Event('change'));
  }
  if (project.priority) document.getElementById('priority').checked = true;
  if (project.randomize) {
    document.getElementById('randomizeMin').value = project.randomize.min;
    document.getElementById('randomizeMax').value = project.randomize.max;
    document.getElementById('randomize').checked = true;
    document.getElementById('randomize').dispatchEvent(new Event('change'));
  }

  if (project.rating === 'Custom') {
    document.getElementById('customBody').value = JSON.stringify(project.body, null, '\t');
    document.getElementById('responseURL').value = project.responseURL || '';
  }

  document.getElementById('rating').dispatchEvent(new Event('input'));
  document.getElementById('submitAddProject').style.display = 'none';
  document.getElementById('submitEditProject').parentElement.removeAttribute('style');

  document.querySelector('[data-resource="addTitle"]').textContent = chrome.i18n.getMessage('editTitle');
  document.querySelector('.editSubtitle').removeAttribute('style');
  document.querySelector('.editSubtitle').id = 'edit' + project.key;

  let text = project.rating;
  if (project.nick) text += ' – ' + project.nick;
  if (project.game) text += ' – ' + project.game;
  if (project.name) text += ' – ' + project.name;
  else if (project.id) text += ' – ' + project.id;
  document.querySelector('.editSubtitle').textContent = text;
}

async function addProject(project, element) {
  notif.create(chrome.i18n.getMessage('adding'), 'hint', { element });

  if (project.rating !== 'Custom' && !allProjects[project.rating].notRequiredNick?.(project)) {
    if (project.nick?.includes?.(' ')) {
      notif.create(chrome.i18n.getMessage('nickWithSpace'), 'warn');
      if (!confirm(chrome.i18n.getMessage('nickWithSpaceConfirm'))) return;
    }
  }

  if (!(await checkPermissions([project], element))) return;

  // Pre-check presence unless disabled
  if (!document.getElementById('disableCheckProjects').checked && project.rating !== 'Custom') {
    notif.create(chrome.i18n.getMessage('checkHasProject'), 'hint', { element });

    let response;
    try {
      const url = allProjects[project.rating].pageURL(project);
      if (project.rating === 'minecraftiplist.com') {
        response = await fetch(url, { credentials: 'omit' });
      } else {
        response = await fetch(url, { credentials: 'include' });
      }
    } catch (error) {
      if (String(error).includes('Failed to fetch')) {
        notif.create(chrome.i18n.getMessage('notConnectInternet'), 'error', { element });
      } else {
        notif.create(error, 'error', { element });
      }
      return;
    }

    // Ignore some status per site rules
    const ignoreErrors = allProjects[project.rating].ignoreErrors?.();
    if (!ignoreErrors) {
      if (response.status === 404) {
        notif.create(chrome.i18n.getMessage('notFoundProjectCode', String(response.status)), 'error', { element });
        return;
      } else if (response.redirected) {
        notif.create(chrome.i18n.getMessage('notFoundProjectRedirect', response.url), 'error', { element });
        return;
      } else if (response.status === 503 || response.status === 403) {
        // ignore CF
      } else if (!response.ok) {
        notif.create(chrome.i18n.getMessage('notConnect', [project.rating, String(response.status)]), 'error', { element });
        return;
      }
    }

    let html = await response.text();
    let doc = new DOMParser().parseFromString(html, 'text/html');

    try {
      const notFound = allProjects[project.rating].notFound?.(doc, project);
      if (notFound) {
        notif.create(notFound === true ? chrome.i18n.getMessage('notFoundProject') : notFound, 'error', { element });
        return;
      }
      project.name = allProjects[project.rating].projectName(doc, project)?.trim() || '';
    } catch (e) {
      console.warn('projectName parse failed:', e);
      project.name = project.name || '';
    }

    notif.create(chrome.i18n.getMessage('checkHasProjectSuccess'), 'hint', { element });
  }

  // Insert into DB/UI
  await addProjectList(project);
  const arr = [];
  arr.push(chrome.i18n.getMessage('addSuccess') + ' ' + (project.name || ''));
  notif.create(arr, 'success', { element });

  // Warnings
  if (allProjects[project.rating].alertManualCaptcha?.()) {
    alert(chrome.i18n.getMessage('alertCaptcha'));
  }
  if (allProjects[project.rating].focusedTab?.(project)) {
    alert(chrome.i18n.getMessage('alertFocusedTab'));
  }
}

// -------------------- Add form (manual/link) --------------------

let editing = false;

function wireAddForm() {
  // Toggle manual mode
  document.getElementById('switchAddMode')?.addEventListener('change', function (event) {
    if (event.target.checked) {
      // manual
      linkChanged(null, true);
      document.getElementById('rating').dispatchEvent(new Event('input'));
      document.getElementById('rating').parentElement.removeAttribute('style');
      document.getElementById('rating').required = true;
      document.getElementById('link').parentElement.style.display = 'none';
      document.getElementById('link').required = false;
    } else {
      // link mode
      ratingChanged(null, true);
      document.getElementById('link').dispatchEvent(new Event('input'));
      document.getElementById('rating').parentElement.style.display = 'none';
      document.getElementById('rating').required = false;
      document.getElementById('link').parentElement.removeAttribute('style');
      document.getElementById('link').required = true;
    }
  });

  // Cancel edit
  document.getElementById('submitCancelProject')?.addEventListener('click', () => resetEdit(editingProject));

  // Additional toggles
  document.getElementById('disableCheckProjects')?.addEventListener('change', function () {
    if (this.checked && !confirm(chrome.i18n.getMessage('confirmDisableCheckProjects'))) {
      this.checked = false;
    }
  });
  document.getElementById('priority')?.addEventListener('change', function () {
    if (this.checked && !confirm(chrome.i18n.getMessage('confirmPriority'))) {
      this.checked = false;
    }
  });
  document.getElementById('customTimeOut')?.addEventListener('change', function () {
    // Reset fields
    const hide = (id) => { document.getElementById(id).parentElement.style.display = 'none'; document.getElementById(id).required = false; };
    const show = (id) => { document.getElementById(id).parentElement.removeAttribute('style'); document.getElementById(id).required = true; };
    hide('hour'); hide('time'); hide('week'); hide('month');
    if (this.checked) {
      document.getElementById('lastDayMonth').disabled = false;
      document.getElementById('selectTime').parentElement.removeAttribute('style');
      if (document.getElementById('selectTime').value === 'ms') show('time');
      else {
        if (document.getElementById('selectTime').value === 'week') show('week');
        else if (document.getElementById('selectTime').value === 'month') show('month');
        show('hour');
      }
    } else {
      document.getElementById('lastDayMonth').disabled = true;
      document.getElementById('selectTime').parentElement.style.display = 'none';
    }
  });
  document.getElementById('randomize')?.addEventListener('change', function () {
    if (this.checked) {
      document.getElementById('randomizeMin').parentElement.removeAttribute('style');
      document.getElementById('randomizeMin').required = true;
      document.getElementById('randomizeMax').required = true;
    } else {
      document.getElementById('randomizeMin').parentElement.style.display = 'none';
      document.getElementById('randomizeMin').required = false;
      document.getElementById('randomizeMax').required = false;
    }
  });
  document.getElementById('scheduleTimeCheckbox')?.addEventListener('change', function () {
    if (this.checked) {
      document.getElementById('scheduleTime').parentElement.removeAttribute('style');
      document.getElementById('scheduleTime').required = true;
    } else {
      document.getElementById('scheduleTime').parentElement.style.display = 'none';
      document.getElementById('scheduleTime').required = false;
    }
  });
  document.getElementById('voteMode')?.addEventListener('change', function () {
    document.getElementById('voteModeSelect').parentElement.style.display = this.checked ? '' : 'none';
  });
  document.getElementById('selectTime')?.addEventListener('change', function () {
    const hide = (id) => { document.getElementById(id).parentElement.style.display = 'none'; document.getElementById(id).required = false; };
    const show = (id) => { document.getElementById(id).parentElement.removeAttribute('style'); document.getElementById(id).required = true; };
    hide('hour'); hide('time'); hide('week'); hide('month');
    if (this.value === 'ms') show('time');
    else {
      if (this.value === 'week') show('week');
      else if (this.value === 'month') show('month');
      show('hour');
    }
  });

  // Link-based project detection (input#link)
  let laterChoose = false;
  document.getElementById('link')?.addEventListener('input', linkChanged);
  function linkChanged(_event, reset) {
    if (laterChoose || reset) {
      const hide = (id, name = null, placeholderKey = null) => {
        const el = document.getElementById(id);
        el.parentElement.style.display = 'none';
        if (name) el.name = name;
        if (placeholderKey) el.placeholder = chrome.i18n.getMessage(placeholderKey);
        el.required = false;
      };
      hide('nick', 'nick', 'enterNick');
      hide('countVote'); hide('ordinalWorld');
      document.getElementById('banAttention').style.display = 'none';
      document.getElementById('rewardAttention').style.display = 'none';
      document.getElementById('operaAttention').style.display = 'none';
      document.getElementById('voteMode').disabled = true;
      document.getElementById('voteMode').checked = false;
      document.getElementById('voteMode').dispatchEvent(new Event('change'));
      laterChoose = false;
      if (reset) return;
    }

    let domain, project, funcRating;
    try {
      domain = getDomainWithoutSubdomain(this.value);
      funcRating = allProjects[domain];
      if (!funcRating) return;
      project = funcRating.parseURL(new URL(this.value)) || {};
    } catch (error) {
      return; // silence invalid URL
    }
    laterChoose = true;
    project.rating = domain;

    // Show conditional UI fields
    if (!funcRating.notRequiredNick?.(project)) {
      document.getElementById('nick').parentElement.removeAttribute('style');
      document.getElementById('nick').required = true;
      if (funcRating.optionalNick?.()) {
        document.getElementById('nick').placeholder = chrome.i18n.getMessage('enterNickOptional');
      }
    }
    if (funcRating.limitedCountVote?.()) {
      document.getElementById('countVote').parentElement.removeAttribute('style');
      document.getElementById('countVote').required = true;
    }
    if (funcRating.ordinalWorld?.()) {
      document.getElementById('ordinalWorld').parentElement.removeAttribute('style');
      document.getElementById('ordinalWorld').required = true;
    }
    if (funcRating.silentVote?.(project)) {
      document.getElementById('voteMode').disabled = false;
    }
    if (funcRating.banAttention?.(project)) {
      document.getElementById('banAttention').removeAttribute('style');
    }
    if (project.rating === 'minecraftrating.ru' && project.listing === 'servers') {
      document.getElementById('rewardAttention').removeAttribute('style');
    }
  }

  // Manual rating selection (input#rating list)
  let laterChooseManual = false;
  document.getElementById('rating')?.addEventListener('input', ratingChanged);
  function ratingChanged(_event, reset) {
    const hidden = () => {
      const hide = (id, name = null, valIds = []) => {
        const el = document.getElementById(id);
        el.parentElement.style.display = 'none';
        if (name) el.name = name;
        el.required = false;
        for (const vid of valIds) document.getElementById(vid).textContent = '';
      };
      hide('id', 'id', ['projectIDTooltip1', 'projectIDTooltip2', 'projectIDTooltip3']);
      hide('nick', 'nick'); document.querySelector('[data-resource="yourNick"]').textContent = chrome.i18n.getMessage('yourNick');
      hide('chooseGame', 'chooseGame', ['urlGameTooltip1', 'urlGameTooltip2', 'urlGameTooltip3']); document.getElementById('gameList').replaceChildren();
      hide('chooseListing', 'chooseListing', ['urlListingTooltip1', 'urlListingTooltip2', 'urlListingTooltip3']); document.getElementById('listingList').replaceChildren();
      hide('chooseLang', 'chooseLang'); document.getElementById('langList').replaceChildren();
      hide('countVote'); hide('ordinalWorld');
      document.getElementById('banAttention').style.display = 'none';
      document.getElementById('rewardAttention').style.display = 'none';
      document.getElementById('operaAttention').style.display = 'none';
      hide('additionURL', 'additionURL', ['additionURLTooltip1', 'additionURLTooltip2', 'additionURLTooltip3']);
      document.getElementById('customTimeOut').disabled = false;
      document.getElementById('customTimeOut').dispatchEvent(new Event('change'));
      document.getElementById('voteMode').disabled = true;
      document.getElementById('voteMode').checked = false;
      document.getElementById('voteMode').dispatchEvent(new Event('change'));
      if (!document.getElementById('customTimeOut').checked) document.getElementById('selectTime').parentElement.style.display = 'none';
      document.getElementById('customBody').parentElement.style.display = 'none';
      document.getElementById('responseURL').parentElement.style.display = 'none';
    };

    if (laterChooseManual || reset) {
      hidden(); laterChooseManual = false; if (reset) return;
    }

    const rating = this.value;
    const funcRating = allProjects[rating];
    if (!funcRating) return;
    laterChooseManual = true;

    if (rating === 'Custom') {
      document.getElementById('customTimeOut').disabled = true;
      document.getElementById('customTimeOut').checked = false;
      document.getElementById('lastDayMonth').disabled = true;
      document.getElementById('lastDayMonth').checked = false;
      document.getElementById('voteMode').disabled = true;
      document.getElementById('voteMode').checked = false;
      document.getElementById('voteMode').dispatchEvent(new Event('change'));

      document.getElementById('nick').parentElement.removeAttribute('style');
      document.getElementById('nick').required = true;
      document.getElementById('id').required = false;
      document.getElementById('selectTime').parentElement.removeAttribute('style');
      document.getElementById('selectTime').dispatchEvent(new Event('change'));
      document.getElementById('customBody').parentElement.removeAttribute('style');
      document.getElementById('responseURL').parentElement.removeAttribute('style');
      document.querySelector('[data-resource="yourNick"]').textContent = chrome.i18n.getMessage('name');
      document.getElementById('nick').placeholder = chrome.i18n.getMessage('enterName');
      return;
    }

    // Required id
    if (!funcRating.notRequiredId?.()) {
      document.getElementById('id').parentElement.removeAttribute('style');
      document.getElementById('id').required = true;
      const ex = funcRating.exampleURL?.();
      if (ex) {
        document.getElementById('projectIDTooltip1').textContent = ex[0] || '';
        document.getElementById('projectIDTooltip2').textContent = ex[1] || '';
        document.getElementById('projectIDTooltip3').textContent = ex[2] || '';
      }
      document.getElementById('id').name = 'id_' + rating;
    }

    if (!funcRating.notRequiredNick?.()) {
      document.getElementById('nick').parentElement.removeAttribute('style');
      document.getElementById('nick').required = true;
      if (funcRating.optionalNick?.()) {
        document.getElementById('nick').placeholder = chrome.i18n.getMessage('enterNickOptional');
      }
    }

    // If canonical differs (URLMain), normalize input
    if (funcRating.URLMain?.() && this.value !== funcRating.URLMain()) {
      if (funcRating.exampleURLGame && !funcRating.defaultGame) document.getElementById('chooseGame').value = this.value;
      this.value = funcRating.URLMain();
    }

    // Game / Listing / Lang
    if (funcRating.exampleURLGame) {
      document.getElementById('chooseGame').parentElement.removeAttribute('style');
      document.getElementById('chooseGame').name = 'chooseGame_' + this.value;
      const exg = funcRating.exampleURLGame();
      if (exg) {
        document.getElementById('urlGameTooltip1').textContent = exg[0] || '';
        document.getElementById('urlGameTooltip2').textContent = exg[1] || '';
        document.getElementById('urlGameTooltip3').textContent = exg[2] || '';
      }
      if (funcRating.gameList) {
        const gameList = document.getElementById('gameList');
        gameList.replaceChildren();
        for (const [value, name] of funcRating.gameList()) {
          const option = document.createElement('option');
          option.value = value; option.textContent = name;
          gameList.append(option);
        }
      }
    }

    if (funcRating.exampleURLListing) {
      document.getElementById('chooseListing').parentElement.removeAttribute('style');
      document.getElementById('chooseListing').name = 'chooseListing_' + rating;
      const exl = funcRating.exampleURLListing();
      if (exl) {
        document.getElementById('urlListingTooltip1').textContent = exl[0] || '';
        document.getElementById('urlListingTooltip2').textContent = exl[1] || '';
        document.getElementById('urlListingTooltip3').textContent = exl[2] || '';
      }
      if (funcRating.listingList) {
        const listingList = document.getElementById('listingList');
        listingList.replaceChildren();
        for (const [value, name] of funcRating.listingList()) {
          const option = document.createElement('option');
          option.value = value; option.textContent = name;
          listingList.append(option);
        }
      }
    }

    if (funcRating.langList) {
      document.getElementById('chooseLang').parentElement.removeAttribute('style');
      document.getElementById('chooseLang').name = 'chooseLang_' + rating;
      const langList = document.getElementById('langList');
      langList.replaceChildren();
      for (const [value, name] of funcRating.langList()) {
        const option = document.createElement('option');
        option.value = value; option.textContent = name;
        langList.append(option);
      }
    }

    if (funcRating.limitedCountVote?.()) {
      document.getElementById('countVote').parentElement.removeAttribute('style');
      document.getElementById('countVote').required = true;
    }
    if (funcRating.ordinalWorld?.()) {
      document.getElementById('ordinalWorld').parentElement.removeAttribute('style');
      document.getElementById('ordinalWorld').required = true;
    }
    if (funcRating.silentVote?.()) {
      document.getElementById('voteMode').disabled = false;
    }
    if (funcRating.banAttention?.()) {
      document.getElementById('banAttention').removeAttribute('style');
      if (!document.getElementById('randomize').checked) {
        document.getElementById('randomize').click();
        document.getElementById('randomizeMin').value = '0';
        document.getElementById('randomizeMax').value = '14400000';
      }
    }
    if (funcRating.additionExampleURL) {
      document.getElementById('additionURL').parentElement.removeAttribute('style');
      document.getElementById('additionURL').name = 'additionURL_' + rating;
      const exa = funcRating.additionExampleURL();
      if (exa) {
        document.getElementById('additionURLTooltip1').textContent = exa[0] || '';
        document.getElementById('additionURLTooltip2').textContent = exa[1] || '';
        document.getElementById('additionURLTooltip3').textContent = exa[2] || '';
      }
    }
  }

  // chooseListing special case (minecraftrating.ru)
  document.getElementById('chooseListing')?.addEventListener('change', function () {
    if (this.name === 'chooseListing_minecraftrating.ru') {
      if (this.value === 'servers') {
        document.getElementById('nick').required = false;
        document.getElementById('nick').parentElement.style.display = 'none';
        document.getElementById('rewardAttention').removeAttribute('style');
      } else {
        document.getElementById('nick').required = true;
        document.getElementById('nick').parentElement.removeAttribute('style');
        document.getElementById('rewardAttention').style.display = 'none';
      }
    }
  });

  // Submit (add/edit)
  document.getElementById('append')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.submitter.disabled = true;

    let domain, funcRating;
    let project = {};
    if (event.submitter.id === 'submitEditProject') project = editingProject;

    try {
      if (!document.getElementById('switchAddMode').checked) {
        // Link mode
        const url = document.getElementById('link').value;
        try {
          domain = getDomainWithoutSubdomain(url);
          funcRating = allProjects[domain];
          if (!funcRating) {
            notif.create(chrome.i18n.getMessage('errorLink', domain), 'error');
            event.submitter.disabled = false; return;
          }
          project = funcRating.parseURL(new URL(url)) || {};
          project.rating = domain;
          if (funcRating.URLMain) {
            const domain2 = funcRating.URLMain?.();
            if (domain2 && domain2 !== domain) project.ratingMain = domain2;
          }
          if (!funcRating.notRequiredId?.() && !project.id) {
            notif.create(chrome.i18n.getMessage('errorLinkParam', 'id'), 'error');
            event.submitter.disabled = false; return;
          }
          if (funcRating.exampleURLGame && project.game == null) {
            notif.create(chrome.i18n.getMessage('errorLinkParam', 'game'), 'error');
            event.submitter.disabled = false; return;
          }
          if (funcRating.exampleURLListing && project.listing == null) {
            notif.create(chrome.i18n.getMessage('errorLinkParam', 'listing'), 'error');
            event.submitter.disabled = false; return;
          }
          if (funcRating.langList && project.lang == null) {
            notif.create(chrome.i18n.getMessage('errorLinkParam', 'lang'), 'error');
            event.submitter.disabled = false; return;
          }
        } catch (e) {
          notif.create(e, 'error'); event.submitter.disabled = false; return;
        }
      } else {
        // Manual mode
        domain = document.getElementById('rating').value;
        funcRating = allProjects[domain];
        if (!funcRating) {
          notif.create(chrome.i18n.getMessage('errorSelectSiteRating'), 'error');
          event.submitter.disabled = false; return;
        }
        project.rating = domain;
        if (domain === 'Custom') {
          project.id = document.getElementById('nick').value;
        } else if (!funcRating.notRequiredId?.()) {
          project.id = document.getElementById('id').value;
        }
        if (funcRating.exampleURLGame) project.game = document.getElementById('chooseGame').value;
        if (funcRating.exampleURLListing) project.listing = document.getElementById('chooseListing').value;
        if (funcRating.langList) project.lang = document.getElementById('chooseLang').value;
        if (funcRating.additionExampleURL) project.addition = document.getElementById('additionURL').value;

        const domain2 = getDomainWithoutSubdomain(funcRating.voteURL(project));
        if (domain2 !== domain && domain !== 'Custom') {
          if (!allProjects[domain2]) {
            if (!confirm(chrome.i18n.getMessage('notSupportedSiteRating', domain2))) {
              event.submitter.disabled = false; return;
            }
          } else {
            project.rating = domain2;
            project.ratingMain = domain;
          }
        }
      }

      if (project.rating !== 'Custom' && !funcRating.notRequiredNick?.(project)) {
        project.nick = document.getElementById('nick').value;
      }
      if (funcRating.limitedCountVote?.()) {
        project.maxCountVote = document.getElementById('countVote').valueAsNumber || 5;
        project.countVote = 0;
      }
      if (funcRating.ordinalWorld?.()) {
        project.ordinalWorld = document.getElementById('ordinalWorld').valueAsNumber;
      }

      if (event.submitter.id !== 'submitEditProject') {
        project.stats = {
          successVotes: 0, monthSuccessVotes: 0, lastMonthSuccessVotes: 0,
          errorVotes: 0, laterVotes: 0, lastSuccessVote: null, lastAttemptVote: null, added: Date.now()
        };
      }

      if (settings.expertMode || project.rating === 'Custom') {
        if (document.getElementById('scheduleTimeCheckbox').checked && document.getElementById('scheduleTime').value !== '') {
          project.time = new Date(document.getElementById('scheduleTime').value).getTime();
        } else project.time = null;

        if (document.getElementById('customTimeOut').checked || project.rating === 'Custom') {
          if (document.getElementById('selectTime').value === 'ms') {
            delete project.timeoutHour; delete project.timeoutMinute; delete project.timeoutSecond; delete project.timeoutMS;
            delete project.timeoutWeek; delete project.timeoutMonth;
            project.timeout = document.getElementById('time').valueAsNumber;
          } else {
            delete project.timeout;
            const [hh, mmss] = (document.getElementById('hour').value || '0:0:0.0').split(':');
            const [ss, ms] = (mmss || '0.0').split('.');
            project.timeoutHour = Number(hh) || 0;
            project.timeoutMinute = Number(mmss?.split(':')[1]) || 0;
            project.timeoutSecond = Number(ss) || 0;
            project.timeoutMS = Number(ms) || 0;
            if (document.getElementById('selectTime').value === 'week') {
              project.timeoutWeek = Number(document.getElementById('week').value);
            } else delete project.timeoutWeek;
            if (document.getElementById('selectTime').value === 'month') {
              project.timeoutMonth = document.getElementById('month').valueAsNumber;
            } else delete project.timeoutMonth;
          }
        } else {
          delete project.timeout; delete project.timeoutHour; delete project.timeoutMinute; delete project.timeoutSecond; delete project.timeoutMS;
          delete project.timeoutWeek; delete project.timeoutMonth;
        }

        if (document.getElementById('lastDayMonth').checked) project.lastDayMonth = true;
        else delete project.lastDayMonth;

        delete project.silentMode; delete project.emulateMode;
        if (project.rating !== 'Custom' && document.getElementById('voteMode').checked) {
          if (document.getElementById('voteModeSelect').value === 'silentMode') project.silentMode = true;
          else if (document.getElementById('voteModeSelect').value === 'emulateMode') project.emulateMode = true;
        }

        delete project.randomize;
        if (document.getElementById('randomize').checked) {
          project.randomize = { min: document.getElementById('randomizeMin').valueAsNumber, max: document.getElementById('randomizeMax').valueAsNumber };
        }
      }

      if (project.rating === 'Custom') {
        let body;
        try { body = JSON.parse(document.getElementById('customBody').value || '{}'); }
        catch (error) { notif.create(error, 'error'); event.submitter.disabled = false; return; }
        project.body = body;
        project.responseURL = document.getElementById('responseURL').value;
        if (!settings.enableCustom) {
          settings.enableCustom = true;
          await db.put('other', settings, 'settings');
          chrome.runtime.sendMessage('reloadSettings');
        }
      }

      // Save DB
      if (event.submitter.id === 'submitEditProject') {
        if (document.getElementById('priority').checked && !project.priority) {
          project.priority = true;
          if (!await removeProjectList(project, true)) { event.submitter.disabled = false; return; }
          const store = db.transaction('projects', 'readwrite').store;
          const cursor = await store.openCursor();
          project.key = (!cursor || cursor.key === 1) ? -1 : cursor.key - 1;
          await store.put(project, project.key);
          await addProjectList(project, true);
        } else if (!document.getElementById('priority').checked && project.priority) {
          delete project.priority;
          if (!await removeProjectList(project, true)) { event.submitter.disabled = false; return; }
          const store = db.transaction('projects', 'readwrite').store;
          project.key = await store.put(project);
          await store.put(project, project.key);
          await addProjectList(project);
        } else {
          await db.put('projects', project, project.key);
        }
        resetEdit(project);
        await onMessage({ updateValue: 'projects', value: project });

        if (project.time == null || project.time < Date.now()) {
          chrome.runtime.sendMessage('checkVote');
        } else {
          let when = project.time;
          if (when - Date.now() < 65000) when = Date.now() + 65000;
          try { await chrome.alarms.create(String(project.key), { when }); }
          catch (error) { notif.create('chrome.alarms create error ' + error.message, 'warn'); }
        }
      } else {
        // Add new
        await addProject(project);
      }
    } catch (e) {
      notif.create(e, 'error');
    } finally {
      event.submitter.disabled = false;
    }
  });
}

// -------------------- Fast Add (from URL) --------------------

function getUrlProjects(element) {
  const projects = [];
  let project = {};
  const url = new URL(document.location.href);
  for (let [key, value] of url.searchParams) {
    if (key === 'top') key = 'rating';
    if (['rating', 'nick', 'id', 'game', 'listing', 'lang', 'maxCountVote', 'ordinalWorld', 'addition'].includes(key)) {
      if (key !== 'rating' && !project.rating) continue;
      if (key === 'rating' && Object.keys(project).length > 0) {
        project.time = null;
        project.stats = { successVotes: 0, monthSuccessVotes: 0, lastMonthSuccessVotes: 0, errorVotes: 0, laterVotes: 0, lastSuccessVote: null, lastAttemptVote: null, added: Date.now() };
        if (allProjects[project.rating].URLMain) {
          const domain2 = allProjects[project.rating].URLMain?.();
          if (domain2 !== project.rating) project.ratingMain = domain2;
        }
        projects.push(project);
        project = {};
      }
      if (key === 'rating') {
        if (!allProjects[value]) {
          const html = document.createElement('div');
          html.classList.add('fastAddEl');
          const img = document.createElement('img'); img.src = 'images/icons/error.svg'; html.append(img);
          const div = document.createElement('div');
          const p = document.createElement('p');
          p.textContent = chrome.i18n.getMessage('failParseUrlFastAdd', [value, url.searchParams.get('name')]);
          div.append(p);
          html.append(div);
          element.append(html);
          element.scrollTop = element.scrollHeight;
          continue;
        }
        project.rating = value;
      } else if (key === 'maxCountVote' || key === 'ordinalWorld') {
        const num = Number(value); project[key] = isNaN(num) ? 1 : num;
      } else {
        project[key] = value;
      }
    }
  }
  if (Object.keys(project).length > 0) {
    project.time = null;
    project.stats = { successVotes: 0, monthSuccessVotes: 0, lastMonthSuccessVotes: 0, errorVotes: 0, laterVotes: 0, lastSuccessVote: null, lastAttemptVote: null, added: Date.now() };
    if (allProjects[project.rating].URLMain) {
      const domain2 = allProjects[project.rating].URLMain?.();
      if (domain2 !== project.rating) project.ratingMain = domain2;
    }
    projects.push(project);
  }
  return projects;
}

async function fastAdd() {
  if (!document.location.href.includes('addFastProject')) return;

  toggleModal('addFastProject');
  const searchParams = new URL(document.location.href).searchParams;
  if (searchParams.get('name')) document.querySelector('[data-resource="fastAdd"]').textContent = searchParams.get('name');

  const listFastAdd = document.querySelector('#addFastProject > div.content > .message');
  listFastAdd.textContent = '';

  // Optional: disable info/warn/start notifs via URL flags
  const toggles = [
    ['disableNotifInfo', 'disabledNotifInfo'],
    ['disableNotifWarn', 'disabledNotifWarn'],
    ['disableNotifStart', 'disabledNotifStart'],
  ];
  for (const [param, field] of toggles) {
    if (searchParams.get(param) === 'true') {
      settings[field] = true;
      await db.put('other', settings, 'settings');
      chrome.runtime.sendMessage('reloadSettings');
      const html = document.createElement('div'); html.classList.add('fastAddEl');
      const ok = document.createElement('img'); ok.src = 'images/icons/success.svg'; html.append(ok);
      const div = document.createElement('div'); const p = document.createElement('p');
      p.textContent = chrome.i18n.getMessage(field); div.append(p); html.append(div);
      listFastAdd.append(html); listFastAdd.scrollTop = listFastAdd.scrollHeight;
    }
  }

  const projects = getUrlProjects(listFastAdd);

  const html2 = document.createElement('div'); html2.classList.add('fastAddEl');
  const fail = document.createElement('img'); fail.src = 'images/icons/error.svg'; html2.append(fail);
  const div2 = document.createElement('div'); const p2 = document.createElement('p');
  p2.textContent = chrome.i18n.getMessage('permissions');
  const status2 = document.createElement('span'); p2.append(document.createElement('br')); p2.append(status2);
  div2.append(p2); html2.append(div2); listFastAdd.append(html2); listFastAdd.scrollTop = listFastAdd.scrollHeight;

  if (!await checkPermissions(projects, status2)) {
    const buttonRetry = document.createElement('button');
    buttonRetry.classList.add('btn'); buttonRetry.textContent = chrome.i18n.getMessage('retry');
    document.querySelector('#addFastProject > div.content > .events').append(buttonRetry);
    buttonRetry.addEventListener('click', () => document.location.reload(true));
    return;
  }

  for (const project of projects) {
    const html = document.createElement('div'); html.classList.add('fastAddEl');
    const img = document.createElement('img'); img.src = 'images/icons/error.svg'; html.append(img);
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = project.rating;
    if (project.nick) p.textContent += ' – ' + project.nick;
    if (project.id) p.textContent += ' – ' + project.id;
    const status = document.createElement('span'); p.append(document.createElement('br')); p.append(status);
    div.append(p); html.append(div); listFastAdd.append(html); listFastAdd.scrollTop = listFastAdd.scrollHeight;
    await addProject(project, status);
  }

  if (document.querySelector('#addFastProject img[src="images/icons/error.svg"]') != null) {
    const buttonRetry = document.createElement('button');
    buttonRetry.classList.add('btn'); buttonRetry.textContent = chrome.i18n.getMessage('retry');
    document.querySelector('#addFastProject > div.content > .events').append(buttonRetry);
    buttonRetry.addEventListener('click', () => document.location.reload(true));
  } else if (document.querySelector('#addFastProject > div.content > div.message').childElementCount > 0) {
    const successFastAdd = document.createElement('div');
    successFastAdd.setAttribute('class', 'successFastAdd');
    successFastAdd.append(chrome.i18n.getMessage('successFastAdd'));
    successFastAdd.append(document.createElement('br'));
    successFastAdd.append(chrome.i18n.getMessage('closeTab'));
    listFastAdd.append(successFastAdd); listFastAdd.scrollTop = listFastAdd.scrollHeight;
  } else return;

  const buttonClose = document.createElement('button');
  buttonClose.classList.add('btn', 'redBtn'); buttonClose.textContent = chrome.i18n.getMessage('closeTabButton');
  document.querySelector('#addFastProject > div.content > .events').append(buttonClose);
  buttonClose.addEventListener('click', () => window.close());
}

// -------------------- Misc --------------------

function lagServiceWorker(event) {
  const button = document.createElement('button');
  button.classList.add('btn');
  button.id = 'restartBtn';
  button.addEventListener('click', () => {
    if (confirm(chrome.i18n.getMessage('confirmRestartExtension'))) {
      chrome.runtime.reload();
    }
  });
  button.textContent = chrome.i18n.getMessage('restartExtension');
  notif.create([chrome.i18n.getMessage('lagServiceWorker'), button], 'warn', 60000);
  if (event.target) event.target.disabled = false;
  if (event.submitter) event.submitter.disabled = false;
}

function wireTabsAndNav() {
  // burger
  document.querySelector('.burger')?.addEventListener('click', () => {
    document.querySelector('.burger').classList.toggle('active');
    document.querySelector('nav').classList.toggle('active');
  });

  // tabs
  document.querySelectorAll('.tablinks').forEach((item) => {
    item.addEventListener('click', () => {
      if (document.getElementById('load').style.display !== 'none') return;
      if (item.classList.contains('active')) return;
      if (document.querySelector('.burger.active')) {
        document.querySelector('.burger.active').classList.remove('active');
        document.querySelector('nav').classList.remove('active');
      }
      document.querySelectorAll('.tabcontent').forEach((elem) => { elem.style.display = 'none'; });
      document.querySelectorAll('.tablinks').forEach((elem) => { elem.classList.remove('active'); });

      // show chips only on Added tab
      let genStats = document.querySelector('#generalStats');
      let todStats = document.querySelector('#todayStats');
      if (item.getAttribute('data-tab') === 'added') {
        genStats.style.display = 'block'; todStats.style.display = 'block';
      } else {
        genStats.removeAttribute('style'); todStats.removeAttribute('style');
      }
      item.classList.add('active');
      document.getElementById(item.getAttribute('data-tab')).style.display = 'block';
    });
  });

  // default tab → Dashboard (fallback to Add)
  const dashBtn = document.getElementById('dashboardTab');
  document.getElementById('load').style.display = 'none';
  if (dashBtn) {
    // Let the click handler do the work (and trigger dashboard.js first-render)
    dashBtn.click();
  } else {
    document.getElementById('addTab')?.classList.add('active');
    document.getElementById('append')?.removeAttribute('style');
  }
}

// Stats buttons
function wireStatsButtons() {
  document.getElementById('generalStats')?.addEventListener('click', async () => {
    const store = db.transaction('other', 'readwrite').store;
    generalStats = await store.get('generalStats');

    // Swap month if new month
    if (generalStats.lastAttemptVote) {
      const last = new Date(generalStats.lastAttemptVote);
      const now = new Date();
      if (last.getMonth() < now.getMonth() || last.getFullYear() < now.getFullYear()) {
        generalStats.lastMonthSuccessVotes = generalStats.monthSuccessVotes;
        generalStats.monthSuccessVotes = 0;
      }
    }

    toggleModal('stats');
    await store.put(generalStats, 'generalStats');

    document.querySelector('.statsSubtitle').textContent = chrome.i18n.getMessage('generalStats');
    document.querySelector('td[data-resource="statsSuccessVotes"]').nextElementSibling.textContent = generalStats.successVotes;
    document.querySelector('td[data-resource="statsMonthSuccessVotes"]').nextElementSibling.textContent = generalStats.monthSuccessVotes;
    document.querySelector('td[data-resource="statsLastMonthSuccessVotes"]').nextElementSibling.textContent = generalStats.lastMonthSuccessVotes;
    document.querySelector('td[data-resource="statsErrorVotes"]').nextElementSibling.textContent = generalStats.errorVotes;
    document.querySelector('td[data-resource="statsLaterVotes"]').nextElementSibling.textContent = generalStats.laterVotes;
    document.querySelector('td[data-resource="statsLastSuccessVote"]').nextElementSibling.textContent =
      generalStats.lastSuccessVote ? new Date(generalStats.lastSuccessVote).toLocaleString().replace(',', '') : 'None';
    document.querySelector('td[data-resource="statsLastAttemptVote"]').nextElementSibling.textContent =
      generalStats.lastAttemptVote ? new Date(generalStats.lastAttemptVote).toLocaleString().replace(',', '') : 'None';
    document.querySelector('td[data-resource="statsAdded"]').textContent = chrome.i18n.getMessage('statsInstalled');
    document.querySelector('td[data-resource="statsAdded"]').nextElementSibling.textContent =
      generalStats.added ? new Date(generalStats.added).toLocaleString().replace(',', '') : 'None';
  });

  document.getElementById('todayStats')?.addEventListener('click', async () => {
    const store = db.transaction('other', 'readwrite').store;
    todayStats = await store.get('todayStats');
    const now = new Date(); const last = todayStats.lastAttemptVote ? new Date(todayStats.lastAttemptVote) : null;
    if (last && last.getDate() !== now.getDate()) {
      todayStats = { successVotes: 0, errorVotes: 0, laterVotes: 0, lastSuccessVote: null, lastAttemptVote: null };
    }
    toggleModal('statsToday');
    await store.put(todayStats, 'todayStats');

    document.querySelector('#statsToday td[data-resource="statsSuccessVotes"]').nextElementSibling.textContent = todayStats.successVotes;
    document.querySelector('#statsToday td[data-resource="statsErrorVotes"]').nextElementSibling.textContent = todayStats.errorVotes;
    document.querySelector('#statsToday td[data-resource="statsLaterVotes"]').nextElementSibling.textContent = todayStats.laterVotes;
    document.querySelector('#statsToday td[data-resource="statsLastSuccessVote"]').nextElementSibling.textContent =
      todayStats.lastSuccessVote ? new Date(todayStats.lastSuccessVote).toLocaleString().replace(',', '') : 'None';
    document.querySelector('#statsToday td[data-resource="statsLastAttemptVote"]').nextElementSibling.textContent =
      todayStats.lastAttemptVote ? new Date(todayStats.lastAttemptVote).toLocaleString().replace(',', '') : 'None';
  });

  document.querySelector('#stats .close')?.addEventListener('click', resetModalStats);
}

// -------------------- Messaging --------------------

chrome.runtime.onMessage.addListener(onMessage);
async function onMessage(request) {
  if (request.updateValue) {
    usageSpace();
    if (request.updateValue === 'projects') updateProjectText(request.value);
  } else if (request.installed) {
    alert(chrome.i18n.getMessage('firstInstall'));
  } else if (request.openProject) {
    await initializeReady;
    document.getElementById('addedTab').click();
    await loaded;
    const project = await db.get('projects', request.openProject);
    await listSelect({ currentTarget: document.querySelector(`[data-rating-button="${project.rating}"]`) }, project.rating);
    document.getElementById('projects' + project.key).scrollIntoView({ block: 'center' });
    highlight(document.getElementById('projects' + project.key));
    window.history.replaceState(null, null, 'options.html');
  } else if (request.notification) {
    if (!['warn', 'error'].includes(request.notification.type)) request.notification.type = 'hint';
    let onClick;
    if (request.notification.notificationId?.startsWith?.('openTab_')) {
      onClick = async () => {
        const tabId = Number(request.notification.notificationId.replace('openTab_', ''));
        if (!tabId) return;
        const tab = await chrome.tabs.update(tabId, { active: true });
        if (!tab) return await chrome.windows.update(tab.windowId, { focused: true });
      };
    } else if (request.notification.notificationId?.startsWith?.('openProject_')) {

      onClick = () => {
        try {
          const projectKey = Number(request.notification.notificationId.replace('openProject_', ''));
          onMessage({ openProject: projectKey });
        } catch (error) {
          console.warn('Open settings by project failed', error.message);
        }
      };
    }
    notif.create([request.notification.title, document.createElement('br'), request.notification.message], request.notification.type, { onClick });
  }
}

// -------------------- Boot --------------------

let initializeReady;
const loaded = new Promise((resolve) => (initializeReady = resolve));

async function restoreOptions(first) {
  // read settings-> UI
  document.getElementById('disabledNotifStart').checked = settings.disabledNotifStart;
  document.getElementById('disabledNotifInfo').checked = settings.disabledNotifInfo;
  document.getElementById('disabledNotifWarn').checked = settings.disabledNotifWarn;
  document.getElementById('disabledNotifError').checked = settings.disabledNotifError;
  document.getElementById('disabledCheckInternet').checked = settings.disabledCheckInternet;
  document.getElementById('disabledOneVote').checked = settings.disabledOneVote;
  document.getElementById('disabledRestartOnTimeout').checked = settings.disabledRestartOnTimeout;
  document.getElementById('disabledFocusedTab').checked = settings.disabledFocusedTab;
  document.getElementById('timeoutValue').value = settings.timeout;
  document.getElementById('timeoutErrorValue').value = settings.timeoutError;
  document.getElementById('timeoutVoteValue').value = settings.timeoutVote;
  document.getElementById('disabledWarnCaptcha').checked = settings.disabledWarnCaptcha;
  document.getElementById('disabledClickCaptcha').checked = settings.disabledClickCaptcha;
  document.getElementById('disabledDebug').checked = settings.debug || false;
  document.getElementById('disableCloseTabsOnSuccess').checked = settings.disableCloseTabsOnSuccess || false;
  document.getElementById('disableCloseTabsOnError').checked = settings.disableCloseTabsOnError || false;
  document.getElementById('expertMode').checked = settings.expertMode || false;
  document.getElementById('expertMode').dispatchEvent(new Event('change'));

  if (first) {
    const dashBtn = document.getElementById('dashboardTab');
    document.getElementById('load').style.display = 'none';
    if (dashBtn) {
      dashBtn.click();
    } else {
      document.getElementById('addTab').classList.add('active');
      document.getElementById('append').removeAttribute('style');
    }
  } else {
    await reloadProjectList();
  }
}

async function boot() {
  attachGlobalErrorHandlers((err) => notif.create(err, 'error'));
  i18nInject();

  // Initialize DB/state
  await initializeConfig({ background: false });

  // Wire live bindings from main.js
  db = DB; dbLogs = DB_LOGS; settings = SETTINGS;
  generalStats = GENERAL_STATS; todayStats = TODAY_STATS; openedProjects = OPENED; onLine = ONLINE;

  // 1) Wire UI handlers first
  wireTabsAndNav();
  wireSettingsCheckboxes();
  wireTimeoutForms();
  wireImportExport();
  wireAddForm();
  wireStatsButtons();

  // 2) Now apply saved settings to the UI
  await restoreOptions(true);

  // 3) Defaults for add/edit form toggles (not related to settings)
  document.getElementById('switchAddMode')?.dispatchEvent(new Event('change'));
  document.getElementById('customTimeOut')?.dispatchEvent(new Event('change'));
  document.getElementById('scheduleTimeCheckbox')?.dispatchEvent(new Event('change'));
  document.getElementById('randomize')?.dispatchEvent(new Event('change'));
  document.getElementById('voteMode')?.dispatchEvent(new Event('change'));

  // Load projects
  generateDataList();
  await reloadProjectList();
  document.getElementById('addedLoading').style.display = 'none';
  document.getElementById('notAddedAll').removeAttribute('style');
  usageSpace();

  // Fast add if requested
  await fastAdd();

  initializeReady();
}

window.addEventListener('load', boot);