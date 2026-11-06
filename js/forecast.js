/* d. Demand forecasting: Holt-Winters / Holt / SES written from scratch, grid-searched, MAPE on a hold-out. */
(function () {
  'use strict';
  var PF = window.PF, $ = PF.$;
  var M = 12; // season length (months)

  /** Sample series: 48 months, trend + yearly seasonality + noise, fixed seed. */
  function sampleSeries() {
    var g = PF.gauss(PF.rng(2024)), labels = [], values = [];
    for (var t = 0; t < 48; t++) {
      var d = new Date(2022, t, 1);
      labels.push(d.toLocaleString('en-US', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2));
      var season = 160 * Math.sin(2 * Math.PI * (t - 2) / 12) + 60 * Math.cos(4 * Math.PI * t / 12);
      values.push(Math.round(1200 + 14 * t + season + 45 * g()));
    }
    return { labels: labels, values: values, name: 'Sample monthly demand (units)', sample: true };
  }

  // ---- Models. Each returns { fitted, sse, n, forecast(h), params }. ----
  function ses(y, a) {
    var L = y[0], sse = 0, n = 0, fitted = [null];
    for (var t = 1; t < y.length; t++) { var f = L; fitted.push(f); var e = y[t] - f; sse += e * e; n++; L = a * y[t] + (1 - a) * L; }
    return { fitted: fitted, sse: sse, n: n, forecast: function (h) { var o = []; for (var k = 1; k <= h; k++) o.push(L); return o; }, params: { alpha: a } };
  }
  function holt(y, a, b) {
    var L = y[0], T = y[1] - y[0], sse = 0, n = 0, fitted = [null];
    for (var t = 1; t < y.length; t++) {
      var f = L + T; fitted.push(f); var e = y[t] - f; sse += e * e; n++;
      var Lp = L; L = a * y[t] + (1 - a) * (L + T); T = b * (L - Lp) + (1 - b) * T;
    }
    return { fitted: fitted, sse: sse, n: n, forecast: function (h) { var o = []; for (var k = 1; k <= h; k++) o.push(L + k * T); return o; }, params: { alpha: a, beta: b } };
  }
  function hw(y, a, b, g) {
    var L = PF.mean(y.slice(0, M)), T = (PF.mean(y.slice(M, 2 * M)) - L) / M;
    var S = y.slice(0, M).map(function (v) { return v - L; });
    var fitted = [], sse = 0, n = 0;
    for (var i = 0; i < M; i++) fitted.push(null);
    for (var t = M; t < y.length; t++) {
      var s = S[t % M], f = L + T + s; fitted.push(f);
      var e = y[t] - f; sse += e * e; n++;
      var Lp = L;
      L = a * (y[t] - s) + (1 - a) * (L + T);
      T = b * (L - Lp) + (1 - b) * T;
      S[t % M] = g * (y[t] - L) + (1 - g) * s;
    }
    var N = y.length;
    return { fitted: fitted, sse: sse, n: n, forecast: function (h) { var o = []; for (var k = 1; k <= h; k++) o.push(L + k * T + S[(N + k - 1) % M]); return o; }, params: { alpha: a, beta: b, gamma: g } };
  }

  var GRID = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  /** Grid search smoothing weights by minimising in-sample one-step-ahead SSE. */
  function fit(method, y) {
    var best = null;
    function consider(m) { if (!best || m.sse < best.sse) best = m; }
    if (method === 'ses') GRID.forEach(function (a) { consider(ses(y, a)); });
    if (method === 'holt') GRID.forEach(function (a) { GRID.forEach(function (b) { consider(holt(y, a, b)); }); });
    if (method === 'hw') GRID.forEach(function (a) { GRID.forEach(function (b) { GRID.forEach(function (g) { consider(hw(y, a, b, g)); }); }); });
    best.sigma = Math.sqrt(best.sse / Math.max(1, best.n));
    return best;
  }
  function mape(actual, pred) {
    var s = 0, n = 0;
    for (var i = 0; i < actual.length; i++) if (actual[i] !== 0) { s += Math.abs((actual[i] - pred[i]) / actual[i]); n++; }
    return n ? 100 * s / n : NaN;
  }

  var data = sampleSeries();
  var chart = null;

  function holdLen(n) { return Math.min(12, Math.max(3, Math.floor(n * 0.25))); }
  function canHW(nTrain) { return nTrain >= 2 * M + 2; }

  function evaluate() {
    var y = data.values, n = y.length, H = holdLen(n);
    var train = y.slice(0, n - H), test = y.slice(n - H);
    var results = {};
    ['hw', 'holt', 'ses'].forEach(function (m) {
      if (m === 'hw' && !canHW(train.length)) { results[m] = null; return; }
      var model = fit(m, train);
      var pred = model.forecast(H);
      results[m] = { mape: mape(test, pred), pred: pred, params: model.params };
    });
    return { H: H, results: results };
  }

  function paramStr(p) {
    return Object.keys(p).map(function (k) { return { alpha: 'α', beta: 'β', gamma: 'γ' }[k] + '=' + p[k].toFixed(2); }).join(', ');
  }

  function render() {
    var method = $('#fcMethod').value;
    var hwOpt = $('#fcMethod').querySelector('option[value="hw"]');
    var y = data.values, n = y.length;
    var ev = evaluate();
    hwOpt.disabled = !ev.results.hw;
    if (method === 'hw' && !ev.results.hw) { method = 'holt'; $('#fcMethod').value = 'holt'; }

    var h = +$('#fcH').value;
    $('#fcHOut').textContent = h;
    var full = fit(method, y);
    var fc = full.forecast(h);
    var z = 1.96;
    var lo = [], hi = [];
    fc.forEach(function (f, k) { var w = z * full.sigma * Math.sqrt(k + 1); lo.push(f - w); hi.push(f + w); });

    // Labels for the future months
    var labels = data.labels.slice();
    var last = data.labels[n - 1];
    for (var k = 1; k <= h; k++) labels.push('+' + k);
    if (data.sample) {
      labels = data.labels.slice();
      for (var j = 1; j <= h; j++) { var d = new Date(2022, n - 1 + j, 1); labels.push(d.toLocaleString('en-US', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2)); }
    }
    var pad = function (arr, before, after) { return new Array(before).fill(null).concat(arr, new Array(after || 0).fill(null)); };
    var r = ev.results[method];

    // KPIs and comparison table
    $('#fcKpis').innerHTML =
      '<div class="kpi"><b>' + (r ? r.mape.toFixed(1) + '%' : 'n/a') + '</b><span>Hold-out MAPE (' + ev.H + ' mo)</span></div>' +
      '<div class="kpi"><b>' + PF.fmt(fc[fc.length - 1]) + '</b><span>Forecast, month +' + h + '</span></div>' +
      '<div class="kpi"><b>±' + PF.fmt(z * full.sigma * Math.sqrt(h)) + '</b><span>Approx. 95% half-width</span></div>' +
      '<div class="kpi"><b>' + n + '</b><span>Data points</span></div>';
    var NAMES = { hw: 'Holt-Winters', holt: 'Holt', ses: 'Simple ES' };
    $('#fcCompare tbody').innerHTML = ['hw', 'holt', 'ses'].map(function (m) {
      var x = ev.results[m];
      return '<tr class="' + (m === method ? 'sel' : '') + '"><td>' + NAMES[m] + '</td><td class="num">' + (x ? x.mape.toFixed(2) + '%' : 'needs ≥ 2 full seasons') + '</td><td class="mono">' + (x ? paramStr(x.params) : '-') + '</td></tr>';
    }).join('');
    $('#fcMsg').textContent = data.name + '. Model fitted on all ' + n + ' points for the forward forecast; MAPE uses a fit on the first ' + (n - ev.H) + ' points only. Full-data parameters: ' + paramStr(full.params) + '.';

    var c = PF.colors();
    var datasets = [
      { label: 'Actual', data: pad(y, 0, h), borderColor: c.text, backgroundColor: c.text, borderWidth: 2, pointRadius: 0, tension: 0.2 },
      { label: 'Fitted (in-sample)', data: pad(full.fitted, 0, h), borderColor: c.c2, borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
      { label: 'Hold-out test forecast', data: r ? pad(r.pred, n - ev.H, h) : [], borderColor: c.c3, backgroundColor: c.c3, borderWidth: 2, pointRadius: 2, tension: 0.2 },
      { label: '95% band (lower)', data: pad(lo, n), borderColor: 'transparent', pointRadius: 0, fill: false },
      { label: 'Approx. 95% band', data: pad(hi, n), borderColor: 'transparent', backgroundColor: PF.alpha(c.accent, 0.18), pointRadius: 0, fill: '-1' },
      { label: 'Forecast', data: pad(fc, n), borderColor: c.accent, backgroundColor: c.accent, borderWidth: 2.5, pointRadius: 2, tension: 0.2 }
    ];
    if (chart) chart.destroy();
    chart = new Chart($('#fcChart'), {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        animation: false, responsive: true, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { filter: function (it) { return it.text !== '95% band (lower)'; } } },
          tooltip: { filter: function (it) { return it.raw !== null && it.dataset.label !== '95% band (lower)'; },
            callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + PF.fmt(ctx.raw); } } }
        },
        scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: PF.isNarrow() ? 6 : 12 }, grid: { display: false } },
          y: { ticks: { callback: function (v) { return PF.fmt(v); } } } }
      }
    });
  }

  function parseCSV(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var labels = [], values = [];
    lines.forEach(function (l) {
      var cells = l.split(/[,;\t]/).map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      var v = parseFloat(cells[cells.length - 1].replace(/[^0-9.eE+-]/g, ''));
      if (!isFinite(v)) return; // header or junk row
      values.push(v);
      labels.push(cells.length > 1 ? cells[0] : String(values.length));
    });
    return { labels: labels, values: values };
  }

  function init() {
    if (!window.Chart) { $('#fcMsg').textContent = 'Could not load Chart.js from the CDN. Check your connection.'; return; }
    $('#fcMethod').addEventListener('change', render);
    $('#fcH').addEventListener('input', render);
    $('#fcReset').addEventListener('click', function () { data = sampleSeries(); $('#fcMethod').value = 'hw'; $('#fcBadge').textContent = 'Sample data for demonstration'; render(); });
    $('#fcDownload').addEventListener('click', function () {
      var s = sampleSeries(), rows = ['month,units'];
      s.values.forEach(function (v, i) { var d = new Date(2022, i, 1); rows.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + ',' + v); });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
      a.download = 'sample-demand.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
    $('#fcFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var p = parseCSV(String(reader.result));
        if (p.values.length < 10) { $('#fcMsg').textContent = 'Need at least 10 numeric rows (found ' + p.values.length + '). Keeping the current data.'; return; }
        data = { labels: p.labels, values: p.values, name: 'Your file "' + f.name + '" (processed in your browser)', sample: false };
        $('#fcBadge').textContent = 'Your data (local only)';
        render();
      };
      reader.readAsText(f);
      this.value = '';
    });
    render();
  }

  PF.demos.forecast = { init: init, theme: function () { if (chart) render(); } };
  PF._fc = { hw: hw, fit: fit, mape: mape, sampleSeries: sampleSeries };
})();
