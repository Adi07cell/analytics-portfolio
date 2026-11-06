/* Navigation, theming and demo lifecycle. */
(function () {
  'use strict';
  var PF = window.PF;
  var $ = PF.$, $$ = PF.$$;

  var SECTIONS = [
    { id: 'home', title: 'Home' },
    { id: 'lab', title: 'Prototype lab' },
    { id: 'cases', title: 'Case studies' },
    { id: 'work', title: 'How I work' },
    { id: 'contact', title: 'Contact' }
  ];
  var DEMOS = [
    { id: 'rag', title: 'RAG assistant' },
    { id: 'agent', title: 'Procurement agent' },
    { id: 'graph', title: 'Knowledge graph' },
    { id: 'forecast', title: 'Forecasting' },
    { id: 'spc', title: 'Quality SPC' },
    { id: 'vision', title: 'Vision' }
  ];
  // Flattened sequence used by Back / Next: the lab steps through each demo.
  var STEPS = [];
  SECTIONS.forEach(function (s) {
    if (s.id === 'lab') DEMOS.forEach(function (d) { STEPS.push({ section: 'lab', demo: d.id, title: d.title }); });
    else STEPS.push({ section: s.id, title: s.title });
  });

  var state = { section: null, demo: 'rag' };
  var inited = {};

  function parseHash() {
    var h = (location.hash || '#home').slice(1).split('/');
    var sec = SECTIONS.some(function (s) { return s.id === h[0]; }) ? h[0] : 'home';
    var demo = h[1] && DEMOS.some(function (d) { return d.id === h[1]; }) ? h[1] : null;
    return { section: sec, demo: demo };
  }

  function stepIndex() {
    for (var i = 0; i < STEPS.length; i++) {
      var s = STEPS[i];
      if (s.section === state.section && (s.section !== 'lab' || s.demo === state.demo)) return i;
    }
    return 0;
  }

  function hrefFor(step) { return '#' + step.section + (step.demo ? '/' + step.demo : ''); }

  function activeDemo() { return state.section === 'lab' ? state.demo : null; }

  function lifecycle(prevDemo) {
    var cur = activeDemo();
    if (prevDemo && prevDemo !== cur && PF.demos[prevDemo] && PF.demos[prevDemo].hide) PF.demos[prevDemo].hide();
    if (cur && PF.demos[cur]) {
      var d = PF.demos[cur];
      if (!inited[cur]) {
        inited[cur] = true;
        try { d.init(); } catch (e) { console.error('Demo ' + cur + ' failed to start', e); }
      }
      if (d.show) d.show();
    }
  }

  function render() {
    var prevDemo = activeDemo();
    var p = parseHash();
    var sectionChanged = p.section !== state.section;
    state.section = p.section;
    if (p.demo) state.demo = p.demo;

    $$('[data-section]').forEach(function (el) {
      if (el.tagName === 'SECTION') el.hidden = el.getAttribute('data-section') !== state.section;
    });
    $$('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === state.section) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    // Lab tabs
    $$('.lab-tabs [role="tab"]').forEach(function (t) {
      var on = t.getAttribute('data-demo') === state.demo;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    DEMOS.forEach(function (d) { $('#demo-' + d.id).hidden = d.id !== state.demo; });
    // Keep the active tab / nav link visible in horizontally scrolling strips (phones)
    function centerIn(container, el) {
      if (!container || !el || container.scrollWidth <= container.clientWidth) return;
      container.scrollLeft = el.offsetLeft - (container.clientWidth - el.offsetWidth) / 2;
    }
    if (state.section === 'lab') centerIn($('.lab-tabs'), $('.lab-tabs [aria-selected="true"]'));
    centerIn($('.nav'), $('.nav [aria-current="page"]'));

    // Pager
    var i = stepIndex();
    var prev = STEPS[i - 1], next = STEPS[i + 1];
    var prevBtn = $('#prevBtn'), nextBtn = $('#nextBtn');
    prevBtn.disabled = !prev; nextBtn.disabled = !next;
    $('#prevLbl').textContent = prev ? prev.title : 'Back';
    $('#nextLbl').textContent = next ? next.title : 'Next';
    prevBtn.setAttribute('aria-label', prev ? 'Back to ' + prev.title : 'Back');
    nextBtn.setAttribute('aria-label', next ? 'Next: ' + next.title : 'Next');
    var secIdx = SECTIONS.findIndex(function (s) { return s.id === state.section; });
    var narrow = window.matchMedia('(max-width: 520px)').matches;
    var dIdx = DEMOS.findIndex(function (d) { return d.id === state.demo; }) + 1;
    var pos = narrow ? (secIdx + 1) + ' / ' + SECTIONS.length : 'Section ' + (secIdx + 1) + ' of ' + SECTIONS.length;
    if (state.section === 'lab') pos += narrow ? ' · demo ' + dIdx + '/6' : ' · Demo ' + dIdx + ' of 6';
    $('#pagerPos').textContent = pos;

    document.title = (state.section === 'home' ? '' : (state.section === 'lab' ? DEMOS.find(function (d) { return d.id === state.demo; }).title : SECTIONS[secIdx].title) + ' · ') + 'Ghanashyam Mandal · Analytics Portfolio';

    lifecycle(prevDemo);
    if (sectionChanged || p.demo) $('.stage').scrollTop = 0;
  }

  function go(step) { location.hash = hrefFor(step); }

  // ---- Theme ----
  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function updateThemeLabel() {
    var t = currentTheme();
    $('#themeLabel').textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
    $('#themeToggle').setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  function themeChanged() {
    updateThemeLabel();
    PF.applyChartDefaults();
    Object.keys(inited).forEach(function (k) { if (PF.demos[k] && PF.demos[k].theme) PF.demos[k].theme(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    PF.applyChartDefaults();
    updateThemeLabel();

    $('#themeToggle').addEventListener('click', function () {
      var t = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('pf-theme', t); } catch (e) {}
      themeChanged();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!document.documentElement.getAttribute('data-theme')) themeChanged();
    });

    $('#prevBtn').addEventListener('click', function () { var i = stepIndex(); if (STEPS[i - 1]) go(STEPS[i - 1]); });
    $('#nextBtn').addEventListener('click', function () { var i = stepIndex(); if (STEPS[i + 1]) go(STEPS[i + 1]); });

    // Lab tabs: click + arrow-key navigation (WAI-ARIA tabs pattern)
    var tabs = $$('.lab-tabs [role="tab"]');
    tabs.forEach(function (t, idx) {
      t.addEventListener('click', function () { location.hash = '#lab/' + t.getAttribute('data-demo'); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = (idx + 1) % tabs.length;
        if (e.key === 'ArrowLeft') n = (idx - 1 + tabs.length) % tabs.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); tabs[n].focus(); tabs[n].click(); }
      });
    });

    // Copy email
    $('#copyEmail').addEventListener('click', function () {
      var email = 'ch23b015@smail.iitm.ac.in';
      var msg = $('#copyMsg');
      function ok() { msg.textContent = 'Copied to clipboard.'; }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = email; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); ok(); } catch (e) { msg.textContent = 'Copy failed. Select the address above.'; }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(email).then(ok, fallback);
      else fallback();
    });

    // Pause streaming demos when the tab is in the background
    document.addEventListener('visibilitychange', function () {
      var d = activeDemo();
      if (!d || !PF.demos[d]) return;
      if (document.hidden) { if (PF.demos[d].hide) PF.demos[d].hide(); }
      else if (PF.demos[d].show) PF.demos[d].show();
    });

    window.addEventListener('hashchange', render);
    render();
  });
})();
