/* b. Agentic procurement workflow: a rule-based agent structured as plan -> act -> observe. */
(function () {
  'use strict';
  var PF = window.PF, $ = PF.$;

  // ---- Sample data (fictional items and suppliers) ----
  var INVENTORY = [
    { sku: 'SKU-101', item: 'Surfactant base (kg)', onHand: 180, rop: 250, max: 900, use: 30 },
    { sku: 'SKU-102', item: 'Glass vial 30 ml', onHand: 5200, rop: 3000, max: 12000, use: 400 },
    { sku: 'SKU-103', item: 'Pump seal kit', onHand: 14, rop: 20, max: 60, use: 2 },
    { sku: 'SKU-104', item: 'Nitrile gloves (box)', onHand: 35, rop: 60, max: 240, use: 12 },
    { sku: 'SKU-105', item: 'Label stock (roll)', onHand: 95, rop: 40, max: 160, use: 5 },
    { sku: 'SKU-106', item: 'Emulsifier (kg)', onHand: 60, rop: 120, max: 500, use: 15 }
  ];
  var SUPPLIERS = {
    'SKU-101': [
      { name: 'Tessera Chemicals', cost: 4.10, lead: 6, risk: 35, moq: 200 },
      { name: 'Kestrel Resins', cost: 3.80, lead: 12, risk: 55, moq: 500 },
      { name: 'Halden Supply', cost: 4.60, lead: 3, risk: 25, moq: 100 }
    ],
    'SKU-102': [
      { name: 'Lumen Glassworks', cost: 0.42, lead: 10, risk: 30, moq: 5000 },
      { name: 'Orbis Packaging', cost: 0.38, lead: 18, risk: 60, moq: 10000 }
    ],
    'SKU-103': [
      { name: 'Orion Metals', cost: 85, lead: 9, risk: 45, moq: 10 },
      { name: 'Vireo Industrial', cost: 92, lead: 4, risk: 20, moq: 5 },
      { name: 'Castor Parts', cost: 71, lead: 14, risk: 78, moq: 20 }
    ],
    'SKU-104': [
      { name: 'SafeHands Supplies', cost: 9.5, lead: 2, risk: 15, moq: 50 },
      { name: 'Medigrip', cost: 8.2, lead: 7, risk: 40, moq: 100 }
    ],
    'SKU-105': [
      { name: 'Halcyon Packaging', cost: 22, lead: 5, risk: 20, moq: 20 },
      { name: 'Kestrel Resins', cost: 19, lead: 9, risk: 55, moq: 50 }
    ],
    'SKU-106': [
      { name: 'Tessera Chemicals', cost: 6.9, lead: 6, risk: 35, moq: 100 },
      { name: 'Nordic Emulsions', cost: 6.2, lead: 15, risk: 72, moq: 250 },
      { name: 'Halden Supply', cost: 7.4, lead: 4, risk: 25, moq: 50 }
    ]
  };
  var POLICY = [ // mirrors sample document D6 in the RAG demo
    { max: 5000, approver: 'Department manager' },
    { max: 50000, approver: 'Plant head' },
    { max: Infinity, approver: 'Finance director (3 quotes required)' }
  ];
  var RISK_CAP = 70; // per sample doc D7: risk > 70 needs a mitigation plan

  var inv = INVENTORY.map(function (r) { return Object.assign({}, r); });
  var runId = 0;

  // ---- Tools the agent can call. Each returns an observation. ----
  var TOOLS = {
    get_inventory: function () { return inv.map(function (r) { return Object.assign({}, r); }); },
    check_reorder: function (a) {
      var r = inv.find(function (x) { return x.sku === a.sku; });
      return { sku: r.sku, onHand: r.onHand, rop: r.rop, below: r.onHand < r.rop, cover: r.onHand / r.use };
    },
    score_suppliers: function (a) {
      var list = SUPPLIERS[a.sku];
      function norm(k) {
        var vals = list.map(function (s) { return s[k]; });
        var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
        return function (v) { return hi === lo ? 0 : (v - lo) / (hi - lo); };
      }
      var nc = norm('cost'), nl = norm('lead'), nr = norm('risk');
      var W = a.w, tot = (W.cost + W.lead + W.risk) || 1;
      return list.map(function (s) {
        var score = (W.cost * nc(s.cost) + W.lead * nl(s.lead) + W.risk * nr(s.risk)) / tot; // lower is better
        return Object.assign({ score: score }, s);
      }).sort(function (x, y) { return x.score - y.score; });
    },
    draft_po: function (a) {
      var qty = Math.max(a.need, a.supplier.moq);
      qty = Math.ceil(qty / a.supplier.moq) * a.supplier.moq;
      return { po: 'PO-DRAFT-' + (100 + a.n), sku: a.sku, item: a.item, supplier: a.supplier.name, qty: qty, unit: a.supplier.cost, total: qty * a.supplier.cost, eta: a.supplier.lead };
    },
    check_policy: function (a) {
      var tier = POLICY.find(function (p) { return a.total <= p.max; });
      return { total: a.total, approver: tier.approver };
    }
  };

  function weights() {
    return { cost: +$('#wCost').value, lead: +$('#wLead').value, risk: +$('#wRisk').value };
  }
  function money(x) { return 'USD ' + PF.fmt(x, x < 100 ? 2 : 0); }

  // ---- Trace rendering ----
  function addStep(kind, phase, tool, html) {
    var li = document.createElement('li');
    li.className = kind;
    li.innerHTML = '<div class="t-head"><span class="t-phase">' + phase + '</span>' +
      (tool ? '<code class="t-tool">' + PF.esc(tool) + '</code>' : '') + '</div><div class="t-obs">' + html + '</div>';
    var list = $('#agentTrace');
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }

  /** The agent loop. Each iteration: decide (plan/reason) -> act (call tool) -> observe (record result). */
  async function runAgent() {
    var my = ++runId;
    var fast = $('#agentFast').checked || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var delay = fast ? 0 : 320;
    var W = weights();
    var alive = function () { return my === runId; };
    var wait = async function () { if (delay) await PF.sleep(delay); return alive(); };

    $('#agentTrace').innerHTML = '';
    $('#agentApproval').hidden = true;
    $('#agentStatus').textContent = '· running';
    $('#agentRun').disabled = true;

    addStep('plan', 'Plan', null,
      '<b>Goal:</b> keep every SKU above its reorder point at the best risk-adjusted cost, then get human approval.<br>' +
      '1. Read inventory → 2. Check each SKU against its reorder point → 3. Score suppliers for SKUs that are low → 4. Draft POs → 5. Check approval policy → 6. Ask a human to approve.');
    if (!(await wait())) return;

    // Act: read inventory
    var rows = TOOLS.get_inventory();
    addStep('act', 'Act → Observe', 'get_inventory()', 'Read <b>' + rows.length + '</b> SKUs.');
    if (!(await wait())) return;

    var pos = [], n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var chk = TOOLS.check_reorder({ sku: r.sku });
      if (!chk.below) {
        addStep('obs', 'Act → Observe', 'check_reorder("' + r.sku + '")',
          PF.esc(r.item) + ': on hand <b>' + chk.onHand + '</b> ≥ reorder point ' + chk.rop + '. No action.');
        if (!(await wait())) return;
        continue;
      }
      addStep('warn', 'Act → Observe', 'check_reorder("' + r.sku + '")',
        PF.esc(r.item) + ': on hand <b>' + chk.onHand + '</b> &lt; reorder point ' + chk.rop + '. Stock covers <b>' + chk.cover.toFixed(1) + ' days</b>. Needs a PO.');
      if (!(await wait())) return;

      var ranked = TOOLS.score_suppliers({ sku: r.sku, w: W });
      addStep('act', 'Act → Observe', 'score_suppliers("' + r.sku + '", w=' + W.cost + '/' + W.lead + '/' + W.risk + ')',
        'Ranked ' + ranked.length + ' suppliers (lower score is better):' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Supplier</th><th class="num">Cost</th><th class="num">Lead</th><th class="num">Risk</th><th class="num">Score</th></tr></thead><tbody>' +
        ranked.map(function (s) {
          return '<tr><td>' + PF.esc(s.name) + '</td><td class="num">' + s.cost + '</td><td class="num">' + s.lead + 'd</td><td class="num">' + s.risk + '</td><td class="num">' + s.score.toFixed(2) + '</td></tr>';
        }).join('') + '</tbody></table></div>');
      if (!(await wait())) return;

      // Reason: guardrails and re-planning
      var choice = ranked[0], notes = [];
      var eligible = ranked.filter(function (s) { return s.risk <= RISK_CAP; });
      if (choice.risk > RISK_CAP && eligible.length) {
        notes.push('Top-ranked ' + PF.esc(choice.name) + ' has risk ' + choice.risk + ' &gt; ' + RISK_CAP + ', which needs a mitigation plan (sample policy D7), so it is skipped.');
        choice = eligible[0];
      }
      var replanned = false;
      if (chk.cover < choice.lead) {
        var fastest = eligible.slice().sort(function (a, b) { return a.lead - b.lead; })[0] || choice;
        if (fastest !== choice) {
          notes.push('<b>Re-plan:</b> stock lasts ' + chk.cover.toFixed(1) + ' days but ' + PF.esc(choice.name) + ' needs ' + choice.lead + ' days, so a stock-out is likely. Switching to the fastest acceptable supplier.');
          choice = fastest; replanned = true;
        } else {
          notes.push('Even the fastest acceptable supplier (' + choice.lead + ' days) is slower than the remaining cover. Flag for expediting.');
        }
      }
      if (!notes.length) notes.push('Best weighted score, risk within limit, and its ' + choice.lead + '-day lead time fits within the ' + chk.cover.toFixed(1) + ' days of stock cover.');
      addStep(replanned ? 'warn' : 'plan', 'Reason', null, notes.join(' ') + ' Decision: <b>' + PF.esc(choice.name) + '</b>.');
      if (!(await wait())) return;

      var po = TOOLS.draft_po({ sku: r.sku, item: r.item, need: r.max - r.onHand, supplier: choice, n: ++n });
      pos.push(po);
      addStep('act', 'Act → Observe', 'draft_po("' + r.sku + '", "' + choice.name + '")',
        '<b>' + po.po + '</b>: ' + PF.fmt(po.qty) + ' × ' + money(po.unit) + ' = <b>' + money(po.total) + '</b>, ETA ' + po.eta + ' days (order up to max stock ' + r.max + ', rounded to MOQ).');
      if (!(await wait())) return;
    }

    if (!pos.length) {
      addStep('done', 'Finish', null, 'All SKUs are above their reorder points. Nothing to order.');
      $('#agentStatus').textContent = '· done';
      $('#agentRun').disabled = false;
      return;
    }

    var total = pos.reduce(function (s, p) { return s + p.total; }, 0);
    var pol = TOOLS.check_policy({ total: total });
    addStep('act', 'Act → Observe', 'check_policy(total=' + Math.round(total) + ')',
      pos.length + ' draft POs total <b>' + money(total) + '</b>. Approval required from: <b>' + pol.approver + '</b> (sample policy D6).');
    if (!(await wait())) return;

    addStep('warn', 'Act', 'request_human_approval()', 'Paused. Waiting for a human decision. No order is sent without approval.');
    $('#agentStatus').textContent = '· waiting for approval';
    $('#agentRun').disabled = false;

    var box = $('#agentApproval');
    box.hidden = false;
    box.innerHTML = '<h4>Approval needed · ' + PF.esc(pol.approver) + '</h4>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>PO</th><th>Item</th><th>Supplier</th><th class="num">Qty</th><th class="num">Total</th></tr></thead><tbody>' +
      pos.map(function (p) { return '<tr><td>' + p.po + '</td><td>' + PF.esc(p.item) + '</td><td>' + PF.esc(p.supplier) + '</td><td class="num">' + PF.fmt(p.qty) + '</td><td class="num">' + money(p.total) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="btn-row mt"><button class="btn btn-primary" type="button" data-act="approve">Approve (simulated)</button><button class="btn" type="button" data-act="reject">Reject</button></div>';
    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (my !== runId) return;
        var ok = b.getAttribute('data-act') === 'approve';
        box.hidden = true;
        addStep(ok ? 'done' : 'warn', 'Observe → Finish', null, ok
          ? 'Human approved. ' + pos.length + ' POs marked <b>approved</b> (simulation only; nothing is sent to any supplier).'
          : 'Human rejected. POs kept as drafts with the reason logged for the buyer. Agent stops.');
        $('#agentStatus').textContent = ok ? '· approved' : '· rejected';
      });
    });
  }

  function renderTable() {
    $('#agentInv tbody').innerHTML = inv.map(function (r, i) {
      return '<tr class="' + (r.onHand < r.rop ? 'low' : '') + '"><td>' + r.sku + '</td><td>' + PF.esc(r.item) + '</td>' +
        '<td><label class="sr-only" for="oh' + i + '">On hand for ' + PF.esc(r.item) + '</label><input type="number" min="0" id="oh' + i + '" data-i="' + i + '" value="' + r.onHand + '"></td>' +
        '<td class="num">' + r.rop + '</td><td class="num">' + r.use + '</td></tr>';
    }).join('');
  }

  function init() {
    renderTable();
    $('#agentInv').addEventListener('change', function (e) {
      if (e.target.dataset.i === undefined) return;
      var v = Math.max(0, Math.round(+e.target.value || 0));
      inv[+e.target.dataset.i].onHand = v;
      renderTable();
    });
    ['wCost', 'wLead', 'wRisk'].forEach(function (id) {
      $('#' + id).addEventListener('input', function () { $('#' + id + 'Out').textContent = this.value; });
    });
    $('#agentRun').addEventListener('click', runAgent);
    runAgent();
  }

  PF.demos.agent = { init: init };
})();
