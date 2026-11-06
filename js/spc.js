/* e. Manufacturing quality monitor: X-bar / R charts, Western Electric rules on a simulated stream, Pareto chart. */
(function () {
  'use strict';
  var PF = window.PF, $ = PF.$;

  var N = 5, A2 = 0.577, D3 = 0, D4 = 2.114; // SPC constants for subgroup size 5
  var TARGET = 3000, SD = 60;                // simulated viscosity, mPa·s
  var BASE = 25, WINDOW = 50, TICK = 1000;
  var DEFECTS = [ // sample defect log counts
    ['Viscosity out of spec', 42], ['Phase separation', 27], ['Fill weight', 18],
    ['Seal leak', 11], ['Label misprint', 7], ['Colour drift', 5]
  ];

  var g = PF.gauss(PF.rng(7));
  var sub = [];          // { i, xbar, r, rules: [] }
  var offset = 0, drift = 0, spike = false;
  var lim = null, timer = null, paused = false;
  var chX, chR, chP, logItems = [];

  function makeSubgroup() {
    if (drift) offset += drift;
    var xs = [];
    for (var k = 0; k < N; k++) xs.push(TARGET + offset + SD * g());
    if (spike) { xs = xs.map(function (x) { return x + 4.5 * SD; }); spike = false; }
    var xbar = PF.mean(xs), r = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    return { i: sub.length + 1, xbar: xbar, r: r, rules: [] };
  }

  function computeLimits() {
    var b = sub.slice(0, BASE);
    var xbb = PF.mean(b.map(function (s) { return s.xbar; })), rbar = PF.mean(b.map(function (s) { return s.r; }));
    var sig = A2 * rbar / 3; // sigma of the subgroup mean
    lim = { cl: xbb, ucl: xbb + A2 * rbar, lcl: xbb - A2 * rbar, sig: sig, rbar: rbar, rucl: D4 * rbar, rlcl: D3 * rbar };
  }

  /** Western Electric rules evaluated on the newest point. */
  function checkRules(idx) {
    var x = sub.map(function (s) { return s.xbar - lim.cl; });
    var s = lim.sig, out = [];
    function lastK(k) { return idx + 1 >= k ? x.slice(idx - k + 1, idx + 1) : null; }
    var v = x[idx], side = v > 0 ? 1 : -1;
    if (Math.abs(v) > 3 * s) out.push({ rule: 1, text: 'beyond 3σ' });
    var w3 = lastK(3);
    if (w3 && Math.abs(v) > 2 * s && w3.filter(function (z) { return z * side > 2 * s; }).length >= 2) out.push({ rule: 2, text: '2 of 3 beyond 2σ' });
    var w5 = lastK(5);
    if (w5 && Math.abs(v) > s && w5.filter(function (z) { return z * side > s; }).length >= 4) out.push({ rule: 3, text: '4 of 5 beyond 1σ' });
    var w8 = lastK(8);
    if (w8 && w8.every(function (z) { return z * side > 0; })) out.push({ rule: 4, text: '8 in a row on one side' });
    var rOut = sub[idx].r > lim.rucl || sub[idx].r < lim.rlcl;
    if (rOut) out.push({ rule: 'R', text: 'range beyond R-chart limit' });
    return out.map(function (o) { o.side = side > 0 ? 'above' : 'below'; return o; });
  }

  function push() {
    var s = makeSubgroup();
    sub.push(s);
    var idx = sub.length - 1;
    if (idx >= BASE) {
      s.rules = checkRules(idx);
      if (s.rules.length) logItems.unshift(s);
    }
  }

  function seed() {
    sub = []; logItems = []; offset = 0; drift = 0;
    for (var i = 0; i < BASE; i++) push();
    computeLimits();
    // Pre-loaded history: a small upward shift between subgroups 31 and 38, then corrected.
    for (var j = BASE; j < 42; j++) { offset = (j >= 30 && j < 38) ? 2.4 * SD / Math.sqrt(N) : 0; push(); }
    offset = 0;
  }

  function hLine(v, color, dash, label) {
    return { label: label, data: [], type: 'line', borderColor: color, borderWidth: 1.2, borderDash: dash, pointRadius: 0, fill: false, _const: v };
  }

  function buildCharts() {
    var c = PF.colors();
    if (chX) chX.destroy(); if (chR) chR.destroy(); if (chP) chP.destroy();
    var common = { animation: false, responsive: true, interaction: { mode: 'nearest', intersect: false },
      plugins: { legend: { display: !PF.isNarrow() } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } } } };

    chX = new Chart($('#spcX'), {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'Subgroup mean (X̄)', data: [], borderColor: c.accent, borderWidth: 1.8, pointRadius: [], pointBackgroundColor: [], pointBorderColor: [], tension: 0 },
        hLine(lim.ucl, c.danger, [], 'UCL / LCL'), hLine(lim.lcl, c.danger, [], 'LCL'),
        hLine(lim.cl, c.text, [], 'Centre line'),
        hLine(lim.cl + 2 * lim.sig, c.muted, [3, 3], '±1σ, ±2σ zones'), hLine(lim.cl - 2 * lim.sig, c.muted, [3, 3], 'z'),
        hLine(lim.cl + lim.sig, c.grid, [2, 4], 'z'), hLine(lim.cl - lim.sig, c.grid, [2, 4], 'z')
      ] },
      options: Object.assign({}, common, {
        plugins: { legend: { display: !PF.isNarrow(), labels: { filter: function (it) { return it.text !== 'LCL' && it.text !== 'z'; } } },
          title: { display: true, text: 'X̄ chart · viscosity (mPa·s), n = 5', align: 'start' },
          tooltip: { filter: function (it) { return it.datasetIndex === 0; },
            callbacks: { label: function (ctx) { var s = sub[sub.length - ctx.chart.data.labels.length + ctx.dataIndex]; return 'X̄ = ' + PF.fmt(ctx.raw, 1) + (s && s.rules.length ? ' · ' + s.rules.map(function (r) { return 'Rule ' + r.rule; }).join(', ') : ''); } } } },
        scales: Object.assign({}, common.scales, { y: { suggestedMin: lim.lcl - lim.sig, suggestedMax: lim.ucl + lim.sig } })
      })
    });
    chR = new Chart($('#spcR'), {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'Range (R)', data: [], borderColor: c.c2, borderWidth: 1.5, pointRadius: [], pointBackgroundColor: [], tension: 0 },
        hLine(lim.rucl, c.danger, [], 'UCL'), hLine(lim.rbar, c.text, [], 'R̄')
      ] },
      options: Object.assign({}, common, {
        plugins: { legend: { display: false }, title: { display: true, text: 'R chart', align: 'start' } },
        scales: Object.assign({}, common.scales, { y: { min: 0, suggestedMax: lim.rucl * 1.15 } })
      })
    });

    var sorted = DEFECTS.slice().sort(function (a, b) { return b[1] - a[1]; });
    var total = sorted.reduce(function (s, d) { return s + d[1]; }, 0), cum = 0;
    var cumPct = sorted.map(function (d) { cum += d[1]; return +(100 * cum / total).toFixed(1); });
    chP = new Chart($('#spcPareto'), {
      data: {
        labels: sorted.map(function (d) { return d[0]; }),
        datasets: [
          { type: 'bar', label: 'Defects (count)', data: sorted.map(function (d) { return d[1]; }), backgroundColor: PF.alpha(c.accent, 0.75), yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Cumulative %', data: cumPct, borderColor: c.c3, backgroundColor: c.c3, pointRadius: 3, yAxisID: 'y1', order: 1 },
          { type: 'line', label: '80% line', data: sorted.map(function () { return 80; }), borderColor: c.muted, borderDash: [4, 4], pointRadius: 0, yAxisID: 'y1', order: 0 }
        ]
      },
      options: { animation: false, responsive: true,
        plugins: { title: { display: true, text: 'Pareto of defect causes (' + total + ' defects, sample)', align: 'start' }, legend: { display: !PF.isNarrow() } },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: PF.isNarrow() ? 60 : 30, minRotation: 0, font: { size: 10 } } },
          y: { beginAtZero: true, title: { display: true, text: 'Count' } },
          y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { callback: function (v) { return v + '%'; } } }
        } }
    });
    var top = 0, k = 0; while (k < cumPct.length && cumPct[k] < 80) k++;
    top = k + 1;
    chP._note = top;
    refresh();
  }

  function refresh() {
    if (!chX) return;
    var c = PF.colors();
    var view = sub.slice(-WINDOW);
    var labels = view.map(function (s) { return s.i; });
    chX.data.labels = labels;
    chR.data.labels = labels;
    var xd = chX.data.datasets[0];
    xd.data = view.map(function (s) { return +s.xbar.toFixed(1); });
    xd.pointRadius = view.map(function (s) { return s.rules.length ? 5 : 2; });
    xd.pointBackgroundColor = view.map(function (s) { return s.rules.length ? c.danger : (s.i <= BASE ? c.muted : c.accent); });
    xd.pointBorderColor = xd.pointBackgroundColor;
    chX.data.datasets.slice(1).forEach(function (d) { d.data = labels.map(function () { return d._const; }); });
    var rd = chR.data.datasets[0];
    rd.data = view.map(function (s) { return +s.r.toFixed(1); });
    rd.pointRadius = view.map(function (s) { return s.r > lim.rucl ? 5 : 2; });
    rd.pointBackgroundColor = view.map(function (s) { return s.r > lim.rucl ? c.danger : c.c2; });
    chR.data.datasets.slice(1).forEach(function (d) { d.data = labels.map(function () { return d._const; }); });
    chX.update('none'); chR.update('none');

    // Status, KPIs, log
    var recent = sub.slice(-8).some(function (s) { return s.rules.length; });
    var pill = $('#spcStatus');
    pill.textContent = recent ? 'Out-of-control signal' : 'In control';
    pill.classList.toggle('alarm', recent);
    var after = sub.slice(BASE), flagged = after.filter(function (s) { return s.rules.length; }).length;
    $('#spcKpis').innerHTML =
      '<div class="kpi"><b>' + PF.fmt(lim.cl, 1) + '</b><span>Centre line</span></div>' +
      '<div class="kpi"><b>' + PF.fmt(lim.lcl, 1) + ' to ' + PF.fmt(lim.ucl, 1) + '</b><span>X̄ control limits</span></div>' +
      '<div class="kpi"><b>' + PF.fmt(lim.rbar, 1) + '</b><span>R̄ (UCL ' + PF.fmt(lim.rucl, 0) + ')</span></div>' +
      '<div class="kpi"><b>' + flagged + ' / ' + after.length + '</b><span>Monitored subgroups flagged</span></div>' +
      (chP && chP._note ? '<div class="kpi"><b>' + chP._note + ' of ' + DEFECTS.length + '</b><span>Causes giving ≥ 80% of defects</span></div>' : '');
    $('#spcLog').innerHTML = logItems.length ? logItems.slice(0, 30).map(function (s) {
      return '<li><b>Subgroup ' + s.i + '</b> · X̄ ' + PF.fmt(s.xbar, 1) + ' · ' + s.rules.map(function (r) {
        return (r.rule === 'R' ? 'R chart: ' : 'Rule ' + r.rule + ': ') + r.text + (r.rule === 'R' ? '' : ' (' + r.side + ')');
      }).join('; ') + '</li>';
    }).join('') : '<li>No violations yet.</li>';
  }

  function tick() { push(); refresh(); }
  function start() { if (!timer && !paused && !document.hidden) timer = setInterval(tick, TICK); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function init() {
    if (!window.Chart) { $('#spcLog').innerHTML = '<li>Could not load Chart.js from the CDN.</li>'; return; }
    seed();
    buildCharts();
    $('#spcPause').addEventListener('click', function () {
      paused = !paused;
      this.textContent = paused ? 'Resume stream' : 'Pause stream';
      this.setAttribute('aria-pressed', paused ? 'true' : 'false');
      if (paused) stop(); else start();
    });
    $('#spcShift').addEventListener('click', function () { drift = 0; offset = 1.8 * SD / Math.sqrt(N); });
    $('#spcDrift').addEventListener('click', function () { drift = 0.25 * SD / Math.sqrt(N); });
    $('#spcSpike').addEventListener('click', function () { spike = true; if (paused) tick(); });
    $('#spcRestore').addEventListener('click', function () { drift = 0; offset = 0; });
  }

  PF.demos.spc = {
    init: init,
    show: start,
    hide: stop,
    theme: function () { if (chX) buildCharts(); }
  };
})();
