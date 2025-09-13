// Dashboard for AVR Options (2025)
// - Favicons per site (fallback chain)
// - Interactive sparklines: legend toggle, mouseover tooltip, markers, guideline
// - Leaderboard success rate as ellipse pill with value inside

import { initializeConfig, db as DB } from './main.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const i18n = (k, a) => (chrome?.i18n?.getMessage?.(k, a)) || ({
  dashboard: 'Dashboard',
  overview: 'Overview',
  totalVotes: 'Total votes',
  today: 'Today',
  thisMonth: 'This month',
  allTime: 'All time',
  live: 'Live',
  reliability: 'Reliability',
  successRate: 'Success rate',
  errors: 'Errors',
  monthlyTrend: 'Monthly trend',
  topSites: 'Top vote sites',
  votes: 'Votes',
  success: 'Success',
  last: 'Last',
  recentActivity: 'Recent activity',
  streak: 'Streak',
  site: 'Site',
  ok: 'Vote success',
  err: 'Vote error'
}[k] || k);

const fmt = (n) => (isFinite(n) ? n.toLocaleString() : '—');
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return +d; };

let sortKey = 'count';
let sortDir = 'desc';
let range = 'month';
let cache = null;
let refreshTimer;
let showOk = true, showErr = true;

const els = {
  pillTotal: $('#pillTotalValue'),
  pillToday: $('#pillTodayValue'),
  pillSuccess: $('#pillSuccessValue'),
  pillStreak: $('#pillStreakValue'),
  kpiTotal: $('#kpiTotalVotes'),
  kpiAvg: $('#kpiAvgPerDay'),
  kpiToday: $('#kpiTodayVotes'),
  kpiTodaySuccess: $('#kpiTodaySuccess'),
  kpiMonthVotes: $('#kpiMonthVotes'),
  kpiMonthLabel: $('#kpiMonthLabel'),
  kpiLastMonthDelta: $('#kpiLastMonthDelta'),
  kpiSuccessRate: $('#kpiSuccessRate'),
  kpiErrors: $('#kpiErrors'),
  sparkSuccess: $('#sparklineSuccess'),
  sparkErrors: $('#sparklineErrors'),
  sparkWrap: $('.sparkWrap'),
  leaderBody: $('#leaderBody'),
  leaderSortBtns: $$('.leaderHead .col'),
  rangeMonth: $('#topRangeMonth'),
  rangeAll: $('#topRangeAll'),
  activity: $('#activityList'),
  chipToday: $('#todayStats'),
  chipTotal: $('#generalStats'),
  dashboardTab: $('#dashboardTab'),
  dashboardPanel: $('#dashboard'),
  legend: $('.card .legend') // first legend in trend card
};

function getMonthLabel(d = new Date()) {
  return new Intl.DateTimeFormat(undefined, { month: 'long' }).format(d);
}

async function fetchData() {
  const [general, today, projects] = await Promise.all([
    DB.get('other', 'generalStats'),
    DB.get('other', 'todayStats'),
    DB.getAll('projects')
  ]);
  return { general: general || {}, today: today || {}, projects: projects || [] };
}

