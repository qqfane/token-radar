(function () {
  'use strict';

  var state = { sortCol: 'rank', sortDir: 'asc' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtUsd(n) {
    var v = Math.round(Number(n) || 0);
    return '$' + v.toLocaleString('en-US');
  }

  function fmtPct(n) {
    if (n == null || isNaN(Number(n))) return '\u2014';
    var sign = Number(n) > 0 ? '+' : '';
    return sign + Number(n).toFixed(2) + '%';
  }

  function fmtDate(value) {
    if (value == null) return '\u2014';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '\u2014';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function allRows() {
    var d = window.RADAR_DATA;
    return (d && Array.isArray(d.rows)) ? d.rows : [];
  }

  function sortRows(list) {
    var dir = state.sortDir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var av = a[state.sortCol];
      var bv = b[state.sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      var cmp;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return cmp * dir;
    });
  }

  function th(col, label, sortable, num) {
    var cls = num ? 'num' : '';
    var sortAttr = sortable ? ' data-sort="' + esc(col) + '"' : '';
    var arrow = '';
    if (sortable && state.sortCol === col) arrow = state.sortDir === 'asc' ? ' \u25B4' : ' \u25BE';
    return '<th class="' + cls + '"' + sortAttr + '><span>' + esc(label) + '</span>' + arrow + '</th>';
  }

  function boardRow(row) {
    var watch = (Number(row.tvl_usd) || 0) >= 50000000;
    var cls = watch ? ' class="watchlist"' : '';
    return '<tr' + cls + '>'
      + '<td class="num">' + esc(row.rank) + '</td>'
      + '<td><a href="#p=' + esc(row.slug) + '">' + esc(row.name) + '</a></td>'
      + '<td>' + esc(row.category) + '</td>'
      + '<td class="num">' + fmtUsd(row.tvl_usd) + '</td>'
      + '<td class="num">' + fmtPct(row.change_7d) + '</td>'
      + '<td class="num">' + fmtUsd(row.implied_value_usd) + '</td>'
      + '</tr>';
  }

  function boardHtml(list) {
    var sorted = sortRows(list);
    if (!sorted.length) return '<p class="empty">No protocols match.</p>';
    var html = '<div class="table-wrap"><table class="board"><thead><tr>';
    html += th('rank', 'Rank', true, true);
    html += th('name', 'Protocol', false, false);
    html += th('category', 'Category', false, false);
    html += th('tvl_usd', 'TVL', true, true);
    html += th('change_7d', '7d Change', true, true);
    html += th('implied_value_usd', 'Implied Value', true, true);
    html += '</tr></thead><tbody>';
    for (var i = 0; i < sorted.length; i++) html += boardRow(sorted[i]);
    html += '</tbody></table></div>';
    return html;
  }

  function searchHtml(q) {
    var list = allRows().filter(function (row) {
      var hay = ((row.name || '') + ' ' + (row.slug || '') + ' ' + (row.category || '')).toLowerCase();
      return hay.indexOf((q || '').toLowerCase()) !== -1;
    });
    var n = list.length;
    var html = '<p class="result-line">' + n + ' protocol' + (n === 1 ? '' : 's') + ' match' + (n === 1 ? '' : 'es') + ' for "' + esc(q) + '" <a href="#">&larr; Back to the full board</a></p>';
    return html + boardHtml(list);
  }

  function detailHtml(slug) {
    var all = allRows();
    var row = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].slug === slug) { row = all[i]; break; }
    }
    if (!row) {
      return '<div class="detail"><div class="panel"><h2>Not on the board</h2>'
        + '<p>This protocol is not on the radar board.</p>'
        + '<p><a href="#">&larr; Back to the board</a></p></div></div>';
    }
    var tvl = Number(row.tvl_usd) || 0;
    var base = Number(row.base_multiple) || 0;
    var momentum = Number(row.momentum) || 0;
    var ageFactor = Number(row.age_factor) || 0;
    var computed = Math.round(tvl * base * momentum * ageFactor);
    var implied = Math.round(Number(row.implied_value_usd) || 0);
    var agree = computed === implied;
    var farm = Array.isArray(row.farm_steps) ? row.farm_steps : [];
    var html = '<a class="back" href="#">&larr; Back to the board</a>';
    html += '<div class="detail"><div class="panel detail-card">';
    html += '<h2><a href="#p=' + esc(row.slug) + '">' + esc(row.name) + '</a> <span class="muted">rank ' + esc(row.rank) + '</span></h2>';
    html += '<dl class="fields">';
    html += '<div class="field"><dt>Rank</dt><dd>' + esc(row.rank) + '</dd></div>';
    html += '<div class="field"><dt>Category</dt><dd>' + esc(row.category) + '</dd></div>';
    html += '<div class="field"><dt>TVL</dt><dd>' + fmtUsd(row.tvl_usd) + '</dd></div>';
    html += '<div class="field"><dt>7d Change</dt><dd>' + fmtPct(row.change_7d) + '</dd></div>';
    html += '<div class="field"><dt>Listed</dt><dd>' + fmtDate(row.listed_at) + '</dd></div>';
    html += '<div class="field"><dt>Implied Value</dt><dd>' + fmtUsd(row.implied_value_usd) + '</dd></div>';
    html += '</dl>';
    html += '<h3>Valuation</h3>';
    html += '<p class="formula">' + fmtUsd(tvl) + ' \u00d7 ' + base + ' \u00d7 ' + momentum + ' \u00d7 ' + ageFactor + ' = ' + fmtUsd(computed) + '</p>';
    html += '<p class="recompute">Live recompute: round(tvl_usd \u00d7 base_multiple \u00d7 momentum \u00d7 age_factor) = <strong>' + fmtUsd(computed) + '</strong> &middot; board implied value: <strong>' + fmtUsd(implied) + '</strong> &middot; they agree: ' + (agree ? 'yes' : 'no') + '</p>';
    html += '<p class="cat-multiple">Category multiple: <strong>' + base + '</strong></p>';
    html += '<h3>Farm plan</h3>';
    html += '<ol class="farm">';
    for (var j = 0; j < farm.length; j++) html += '<li>' + esc(farm[j]) + '</li>';
    html += '</ol>';
    html += '</div></div>';
    return html;
  }

  function currentView() {
    var params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    var p = params.get('p');
    var q = params.get('q');
    if (p) return { type: 'detail', slug: p };
    if (q) return { type: 'search', q: q };
    return { type: 'board' };
  }

  function render() {
    var view = currentView();
    var html = '';
    if (view.type === 'detail') html = detailHtml(view.slug);
    else if (view.type === 'search') html = searchHtml(view.q);
    else html = boardHtml(allRows());
    document.getElementById('app').innerHTML = html;
    var input = document.getElementById('search');
    if (input) input.value = (view.type === 'search') ? (view.q || '') : '';
  }

  document.addEventListener('click', function (e) {
    var el = e.target;
    var thEl = el && el.closest ? el.closest('th[data-sort]') : null;
    if (!thEl) return;
    var col = thEl.getAttribute('data-sort');
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    render();
  });

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'search') {
      if (e.target.value === '') window.location.hash = '';
      else window.location.hash = '#q=' + encodeURIComponent(e.target.value);
    }
  });

  window.addEventListener('hashchange', render);
  render();
})();
