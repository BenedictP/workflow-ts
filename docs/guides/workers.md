# Workers

Workers encapsulate async side‑effects and are started/stopped based on render calls.

```ts
const fetchWorker = createWorker('fetch', async (signal) => {
  const res = await fetch('/api/data', { signal });
  return res.json();
});

render: (props, state, ctx) => {
  if (state.type === 'loading') {
    ctx.runWorker(fetchWorker, 'fetch', (result) => (s) => ({
      state: { ...s, data: result, type: 'loaded' },
    }));
  }
  return { /* rendering */ };
}
```

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

| Scenario | Worker Behavior |
|----------|-----------------|
| Same key, worker still running | Stays alive, handlers updated |
| Same key, worker completed | Starts fresh instance |
| Different key | Old stopped, new started |
| Not called in render | Cancelled at end of render cycle |
| Component unmounts | All workers cancelled |

### Example: Worker Across State Transitions

```ts
render: (props, state, ctx) => {
  // Worker called in both 'loading' and 'processing' states
  ctx.runWorker(dataWorker, 'data', (result) => (s) => ({
    state: { ...s, data: result },
  }));
  
  return { /* rendering */ };
}
```

- **Transition: idle → loading**: Worker starts
- **Transition: loading → processing**: If worker still running, it stays alive (no restart)
- **Transition: processing → done**: If worker completed, next call starts fresh

## Notes

- Workers are keyed by the string key you provide, not by state.
- Reusing the same key keeps the worker alive across renders.
- Use `signal.aborted` in your worker for cooperative cancellation.
- Avoid calling `runWorker` outside render (will warn).