function aggregate({ general = {}, today = {}, projects = [] }) {
  const successAll = Number(general.successVotes || 0);
  const errorAll = Number(general.errorVotes || 0);
  const laterAll = Number(general.laterVotes || 0);
  const attemptsAll = successAll + errorAll + laterAll;
  const successRateAll = attemptsAll ? Math.round((successAll / attemptsAll) * 100) : 0;

  const tSucc = Number(today.successVotes || 0);
  const tErr = Number(today.errorVotes || 0);
  const tLater = Number(today.laterVotes || 0);
  const todayTotal = tSucc + tErr + tLater;
  const todayRate = todayTotal ? Math.round((tSucc / todayTotal) * 100) : 0;

  const monthSuccess = Number(general.monthSuccessVotes || 0);
  const lastMonthSuccess = Number(general.lastMonthSuccessVotes || 0);
  const monthDelta = lastMonthSuccess
    ? Math.round(((monthSuccess - lastMonthSuccess) / lastMonthSuccess) * 100)
    : (monthSuccess ? 100 : 0);

  const since = Number(general.added || Date.now());
  const daysActive = Math.max(1, Math.ceil((Date.now() - since) / 86400000));
  const avgPerDay = Math.round(attemptsAll / daysActive);

  const daysWithSuccess = new Set(
    projects.map(p => p?.stats?.lastSuccessVote).filter(Boolean).map(dayStart)
  );
  let streak = 0; for (let i = 0; i < 365; i++) { const ds = dayStart(Date.now() - i*86400000); if (daysWithSuccess.has(ds)) streak++; else break; }

  const days = Array.from({ length: 30 }, (_, i) => dayStart(Date.now() - (29 - i) * 86400000));
  const successSeries = days.map(ds => projects.filter(p => dayStart(p?.stats?.lastSuccessVote || 0) === ds).length);
  const errorSeries = days.map(ds => projects.filter(p => {
    const la = p?.stats?.lastAttemptVote || 0;
    if (!la) return false;
    if (dayStart(la) !== ds) return false;
    return la !== p?.stats?.lastSuccessVote;
  }).length);

  const bySite = new Map();
  for (const p of projects) {
    const site = p.rating || 'unknown';
    const s = bySite.get(site) || { site, succ: 0, err: 0, later: 0, monthSucc: 0, last: 0 };
    s.succ += Number(p?.stats?.successVotes || 0);
    s.err  += Number(p?.stats?.errorVotes || 0);
    s.later += Number(p?.stats?.laterVotes || 0);
    s.monthSucc += Number(p?.stats?.monthSuccessVotes || 0);
    s.last = Math.max(s.last, Number(p?.stats?.lastAttemptVote || 0));
    bySite.set(site, s);
  }
  const topAll = [...bySite.values()].map(s => {
    const attempts = s.succ + s.err + s.later;
    const rate = attempts ? Math.round((s.succ / attempts) * 100) : 0;
    return { site: s.site, countAll: s.succ, countMonth: s.monthSucc, rate, last: s.last };
  });

  const recent = projects
    .filter(p => p?.stats?.lastAttemptVote)
    .map(p => ({ site: p.rating || 'unknown', ts: p.stats.lastAttemptVote, ok: p.stats.lastAttemptVote === p.stats.lastSuccessVote }))
    .sort((a, b) => b.ts - a.ts).slice(0, 8);

  return {
    totals: { attemptsAll, successAll, errorAll, laterAll, successRateAll, monthSuccess, lastMonthSuccess, monthDelta, todayTotal, todaySucc: tSucc, todayRate, avgPerDay, streak },
    trend: { days, successSeries, errorSeries },
    topAll,
    recent
  };
}

function renderPills(t) {
  els.pillTotal.textContent = fmt(t.attemptsAll);
  els.pillToday.textContent = fmt(t.todayTotal);
  els.pillSuccess.textContent = `${t.successRateAll}%`;
  els.pillStreak.textContent = t.streak ? `${t.streak}d` : '—';
}

function renderKPIs(t) {
  els.kpiMonthLabel.textContent = getMonthLabel();
  els.kpiTotal.textContent = fmt(t.attemptsAll);
  els.kpiAvg.textContent = chrome.i18n.getMessage("kpiAvgPerDay",`${fmt(t.avgPerDay)}`);
  els.kpiToday.textContent = fmt(t.todayTotal);
  els.kpiTodaySuccess.textContent = `${t.todayRate}% ${i18n('success')}`;
  els.kpiMonthVotes.textContent = fmt(t.monthSuccess);
  const sign = t.monthDelta > 0 ? '+' : '';
  els.kpiLastMonthDelta.textContent = chrome.i18n.getMessage("kpiLastMonthDelta",`${sign}${t.monthDelta}`);
  els.kpiSuccessRate.textContent = `${t.successRateAll}%`;
  els.kpiErrors.textContent = `${fmt(t.errorAll)} ${chrome.i18n.getMessage('errors')}`;
}

