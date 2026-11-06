/* Shared helpers. Every demo registers itself on PF.demos. */
(function () {
  'use strict';
  var PF = (window.PF = window.PF || {});
  PF.demos = PF.demos || {};

  /** Seeded PRNG (mulberry32) so sample data is identical on every load. */
  PF.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /** Standard normal draws from a uniform RNG (Box-Muller). */
  PF.gauss = function (rng) {
    return function () {
      var u = 0, v = 0;
      while (u === 0) u = rng();
      v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
  };
  PF.$ = function (sel, root) { return (root || document).querySelector(sel); };
  PF.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  PF.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  PF.css = function (name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };
  PF.fmt = function (x, d) {
    d = d === undefined ? 0 : d;
    return Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  PF.mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; };

  /** Colours for charts, read from CSS tokens so light/dark both work. */
  PF.colors = function () {
    return {
      text: PF.css('--text-2'), muted: PF.css('--muted'), grid: PF.css('--chart-grid'),
      surface: PF.css('--surface'), accent: PF.css('--chart-1'), c2: PF.css('--chart-2'),
      c3: PF.css('--chart-3'), c4: PF.css('--chart-4'), danger: PF.css('--danger'),
      warn: PF.css('--warn'), border: PF.css('--border')
    };
  };
  PF.applyChartDefaults = function () {
    if (!window.Chart) return;
    var c = PF.colors();
    Chart.defaults.color = c.text;
    Chart.defaults.borderColor = c.grid;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
  };
  /** Convert a CSS colour to rgba with alpha (supports #rgb, #rrggbb, rgb/rgba). */
  PF.alpha = function (col, a) {
    col = col.trim();
    if (col[0] === '#') {
      var h = col.slice(1);
      if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join('');
      var n = parseInt(h, 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    var m = col.match(/[\d.]+/g);
    if (m && m.length >= 3) return 'rgba(' + m[0] + ',' + m[1] + ',' + m[2] + ',' + a + ')';
    return col;
  };
  PF.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  PF.isNarrow = function () { return window.matchMedia('(max-width: 560px)').matches; };
})();
