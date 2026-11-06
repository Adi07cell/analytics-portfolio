/* a. RAG assistant: TF-IDF + cosine similarity retrieval with an extractive, cited answer. */
(function () {
  'use strict';
  var PF = window.PF, $ = PF.$;

  // ---- Sample documents (mock text written for this demo; not real company procedures) ----
  var DOCS = [
    { id: 'D1', title: 'Reactor Area Entry Safety SOP (sample)', text:
      'Before entering the reactor area every person must wear flame-resistant coveralls, safety goggles, chemical-resistant gloves, a hard hat and steel-toe boots. ' +
      'A personal gas detector must be bump-tested at the start of each shift and worn at chest height. ' +
      'Entry is allowed only with a valid area permit signed by the shift supervisor. ' +
      'Work alone is not permitted; a buddy must remain within sight at all times. ' +
      'If the gas detector alarms, stop work, leave the area by the nearest marked exit and report to the muster point.' },
    { id: 'D2', title: 'Lockout / Tagout Procedure (sample)', text:
      'Lockout/tagout is required before any maintenance on pumps, agitators, conveyors or any equipment with stored energy. ' +
      'Identify every energy source, including electrical, pneumatic, hydraulic and thermal. ' +
      'Isolate each source, apply a personal lock and a tag with your name and date. ' +
      'Verify zero energy by attempting a start and by measuring pressure or voltage. ' +
      'Only the person who applied a lock may remove it, after confirming all tools are cleared and guards are refitted.' },
    { id: 'D3', title: 'Chemical Spill Response (sample)', text:
      'For a small spill under 20 litres, alert people nearby, put on gloves and goggles, and contain the spill with absorbent pads from the spill kit. ' +
      'Never wash a spill into the drain. ' +
      'For a large spill above 20 litres, or any spill of a toxic or flammable chemical, evacuate the area and call the emergency response team. ' +
      'Used absorbent must be bagged, labelled as hazardous waste and handed to the environment team. ' +
      'Every spill must be logged as an incident within 24 hours.' },
    { id: 'D4', title: 'Incoming Raw Material Inspection (sample)', text:
      'Every incoming lot of raw material is placed in quarantine until it is released by quality control. ' +
      'Check that the certificate of analysis matches the purchase specification for identity, assay and moisture. ' +
      'Sample the lot using the sampling plan at AQL 1.0, general inspection level II. ' +
      'If any result is out of specification, keep the lot in quarantine, raise a non-conformance report and notify procurement. ' +
      'Released lots get a green release label with the date and inspector initials.' },
    { id: 'D5', title: 'Non-Conformance and CAPA Procedure (sample)', text:
      'Any deviation from specification must be recorded as a non-conformance report within 24 hours of detection. ' +
      'The quality engineer leads a root cause analysis using the 5 Whys or a fishbone diagram. ' +
      'Corrective and preventive actions (CAPA) are assigned an owner and a due date. ' +
      'CAPA must be closed within 30 days, and effectiveness is checked after three subsequent batches. ' +
      'Repeat non-conformances on the same product are escalated to the plant quality head.' },
    { id: 'D6', title: 'Procurement Approval Policy (sample)', text:
      'Purchase orders up to USD 5,000 can be approved by the department manager. ' +
      'Orders between USD 5,000 and USD 50,000 need approval from the plant head. ' +
      'Orders above USD 50,000 need approval from the finance director and at least three competitive quotations. ' +
      'Splitting an order to stay below an approval limit is not allowed. ' +
      'Emergency purchases may be approved verbally but must be documented within two working days.' },
    { id: 'D7', title: 'Supplier Qualification and Risk Review (sample)', text:
      'New suppliers must complete a qualification questionnaire and provide quality certifications before the first order. ' +
      'Critical suppliers are audited on site before approval and every two years after that. ' +
      'Each supplier receives a risk score from 0 to 100 based on financial health, delivery history, quality incidents and geographic concentration. ' +
      'Suppliers with a risk score above 70 need a mitigation plan, such as a qualified second source. ' +
      'Single-source components are reviewed every quarter.' },
    { id: 'D8', title: 'Instrument Calibration Procedure (sample)', text:
      'Critical instruments such as balances, pH meters, thermocouples and viscometers are calibrated against traceable standards. ' +
      'Balances are checked daily with a reference weight and fully calibrated every six months. ' +
      'Viscometers and thermocouples are calibrated every twelve months. ' +
      'If an instrument is found out of tolerance, label it "Do not use" and assess the impact on every batch measured since the last good calibration.' },
    { id: 'D9', title: 'Stability Testing and Batch Release (sample)', text:
      'Each new formulation is placed on stability at 5°C, 25°C and 45°C and checked for viscosity, pH, colour, odour and phase separation. ' +
      'Samples are pulled at 1, 2, 4, 8 and 12 weeks. ' +
      'A trend of falling viscosity or any phase separation triggers an investigation before batch release. ' +
      'Retained samples of every released batch are kept for the shelf life plus one year.' },
    { id: 'D10', title: 'Hot Work Permit (sample)', text:
      'Hot work includes welding, grinding, cutting and any task that creates sparks or open flame. ' +
      'A hot work permit is valid for one shift only. ' +
      'Remove flammable material within 11 metres or cover it with fire blankets, and keep a fire extinguisher at the work point. ' +
      'Gas testing must show no flammable vapour before work starts. ' +
      'A fire watch must stay for at least 30 minutes after hot work ends.' }
  ];
  var EXAMPLES = [
    'What PPE is required before entering the reactor area?',
    'Who approves a purchase order of USD 12,000?',
    'How fast must a CAPA be closed?',
    'What do I do with a large chemical spill?',
    'When is a supplier mitigation plan needed?',
    'How often are viscometers calibrated?'
  ];

  var STOP = new Set(('a an and are as at be before by can do does for from get has have how i if in into is it its may must my no not of on or our per should so than that the their then there these this to up was we what when where which who why will with you your any all each every only after must need needs').split(' '));

  function stem(w) {
    if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /es$/.test(w) && !/(ss|us)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(text) {
    return (text.toLowerCase().replace(/[^a-z0-9°\s-]/g, ' ').match(/[a-z0-9°]+/g) || [])
      .filter(function (w) { return !STOP.has(w) && w.length > 1; })
      .map(stem);
  }
  function sentences(text) {
    return text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  var ownDocs = [];
  var index = null;

  /** Split docs into passages of 2 sentences, build TF-IDF vectors. */
  function buildIndex(docs) {
    var passages = [];
    docs.forEach(function (d) {
      var ss = sentences(d.text);
      for (var i = 0, k = 1; i < ss.length; i += 2, k++) {
        var t = ss.slice(i, i + 2).join(' ');
        passages.push({ doc: d, n: k, text: t, sents: ss.slice(i, i + 2), toks: tokens(t) });
      }
    });
    var df = {};
    passages.forEach(function (p) {
      new Set(p.toks).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
    });
    var N = passages.length;
    var idf = {};
    Object.keys(df).forEach(function (w) { idf[w] = Math.log((N + 1) / (df[w] + 1)) + 1; });
    passages.forEach(function (p) { p.vec = vectorize(p.toks, idf); });
    return { passages: passages, idf: idf, N: N };
  }
  function vectorize(toks, idf) {
    var tf = {}, v = {}, norm = 0;
    toks.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
    Object.keys(tf).forEach(function (w) {
      if (!idf[w]) return;
      var x = (1 + Math.log(tf[w])) * idf[w];
      v[w] = x; norm += x * x;
    });
    norm = Math.sqrt(norm) || 1;
    Object.keys(v).forEach(function (w) { v[w] /= norm; });
    return v;
  }
  function cosine(a, b) {
    var s = 0;
    for (var k in a) if (b[k]) s += a[k] * b[k];
    return s;
  }

  function activeDocs() {
    return $('#ragOnlyOwn').checked && ownDocs.length ? ownDocs : DOCS.concat(ownDocs);
  }
  function rebuild() { index = buildIndex(activeDocs()); }

  function highlight(text, qset) {
    return PF.esc(text).replace(/[A-Za-z0-9°]+/g, function (w) {
      return qset.has(stem(w.toLowerCase())) ? '<mark>' + w + '</mark>' : w;
    });
  }

  function search(q) {
    var qt = tokens(q);
    var qv = vectorize(qt, index.idf);
    var qset = new Set(Object.keys(qv));
    var ranked = index.passages.map(function (p) { return { p: p, s: cosine(qv, p.vec) }; })
      .sort(function (a, b) { return b.s - a.s; });
    var top = ranked.slice(0, 3).filter(function (r, i) { return i === 0 || r.s > 0; });

    // Passages
    var maxS = top.length ? Math.max(top[0].s, 0.0001) : 1;
    $('#ragPassages').innerHTML = top.map(function (r, i) {
      return '<li><div class="p-meta"><span><b>#' + (i + 1) + ' · ' + PF.esc(r.p.doc.id) + ' ¶' + r.p.n + '</b> ' + PF.esc(r.p.doc.title) + '</span>' +
        '<span>cosine <b>' + r.s.toFixed(3) + '</b></span></div>' +
        '<div class="scorebar" aria-hidden="true"><i style="width:' + Math.round(100 * r.s / maxS) + '%"></i></div>' +
        '<p>' + highlight(r.p.text, qset) + '</p></li>';
    }).join('');

    // Extractive answer: score each sentence of the top passages by the query terms it contains.
    var ans = $('#ragAnswer');
    if (!qset.size || !top.length || top[0].s < 0.08) {
      ans.innerHTML = '<p class="muted">No passage matches this question well enough (top cosine ' +
        (top.length ? top[0].s.toFixed(3) : '0') + ' &lt; 0.08). Try different words. The assistant only answers from the documents.</p>';
      return;
    }
    var cands = [];
    top.forEach(function (r) {
      if (r.s < top[0].s * 0.5) return; // ignore weak passages
      r.p.sents.forEach(function (s) {
        var st = new Set(tokens(s)), score = 0;
        qset.forEach(function (w) { if (st.has(w)) score += qv[w]; });
        if (score > 0) cands.push({ s: s, score: score * (0.6 + 0.4 * r.s / top[0].s), p: r.p });
      });
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var chosen = cands.slice(0, 2);
    if (!chosen.length) chosen = [{ s: top[0].p.sents[0], p: top[0].p }];
    ans.innerHTML = chosen.map(function (c) {
      return '<p>' + PF.esc(c.s) + ' <span class="cite">[' + PF.esc(c.p.doc.id) + ' ¶' + c.p.n + ']</span></p>';
    }).join('') + '<p class="muted small">Quoted from the sources, not generated. Confidence = top cosine ' + top[0].s.toFixed(3) + '.</p>';
  }

  function run() {
    var q = $('#ragQuery').value.trim();
    if (!q) return;
    search(q);
  }

  function init() {
    rebuild();
    $('#ragChips').innerHTML = EXAMPLES.map(function (e) { return '<button type="button" class="chip">' + PF.esc(e) + '</button>'; }).join('');
    $('#ragChips').addEventListener('click', function (e) {
      if (e.target.classList.contains('chip')) { $('#ragQuery').value = e.target.textContent; run(); }
    });
    $('#ragForm').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    $('#ragDocs').innerHTML = DOCS.map(function (d) {
      return '<article><h5>' + d.id + ' · ' + PF.esc(d.title) + '</h5>' + PF.esc(d.text) + '</article>';
    }).join('');

    $('#ragAddOwn').addEventListener('click', function () {
      var txt = $('#ragOwn').value.trim();
      if (!txt) { $('#ragOwnStatus').textContent = 'Paste some text first.'; return; }
      var paras = txt.split(/\n\s*\n/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(function (s) { return s.length > 0; });
      paras.forEach(function (p) {
        if (!/[.!?]$/.test(p)) p += '.';
        ownDocs.push({ id: 'U' + (ownDocs.length + 1), title: 'Your text', text: p });
      });
      $('#ragOwn').value = '';
      rebuild(); run();
      $('#ragOwnStatus').textContent = ownDocs.length + ' passage group(s) of your text indexed (U1-U' + ownDocs.length + '). Nothing was uploaded.';
    });
    $('#ragClearOwn').addEventListener('click', function () {
      ownDocs = []; $('#ragOnlyOwn').checked = false; rebuild(); run();
      $('#ragOwnStatus').textContent = 'Your text was removed.';
    });
    $('#ragOnlyOwn').addEventListener('change', function () {
      if (this.checked && !ownDocs.length) $('#ragOwnStatus').textContent = 'Add some text first; searching the sample documents.';
      rebuild(); run();
    });
    run();
  }

  PF.demos.rag = { init: init };
  // Exposed for testing in the console
  PF._rag = { tokens: tokens, buildIndex: buildIndex };
})();
