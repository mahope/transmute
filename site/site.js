/* transmute.run — progressive enhancement only.
   Without JS the menu is always visible and code blocks are plain <pre>. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var lang = document.documentElement.lang === 'da' ? 'da' : 'en';
  var t = {
    en: { copy: 'Copy', copied: 'Copied', failed: 'Select and copy', open: 'Open menu', close: 'Close menu' },
    da: { copy: 'Kopiér', copied: 'Kopieret', failed: 'Markér og kopiér', open: 'Åbn menu', close: 'Luk menu' }
  }[lang];

  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    /* Mobile menu */
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.site-nav');
    if (toggle && nav) {
      var setOpen = function (open) {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? t.close : t.open);
      };
      setOpen(false);
      toggle.addEventListener('click', function () {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
      });
      document.addEventListener('click', function (e) {
        if (toggle.getAttribute('aria-expanded') === 'true' && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
      });
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
    }

    /* Copy buttons on terminal blocks. Copies the command lines only, without the
       prompt and without output/comment lines, so the result can be pasted as-is. */
    var iconCopy = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
    var iconDone = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

    function commandText(pre) {
      var clone = pre.cloneNode(true);
      var drop = clone.querySelectorAll('.out, .cm, .nm, .copy');
      for (var i = 0; i < drop.length; i++) drop[i].parentNode.removeChild(drop[i]);
      var prompts = clone.querySelectorAll('.p, .prompt');
      for (var j = 0; j < prompts.length; j++) prompts[j].parentNode.removeChild(prompts[j]);
      var lines = clone.textContent.replace(/\r/g, '').split('\n');
      var out = [];
      for (var k = 0; k < lines.length; k++) {
        var line = lines[k].replace(/^\s?/, '');
        if (line.trim() !== '' || out.length) out.push(line);
      }
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      return out.join('\n');
    }

    var pres = document.querySelectorAll('pre');
    for (var i = 0; i < pres.length; i++) {
      (function (pre) {
        var text = commandText(pre);
        if (!text) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copy';
        btn.innerHTML = iconCopy + '<span>' + t.copy + '</span>';
        btn.setAttribute('aria-label', t.copy);
        var timer;
        btn.addEventListener('click', function () {
          var done = function (ok) {
            btn.classList.toggle('is-done', ok);
            btn.innerHTML = (ok ? iconDone : iconCopy) + '<span>' + (ok ? t.copied : t.failed) + '</span>';
            clearTimeout(timer);
            timer = setTimeout(function () {
              btn.classList.remove('is-done');
              btn.innerHTML = iconCopy + '<span>' + t.copy + '</span>';
            }, 1800);
          };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          } else {
            done(false);
          }
        });
        pre.appendChild(btn);
      })(pres[i]);
    }
  });
})();