function pathFromSeries(series, w=320, h=80, pad=6) {
  const max = Math.max(1, ...series);
  const stepX = (w - pad*2) / Math.max(1, series.length - 1);
  const scaleY = (h - pad*2) / max;
  const points = series.map((v, i) => {
    const x = pad + i*stepX;
    const y = h - pad - v*scaleY;
    return { x, y };
  });
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { d, points, max, stepX, scaleY, pad, w, h };
}

function renderSparklines(tr) {
  const ok = pathFromSeries(tr.successSeries);
  const er = pathFromSeries(tr.errorSeries);

  els.sparkSuccess.innerHTML = `
    <defs>
      <linearGradient id="okFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--ok)" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path class="line-ok" d="${ok.d}" fill="none" stroke="var(--ok)" stroke-width="2" style="opacity:${showOk?1:.15}"/>
    <path class="area-ok" d="${ok.d} L 314,74 L 6,74 Z" fill="url(#okFill)" opacity="${showOk?.6:0}"/>
    <line class="guide" x1="0" y1="${ok.pad}" x2="0" y2="${ok.h - ok.pad}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3,3" style="display:none"/>
    <circle class="marker-ok" r="3.5" fill="var(--ok)" stroke="#000" stroke-width="1" style="display:none"/>
  `;
  els.sparkErrors.innerHTML = `
    <defs>
      <linearGradient id="errFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--error)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path class="line-err" d="${er.d}" fill="none" stroke="var(--error)" stroke-width="2" style="opacity:${showErr?1:.15}"/>
    <path class="area-err" d="${er.d} L 314,74 L 6,74 Z" fill="url(#errFill)" opacity="${showErr?.5:0}"/>
    <line class="guide" x1="0" y1="${er.pad}" x2="0" y2="${er.h - er.pad}" stroke="rgba(255,255,255,.35)" stroke-dasharray="3,3" style="display:none"/>
    <circle class="marker-err" r="3.5" fill="var(--error)" stroke="#000" stroke-width="1" style="display:none"/>
  `;

  setupSparkInteractions(tr, ok, er);
  $('#sparkStartLabel').textContent = '−30d';
  $('#sparkEndLabel').textContent = i18n('today') || 'Today';
}

