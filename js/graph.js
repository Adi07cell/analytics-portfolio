/* c. Supply-chain knowledge graph: d3 force layout, disruption propagation, BFS shortest path, betweenness centrality. */
(function () {
  'use strict';
  var PF = window.PF, $ = PF.$;

  // ---- Sample data (fictional) ----
  var NODES = [
    { id: 'kestrel', label: 'Kestrel Resins', type: 'supplier' },
    { id: 'orion', label: 'Orion Metals', type: 'supplier' },
    { id: 'lumen', label: 'Lumen Glassworks', type: 'supplier' },
    { id: 'tessera', label: 'Tessera Chemicals', type: 'supplier' },
    { id: 'halcyon', label: 'Halcyon Packaging', type: 'supplier' },
    { id: 'vireo', label: 'Vireo Electronics', type: 'supplier' },
    { id: 'resin', label: 'Polymer resin', type: 'component' },
    { id: 'housing', label: 'Aluminium housing', type: 'component' },
    { id: 'vial', label: 'Glass vial', type: 'component' },
    { id: 'surf', label: 'Surfactant', type: 'component' },
    { id: 'emul', label: 'Emulsifier', type: 'component' },
    { id: 'chip', label: 'Sensor chip', type: 'component' },
    { id: 'pump', label: 'Pump assembly', type: 'component' },
    { id: 'label', label: 'Label stock', type: 'component' },
    { id: 'box', label: 'Corrugated box', type: 'component' },
    { id: 'cleanser', label: 'Cleanser 200 ml', type: 'product' },
    { id: 'serum', label: 'Serum 30 ml', type: 'product' },
    { id: 'lotion', label: 'Lotion 400 ml', type: 'product' },
    { id: 'dispenser', label: 'Smart dispenser', type: 'product' },
    { id: 'degreaser', label: 'Degreaser 5 L', type: 'product' },
    { id: 'pune', label: 'Plant Pune', type: 'plant' },
    { id: 'chennai', label: 'Plant Chennai', type: 'plant' },
    { id: 'baddi', label: 'Plant Baddi', type: 'plant' }
  ];
  var SUPPLIES = [['kestrel', 'resin'], ['kestrel', 'label'], ['orion', 'housing'], ['orion', 'pump'], ['lumen', 'vial'],
    ['tessera', 'surf'], ['tessera', 'emul'], ['halcyon', 'box'], ['halcyon', 'label'], ['vireo', 'chip'], ['vireo', 'pump']];
  var BOM = {
    cleanser: ['resin', 'surf', 'label', 'box'],
    serum: ['vial', 'emul', 'pump', 'label', 'box'],
    lotion: ['resin', 'emul', 'pump', 'label', 'box'],
    dispenser: ['housing', 'chip', 'pump', 'box'],
    degreaser: ['resin', 'surf', 'label']
  };
  var MADE_AT = [['cleanser', 'chennai'], ['serum', 'pune'], ['lotion', 'pune'], ['lotion', 'chennai'], ['dispenser', 'baddi'], ['degreaser', 'baddi']];

  var LINKS = [];
  SUPPLIES.forEach(function (e) { LINKS.push({ source: e[0], target: e[1], rel: 'supplies' }); });
  Object.keys(BOM).forEach(function (p) { BOM[p].forEach(function (c) { LINKS.push({ source: c, target: p, rel: 'used in' }); }); });
  MADE_AT.forEach(function (e) { LINKS.push({ source: e[0], target: e[1], rel: 'made at' }); });

  var byId = {};
  NODES.forEach(function (n) { byId[n.id] = n; });
  var adj = {};
  NODES.forEach(function (n) { adj[n.id] = []; });
  LINKS.forEach(function (l) { adj[l.source].push(l.target); adj[l.target].push(l.source); });
  var suppliersOf = {};
  SUPPLIES.forEach(function (e) { (suppliersOf[e[1]] = suppliersOf[e[1]] || []).push(e[0]); });

  var LAYER = { supplier: 0, component: 1, product: 2, plant: 3 };
  var disrupted = new Set();
  var svg, linkSel, nodeSel, sim, pathEdges = new Set(), pathNodes = new Set(), status = {};

  /** Propagate a disruption downstream. Returns status per node: 'down' | 'lost' | 'risk'. */
  function propagate(down) {
    var st = {};
    down.forEach(function (s) { st[s] = 'down'; });
    Object.keys(suppliersOf).forEach(function (c) {
      var sup = suppliersOf[c], hit = sup.filter(function (s) { return down.has(s); }).length;
      if (hit === sup.length) st[c] = 'lost'; else if (hit > 0) st[c] = 'risk';
    });
    Object.keys(BOM).forEach(function (p) {
      var comps = BOM[p];
      if (comps.some(function (c) { return st[c] === 'lost'; })) st[p] = 'lost';
      else if (comps.some(function (c) { return st[c] === 'risk'; })) st[p] = 'risk';
    });
    MADE_AT.forEach(function (e) {
      var ps = st[e[0]];
      if (ps === 'lost') st[e[1]] = 'lost';
      else if (ps === 'risk' && st[e[1]] !== 'lost') st[e[1]] = 'risk';
    });
    return st;
  }

  function bfs(a, b) {
    var prev = {}, seen = new Set([a]), q = [a];
    while (q.length) {
      var x = q.shift();
      if (x === b) break;
      adj[x].forEach(function (y) { if (!seen.has(y)) { seen.add(y); prev[y] = x; q.push(y); } });
    }
    if (!seen.has(b)) return null;
    var path = [b];
    while (path[0] !== a) path.unshift(prev[path[0]]);
    return path;
  }

  /** Brandes betweenness centrality on the undirected graph, normalised to 0-1. */
  function betweenness() {
    var ids = NODES.map(function (n) { return n.id; }), C = {};
    ids.forEach(function (v) { C[v] = 0; });
    ids.forEach(function (s) {
      var S = [], P = {}, sigma = {}, d = {}, delta = {};
      ids.forEach(function (v) { P[v] = []; sigma[v] = 0; d[v] = -1; delta[v] = 0; });
      sigma[s] = 1; d[s] = 0;
      var Q = [s];
      while (Q.length) {
        var v = Q.shift(); S.push(v);
        adj[v].forEach(function (w) {
          if (d[w] < 0) { Q.push(w); d[w] = d[v] + 1; }
          if (d[w] === d[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
        });
      }
      while (S.length) {
        var w = S.pop();
        P[w].forEach(function (v) { delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]); });
        if (w !== s) C[w] += delta[w];
      }
    });
    var n = ids.length, norm = (n - 1) * (n - 2); // undirected: each pair counted twice above
    ids.forEach(function (v) { C[v] = C[v] / norm; });
    return C;
  }

  function rankSuppliers() {
    var bc = betweenness();
    var rows = NODES.filter(function (n) { return n.type === 'supplier'; }).map(function (n) {
      var st = propagate(new Set([n.id]));
      var lost = Object.keys(BOM).filter(function (p) { return st[p] === 'lost'; }).length;
      var risk = Object.keys(BOM).filter(function (p) { return st[p] === 'risk'; }).length;
      return { id: n.id, label: n.label, lost: lost, risk: risk, bc: bc[n.id] };
    });
    rows.sort(function (a, b) { return b.lost - a.lost || b.risk - a.risk || b.bc - a.bc; });
    return rows;
  }

  function color(n) {
    var c = PF.colors();
    var s = status[n.id];
    if (s === 'down') return c.danger;
    if (s === 'lost') return PF.alpha(c.danger, 0.75);
    if (s === 'risk') return c.warn;
    return { supplier: c.accent, component: c.c2, product: c.c4, plant: c.muted }[n.type];
  }
  var SYMBOL = { supplier: d3.symbolSquare, component: d3.symbolCircle, product: d3.symbolDiamond, plant: d3.symbolTriangle };

  function update() {
    status = propagate(disrupted);
    if (nodeSel) {
      nodeSel.select('path').attr('fill', color);
      nodeSel.classed('onpath', function (d) { return pathNodes.has(d.id); });
      nodeSel.classed('dim', function (d) { return disrupted.size > 0 && !status[d.id] && !pathNodes.has(d.id); });
      linkSel.attr('class', function (l) {
        var k = l.source.id + '>' + l.target.id;
        if (pathEdges.has(k)) return 'link path';
        var s = status[l.source.id], t = status[l.target.id];
        if (s && t) return (t === 'risk' ? 'link risk' : 'link hit');
        return 'link';
      });
    }
    // Chips
    PF.$$('#graphSuppliers .chip').forEach(function (b) { b.setAttribute('aria-pressed', disrupted.has(b.dataset.id) ? 'true' : 'false'); });
    // Impact text
    var box = $('#graphImpact');
    if (!disrupted.size) { box.innerHTML = '<p class="muted">No supplier disrupted. Click a supplier to simulate one.</p>'; return; }
    function list(type, s) { return NODES.filter(function (n) { return n.type === type && status[n.id] === s; }).map(function (n) { return n.label; }); }
    var lostP = list('product', 'lost'), riskP = list('product', 'risk');
    var html = '<p><b>Disrupted:</b> ' + Array.from(disrupted).map(function (id) { return PF.esc(byId[id].label); }).join(', ') + '</p><ul class="impact-list">';
    var lc = list('component', 'lost'), rc = list('component', 'risk');
    if (lc.length) html += '<li><span class="tag-lost">Components lost:</span> ' + lc.join(', ') + '</li>';
    if (rc.length) html += '<li><span class="tag-risk">Components at risk (other source exists):</span> ' + rc.join(', ') + '</li>';
    html += '<li><span class="tag-lost">Products lost:</span> ' + (lostP.join(', ') || 'none') + '</li>';
    if (riskP.length) html += '<li><span class="tag-risk">Products at risk:</span> ' + riskP.join(', ') + '</li>';
    var lpl = list('plant', 'lost'), rpl = list('plant', 'risk');
    if (lpl.length || rpl.length) html += '<li>Plants affected: ' + lpl.concat(rpl).join(', ') + '</li>';
    html += '</ul><p class="muted small">' + lostP.length + ' of ' + Object.keys(BOM).length + ' products cannot be built.</p>';
    box.innerHTML = html;
  }

  function updatePath() {
    var a = $('#pathFrom').value, b = $('#pathTo').value;
    pathEdges = new Set(); pathNodes = new Set();
    var p = a === b ? [a] : bfs(a, b);
    if (!p) { $('#graphPath').textContent = 'No path.'; update(); return; }
    p.forEach(function (id) { pathNodes.add(id); });
    for (var i = 0; i < p.length - 1; i++) { pathEdges.add(p[i] + '>' + p[i + 1]); pathEdges.add(p[i + 1] + '>' + p[i]); }
    $('#graphPath').innerHTML = p.map(function (id) { return '<b>' + PF.esc(byId[id].label) + '</b>'; }).join(' → ') + ' <span class="muted">(' + (p.length - 1) + ' hops)</span>';
    update();
  }

  function toggle(id) {
    if (disrupted.has(id)) disrupted.delete(id); else disrupted.add(id);
    update();
  }

  function draw() {
    var wrap = $('#graphWrap');
    var W = wrap.clientWidth || 600;
    var H = $('#graphSvg').clientHeight || 440;
    var vertical = W < 560;
    svg = d3.select('#graphSvg').attr('viewBox', [0, 0, W, H]);
    svg.selectAll('*').remove();
    var nodes = NODES.map(function (n) { return Object.assign({}, n); });
    var links = LINKS.map(function (l) { return Object.assign({}, l); });
    var pad = vertical ? 30 : 70;
    function layerPos(t, span) { return pad + LAYER[t] * (span - 2 * pad) / 3; }
    var counts = {}, order = {};
    nodes.forEach(function (n) { order[n.id] = counts[n.type] = (counts[n.type] || 0) + 1; });
    function slot(d, span) { var p2 = vertical ? 50 : 24; return p2 + (order[d.id] - 0.5) * (span - 2 * p2) / counts[d.type]; }
    nodes.forEach(function (d) { if (vertical) { d.x = slot(d, W); d.y = layerPos(d.type, H); } else { d.x = layerPos(d.type, W); d.y = slot(d, H); } });

    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(vertical ? 45 : 60).strength(0.25))
      .force('charge', d3.forceManyBody().strength(vertical ? -120 : -200))
      .force('collide', d3.forceCollide(vertical ? 20 : 24))
      .force(vertical ? 'y' : 'x', (vertical ? d3.forceY : d3.forceX)(function (d) { return layerPos(d.type, vertical ? H : W) + (vertical ? (order[d.id] % 2 ? -22 : 22) : 0); }).strength(0.9))
      .force(vertical ? 'x' : 'y', (vertical ? d3.forceX : d3.forceY)(function (d) { return slot(d, vertical ? W : H); }).strength(0.35));

    linkSel = svg.append('g').selectAll('line').data(links).join('line').attr('class', 'link');
    nodeSel = svg.append('g').selectAll('g').data(nodes).join('g').attr('class', 'node')
      .attr('tabindex', function (d) { return d.type === 'supplier' ? 0 : null; })
      .attr('role', function (d) { return d.type === 'supplier' ? 'button' : null; })
      .attr('aria-label', function (d) { return d.type === 'supplier' ? 'Toggle disruption of ' + d.label : null; })
      .on('click', function (e, d) { if (d.type === 'supplier') toggle(d.id); })
      .on('keydown', function (e, d) { if ((e.key === 'Enter' || e.key === ' ') && d.type === 'supplier') { e.preventDefault(); toggle(d.id); } })
      .call(d3.drag()
        .on('start', function (e, d) { if (!e.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; })
        .on('end', function (e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    nodeSel.append('path').attr('d', function (d) { return d3.symbol(SYMBOL[d.type], d.type === 'supplier' ? 260 : 190)(); });
    nodeSel.append('title').text(function (d) { return d.label + ' (' + d.type + ')'; });
    nodeSel.append('text').attr('dy', function (d) { return vertical ? (order[d.id] % 2 ? -12 : 22) : 20; }).attr('text-anchor', 'middle').text(function (d) { return d.label; });

    sim.on('tick', function () {
      nodes.forEach(function (d) { d.x = Math.max(16, Math.min(W - 16, d.x)); d.y = Math.max(16, Math.min(H - 16, d.y)); });
      linkSel.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
      nodeSel.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
    });
    update();
  }

  function legend() {
    var c = PF.colors();
    function item(sym, col, txt) {
      return '<span><svg viewBox="-8 -8 16 16" aria-hidden="true"><path d="' + d3.symbol(sym, 70)() + '" fill="' + col + '"/></svg>' + txt + '</span>';
    }
    $('#graphLegend').innerHTML = item(d3.symbolSquare, c.accent, 'Supplier') + item(d3.symbolCircle, c.c2, 'Component') +
      item(d3.symbolDiamond, c.c4, 'Product') + item(d3.symbolTriangle, c.muted, 'Plant') +
      item(d3.symbolCircle, c.danger, 'Disrupted / lost') + item(d3.symbolCircle, c.warn, 'At risk') +
      '<span class="muted">Teal edges: shortest path · Sample data for demonstration</span>';
  }

  var lastW = 0, ro;
  function init() {
    if (!window.d3) { $('#graphImpact').textContent = 'Could not load d3 from the CDN. Check your connection.'; return; }
    var sups = NODES.filter(function (n) { return n.type === 'supplier'; });
    $('#graphSuppliers').innerHTML = sups.map(function (n) { return '<button type="button" class="chip" aria-pressed="false" data-id="' + n.id + '">' + PF.esc(n.label) + '</button>'; }).join('');
    $('#graphSuppliers').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) toggle(b.dataset.id); });
    var opts = NODES.map(function (n) { return '<option value="' + n.id + '">' + PF.esc(n.label) + '</option>'; }).join('');
    $('#pathFrom').innerHTML = opts; $('#pathTo').innerHTML = opts;
    $('#pathFrom').value = 'vireo'; $('#pathTo').value = 'chennai';
    $('#pathFrom').addEventListener('change', updatePath);
    $('#pathTo').addEventListener('change', updatePath);

    var ranks = rankSuppliers();
    $('#graphRank tbody').innerHTML = ranks.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + PF.esc(r.label) + '</td><td class="num">' + r.lost + '</td><td class="num">' + r.risk + '</td><td class="num">' + r.bc.toFixed(3) + '</td></tr>';
    }).join('');
    $('#graphRank').insertAdjacentHTML('beforeend', '<caption class="muted small" style="caption-side:bottom;padding-top:6px">Computed live: products lost or at risk if this supplier alone fails; betweenness on the undirected graph.</caption>');

    disrupted.add(ranks[0].id); // start with the most critical supplier disrupted so the impact is visible
    legend();
    draw();
    updatePath();
    lastW = $('#graphWrap').clientWidth;
    ro = new ResizeObserver(function () {
      var w = $('#graphWrap').clientWidth;
      if (w > 0 && Math.abs(w - lastW) > 40) { lastW = w; draw(); }
    });
    ro.observe($('#graphWrap'));
  }

  PF.demos.graph = {
    init: init,
    show: function () { if (sim && $('#graphWrap').clientWidth && Math.abs($('#graphWrap').clientWidth - lastW) > 40) { lastW = $('#graphWrap').clientWidth; draw(); } },
    theme: function () { if (window.d3) { legend(); update(); } }
  };
})();
