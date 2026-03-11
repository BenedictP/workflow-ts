# Workers

Workers encapsulate async side-effects and are started/stopped based on render calls.
Keep `render` primarily as `switch (state.type)` branches. Use pre-switch code only for worker startup that must run regardless of state.

```ts
type State = { type: 'loading' } | { type: 'loaded'; data: unknown };

const fetchWorker = createWorker('fetch', async (signal) => {
  const res = await fetch('/api/data', { signal });
  return res.json();
});

render: (_props, state, ctx) => {
  // Pre-switch work is only for workers that should run for all states.
  // ctx.runWorker(auditWorker, 'audit', () => (s) => ({ state: s }));

  switch (state.type) {
    case 'loading':
      ctx.runWorker(fetchWorker, 'fetch', (result) => () => ({
        state: { type: 'loaded', data: result },
      }));
      return { type: 'loading' };
    case 'loaded':
      return { type: 'loaded', data: state.data };
  }
};
```

## Keyed Side-Effect Semantics

`ctx.runWorker(worker, key, handler)` uses `key` as the worker identity for the current workflow runtime.

1. First call with a key starts a worker.
2. Calling again with the same key while it is still running does not restart it.
3. Calling with the same key after completion starts a fresh worker run.
4. If a key is not called in a render pass, that worker is cancelled at the end of the render cycle.
5. Disposing the runtime cancels all active workers.

## Execution environments (automatic)

Worker execution is environment-aware and does not require a runtime option:

- Browser-like environments (`window` + `document`): workers run.
- React Native (`navigator.product === 'ReactNative'`): workers run.
- Test runtimes (`NODE_ENV === 'test'`, or `globalThis.vi` / `globalThis.jest`): workers run.
- Server-like non-test runtimes (for example Next.js SSR in Node): workers are blocked.

### Function/Handler Changes with Same Key

If you call `runWorker` again with the same key while a worker is running:

- The running worker keeps going.
- The runtime updates the output/completion handlers.
- The worker itself is not restarted.

## Worker Lifecycle

### When Workers Are Cancelled

Workers are automatically cancelled in two scenarios:

1. **Not called in render** — At the end of each render cycle, any worker that wasn't invoked via `ctx.runWorker()` during that render is stopped via `AbortController.abort()`.

2. **Component unmounts** — When the runtime is disposed (e.g., React component unmounts), all active workers are stopped.

### When Workers Are Restarted

A worker is restarted when:

1. **Worker key is called again after completing** — If a worker finishes (produces output or errors), it's removed from active tracking. Calling it again starts a fresh worker instance.

2. **Different key** — Using a different key always starts a new worker; the old one is stopped.

### Key Behavior by Scenario

| Scenario                       | Worker Behavior                  |
| ------------------------------ | -------------------------------- |
| Same key, worker still running | Stays alive, handlers updated    |
| Same key, worker completed     | Starts fresh instance            |
| Different key                  | Old stopped, new started         |
| Not called in render           | Cancelled at end of render cycle |
| Component unmounts             | All workers cancelled            |

### Example: Worker Across State Transitions

```ts
type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'processing'; data?: Data }
  | { type: 'done'; data: Data };

render: (props, state, ctx) => {
  switch (state.type) {
    case 'idle':
      return { type: 'idle' };
    case 'loading':
      ctx.runWorker(dataWorker, 'data', (result) => (s) => ({
        state:
          s.type === 'processing' ? { ...s, data: result } : { type: 'processing', data: result },
      }));
      return { type: 'loading' };
    case 'processing':
      // Keep the same worker alive while the UI is in either loading phase.
      ctx.runWorker(dataWorker, 'data', (result) => (s) => ({
        state:
          s.type === 'processing' ? { ...s, data: result } : { type: 'processing', data: result },
      }));
      return { type: 'processing', data: state.data };
    case 'done':
      return { type: 'done', data: state.data };
  }
};
```

Timeline with this example:

- **`idle` -> `loading`**: key `data` is seen for the first time, so the worker starts.
- **`loading` -> `processing`**: `runWorker(..., 'data', ...)` is still called with the same key, so the existing run stays alive (no restart).
- **`processing` -> `done`**: `runWorker` is no longer called, so any still-running `data` worker is cancelled at end of render.
- **`done` -> `loading` (later retry)**: key `data` is called again after prior completion/cancellation, so a fresh run starts.

## Best Practices

- Model expected business failures as worker output data (for example `Result.Success` / `Result.Error`), then branch in the `runWorker` handler.
- Do not rely on thrown worker exceptions for domain state transitions; thrown errors are infrastructure failures and should be logged/observed.
- Inject worker factories/providers into workflows so tests can stub sequential outcomes (for example first `error`, then `success` on retry).
- Keep worker keys stable for the same logical effect; change keys only when you intentionally want a fresh run identity.
- Keep `render` centered on a `switch (state.type)` for clarity and exhaustiveness; use pre-switch code only for unconditional worker startup.
- Test worker behavior with deterministic completion/cancellation patterns, not timing-dependent sleeps.

```ts
type LoadResult = { type: 'success'; cards: Card[] } | { type: 'error'; message: string };

ctx.runWorker(loadCardsWorker, `loadCards_${state.isSandbox}`, (result) => () => ({
  state:
    result.type === 'success'
      ? { type: 'showCards', cards: result.cards, isSandbox: state.isSandbox }
      : { type: 'loadingError', isSandbox: state.isSandbox },
}));
```

For testing patterns (deferred completion, cancellation assertions, and Kotlin-style sequential worker stubs), see [Testing Workflows](./testing.md#testing-workers).

## Built-in Worker Utilities

### `fromPromise(key, factory)`

Creates a worker from a promise factory. The factory receives an optional `AbortSignal` for cooperative cancellation.

```ts
import { fromPromise } from '@workflow-ts/core';

const loadData = fromPromise('load-data', (signal) => api.getData({ signal }));
```

### `fetchWorker(key, url, options?)`

Creates a worker that fetches JSON from a URL. Throws on non-OK responses.

```ts
import { fetchWorker } from '@workflow-ts/core';

const fetchTodos = fetchWorker<Todo[]>('fetch-todos', '/api/todos');
```

### `debounceWorker(key, worker, delayMs)`

Wraps a worker with a delay before execution. If the worker is cancelled during the delay, the inner worker never runs.

```ts
import { createWorker, debounceWorker } from '@workflow-ts/core';

const searchWorker = createWorker('search-inner', async (signal) => search(query, { signal }));
const debouncedSearch = debounceWorker('search', searchWorker, 300);
```

## Notes

- Workers are keyed by the string key you provide, not by state.
- Reusing the same key keeps the worker alive across renders.
- Use `signal.aborted` in your worker for cooperative cancellation.
- Avoid calling `runWorker` outside render (will warn).
- Square's Kotlin `runningSideEffect` docs describe a lazy-start synchronous-render caveat. `workflow-ts` workers are started immediately when `runWorker` is invoked, so that caveat is not directly applicable here.
