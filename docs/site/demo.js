/*
 * workflow-ts interactive demos.
 * Vanilla JS simulation of the runtime contracts used by the static docs site.
 */

(function () {
  'use strict';

  const MAX_COUNTER = 10;
  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function setText(selector, value) {
    const el = qs(selector);
    if (el) el.textContent = value;
  }

  function pushLog(selector, message, kind) {
    const list = qs(selector);
    if (!list) return;

    const item = document.createElement('li');
    item.className = kind ? `event-log__item event-log__item--${kind}` : 'event-log__item';
    item.textContent = message;
    list.prepend(item);

    while (list.children.length > 6) {
      list.removeChild(list.lastElementChild);
    }
  }

  function setButtonDisabled(selector, disabled) {
    const button = qs(selector);
    if (button) button.disabled = disabled;
  }

  // -----------------------------------------------------------------------
  // Tiny TS syntax tokenizer. Kept local so demo.html stays dependency-free.
  // -----------------------------------------------------------------------
  const TS_KEYWORDS = new Set([
    'as',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'default',
    'do',
    'else',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'interface',
    'let',
    'new',
    'null',
    'of',
    'return',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'type',
    'typeof',
    'undefined',
    'var',
    'void',
    'while',
  ]);

  const TS_TYPES = new Set([
    'Action',
    'Math',
    'Output',
    'Props',
    'Rendering',
    'State',
    'Workflow',
    'number',
    'string',
    'void',
  ]);

  function escapeHtml(value) {
    return value.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  }

  function highlight(code) {
    const raw = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

    let out = '';
    let i = 0;

    while (i < raw.length) {
      const current = raw[i];
      const two = raw.slice(i, i + 2);

      if (two === '//') {
        const nextLine = raw.indexOf('\n', i);
        const end = nextLine === -1 ? raw.length : nextLine;
        out += `<span class="tok-c">${escapeHtml(raw.slice(i, end))}</span>`;
        i = end;
        continue;
      }

      if (two === '/*') {
        const end = raw.indexOf('*/', i + 2);
        const stop = end === -1 ? raw.length : end + 2;
        out += `<span class="tok-c">${escapeHtml(raw.slice(i, stop))}</span>`;
        i = stop;
        continue;
      }

      if (current === '"' || current === "'" || current === '`') {
        const quote = current;
        let j = i + 1;
        while (j < raw.length && raw[j] !== quote) {
          j += raw[j] === '\\' && j + 1 < raw.length ? 2 : 1;
        }
        j = Math.min(j + 1, raw.length);
        out += `<span class="tok-s">${escapeHtml(raw.slice(i, j))}</span>`;
        i = j;
        continue;
      }

      if (/[A-Za-z_$]/.test(current)) {
        let j = i + 1;
        while (j < raw.length && /[A-Za-z0-9_$]/.test(raw[j])) j++;
        const word = raw.slice(i, j);
        let k = j;
        while (k < raw.length && raw[k] === ' ') k++;

        let cls = null;
        if (TS_KEYWORDS.has(word)) cls = 'tok-k';
        else if (TS_TYPES.has(word) || /^[A-Z]/.test(word)) cls = 'tok-t';
        else if (raw[k] === '(') cls = 'tok-f';

        out += cls
          ? `<span class="${cls}">${escapeHtml(word)}</span>`
          : `<span class="tok-n">${escapeHtml(word)}</span>`;
        i = j;
        continue;
      }

      if (/[0-9]/.test(current)) {
        let j = i + 1;
        while (j < raw.length && /[0-9.]/.test(raw[j])) j++;
        out += `<span class="tok-t">${escapeHtml(raw.slice(i, j))}</span>`;
        i = j;
        continue;
      }

      if (/[{}()[\];,.:<>?!|&=+\-*/]/.test(current)) {
        out += `<span class="tok-p">${escapeHtml(current)}</span>`;
        i++;
        continue;
      }

      out += escapeHtml(current);
      i++;
    }

    return out;
  }

  qsa('.panel__code code').forEach((el) => {
    el.innerHTML = highlight(el.innerHTML);
  });

  // -----------------------------------------------------------------------
  // Demo 01: counter workflow
  // -----------------------------------------------------------------------
  let counterState = { count: 0 };

  function counterRendering() {
    if (counterState.count === 0) return 'atZero';
    if (counterState.count === MAX_COUNTER) return 'atMax';
    return 'counting';
  }

  function renderCounter() {
    const rendering = counterRendering();
    setText('#counter-value', String(counterState.count));
    setText('#counter-state', `count: ${counterState.count}`);
    setText('#counter-rendering', rendering);
    setButtonDisabled('[data-counter-action="decrement"]', counterState.count === 0);
    setButtonDisabled('[data-counter-action="increment"]', counterState.count === MAX_COUNTER);
    setButtonDisabled('[data-counter-action="reset"]', counterState.count === 0);
  }

  function sendCounterAction(type) {
    const previous = counterState.count;

    if (type === 'increment') {
      counterState = { count: Math.min(counterState.count + 1, MAX_COUNTER) };
    } else if (type === 'decrement') {
      counterState = { count: Math.max(counterState.count - 1, 0) };
    } else {
      counterState = { count: 0 };
    }

    const moved = `${previous} -> ${counterState.count}`;
    pushLog('#counter-log', `action: ${type}; state ${moved}`, 'action');

    if (type === 'increment' && counterState.count === MAX_COUNTER && previous !== MAX_COUNTER) {
      setText('#counter-output', "output: { type: 'reachedMax', value: 10 }");
      pushLog('#counter-log', 'output emitted: reachedMax(10)', 'output');
    } else if (type === 'decrement' && counterState.count === 0 && previous !== 0) {
      setText('#counter-output', "output: { type: 'reachedZero' }");
      pushLog('#counter-log', 'output emitted: reachedZero', 'output');
    } else {
      setText('#counter-output', 'No output for this transition');
    }

    renderCounter();
  }

  qsa('[data-counter-action]').forEach((button) => {
    button.addEventListener('click', () => sendCounterAction(button.dataset.counterAction));
  });

  qsa('[data-counter-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.counterTab;
      qsa('[data-counter-tab]').forEach((t) => {
        t.classList.toggle('is-active', t.dataset.counterTab === target);
        t.setAttribute('aria-selected', t.dataset.counterTab === target ? 'true' : 'false');
      });
      qsa('[data-counter-panel]').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.counterPanel === target);
      });
    });
  });

  pushLog('#counter-log', 'initialState() -> { count: 0 }', 'state');
  renderCounter();

  // -----------------------------------------------------------------------
  // Demo 02: parent/child composition
  // -----------------------------------------------------------------------
  const MAX_CHILD = 5;

  let compositionState = {
    childCount: 0,
    parentStep: 'editingCart',
  };

  function renderComposition() {
    setText('#child-count', String(compositionState.childCount));
    setText('#parent-state', `state: ${compositionState.parentStep}`);
    setButtonDisabled('[data-compose-action="decrement"]', compositionState.childCount === 0);
    setButtonDisabled(
      '[data-compose-action="increment"]',
      compositionState.childCount === MAX_CHILD,
    );

    const parentCard = qs('.workflow-card--parent');
    if (parentCard) {
      parentCard.classList.toggle('is-triggered', compositionState.parentStep === 'bulkSelected');
    }
  }

  function mapChildOutput(output) {
    if (output.type === 'reachedMax') {
      compositionState = { ...compositionState, parentStep: 'bulkSelected' };
      pushLog(
        '#composition-log',
        "output: reachedMax → parent banner: 'Bulk quantity selected'",
        'output',
      );
    } else {
      compositionState = { ...compositionState, parentStep: 'editingCart' };
      pushLog(
        '#composition-log',
        "output: reachedZero → parent banner: 'Quantity reset to zero'",
        'output',
      );
    }
  }

  function sendCompositionAction(type) {
    const previous = compositionState.childCount;

    if (type === 'increment') {
      compositionState = {
        ...compositionState,
        childCount: Math.min(compositionState.childCount + 1, MAX_CHILD),
      };
    } else if (type === 'decrement') {
      compositionState = {
        ...compositionState,
        childCount: Math.max(compositionState.childCount - 1, 0),
      };
    } else {
      compositionState = { ...compositionState, childCount: 0, parentStep: 'editingCart' };
    }

    pushLog(
      '#composition-log',
      `child action: ${type}; child state ${previous} -> ${compositionState.childCount}`,
      'action',
    );

    if (type === 'reset' && previous !== 0) {
      pushLog('#composition-log', "reset → parent state back to 'editingCart'", 'output');
    } else if (
      type === 'increment' &&
      compositionState.childCount === MAX_CHILD &&
      previous !== MAX_CHILD
    ) {
      mapChildOutput({ type: 'reachedMax', value: MAX_CHILD });
    } else if (type === 'decrement' && compositionState.childCount === 0 && previous !== 0) {
      mapChildOutput({ type: 'reachedZero' });
    }

    renderComposition();
  }

  qsa('[data-compose-action]').forEach((button) => {
    button.addEventListener('click', () => sendCompositionAction(button.dataset.composeAction));
  });

  qsa('[data-compose-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.composeTab;
      qsa('[data-compose-tab]').forEach((t) => {
        t.classList.toggle('is-active', t.dataset.composeTab === target);
        t.setAttribute('aria-selected', t.dataset.composeTab === target ? 'true' : 'false');
      });
      qsa('[data-compose-panel]').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.composePanel === target);
      });
    });
  });

  pushLog('#composition-log', "parent renderChild(..., 'quantity') mounted child", 'state');
  renderComposition();

  // -----------------------------------------------------------------------
  // Demo 03: worker lifecycle across states
  // -----------------------------------------------------------------------
  let workerState = 'idle';
  let workerRun = null;
  let workerPath = 'keep';
  let workerMessage = 'No request has run yet.';

  function workerCodeForPath() {
    const nextState = workerPath === 'keep' ? 'processing' : 'review';
    const nextCase =
      workerPath === 'keep'
        ? `case 'processing':
        runLoad(); // same key: worker continues
        return { type: 'processing' };`
        : `case 'review':
        // no runWorker(..., 'load'): worker cancels
        return { type: 'review' };`;

    return `type State =
  | { type: 'loading' }
  | { type: '${nextState}' }
  | { type: 'loaded' };

const loadWorker = createWorker('load', (signal) =&gt; {
  return new Promise&lt;void&gt;((resolve, reject) =&gt; {
    const id = setTimeout(resolve, 2000);
    signal.addEventListener('abort', () =&gt; {
      clearTimeout(id);
      reject(signal.reason);
    });
  });
});

const loadWorkflow = {
  initialState: () =&gt; ({ type: 'loading' }),
  render: (_props, state, ctx) =&gt; {
    const onLoadComplete = () =&gt; () =&gt; ({
      state: { type: 'loaded' },
    });
    const runLoad = () =&gt;
      ctx.runWorker(loadWorker, 'load', onLoadComplete);

    switch (state.type) {
      case 'loading':
        runLoad();
        return {
          type: 'loading',
          next: () =&gt; ctx.actionSink.send(() =&gt; ({ state: { type: '${nextState}' } })),
        };

      ${nextCase}

      case 'loaded':
        return { type: 'loaded' };
    }
  },
};`;
  }

  function updateWorkerCode() {
    const codeEl = qs('#worker-code-block');
    if (codeEl) {
      codeEl.innerHTML = highlight(workerCodeForPath());
    }

    const label = qs('#worker-code-panel .panel__pkg');
    if (label) {
      label.textContent =
        workerPath === 'keep' ? 'same key declared in next state' : 'key omitted in next state';
    }
  }

  function workerRendering() {
    if (workerState === 'idle') return 'idle';
    return workerState;
  }

  function renderWorker() {
    const progress = workerRun ? workerRun.progress : 0;
    const ring = qs('#worker-ring');
    const startBtn = qs('#worker-start-btn');
    const transitionBtn = qs('#worker-process-btn');
    const resetBtn = qs('#worker-leave-btn');

    setText('#worker-state-label', workerState);
    setText(
      '#worker-status',
      workerRun
        ? `Worker key 'load' running - ${progress}%`
        : workerState === 'idle'
          ? 'Press Start load to render loading and run the worker.'
          : workerMessage,
    );
    setText(
      '#worker-key',
      workerState === 'loading' || workerState === 'processing' ? 'load declared' : 'load absent',
    );
    setText('#worker-rendering', workerRendering());

    const bar = qs('#worker-progress-bar');
    if (bar) bar.style.width = workerRun ? `${progress}%` : '0%';

    if (ring) {
      ring.classList.toggle('is-running', Boolean(workerRun));
      ring.classList.toggle('is-cancelled', workerState === 'review');
    }

    if (startBtn) {
      startBtn.disabled = Boolean(workerRun);
      startBtn.querySelector('.btn__label').textContent =
        workerState === 'idle' ? 'Start load' : 'Start over';
    }

    if (transitionBtn) {
      transitionBtn.disabled = workerState !== 'loading' || !workerRun;
      transitionBtn.textContent = workerPath === 'keep' ? 'Move to processing' : 'Move to review';
    }

    if (resetBtn) {
      resetBtn.disabled = workerState === 'idle' && !workerRun;
    }

    qsa('[data-worker-path]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.workerPath === workerPath);
    });
  }

  function stopWorker(reason) {
    if (!workerRun) return;
    window.clearInterval(workerRun.timer);
    workerRun = null;
    pushLog('#worker-log', `${reason} - abort load`, 'cancel');
  }

  function startLoad() {
    stopWorker('restart');

    workerState = 'loading';
    workerMessage = 'Loading data...';
    pushLog('#worker-log', 'action: load; state -> loading', 'action');
    pushLog('#worker-log', "render loading -> runWorker(loadWorker, 'load')", 'worker');
    workerRun = { progress: 0, timer: null };
    renderWorker();

    workerRun.timer = window.setInterval(() => {
      if (!workerRun) return;
      workerRun.progress = Math.min(workerRun.progress + 5, 100);
      renderWorker();

      if (workerRun.progress >= 100) {
        window.clearInterval(workerRun.timer);
        workerRun = null;
        workerState = 'loaded';
        workerMessage = 'Worker completed and transitioned to loaded.';
        pushLog('#worker-log', 'worker output -> state: loaded', 'output');

        renderWorker();
      }
    }, 100);
  }

  qs('#worker-start-btn').addEventListener('click', startLoad);

  qs('#worker-process-btn').addEventListener('click', () => {
    if (!workerRun || workerState !== 'loading') return;

    if (workerPath === 'keep') {
      workerState = 'processing';
      workerMessage = "Processing declares runWorker(..., 'load'), so the worker continues.";
      pushLog('#worker-log', 'action: keepWorker; state -> processing', 'action');
      pushLog('#worker-log', "render processing -> same key 'load'; worker continues", 'worker');
    } else {
      stopWorker("render review omits key 'load'");
      workerState = 'review';
      workerMessage =
        "Review does not declare runWorker(..., 'load'), so the worker was cancelled.";
      pushLog('#worker-log', 'action: cancelWorker; state -> review', 'action');
    }

    renderWorker();
  });

  qs('#worker-leave-btn').addEventListener('click', () => {
    stopWorker('reset');
    workerState = 'idle';
    workerMessage = 'No request has run yet.';
    pushLog('#worker-log', 'reset -> idle', 'state');
    renderWorker();
  });

  qsa('[data-worker-path]').forEach((button) => {
    button.addEventListener('click', () => {
      workerPath = button.dataset.workerPath;
      pushLog(
        '#worker-log',
        workerPath === 'keep'
          ? "next transition will declare key 'load'"
          : "next transition will omit key 'load'",
        'state',
      );
      updateWorkerCode();
      renderWorker();
    });
  });

  qsa('[data-worker-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.workerTab;
      qsa('[data-worker-tab]').forEach((t) => {
        t.classList.toggle('is-active', t.dataset.workerTab === target);
        t.setAttribute('aria-selected', t.dataset.workerTab === target ? 'true' : 'false');
      });
      qsa('[data-worker-panel]').forEach((p) => {
        p.classList.toggle('is-active', p.dataset.workerPanel === target);
      });
    });
  });

  updateWorkerCode();
  renderWorker();
})();