function setupSparkInteractions(tr, ok, er) {
  if (!els.sparkWrap) return;

  let tip = els.sparkWrap.querySelector('.sparkTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'sparkTooltip';
    tip.style.display = 'none';
    els.sparkWrap.appendChild(tip);
  }

  const update = (svg, which, idx, clientX) => {
    const points = which === 'ok' ? ok.points : er.points;
    const marker = svg.querySelector(`.marker-${which}`);
    const guide = svg.querySelector('.guide');
    const p = points[idx];
    if (!p) return;
    guide.setAttribute('x1', p.x); guide.setAttribute('x2', p.x);
    guide.style.display = 'block';
    marker.setAttribute('cx', p.x); marker.setAttribute('cy', p.y);
    marker.style.display = (which === 'ok' ? showOk : showErr) ? 'block' : 'none';

    // Tooltip: show both series values for the day
    const succ = tr.successSeries[idx] ?? 0;
    const errv = tr.errorSeries[idx] ?? 0;
    const date = new Date(tr.days[idx]).toLocaleDateString();
    tip.innerHTML = `
      <div class="line"><span class="dot ok"></span><strong>${succ}</strong></div>
      <div class="line"><span class="dot err"></span><strong>${errv}</strong></div>
      <div class="muted">${date}</div>
    `;
    tip.style.display = 'block';
    const wrapRect = els.sparkWrap.getBoundingClientRect();
    tip.style.left = `${clientX - wrapRect.left}px`;
    tip.style.top = `8px`;
  };

  const onMove = (svg, which, e) => {
    const rect = svg.getBoundingClientRect();
    const w = rect.width; const pad = (which === 'ok' ? ok.pad : er.pad);
    const N = (which === 'ok' ? ok.points.length : er.points.length);
    const x = Math.min(Math.max(0, e.clientX - rect.left - (pad * (w / 320))), (w * (1 - (pad * 2 / 320))));
    const idx = Math.round((x / (w - 2*pad*(w/320))) * (N - 1));
    update(svg, which, idx, e.clientX);
  };

  const onLeave = (svg) => {
    svg.querySelectorAll('.guide,.marker-ok,.marker-err').forEach(el => el.style.display = 'none');
    if (tip) tip.style.display = 'none';
  };

  els.sparkSuccess.onmousemove = (e) => onMove(els.sparkSuccess, 'ok', e);
  els.sparkErrors.onmousemove = (e) => onMove(els.sparkErrors, 'err', e);
  els.sparkSuccess.onmouseleave = () => onLeave(els.sparkSuccess);
  els.sparkErrors.onmouseleave = () => onLeave(els.sparkErrors);

  // Legend toggles
  if (els.legend) {
    // Make spans clickable (dot + next label)
    const dots = els.legend.querySelectorAll('.dot');
    // success toggle
    dots[0]?.addEventListener('click', () => {
      showOk = !showOk;
      els.legend.querySelector('.dot.ok')?.classList.toggle('off', !showOk);
      renderSparklines(tr);
    });
    // errors toggle
    dots[1]?.addEventListener('click', () => {
      showErr = !showErr;
      els.legend.querySelector('.dot.err')?.classList.toggle('off', !showErr);
      renderSparklines(tr);
    });
  }
}

// Favicon helpers
function domainFrom(site) {
  try {
    if (/^https?:\/\//i.test(site)) return new URL(site).hostname;
    if (site.includes('/')) return site.split('/')[0];
    return site;
  } catch { return site; }
}

function setFavicon(imgEl, site) {
  const domain = domainFrom(site || '');
  if (!domain || domain === 'unknown') {
    imgEl.src = 'images/icons/link.svg';
    return;
  }
  const sources = [
    `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`,
    `https://${domain}/favicon.ico`,
    `http://${domain}/favicon.ico`,
  ];
  let step = 0;
  const tryNext = () => {
    if (step >= sources.length) { imgEl.src = 'images/icons/link.svg'; return; }
    imgEl.src = sources[step++];
  };
  imgEl.onerror = tryNext;
  tryNext();
}

function rateColor(rate) {
  // Map 0..100 -> red..green (H=0..120)
  const h = Math.max(0, Math.min(120, Math.round(rate * 1.2)));
  return `hsl(${h} 70% 40%)`;
}

function renderLeaderboard(top) {
  let rows = top.map(s => ({
    site: s.site,
    count: range === 'month' ? s.countMonth : s.countAll,
    rate: s.rate,
    last: s.last
  }));

  const dir = sortDir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const ax = typeof a[sortKey] === 'string' ? a[sortKey].toLowerCase() : a[sortKey];
    const bx = typeof b[sortKey] === 'string' ? b[sortKey].toLowerCase() : b[sortKey];
    if (ax < bx) return -1 * dir; if (ax > bx) return 1 * dir; return 0;
  });

  els.leaderBody.innerHTML = '';
  const tpl = $('#tmplLeaderRow');
  rows.slice(0, 10).forEach(row => {
    const node = tpl.content.cloneNode(true);
    const nameEl = node.querySelector('.name');
    const domainEl = node.querySelector('.domain');
    nameEl.textContent = row.site;
    domainEl.textContent = domainFrom(row.site);
    const ico = node.querySelector('.ico');
    setFavicon(ico, row.site);

    node.querySelector('.count strong').textContent = fmt(row.count);

    // Replace bar+val with ellipse pill
    const rateCell = node.querySelector('.cell.rate');
    const pill = document.createElement('span');
    pill.className = 'ellipse';
    const r = Math.max(0, Math.min(100, Number(row.rate || 0)));
    pill.textContent = isFinite(r) ? `${r}%` : '—';
    pill.style.background = rateColor(r);
    pill.style.color = '#fff';
    rateCell.innerHTML = '';
    rateCell.appendChild(pill);

    node.querySelector('.last time').textContent = row.last ? new Date(row.last).toLocaleString() : '—';
    els.leaderBody.appendChild(node);
  });
}

