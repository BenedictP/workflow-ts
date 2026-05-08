/*
 * workflow-ts landing — interactive state diagram + tabs + tiny syntax tokenizer.
 * Vanilla, no dependencies. Runs after DOMContentLoaded (defer attribute in HTML).
 */

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Tabs
  // -----------------------------------------------------------------------
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    workflow: document.getElementById('panel-workflow'),
    react: document.getElementById('panel-react'),
    test: document.getElementById('panel-test'),
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([k, el]) => {
        if (!el) return;
        const active = k === target;
        el.classList.toggle('is-active', active);
        if (active) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      });
    });
  });

  // -----------------------------------------------------------------------
  // Tiny TS/TSX syntax tokenizer — just enough for our code samples.
  // We avoid shipping a highlighter library to keep the page fast.
  // -----------------------------------------------------------------------
  const TS_KEYWORDS = new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return',
    'if', 'else', 'switch', 'case', 'default', 'break', 'new', 'interface',
    'type', 'typeof', 'as', 'extends', 'implements', 'class', 'this',
    'true', 'false', 'null', 'undefined', 'void', 'async', 'await', 'in',
    'of', 'for', 'while', 'do', 'throw', 'try', 'catch', 'finally',
  ]);
  const TS_TYPES = new Set([
    'string', 'number', 'boolean', 'any', 'unknown', 'never', 'object',
    'Props', 'State', 'Output', 'Rendering', 'Worker', 'Workflow', 'Extract',
    'JSX',
  ]);

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  }

  function highlight(code) {
    // Decode any existing HTML entities so we can retokenize cleanly
    const raw = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    let out = '';
    let i = 0;
    const len = raw.length;

    while (i < len) {
      const c = raw[i];
      const two = raw.substr(i, 2);

      // Line comment
      if (two === '//') {
        const nl = raw.indexOf('\n', i);
        const end = nl === -1 ? len : nl;
        out += `<span class="tok-c">${escapeHtml(raw.slice(i, end))}</span>`;
        i = end;
        continue;
      }
      // Block comment
      if (two === '/*') {
        const end = raw.indexOf('*/', i + 2);
        const stop = end === -1 ? len : end + 2;
        out += `<span class="tok-c">${escapeHtml(raw.slice(i, stop))}</span>`;
        i = stop;
        continue;
      }
      // String (single, double, backtick) — simple, no escapes inside for our samples
      if (c === '"' || c === "'" || c === '`') {
        const quote = c;
        let j = i + 1;
        while (j < len && raw[j] !== quote) {
          if (raw[j] === '\\' && j + 1 < len) j += 2;
          else j++;
        }
        j = Math.min(j + 1, len);
        out += `<span class="tok-s">${escapeHtml(raw.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      // Identifier / keyword / type
      if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1;
        while (j < len && /[A-Za-z0-9_$]/.test(raw[j])) j++;
        const word = raw.slice(i, j);
        // peek next non-space char for function-call detection
        let k = j;
        while (k < len && raw[k] === ' ') k++;
        const isCall = raw[k] === '(';

        let cls = null;
        if (TS_KEYWORDS.has(word)) cls = 'tok-k';
        else if (TS_TYPES.has(word)) cls = 'tok-t';
        else if (/^[A-Z]/.test(word)) cls = 'tok-t';
        else if (isCall) cls = 'tok-f';

        out += cls
          ? `<span class="${cls}">${escapeHtml(word)}</span>`
          : `<span class="tok-n">${escapeHtml(word)}</span>`;
        i = j;
        continue;
      }
      // Numbers
      if (/[0-9]/.test(c)) {
        let j = i + 1;
        while (j < len && /[0-9.]/.test(raw[j])) j++;
        out += `<span class="tok-t">${escapeHtml(raw.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      // Punctuation / operators
      if (/[{}()[\];,.:<>?!|&=+\-*/]/.test(c)) {
        out += `<span class="tok-p">${escapeHtml(c)}</span>`;
        i++;
        continue;
      }
      out += escapeHtml(c);
      i++;
    }
    return out;
  }

  document.querySelectorAll('.panel__code code').forEach((el) => {
    el.innerHTML = highlight(el.innerHTML);
  });

  // -----------------------------------------------------------------------
  // Reveal-on-scroll for cards and glossary rows (IntersectionObserver)
  // -----------------------------------------------------------------------
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.style.transition =
                'opacity 600ms cubic-bezier(0.2,0.8,0.2,1), transform 600ms cubic-bezier(0.2,0.8,0.2,1)';
              entry.target.style.opacity = '1';
              entry.target.style.transform = 'translateY(0)';
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
      )
    : null;

  if (io) {
    document.querySelectorAll('.card, .glossary li, .install__col, .reading li').forEach((el, idx) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transitionDelay = Math.min(idx * 40, 240) + 'ms';
      io.observe(el);
    });
  }
})();
