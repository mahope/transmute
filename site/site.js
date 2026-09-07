/* transmute.run — progressive enhancement only.
   Without JS: the menu is always visible, the search button is a link to /search/,
   code blocks are plain <pre>, the theme follows the system, the playground shows its static example. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  root.classList.add('js');

  var lang = root.lang === 'da' ? 'da' : 'en';
  var t = {
    en: { copy: 'Copy', copied: 'Copied', failed: 'Select and copy', open: 'Open menu', close: 'Close menu',
          search: 'Search', placeholder: 'Search guides, operations, questions…', none: 'No results for', results: 'results',
          hint: '↑↓ to move · Enter to open · Esc to close', all: 'See all results', running: 'Running…', rows: 'rows' },
    da: { copy: 'Kopiér', copied: 'Kopieret', failed: 'Markér og kopiér', open: 'Åbn menu', close: 'Luk menu',
          search: 'Søg', placeholder: 'Søg i guides, operationer, spørgsmål…', none: 'Ingen resultater for', results: 'resultater',
          hint: '↑↓ flytter · Enter åbner · Esc lukker', all: 'Se alle resultater', running: 'Kører…', rows: 'rækker' }
  }[lang];

  function $(sel, el) { return (el || doc).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    var e = doc.createElement(tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject();
  }
  var iconCopy = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  var iconDone = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var iconSearch = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

  /* ---------- Theme ---------- */
  function initTheme() {
    var btn = $('.theme-toggle');
    if (!btn) return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function stored() { try { return localStorage.getItem('theme') || 'system'; } catch (e) { return 'system'; } }
    function apply(mode) {
      if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
      var effective = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode;
      root.setAttribute('data-theme-effective', effective);
      var next = mode === 'system' ? (effective === 'dark' ? 'light' : 'dark') : (mode === 'dark' ? 'light' : 'system');
      btn.setAttribute('aria-label', btn.getAttribute('data-' + next));
      btn.setAttribute('title', btn.getAttribute('data-' + next));
      btn.setAttribute('data-mode', mode);
    }
    apply(stored());
    btn.addEventListener('click', function () {
      var mode = stored(), effective = root.getAttribute('data-theme-effective');
      var next = mode === 'system' ? (effective === 'dark' ? 'light' : 'dark') : (mode === 'dark' ? 'light' : 'system');
      try { if (next === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', next); } catch (e) {}
      apply(next);
    });
    mq.addEventListener && mq.addEventListener('change', function () { apply(stored()); });
  }

  /* ---------- Mobile menu ---------- */
  function initMenu() {
    var toggle = $('.nav-toggle'), nav = $('.site-nav');
    if (!toggle || !nav) return;
    function setOpen(open) {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? t.close : t.open);
    }
    setOpen(false);
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
    });
    doc.addEventListener('click', function (e) {
      if (toggle.getAttribute('aria-expanded') === 'true' && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  }

  /* ---------- Copy buttons on terminal blocks ----------
     Copies the command lines only, without the prompt and without output/comment lines. */
  function commandText(pre) {
    var clone = pre.cloneNode(true);
    $$('.out, .cm, .nm, .copy', clone).forEach(function (n) { n.parentNode.removeChild(n); });
    $$('.p, .prompt', clone).forEach(function (n) { n.parentNode.removeChild(n); });
    var lines = clone.textContent.replace(/\r/g, '').split('\n'), out = [];
    for (var k = 0; k < lines.length; k++) {
      var line = lines[k].replace(/^\s?/, '');
      if (line.trim() !== '' || out.length) out.push(line);
    }
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    return out.join('\n');
  }
  function copyButton(getText, cls) {
    var btn = el('button', { type: 'button', 'class': cls || 'copy', 'aria-label': t.copy }, iconCopy + '<span>' + t.copy + '</span>');
    var timer;
    btn.addEventListener('click', function () {
      var done = function (ok) {
        btn.classList.toggle('is-done', ok);
        btn.innerHTML = (ok ? iconDone : iconCopy) + '<span>' + (ok ? t.copied : t.failed) + '</span>';
        clearTimeout(timer);
        timer = setTimeout(function () { btn.classList.remove('is-done'); btn.innerHTML = iconCopy + '<span>' + t.copy + '</span>'; }, 1800);
      };
      copyText(getText()).then(function () { done(true); }, function () { done(false); });
    });
    return btn;
  }
  function initCopy() {
    $$('pre').forEach(function (pre) {
      if (pre.closest('.try') || $('.copy', pre)) return;
      var text = commandText(pre);
      if (text) pre.appendChild(copyButton(function () { return text; }));
    });
  }

  /* ---------- Share (copy link) ---------- */
  function initShare() {
    $$('.share').forEach(function (btn) {
      var label = btn.querySelector('span'), orig = label.textContent, timer;
      btn.addEventListener('click', function () {
        var url = location.origin + location.pathname;
        var done = function (ok) {
          label.textContent = ok ? btn.getAttribute('data-done') : t.failed;
          clearTimeout(timer);
          timer = setTimeout(function () { label.textContent = orig; }, 1800);
        };
        if (navigator.share && /Mobi|Android/.test(navigator.userAgent)) {
          navigator.share({ title: doc.title, url: url }).catch(function () {});
          return;
        }
        copyText(url).then(function () { done(true); }, function () { done(false); });
      });
    });
  }

  /* ---------- Table of contents: collapse on narrow screens, scroll-spy ---------- */
  function initToc() {
    var details = $('.toc'); if (!details) return;
    var mq = window.matchMedia('(min-width: 1100px)');
    function sync() { if (mq.matches) details.open = true; else details.open = false; }
    sync();
    mq.addEventListener && mq.addEventListener('change', sync);
    var links = $$('.toc a'), heads = links.map(function (a) { return $(a.getAttribute('href').replace(/^#/, '#') === '#' ? null : '[id="' + a.getAttribute('href').slice(1) + '"]'); });
    if (!('IntersectionObserver' in window) || !heads.length) return;
    var active = null;
    function setActive(id) {
      if (id === active) return;
      active = id;
      links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + id); a.removeAttribute('aria-current'); });
      var cur = links.filter(function (a) { return a.getAttribute('href') === '#' + id; })[0];
      if (cur) cur.setAttribute('aria-current', 'location');
    }
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var first = heads.filter(function (h) { return h && visible[h.id]; })[0];
      if (first) setActive(first.id);
      else {
        /* nothing on screen: pick the last heading above the viewport */
        var above = heads.filter(function (h) { return h && h.getBoundingClientRect().top < 100; });
        if (above.length) setActive(above[above.length - 1].id);
      }
    }, { rootMargin: '-80px 0px -60% 0px', threshold: [0, 1] });
    heads.forEach(function (h) { if (h) io.observe(h); });
  }

  /* ---------- Back to top ---------- */
  function initTop() {
    var btn = $('.to-top'); if (!btn) return;
    var shown = false;
    function check() {
      var s = window.scrollY > 600;
      if (s !== shown) { shown = s; btn.hidden = !s; }
    }
    window.addEventListener('scroll', check, { passive: true });
    check();
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); ($('#main') || doc.body).focus && $('h1') && $('h1').focus(); });
  }

  /* ---------- Prefetch internal links on intent ---------- */
  function initPrefetch() {
    var conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
    var done = {};
    function prefetch(a) {
      var href = a.getAttribute('href') || '';
      if (a.origin !== location.origin || done[a.pathname] || a.pathname === location.pathname || href.charAt(0) === '#') return;
      if (!/\/$/.test(a.pathname) && !/\.html$/.test(a.pathname)) return;
      done[a.pathname] = true;
      var l = el('link', { rel: 'prefetch', href: a.pathname, as: 'document' });
      doc.head.appendChild(l);
    }
    doc.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) prefetch(a); }, { passive: true });
    doc.addEventListener('touchstart', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) prefetch(a); }, { passive: true });
  }

  /* ---------- External links ---------- */
  function initExternal() {
    $$('.prose a[href^="http"], .section p a[href^="http"], .faq a[href^="http"]').forEach(function (a) {
      if (a.origin === location.origin) return;
      a.classList.add('ext');
      var rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
      if (rel.indexOf('noopener') < 0) rel.push('noopener');
      a.setAttribute('rel', rel.join(' '));
    });
  }

  /* ---------- Report a bug: open BugBottle's panel from the footer ---------- */
  function initReportBug() {
    $$('.report-bug').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var host = $$('body > *').filter(function (n) { return n.shadowRoot && n.shadowRoot.querySelector('button.trigger'); })[0];
        if (!host) return; /* BugBottle did not load: fall through to GitHub issues */
        e.preventDefault();
        host.shadowRoot.querySelector('button.trigger').click();
      });
    });
  }

  /* ---------- Search: shared matcher for the palette, /search/ and the 404 page ---------- */
  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) indexPromise = fetch('/search-index.json').then(function (r) { return r.json(); }).catch(function () { indexPromise = null; return []; });
    return indexPromise;
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a'); }
  function search(index, q) {
    var terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    index.forEach(function (e) {
      var title = norm(e.title), desc = norm(e.description), body = norm(e.body), tags = norm(e.tags.join(' ')), url = norm(e.url);
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var term = terms[i], s = 0;
        if (title === term) s += 40; else if (title.indexOf(term) === 0) s += 20; else if (title.indexOf(term) >= 0) s += 12;
        if (tags.indexOf(term) >= 0) s += 8;
        if (desc.indexOf(term) >= 0) s += 5;
        if (body.indexOf(term) >= 0) s += 2;
        if (url.indexOf(term) >= 0) s += 1;
        if (!s) { score = 0; break; }
        score += s;
      }
      if (score) { if (e.lang === lang) score += 3; out.push({ e: e, score: score }); }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.map(function (r) { return r.e; });
  }
  function snippet(e, q) {
    var terms = norm(q).split(/\s+/).filter(Boolean);
    var text = e.description || e.body || '', low = norm(text);
    var pos = -1;
    terms.forEach(function (tm) { var p = low.indexOf(tm); if (p >= 0 && (pos < 0 || p < pos)) pos = p; });
    if (pos < 0 && e.body && e.section === 'Guides') { text = e.body; low = norm(text); terms.forEach(function (tm) { var p = low.indexOf(tm); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }); }
    if (pos > 80) text = '…' + text.slice(pos - 60);
    if (text.length > 160) text = text.slice(0, 159) + '…';
    return highlight(text, terms);
  }
  function highlight(text, terms) {
    var h = esc(text);
    terms.forEach(function (tm) {
      if (tm.length < 2) return;
      h = h.replace(new RegExp('(' + tm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return h;
  }
  function renderResults(container, results, q, opts) {
    container.innerHTML = '';
    if (!q.trim()) { container.hidden = true; return; }
    container.hidden = false;
    if (!results.length) {
      container.appendChild(el('p', { 'class': 'search-empty' }, t.none + ' <strong>' + esc(q) + '</strong>'));
      return;
    }
    var terms = norm(q).split(/\s+/).filter(Boolean), groups = {}, order = [];
    results.forEach(function (e) { if (!groups[e.section]) { groups[e.section] = []; order.push(e.section); } groups[e.section].push(e); });
    var n = 0;
    order.forEach(function (sec) {
      var g = el('div', { 'class': 'search-group', role: 'group', 'aria-label': sec });
      g.appendChild(el('h3', {}, esc(sec)));
      var ul = el('ul', { role: opts && opts.listbox ? 'presentation' : null });
      groups[sec].forEach(function (e, k) {
        if (opts && opts.limit && n >= opts.limit) return;
        if (opts && opts.perGroup && k >= opts.perGroup) return;
        var li = el('li', { role: opts && opts.listbox ? 'option' : null, id: opts && opts.listbox ? 'sr-' + n : null, 'aria-selected': opts && opts.listbox ? 'false' : null });
        var badge = e.lang !== lang || (opts && opts.badge) ? '<span class="badge" lang="' + e.lang + '">' + e.lang.toUpperCase() + '</span>' : '';
        li.innerHTML = '<a href="' + esc(e.url) + '"><span class="r-title"><span>' + highlight(e.title, terms) + '</span>' + badge + '</span><span class="r-snip">' + snippet(e, q) + '</span><span class="r-url">' + esc(e.url) + '</span></a>';
        ul.appendChild(li); n++;
      });
      if (ul.children.length) { g.appendChild(ul); container.appendChild(g); }
    });
  }

  /* ---------- Search palette ---------- */
  function initPalette() {
    var opener = $('.search-open'); if (!opener) return;
    var pal, input, list, hint, results = [], sel = -1, lastFocus, index;
    function build() {
      pal = el('div', { 'class': 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': t.search, hidden: '' });
      pal.innerHTML = '<div class="palette-box"><form class="palette-form" role="search">' + iconSearch +
        '<input type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(t.placeholder) + '" aria-label="' + esc(t.search) + '" role="combobox" aria-expanded="false" aria-controls="palette-results" aria-autocomplete="list">' +
        '<kbd>Esc</kbd></form><div class="palette-results" id="palette-results" role="listbox" hidden></div>' +
        '<p class="palette-hint">' + esc(t.hint) + ' · <a href="' + (lang === 'da' ? '/da/search/' : '/search/') + '">' + esc(t.all) + '</a></p></div>';
      doc.body.appendChild(pal);
      input = $('input', pal); list = $('.palette-results', pal); hint = $('.palette-hint a', pal);
      input.addEventListener('input', function () { update(); });
      $('form', pal).addEventListener('submit', function (e) { e.preventDefault(); if (sel >= 0 && results[sel]) go(results[sel]); else if (input.value.trim()) location.href = hint.getAttribute('href') + '?q=' + encodeURIComponent(input.value.trim()); });
      pal.addEventListener('click', function (e) { if (e.target === pal) close(); });
      pal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
        else if (e.key === 'Tab') trap(e);
      });
      list.addEventListener('mousemove', function (e) { var li = e.target.closest('li[role=option]'); if (li) select(parseInt(li.id.slice(3), 10), true); });
    }
    function trap(e) {
      var f = $$('input, a[href], button', pal).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function update() {
      var q = input.value;
      results = index ? search(index, q) : [];
      renderResults(list, results, q, { listbox: true, limit: 12, perGroup: 4 });
      results = $$('li[role=option] a', list).map(function (a) { return { url: a.getAttribute('href') }; });
      input.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
      hint.setAttribute('href', hint.getAttribute('href').split('?')[0] + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
      select(results.length ? 0 : -1);
    }
    function select(i, quiet) {
      sel = i;
      $$('li[role=option]', list).forEach(function (li, k) {
        li.setAttribute('aria-selected', k === i ? 'true' : 'false');
        if (k === i && !quiet) li.scrollIntoView({ block: 'nearest' });
      });
      if (i >= 0) input.setAttribute('aria-activedescendant', 'sr-' + i); else input.removeAttribute('aria-activedescendant');
    }
    function move(d) { if (!results.length) return; select((sel + d + results.length) % results.length); }
    function go(e) { close(); location.href = e.url; }
    function open() {
      if (!pal) build();
      lastFocus = doc.activeElement;
      pal.hidden = false; root.classList.add('palette-open');
      input.value = ''; update();
      input.focus();
      loadIndex().then(function (ix) { index = ix; update(); });
    }
    function close() {
      if (!pal || pal.hidden) return;
      pal.hidden = true; root.classList.remove('palette-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    opener.addEventListener('click', function (e) { e.preventDefault(); open(); });
    opener.addEventListener('mouseenter', function () { loadIndex(); }, { once: true });
    doc.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase(), editing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (pal && !pal.hidden) close(); else open(); }
      else if (e.key === '/' && !editing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(); }
    });
    /* platform hint on the header button */
    var kbd = $('kbd', opener);
    if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform)) kbd.textContent = 'Ctrl K';
  }

  /* ---------- Full search page and 404 field ---------- */
  function initSearchPage() {
    var form = $('.search-form'); if (!form) return;
    var input = $('input', form), out = $('.search-results'), count = $('.search-count');
    var params = new URLSearchParams(location.search), q0 = params.get('q') || '';
    if (q0) input.value = q0;
    function run(push) {
      var q = input.value;
      loadIndex().then(function (ix) {
        var res = search(ix, q);
        renderResults(out, res, q, { badge: true });
        if (count) { count.hidden = !q.trim(); count.textContent = res.length + ' ' + t.results; }
        if (push && history.replaceState) history.replaceState(null, '', q.trim() ? '?q=' + encodeURIComponent(q.trim()) : location.pathname);
      });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); run(true); });
    var timer;
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { run(true); }, 120); });
    if (q0) run(false); else input.focus();
  }

  /* ---------- Playground: the real engine, in a sandboxed frame ---------- */
  function initPlayground() {
    var box = $('.try'); if (!box) return;
    var inputEl = $('[data-role=input]', box), pipeEl = $('[data-role=pipeline]', box), outEl = $('[data-role=output]', box),
        fmtIn = $('[data-role=informat]', box), fmtOut = $('[data-role=outformat]', box), status = $('[data-role=status]', box),
        cmdEl = $('[data-role=command]', box), presets = $$('[data-preset]', box);
    var frame = el('iframe', { src: '/try.html', sandbox: 'allow-scripts', title: 'Transmute engine', 'aria-hidden': 'true', tabindex: '-1', hidden: '' });
    var ready = false, pending = null, seq = 0, timer;
    box.classList.add('is-live');
    outEl.setAttribute('aria-live', 'polite');
    window.addEventListener('message', function (e) {
      if (e.source !== frame.contentWindow || !e.data) return;
      if (e.data.type === 'ready') { ready = true; if (pending) { frame.contentWindow.postMessage(pending, '*'); } return; }
      if (e.data.type !== 'result' || e.data.id !== seq) return;
      if (e.data.error) { outEl.textContent = e.data.error; box.classList.add('has-error'); status.textContent = ''; }
      else { outEl.textContent = e.data.text || ''; box.classList.remove('has-error'); status.textContent = e.data.rows != null ? e.data.rows + ' ' + t.rows : ''; }
    });
    doc.body.appendChild(frame);
    function command() {
      var f = fmtIn.value, o = fmtOut.value, p = pipeEl.value.replace(/\s*\n\s*/g, '').trim();
      var c = 'transmute data.' + (f === 'auto' ? 'json' : f);
      if (p && p !== '[]') c += " --pipe '" + p.replace(/'/g, "'\\''") + "'";
      if (o !== 'table') c += ' -o ' + o;
      if (o === 'sql') c += ' --table my_table';
      cmdEl.textContent = c;
    }
    function run() {
      var msg = { type: 'run', id: ++seq, input: inputEl.value, input_format: fmtIn.value, pipeline: pipeEl.value, output_format: fmtOut.value };
      status.textContent = t.running;
      command();
      if (ready) frame.contentWindow.postMessage(msg, '*'); else pending = msg;
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(run, 160); }
    [inputEl, pipeEl].forEach(function (n) { n.addEventListener('input', schedule); });
    [fmtIn, fmtOut].forEach(function (n) { n.addEventListener('change', run); });
    presets.forEach(function (b) {
      b.addEventListener('click', function () {
        var d = JSON.parse(b.getAttribute('data-preset'));
        inputEl.value = d.input; pipeEl.value = d.pipeline; fmtIn.value = d.informat || 'auto'; fmtOut.value = d.outformat;
        presets.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        run();
      });
    });
    var cmdCopy = $('.try-command', box);
    if (cmdCopy) cmdCopy.appendChild(copyButton(function () { return cmdEl.textContent; }, 'copy copy-inline'));
    var outCopy = $('.try-output', box);
    if (outCopy) outCopy.appendChild(copyButton(function () { return outEl.textContent; }, 'copy'));
    [inputEl, pipeEl].forEach(function (ta) {
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
          e.preventDefault();
          var s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(s); ta.selectionStart = ta.selectionEnd = s + 2; schedule();
        }
      });
    });
    run();
  }

  function ready(fn) { if (doc.readyState !== 'loading') fn(); else doc.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    initTheme(); initMenu(); initCopy(); initShare(); initToc(); initTop(); initPrefetch(); initExternal(); initReportBug();
    initPalette(); initSearchPage(); initPlayground();
  });
})();
