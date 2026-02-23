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

## Notes

- Workers are keyed. Reusing the same key keeps the worker alive.
- Workers stop when they’re not invoked in render.
- Avoid calling `runWorker` outside render (will warn).
