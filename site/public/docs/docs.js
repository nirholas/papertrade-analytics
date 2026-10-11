(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('docs-theme');
    if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  } catch (e) { /* storage unavailable: follow the system theme */ }

  function currentTheme() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function ready() {
    var theme = document.getElementById('theme');
    theme.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('docs-theme', next); } catch (e) { /* ignore */ }
    });

    var menu = document.getElementById('menu');
    var side = document.getElementById('side');
    function setMenu(open) {
      side.setAttribute('data-open', String(open));
      menu.setAttribute('aria-expanded', String(open));
    }
    menu.addEventListener('click', function () { setMenu(side.getAttribute('data-open') !== 'true'); });
    side.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.copy');
      if (!btn) return;
      var code = btn.parentElement.querySelector('code');
      var text = code ? code.textContent : '';
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { btn.textContent = 'Press Ctrl+C'; });
      } else {
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = 'Selected';
      }
    });

    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
    if (links.length && 'IntersectionObserver' in window) {
      var map = {};
      links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.removeAttribute('aria-current'); });
          var a = map[en.target.id];
          if (a) a.setAttribute('aria-current', 'true');
        });
      }, { rootMargin: '-72px 0px -70% 0px' });
      document.querySelectorAll('.doc h2[id], .doc h3[id]').forEach(function (h) { obs.observe(h); });
    }

    var box = document.getElementById('search');
    var input = document.getElementById('search-input');
    var list = document.getElementById('search-results');
    var hint = document.getElementById('search-hint');
    var index = null;
    var loading = null;
    var active = -1;
    var opener = null;

    function load() {
      if (index) return Promise.resolve(index);
      if (!loading) {
        loading = fetch('/docs/search-index.json').then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (d) { index = d; return d; }).catch(function (err) {
          loading = null;
          hint.textContent = 'Search is unavailable right now (' + err.message + '). Reload to retry.';
          throw err;
        });
      }
      return loading;
    }

    function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function mark(text, terms) {
      var out = esc(text);
      terms.forEach(function (t) {
        if (!t) return;
        out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
      });
      return out;
    }
    function snippet(text, terms) {
      var lower = text.toLowerCase();
      var at = -1;
      for (var i = 0; i < terms.length && at < 0; i++) at = lower.indexOf(terms[i]);
      var start = Math.max(0, at - 40);
      return (start > 0 ? '...' : '') + text.slice(start, start + 130);
    }

    function select(i) {
      var items = list.querySelectorAll('a');
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach(function (a, n) { a.setAttribute('aria-selected', String(n === active)); });
      items[active].scrollIntoView({ block: 'nearest' });
    }

    function run() {
      var terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      list.innerHTML = '';
      active = -1;
      if (!terms.length) { hint.textContent = 'Type to search. Enter opens the first result, Esc closes.'; return; }
      load().then(function (data) {
        var scored = [];
        data.forEach(function (e) {
          var h = e.h.toLowerCase();
          var body = e.x.toLowerCase();
          var score = 0;
          for (var i = 0; i < terms.length; i++) {
            var inH = h.indexOf(terms[i]) >= 0;
            var inB = body.indexOf(terms[i]) >= 0;
            if (!inH && !inB && e.t.toLowerCase().indexOf(terms[i]) < 0) return;
            score += (inH ? 6 : 0) + (inB ? 1 : 0) + 1;
          }
          scored.push({ e: e, score: score });
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        var top = scored.slice(0, 8);
        hint.textContent = top.length ? top.length + ' result' + (top.length === 1 ? '' : 's') : 'No results for "' + input.value + '". Try a tool name, a client name or a concept such as skew.';
        list.innerHTML = top.map(function (r) {
          var e = r.e;
          var href = (e.p === 'index' ? '/docs/' : '/docs/' + e.p) + (e.a ? '#' + e.a : '');
          return '<li><a href="' + href + '" role="option"><b>' + mark(e.t === e.h ? e.t : e.t + ': ' + e.h, terms) + '</b><small>' + mark(snippet(e.x, terms), terms) + '</small></a></li>';
        }).join('');
        if (top.length) select(0);
      }).catch(function () { /* hint already set */ });
    }

    function open() {
      opener = document.activeElement;
      box.hidden = false;
      input.focus();
      load().catch(function () { /* hint already set */ });
    }
    function close() {
      box.hidden = true;
      if (opener && opener.focus) opener.focus();
    }

    document.getElementById('search-open').addEventListener('click', open);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(active - 1); }
      else if (e.key === 'Enter') {
        var items = list.querySelectorAll('a');
        if (items[active]) { e.preventDefault(); window.location.href = items[active].getAttribute('href'); close(); }
      }
    });
    list.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape' && !box.hidden) { close(); return; }
      if (box.hidden && ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); open(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