function renderActivity(list) {
  els.activity.innerHTML = list.map(item => {
    const what = item.ok ? i18n('ok') : i18n('err');
    const when = new Date(item.ts).toLocaleString();
    return `<li>
      <span class="dot ${item.ok ? 'ok' : 'err'}"></span>
      <span class="what">${what} — ${domainFrom(item.site)}</span>
      <time class="when">${when}</time>
    </li>`;
  }).join('') || '';
}

function updateSortAria(btn) {
  els.leaderSortBtns.forEach(b => b.setAttribute('aria-sort', 'none'));
  btn?.setAttribute('aria-sort', sortDir === 'desc' ? 'descending' : 'ascending');
}

function bindUI() {
  els.leaderSortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      if (sortKey === key) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      else { sortKey = key; sortDir = 'desc'; }
      updateSortAria(btn);
      if (cache) renderLeaderboard(cache.topAll);
    });
  });

  [els.rangeMonth, els.rangeAll].forEach(el => {
    el?.addEventListener('click', () => {
      range = el.dataset.range;
      els.rangeMonth.setAttribute('aria-pressed', String(range === 'month'));
      els.rangeAll.setAttribute('aria-pressed', String(range === 'all'));
      if (cache) renderLeaderboard(cache.topAll);
    });
  });

  els.dashboardTab?.addEventListener('click', () => {
    // Defer first render till opened
    if (!refreshTimer) renderDashboard();
  });
}

function renderChips(totals) {
  if (els.chipToday && els.chipTotal) {
    els.chipToday.textContent = `${i18n('today') || 'Today'}: ${fmt(totals.todayTotal)}`;
    els.chipTotal.textContent = `${i18n('totalVotes') || 'Total'}: ${fmt(totals.attemptsAll)}`;
  }
}

async function renderDashboard() {
  try {
    await initializeConfig({ background: false });

    const raw = await fetchData();
    const agg = aggregate(raw);
    cache = agg;

    renderPills(agg.totals);
    renderKPIs(agg.totals);
    renderSparklines(agg.trend);
    renderLeaderboard(agg.topAll);
    renderActivity(agg.recent);
    renderChips(agg.totals);

    if (!refreshTimer) {
      refreshTimer = setInterval(async () => {
        const visible = els.dashboardPanel && els.dashboardPanel.style.display !== 'none' && els.dashboardPanel.offsetParent !== null;
        if (!visible) return;
        const raw2 = await fetchData();
        const agg2 = aggregate(raw2);
        cache = agg2;
        renderPills(agg2.totals);
        renderKPIs(agg2.totals);
        renderSparklines(agg2.trend);
        renderLeaderboard(agg2.topAll);
        renderActivity(agg2.recent);
        renderChips(agg2.totals);
      }, 60_000);
    }
  } catch (e) {
    console.warn('[Dashboard] render failed:', e);
  }
}

function boot() {
  bindUI();
  // If Dashboard panel is already visible (dev), render now
  if (els.dashboardPanel && els.dashboardPanel.style.display !== 'none') renderDashboard();
}

document.addEventListener('DOMContentLoaded', boot);