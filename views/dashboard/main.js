/* view/dashboard/main.js — UMD provider "dashboard"
   - Parité avec le dashboard original (sparklines interactives, legend, leaderboard ellipse, favicons)
   - i18n via AVRFW.t / chrome.i18n
   - Backend pluggable: window.AVRFW_DASHBOARD_BACKEND = { initializeConfig, DB }
     (DB doit fournir: get(store,key), getAll(store))
*/
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], function(){ return factory(root.AVRFW); });
  else if (typeof module === 'object' && module.exports) module.exports = factory(require('AVRFW'));
  else factory(root.AVRFW);
}(typeof self !== 'undefined' ? self : this, function(AVRFW){

  function provide(name, def){
    if (AVRFW && AVRFW.provide) { AVRFW.provide(name, def); return; }
    var g = (typeof self !== 'undefined' ? self : this);
    var hub = g.__AVRFW_PROVIDERS__ = g.__AVRFW_PROVIDERS__ || { defs:{}, waiters:{} };
    hub.defs[name] = def;
    var w = hub.waiters[name] || [];
    w.forEach(function(fn){ try{ fn(def); }catch(e){} });
    hub.waiters[name] = [];
  }

  function makeI18n(){
    return function i18n(k, a){
      try {
        if (AVRFW && AVRFW.t) {
          var s = AVRFW.t(k, a);
          if (s) return s;
        }
        if (root.chrome && root.chrome.i18n && typeof root.chrome.i18n.getMessage === 'function') {
          var m = root.chrome.i18n.getMessage(k, a);
          if (m) return m;
        }
      } catch(e){}
      var fallback = {
        dashboard: 'Dashboard', overview:'Overview', totalVotes:'Total votes', today:'Today',
        thisMonth:'This month', allTime:'All time', live:'Live', reliability:'Reliability',
        successRate:'Success rate', errors:'Errors', monthlyTrend:'Monthly trend',
        topSites:'Top vote sites', votes:'Votes', success:'Success', last:'Last',
        recentActivity:'Recent activity', streak:'Streak', site:'Site', ok:'Vote success', err:'Vote error',
        kpiAvgPerDay: 'Avg per day: ' + (Array.isArray(a)?a[0]:a||''),
        kpiLastMonthDelta: (Array.isArray(a)?a[0]:a||'') + '% vs last'
      };
      return fallback[k] || k;
    };
  }

  function domainFrom(site) {
    try {
      if (/^https?:\/\//i.test(site)) return new URL(site).hostname;
      if (site && site.includes('/')) return site.split('/')[0];
      return site || '';
    } catch { return site || ''; }
  }
  function setFavicon(imgEl, site) {
    var domain = domainFrom(site || '');
    if (!domain || domain === 'unknown') { imgEl.src = 'images/icons/link.svg'; return; }
    var sources = [
      'https://www.google.com/s2/favicons?sz=64&domain=' + encodeURIComponent(domain),
      'https://' + domain + '/favicon.ico',
      'http://' + domain + '/favicon.ico'
    ];
    var step = 0;
    var tryNext = function(){ if (step >= sources.length) { imgEl.src = 'images/icons/link.svg'; return; } imgEl.src = sources[step++]; };
    imgEl.onerror = tryNext; tryNext();
  }
  function rateColor(rate) {
    var h = Math.max(0, Math.min(120, Math.round(rate * 1.2)));
    return 'hsl(' + h + ' 70% 40%)';
  }

  function pathFromSeries(series, w, h, pad) {
    if (w===void 0) w=320; if (h===void 0) h=80; if (pad===void 0) pad=6;
    var max = Math.max(1, 0, ...series);
    var stepX = (w - pad*2) / Math.max(1, series.length - 1);
    var scaleY = (h - pad*2) / max;
    var points = series.map(function(v,i){
      var x = pad + i*stepX;
      var y = h - pad - v*scaleY;
      return {x:x, y:y};
    });
    var d = points.map(function(p,i){ return (i?'L':'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    return { d:d, points:points, max:max, stepX:stepX, scaleY:scaleY, pad:pad, w:w, h:h };
  }
  function dayStart(ts){ var d = new Date(ts); d.setHours(0,0,0,0); return +d; }
  function fmt(n){ return isFinite(n) ? n.toLocaleString() : '—'; }

  function initDashboard(ctx){
    var rootEl = ctx.root;
    var i18n = makeI18n();

    // Scoped selectors
    var $ = function(sel){ return rootEl.querySelector(sel); };
    var $$ = function(sel){ return Array.prototype.slice.call(rootEl.querySelectorAll(sel)); };

    var showOk = true, showErr = true;
    var sortKey = 'count', sortDir = 'desc', range = 'month';
    var cache = null, refreshTimer = null;

    var els = {
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
      dashboardPanel: $('#dashboard'),
      legend: $('.card .legend')
    };

    function getMonthLabel(d){ d = d||new Date(); return new Intl.DateTimeFormat(undefined, { month:'long' }).format(d); }

    // Backend adapter (optional)
    var backend = root.AVRFW_DASHBOARD_BACKEND || (AVRFW && AVRFW.backend) || null;

    async function fetchData() {
      if (!backend || !backend.DB) {
        // Demo fallback
        return {
          general: { successVotes: 1200, errorVotes: 80, laterVotes: 20, monthSuccessVotes: 90, lastMonthSuccessVotes: 70, added: Date.now()-20*86400000 },
          today: { successVotes: 5, errorVotes: 1, laterVotes: 0, lastSuccessVote: Date.now()-3600000, lastAttemptVote: Date.now()-1800000 },
          projects: [
            { rating:'minecraftrating.ru', stats:{ successVotes:120, errorVotes:8, laterVotes:1, monthSuccessVotes:12, lastAttemptVote: Date.now()-2*3600000, lastSuccessVote: Date.now()-2*3600000 } },
            { rating:'monitoringminecraft.ru', stats:{ successVotes:80, errorVotes:10, laterVotes:2, monthSuccessVotes:8, lastAttemptVote: Date.now()-4*3600000, lastSuccessVote: Date.now()-5*3600000 } },
            { rating:'minecraftlist.org', stats:{ successVotes:45, errorVotes:6, laterVotes:1, monthSuccessVotes:5, lastAttemptVote: Date.now()-6*3600000, lastSuccessVote: Date.now()-6*3600000 } }
          ]
        };
      }
      await (backend.initializeConfig ? backend.initializeConfig({ background:false }) : Promise.resolve());
      var res = await Promise.all([
        backend.DB.get('other','generalStats'),
        backend.DB.get('other','todayStats'),
        backend.DB.getAll('projects')
      ]);
      return { general: res[0]||{}, today: res[1]||{}, projects: res[2]||[] };
    }

    function aggregate(data) {
      var general = data.general||{}, today = data.today||{}, projects = data.projects||[];
      var successAll = Number(general.successVotes||0);
      var errorAll = Number(general.errorVotes||0);
      var laterAll = Number(general.laterVotes||0);
      var attemptsAll = successAll + errorAll + laterAll;
      var successRateAll = attemptsAll ? Math.round((successAll/attemptsAll)*100) : 0;

      var tSucc = Number(today.successVotes||0);
      var tErr  = Number(today.errorVotes||0);
      var tLater= Number(today.laterVotes||0);
      var todayTotal = tSucc + tErr + tLater;
      var todayRate = todayTotal ? Math.round((tSucc/todayTotal)*100) : 0;

      var monthSuccess = Number(general.monthSuccessVotes||0);
      var lastMonthSuccess = Number(general.lastMonthSuccessVotes||0);
      var monthDelta = lastMonthSuccess ? Math.round(((monthSuccess-lastMonthSuccess)/lastMonthSuccess)*100) : (monthSuccess?100:0);

      var since = Number(general.added || Date.now());
      var daysActive = Math.max(1, Math.ceil((Date.now()-since)/86400000));
      var avgPerDay = Math.round(attemptsAll / daysActive);

      var daysWithSuccess = new Set(
        projects.map(function(p){return p && p.stats && p.stats.lastSuccessVote;}).filter(Boolean).map(dayStart)
      );
      var streak=0; for (var i=0;i<365;i++){ var ds = dayStart(Date.now()-i*86400000); if (daysWithSuccess.has(ds)) streak++; else break; }

      var days = Array.from({length:30}, function(_,i){ return dayStart(Date.now() - (29-i)*86400000); });
      var successSeries = days.map(function(ds){ return projects.filter(function(p){ return dayStart(p && p.stats && p.stats.lastSuccessVote || 0) === ds; }).length; });
      var errorSeries = days.map(function(ds){ return projects.filter(function(p){
        var la = (p && p.stats && p.stats.lastAttemptVote) || 0; if (!la) return false; if (dayStart(la)!==ds) return false; return la !== (p && p.stats && p.stats.lastSuccessVote);
      }).length; });

      var bySite = new Map();
      projects.forEach(function(p){
        var site = p.rating || 'unknown';
        var s = bySite.get(site) || { site:site, succ:0, err:0, later:0, monthSucc:0, last:0 };
        s.succ += Number(p && p.stats && p.stats.successVotes || 0);
        s.err  += Number(p && p.stats && p.stats.errorVotes || 0);
        s.later+= Number(p && p.stats && p.stats.laterVotes || 0);
        s.monthSucc += Number(p && p.stats && p.stats.monthSuccessVotes || 0);
        s.last = Math.max(s.last, Number(p && p.stats && p.stats.lastAttemptVote || 0));
        bySite.set(site, s);
      });
      var topAll = Array.from(bySite.values()).map(function(s){
        var attempts = s.succ + s.err + s.later;
        var rate = attempts ? Math.round((s.succ/attempts)*100) : 0;
        return { site:s.site, countAll:s.succ, countMonth:s.monthSucc, rate:rate, last:s.last };
      });

      var recent = projects
        .filter(function(p){ return p && p.stats && p.stats.lastAttemptVote; })
        .map(function(p){ return { site:p.rating||'unknown', ts:p.stats.lastAttemptVote, ok:p.stats.lastAttemptVote===p.stats.lastSuccessVote }; })
        .sort(function(a,b){ return b.ts - a.ts; })
        .slice(0,8);

      return {
        totals: { attemptsAll, successAll, errorAll, laterAll, successRateAll, monthSuccess, lastMonthSuccess, monthDelta, todayTotal, todaySucc:tSucc, todayRate, avgPerDay, streak },
        trend: { days, successSeries, errorSeries },
        topAll: topAll,
        recent: recent
      };
    }

    function renderPills(t) {
      els.pillTotal.textContent = fmt(t.attemptsAll);
      els.pillToday.textContent = fmt(t.todayTotal);
      els.pillSuccess.textContent = (t.successRateAll||0) + '%';
      els.pillStreak.textContent = t.streak ? (t.streak + 'd') : '—';
    }
    function renderKPIs(t) {
      els.kpiMonthLabel.textContent = getMonthLabel();
      els.kpiTotal.textContent = fmt(t.attemptsAll);
      els.kpiAvg.textContent = i18n('kpiAvgPerDay', fmt(t.avgPerDay));
      els.kpiToday.textContent = fmt(t.todayTotal);
      els.kpiTodaySuccess.textContent = (t.todayRate||0) + '% ' + (i18n('success')||'Success');
      els.kpiMonthVotes.textContent = fmt(t.monthSuccess);
      var sign = t.monthDelta > 0 ? '+' : '';
      els.kpiLastMonthDelta.textContent = i18n('kpiLastMonthDelta', sign + t.monthDelta);
      els.kpiSuccessRate.textContent = (t.successRateAll||0) + '%';
      els.kpiErrors.textContent = fmt(t.errorAll) + ' ' + (i18n('errors')||'Errors');
    }

    function renderSparklines(tr) {
      var ok = pathFromSeries(tr.successSeries);
      var er = pathFromSeries(tr.errorSeries);

      els.sparkSuccess.innerHTML =
        '<defs>' +
          '<linearGradient id="okFill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="var(--ok)" stop-opacity="0.32"/>' +
            '<stop offset="100%" stop-color="transparent" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<path class="line-ok" d="'+ok.d+'" fill="none" stroke="var(--ok)" stroke-width="2" style="opacity:'+(showOk?1:.15)+'"/>' +
        '<path class="area-ok" d="'+ok.d+' L 314,74 L 6,74 Z" fill="url(#okFill)" opacity="'+(showOk?0.6:0)+'"/>' +
        '<line class="guide" x1="0" y1="'+ok.pad+'" x2="0" y2="'+(ok.h-ok.pad)+'" stroke="rgba(255,255,255,.35)" stroke-dasharray="3,3" style="display:none"/>' +
        '<circle class="marker-ok" r="3.5" fill="var(--ok)" stroke="#000" stroke-width="1" style="display:none"/>';

      els.sparkErrors.innerHTML =
        '<defs>' +
          '<linearGradient id="errFill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="var(--error)" stop-opacity="0.25"/>' +
            '<stop offset="100%" stop-color="transparent" stop-opacity="0"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<path class="line-err" d="'+er.d+'" fill="none" stroke="var(--error)" stroke-width="2" style="opacity:'+(showErr?1:.15)+'"/>' +
        '<path class="area-err" d="'+er.d+' L 314,74 L 6,74 Z" fill="url(#errFill)" opacity="'+(showErr?0.5:0)+'"/>' +
        '<line class="guide" x1="0" y1="'+er.pad+'" x2="0" y2="'+(er.h-er.pad)+'" stroke="rgba(255,255,255,.35)" stroke-dasharray="3,3" style="display:none"/>' +
        '<circle class="marker-err" r="3.5" fill="var(--error)" stroke="#000" stroke-width="1" style="display:none"/>';

      setupSparkInteractions(tr, ok, er);
      $('#sparkStartLabel').textContent = '−30d';
      $('#sparkEndLabel').textContent = i18n('today') || 'Today';
    }

    function setupSparkInteractions(tr, ok, er) {
      if (!els.sparkWrap) return;
      var tip = els.sparkWrap.querySelector('.sparkTooltip');
      if (!tip) {
        tip = document.createElement('div'); tip.className='sparkTooltip'; tip.style.display='none';
        els.sparkWrap.appendChild(tip);
      }

      var update = function(svg, which, idx, clientX){
        var points = which==='ok'? ok.points : er.points;
        var marker = svg.querySelector('.marker-'+which);
        var guide = svg.querySelector('.guide');
        var p = points[idx]; if (!p) return;
        guide.setAttribute('x1', p.x); guide.setAttribute('x2', p.x);
        guide.style.display='block';
        marker.setAttribute('cx', p.x); marker.setAttribute('cy', p.y);
        marker.style.display = ((which==='ok'?showOk:showErr) ? 'block':'none');

        var succ = tr.successSeries[idx] || 0;
        var errv = tr.errorSeries[idx] || 0;
        var date = new Date(tr.days[idx]).toLocaleDateString();
        tip.innerHTML =
          '<div class="line"><span class="dot ok"></span><strong>'+succ+'</strong></div>' +
          '<div class="line"><span class="dot err"></span><strong>'+errv+'</strong></div>' +
          '<div class="muted">'+date+'</div>';
        tip.style.display='block';
        var wrapRect = els.sparkWrap.getBoundingClientRect();
        tip.style.left = (clientX - wrapRect.left) + 'px';
        tip.style.top = '8px';
      };

      var onMove = function(svg, which, e){
        var rect = svg.getBoundingClientRect();
        var w = rect.width; var pad = (which==='ok'? ok.pad : er.pad);
        var N = (which==='ok'? ok.points.length : er.points.length);
        var x = Math.min(Math.max(0, e.clientX - rect.left - (pad * (w/320))), (w * (1 - (pad*2/320))));
        var idx = Math.round((x / (w - 2*pad*(w/320))) * (N - 1));
        update(svg, which, idx, e.clientX);
      };

      var onLeave = function(svg){
        svg.querySelectorAll('.guide,.marker-ok,.marker-err').forEach(function(el){ el.style.display='none'; });
        tip.style.display='none';
      };

      els.sparkSuccess.onmousemove = function(e){ onMove(els.sparkSuccess, 'ok', e); };
      els.sparkErrors.onmousemove = function(e){ onMove(els.sparkErrors, 'err', e); };
      els.sparkSuccess.onmouseleave = function(){ onLeave(els.sparkSuccess); };
      els.sparkErrors.onmouseleave = function(){ onLeave(els.sparkErrors); };

      // Legend toggles
      if (els.legend) {
        var dots = els.legend.querySelectorAll('.dot');
        dots[0] && dots[0].addEventListener('click', function(){
          showOk = !showOk;
          var d = els.legend.querySelector('.dot.ok'); if (d) d.classList.toggle('off', !showOk);
          renderSparklines(tr);
        });
        dots[1] && dots[1].addEventListener('click', function(){
          showErr = !showErr;
          var d = els.legend.querySelector('.dot.err'); if (d) d.classList.toggle('off', !showErr);
          renderSparklines(tr);
        });
      }
    }

    function renderLeaderboard(top) {
      var rows = top.map(function(s){
        return { site:s.site, count: (range==='month'? s.countMonth : s.countAll), rate:s.rate, last:s.last };
      });
      var dir = (sortDir==='desc') ? -1 : 1;
      rows.sort(function(a,b){
        var ax = (typeof a[sortKey]==='string') ? a[sortKey].toLowerCase() : a[sortKey];
        var bx = (typeof b[sortKey]==='string') ? b[sortKey].toLowerCase() : b[sortKey];
        if (ax<bx) return -1*dir; if (ax>bx) return 1*dir; return 0;
      });

      els.leaderBody.innerHTML = '';
      var tpl = $('#tmplLeaderRow');
      rows.slice(0,10).forEach(function(row){
        var node = tpl.content.cloneNode(true);
        var nameEl = node.querySelector('.name');
        var domainEl = node.querySelector('.domain');
        nameEl.textContent = row.site;
        domainEl.textContent = domainFrom(row.site);
        var ico = node.querySelector('.ico');
        setFavicon(ico, row.site);

        node.querySelector('.count strong').textContent = fmt(row.count);

        var rateCell = node.querySelector('.cell.rate');
        var pill = document.createElement('span');
        pill.className = 'ellipse';
        var r = Math.max(0, Math.min(100, Number(row.rate||0)));
        pill.textContent = isFinite(r) ? (r + '%') : '—';
        pill.style.background = rateColor(r);
        pill.style.color = '#fff';
        rateCell.innerHTML = '';
        rateCell.appendChild(pill);

        node.querySelector('.last time').textContent = row.last ? new Date(row.last).toLocaleString() : '—';
        els.leaderBody.appendChild(node);
      });
    }

    function renderActivity(list) {
      els.activity.innerHTML = (list.map(function(item){
        var what = item.ok ? (i18n('ok') || 'Vote success') : (i18n('err') || 'Vote error');
        var when = new Date(item.ts).toLocaleString();
        return '<li>' +
          '<span class="dot '+(item.ok?'ok':'err')+'"></span>' +
          '<span class="what">'+ what +' — '+ domainFrom(item.site) +'</span>' +
          '<time class="when">'+ when +'</time>' +
        '</li>';
      }).join('')) || '';
    }

    function updateSortAria(btn) {
      els.leaderSortBtns.forEach(function(b){ b.setAttribute('aria-sort','none'); });
      if (btn) btn.setAttribute('aria-sort', sortDir==='desc' ? 'descending' : 'ascending');
    }

    function bindUI() {
      els.leaderSortBtns.forEach(function(btn){
        btn.addEventListener('click', function(){
          var key = btn.dataset.sort;
          if (sortKey === key) sortDir = (sortDir==='desc' ? 'asc' : 'desc');
          else { sortKey = key; sortDir = 'desc'; }
          updateSortAria(btn);
          if (cache) renderLeaderboard(cache.topAll);
        });
      });

      [els.rangeMonth, els.rangeAll].forEach(function(el){
        if (!el) return;
        el.addEventListener('click', function(){
          range = el.dataset.range;
          els.rangeMonth && els.rangeMonth.setAttribute('aria-pressed', String(range==='month'));
          els.rangeAll && els.rangeAll.setAttribute('aria-pressed', String(range==='all'));
          if (cache) renderLeaderboard(cache.topAll);
        });
      });
    }

    function renderChips(totals){
      // Optionnel: éléments externes (#todayStats / #generalStats) — ignorés s'ils n'existent pas.
      var chipToday = document.querySelector('#todayStats');
      var chipTotal = document.querySelector('#generalStats');
      if (chipToday && chipTotal) {
        chipToday.textContent = (i18n('today') || 'Today') + ': ' + fmt(totals.todayTotal);
        chipTotal.textContent = (i18n('totalVotes') || 'Total') + ': ' + fmt(totals.attemptsAll);
      }
    }

    async function renderDashboard(){
      try{
        var raw = await fetchData();
        var agg = aggregate(raw);
        cache = agg;

        renderPills(agg.totals);
        renderKPIs(agg.totals);
        renderSparklines(agg.trend);
        renderLeaderboard(agg.topAll);
        renderActivity(agg.recent);
        renderChips(agg.totals);

        if (!refreshTimer) {
          refreshTimer = setInterval(async function(){
            // visible + toujours dans le DOM
            var visible = !!(rootEl && rootEl.offsetParent !== null && document.body.contains(rootEl));
            if (!visible) return;
            var raw2 = await fetchData();
            var agg2 = aggregate(raw2);
            cache = agg2;
            renderPills(agg2.totals);
            renderKPIs(agg2.totals);
            renderSparklines(agg2.trend);
            renderLeaderboard(agg2.topAll);
            renderActivity(agg2.recent);
            renderChips(agg2.totals);
          }, 60000);
        }
      } catch(e){
        console.warn('[Dashboard] render failed:', e);
      }
    }

    bindUI();
    renderDashboard();

    // Expose cleanup timer
    return function teardown(){
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    };
  }

  var viewDef = {
    controller: function(){ return { state:{}, methods:{} }; },
    onMounted: function(ctx){
      // Inject i18n strings in static nodes for this view
      if (AVRFW && AVRFW.translate) AVRFW.translate(ctx.root);
      // Init dashboard features
      ctx._teardown = initDashboard(ctx);
    },
    onBeforeUnmount: function(ctx){
      if (ctx && ctx._teardown) { try{ ctx._teardown(); }catch(e){} }
    }
  };

  provide('dashboard', viewDef);
}));