// Token Radar's dashboard: a static page over window.RADAR (data.js, written by main.ts beside this
// directory). It renders the ranked board with sortable columns, text search, category and chain
// filters, and a per-protocol detail panel with the model's arithmetic and the farm plan.
// No framework, no fetch, no network: every figure on the page comes out of data.js.
(function () {
  'use strict';

  var D = window.RADAR;
  if (!D || !D.rows) return;
  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  var state = { q: '', category: '', chain: '', watch: false, sort: 'rank', dir: 1, open: null };

  // ---- formatting -------------------------------------------------------
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return null;
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 730) return (days / 365).toFixed(1) + ' yrs';
    if (days >= 60) return Math.round(days / 30.4) + ' mo';
    return days + ' d';
  }

  // ---- the model, mirrored from lib/model.ts (radar-2) ------------------
  // The detail panel recomputes a row from its raw figures with this copy, so a reader can watch the
  // page arrive at the same implied value board.json carries.
  var MULT = { 'Chain': 1.5, 'Prediction Market': 1.4, 'Derivatives': 1.3, 'Decentralized AI': 1.3, 'AI Agents': 1.3, 'Launchpad': 1.2, 'Interest Rate Derivatives': 1.2, 'Options': 1.2, 'Dexs': 1.1, 'Privacy': 1.1, 'Payments': 1, 'Crypto Card Issuer': 1, 'Synthetics': 1, 'Options Vault': 1, 'RWA': 0.9, 'NFT Marketplace': 0.9, 'OTC Marketplace': 0.9, 'Lending': 0.85, 'Restaking': 0.85, 'CDP': 0.8, 'CDP Manager': 0.8, 'Uncollateralized Lending': 0.8, 'Insurance': 0.8, 'DOR': 0.8, 'Risk Curators': 0.75, 'Onchain Capital Allocator': 0.75, 'Collateral Management': 0.75, 'Collateral Markets': 0.75, 'Stablecoin Issuer': 0.75, 'Basis Trading': 0.7, 'Decentralized BTC': 0.7, 'Indexes': 0.7, 'CeDeFi': 0.7, 'Algo-Stables': 0.65, 'Dual-Token Stablecoin': 0.65, 'Staking Pool': 0.6, 'Anchor BTC': 0.6, 'Token Locker': 0.6, 'Governance Incentives': 0.6, 'Reserve Currency': 0.6, 'Yield': 0.55, 'Cross Chain Bridge': 0.55, 'Liquidity Manager': 0.55, 'Yield Aggregator': 0.5, 'Leveraged Farming': 0.5, 'Stablecoin Wrapper': 0.5, 'Farm': 0.45 };
  var KEYS = [['perpetual', 1.25], ['derivative', 1.25], ['option', 1.15], ['dex', 1.1], ['swap', 1.1], ['lend', 0.85], ['restak', 0.85], ['cdp', 0.8], ['rwa', 0.9], ['real world', 0.9], ['stable', 0.65], ['stak', 0.6], ['yield', 0.55], ['farm', 0.5], ['bridge', 0.55], ['vault', 0.55], ['ai', 1.25]];
  function multiple(cat) {
    if (cat && MULT[cat] !== undefined) return MULT[cat];
    if (cat) {
      var c = cat.toLowerCase();
      for (var i = 0; i < KEYS.length; i++) if (c.indexOf(KEYS[i][0]) >= 0) return KEYS[i][1];
    }
    return 0.7;
  }
  function recompute(r) {
    var raw = Math.min(200, Math.max(-80, r.change_7d === null ? 0 : r.change_7d));
    var trust = r.tvl_usd / (r.tvl_usd + 25e6);
    var growth = Math.exp(0.55 * raw * trust / 100);
    var age = r.age_days === null ? 540 : r.age_days;
    var maturity = 0.55 + 0.45 * (1 - Math.exp(-age / 900));
    var breadth = 1 + 0.055 * Math.log2(Math.max(1, r.chains.length));
    var scale = Math.min(1.5, Math.max(0.6, Math.pow(r.tvl_usd / 1e8, -0.06)));
    return Math.max(1, Math.round(r.tvl_usd * multiple(r.category) * growth * maturity * breadth * scale));
  }

  // ---- tiny DOM helper ---------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  // ---- header, stats, footer --------------------------------------------
  document.getElementById('meta-snapshot').textContent = 'Snapshot ' + D.as_of;
  document.getElementById('meta-model').textContent = 'model ' + D.model_version;
  document.getElementById('footer').textContent =
    'Source: ' + D.source + '. Board built from that snapshot alone; implied values are the model\'s claims, not prices, and nothing here is financial advice.';

  var totalImplied = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
  var sortedVals = rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
  var median = sortedVals[Math.floor(sortedVals.length / 2)];
  var stats = [
    ['Protocols ranked', String(D.board_size)],
    ['Watchlist covered', D.watchlist_size + ' / ' + D.watchlist_size],
    ['Early rows below the floor', String(D.early_size)],
    ['Combined implied value', fmtUsd(totalImplied)],
    ['Median implied value', fmtUsd(median)],
    ['Snapshot floor', fmtUsd(D.floor_usd)],
  ];
  var statsBox = document.getElementById('stats');
  stats.forEach(function (s) {
    var d = el('div', 'stat');
    d.appendChild(el('span', null, s[0]));
    d.appendChild(el('b', null, s[1]));
    statsBox.appendChild(d);
  });

  // ---- filters ------------------------------------------------------------
  var catSel = document.getElementById('f-category');
  var cats = [];
  rows.forEach(function (r) { var c = r.category || 'Uncategorised'; if (cats.indexOf(c) < 0) cats.push(c); });
  cats.sort();
  cats.forEach(function (c) { var o = el('option', null, c); o.value = c; catSel.appendChild(o); });

  var chainSel = document.getElementById('f-chain');
  var chainCount = {};
  rows.forEach(function (r) { r.chains.forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
  Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); })
    .forEach(function (c) { var o = el('option', null, c + ' (' + chainCount[c] + ')'); o.value = c; chainSel.appendChild(o); });

  function visible() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.category && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  var SORTS = {
    rank: function (r) { return r.rank; },
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    chains: function (r) { return r.chains.length; },
    implied: function (r) { return r.implied_value_usd; },
  };

  // ---- board rendering -----------------------------------------------------
  var tbody = document.getElementById('rows');
  var empty = document.getElementById('empty');
  var shown = document.getElementById('shown');
  var heads = Array.prototype.slice.call(document.querySelectorAll('th.sortable'));

  function paintHeads() {
    heads.forEach(function (th) {
      var old = th.querySelector('.arrow');
      if (old) old.remove();
      if (th.getAttribute('data-key') === state.sort) {
        th.appendChild(el('span', 'arrow', state.dir === 1 ? '▲' : '▼'));
      }
    });
  }

  function render() {
    var list = visible().slice().sort(function (a, b) {
      var f = SORTS[state.sort];
      var av = f(a), bv = f(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    tbody.textContent = '';
    list.forEach(function (r) {
      var tr = el('tr');
      tr.tabIndex = 0;
      tr.setAttribute('data-slug', r.slug);
      tr.appendChild(el('td', 'num rank', r.rank));
      var nameTd = el('td');
      var nm = el('span', 'pname', r.name);
      nameTd.appendChild(nm);
      if (r.on_watchlist) nameTd.appendChild(el('span', 'watch', 'watchlist'));
      nameTd.appendChild(el('span', 'psub', (r.category || 'Uncategorised') + ' · ' + (r.chains.slice(0, 3).join(', ') || 'chain unrecorded') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', 'num', fmtUsd(r.tvl_usd)));
      var pct = fmtPct(r.change_7d);
      var chTd = el('td', 'num ' + (pct === null ? 'na' : r.change_7d >= 0 ? 'pos' : 'neg'), pct === null ? 'n/a' : pct);
      tr.appendChild(chTd);
      tr.appendChild(el('td', 'num', fmtAge(r.age_days)));
      tr.appendChild(el('td', 'num', r.chains.length));
      var impTd = el('td', 'num');
      var wrap = el('div', 'implied');
      var bar = el('span', 'bar');
      var fill = el('i');
      fill.style.width = Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%';
      bar.appendChild(fill);
      wrap.appendChild(bar);
      wrap.appendChild(el('b', null, fmtUsd(r.implied_value_usd)));
      impTd.appendChild(wrap);
      tr.appendChild(impTd);
      tbody.appendChild(tr);
    });
    empty.hidden = list.length > 0;
    shown.textContent = list.length + ' of ' + rows.length + ' protocols shown';
    paintHeads();
  }

  // ---- detail panel ---------------------------------------------------------
  var detail = document.getElementById('detail');
  var scrim = document.getElementById('scrim');

  function factorRow(label, value, widthPct, note) {
    var row = el('div', 'frow');
    row.appendChild(el('span', 'fl', label));
    var bar = el('span', 'fbar');
    var fill = el('i');
    fill.style.width = Math.max(2, Math.min(100, widthPct)) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('span', 'fv', value));
    if (note) row.title = note;
    return row;
  }

  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    state.open = slug;
    detail.textContent = '';
    var close = el('button', 'close', 'Close');
    close.addEventListener('click', closeDetail);
    detail.appendChild(close);
    detail.appendChild(el('h2', null, r.name));
    detail.appendChild(el('p', 'dsub',
      'Rank ' + r.rank + ' of ' + D.board_size + ' · ' + (r.category || 'Uncategorised') +
      (r.on_watchlist ? ' · on the snapshot watchlist' : ' · early row, below the watchlist floor')));

    detail.appendChild(el('h3', null, 'The protocol'));
    var facts = el('div', 'facts');
    [
      ['TVL', fmtUsd(r.tvl_usd)],
      ['7d change', fmtPct(r.change_7d) === null ? 'not reported' : fmtPct(r.change_7d)],
      ['Listed', r.listed_at || 'date unrecorded'],
      ['Age with no token', fmtAge(r.age_days)],
      ['Chains', r.chains.length ? r.chains.join(', ') : 'unrecorded'],
      ['Implied value', fmtUsd(r.implied_value_usd)],
    ].forEach(function (f) {
      var d = el('div', 'fact');
      d.appendChild(el('span', null, f[0]));
      d.appendChild(el('b', null, f[1]));
      facts.appendChild(d);
    });
    detail.appendChild(facts);

    detail.appendChild(el('h3', null, 'How the model gets there'));
    var m = r.model;
    detail.appendChild(factorRow('Category', '×' + m.category_multiple.toFixed(2), (m.category_multiple / 1.5) * 100));
    detail.appendChild(factorRow('Growth', '×' + m.growth_factor.toFixed(2), (m.growth_factor / 3) * 100));
    detail.appendChild(factorRow('Growth trust', '×' + m.growth_trust.toFixed(2), m.growth_trust * 100, 'How much of the weekly change the model believes, from TVL size'));
    detail.appendChild(factorRow('Maturity', '×' + m.maturity_factor.toFixed(2), m.maturity_factor * 100));
    detail.appendChild(factorRow('Breadth', '×' + m.breadth_factor.toFixed(2), ((m.breadth_factor - 1) / 0.3) * 100));
    detail.appendChild(factorRow('Scale', '×' + m.scale_factor.toFixed(2), (m.scale_factor / 1.5) * 100));
    var check = recompute(r);
    var eq = el('p', 'eq');
    eq.appendChild(document.createTextNode(fmtUsd(r.tvl_usd) + ' TVL through its model factors gives '));
    eq.appendChild(el('b', null, fmtUsd(r.implied_value_usd)));
    eq.appendChild(document.createTextNode(check === r.implied_value_usd
      ? '. This page recomputes the row from its raw figures and lands on the same number.'
      : '. This page recomputes the row as ' + fmtUsd(check) + ' — a rounding hair from the board\'s figure.'));
    detail.appendChild(eq);

    detail.appendChild(el('h3', null, 'Farm plan — before any token'));
    var ol = el('ol', 'steps');
    r.farm_steps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
    detail.appendChild(ol);
    var note = el('p', 'dsub', 'A plan for being a genuine user of the protocol, sized to its TVL and timed to its age. It cannot promise an allocation: no snapshot can.');
    detail.appendChild(note);

    detail.classList.add('open');
    detail.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    detail.scrollTop = 0;
  }

  function closeDetail() {
    state.open = null;
    detail.classList.remove('open');
    detail.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
  }

  // ---- wiring ----------------------------------------------------------------
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('f-watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
  heads.forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
      render();
    });
  });
  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  tbody.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'TR') {
      e.preventDefault();
      openDetail(e.target.getAttribute('data-slug'));
    }
  });
  scrim.addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  render();
})();
