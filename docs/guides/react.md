# React integration

`@workflow-ts/react` provides hooks that subscribe React to workflow renderings.

## Architecture: subscribe then map

The recommended pattern is:

1. Subscribe once with `useWorkflow(workflow, props)`.
2. Map the returned rendering tree to React components.

```tsx
function AppScreen({ userId }: { userId: string }) {
  const rendering = useWorkflow(appWorkflow, { userId });
  return <AppRenderer rendering={rendering} />;
}

type AppRendering =
  | { type: 'loading' }
  | { type: 'error'; message: string; retry: () => void }
  | {
      type: 'ready';
      header: { title: string };
      list: { items: readonly string[] };
    };

function AppRenderer({ rendering }: { rendering: AppRendering }) {
  switch (rendering.type) {
    case 'loading':
      return <p>Loading...</p>;
    case 'error':
      return <button onClick={rendering.retry}>{rendering.message}</button>;
    case 'ready':
      return (
        <>
          <h1>{rendering.header.title}</h1>
          <ul>
            {rendering.list.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      );
  }
}
```

This keeps workflow state orchestration inside the workflow and keeps React focused on rendering.

## Hooks

### `useWorkflow`

```tsx
const rendering = useWorkflow(workflow, props);
```

- Re-renders when workflow rendering changes.
- `props` are constrained by the `AllowedProp` TypeScript contract: primitives/functions/arrays/plain objects and `Date`/`Map`/`Set`/`ArrayBuffer`/typed-array views.
- In development environments (React Native `__DEV__` or `NODE_ENV !== 'production'`), unsupported values (class instances, `URL`, `Error`, `RegExp`, `Promise`, `WeakMap`, `WeakSet`, etc.) throw `TypeError`.
- Optional `options.resetOnWorkflowChange` recreates the runtime when workflow identity changes.
- Works with React StrictMode development replays.
- Runtime disposal remains strict in core: disposed runtimes still throw when used.
- Optional `options.lifecycle` can pause runtime work while an app is backgrounded.
- Optional `options.isActive` controls active/backgrounded state when using pause lifecycle.
- In pause lifecycle mode, explicit active->inactive transitions dispose runtime immediately.

### `useWorkflowWithState`

```tsx
const { rendering, state, props, updateProps, snapshot } = useWorkflowWithState(workflow, {
  props,
  onOutput,
  resetOnWorkflowChange: false,
});
```

This hook uses `useSyncExternalStore` internally for consistent snapshots.

For React Native backgrounding:

```tsx
const rendering = useWorkflow(workflow, props, undefined, {
  lifecycle: 'pause-when-backgrounded',
  isActive,
});
```

### `usePersistedWorkflow`

Use this hook when state should be automatically saved/restored via `@workflow-ts/core`
persistence.

```tsx
import { memoryStorage } from '@workflow-ts/core';
import { usePersistedWorkflow } from '@workflow-ts/react';

const storage = memoryStorage();

const workflowView = usePersistedWorkflow(workflow, {
  props,
  persist: {
    storage,
    key: ({ userId }) => `profile:v1:${userId}`,
    version: 2,
    rehydrate: 'lazy',
    serialize: (state) => JSON.stringify(state),
    deserialize: (raw, _props) => JSON.parse(raw),
  },
});
```

Key behaviors:

- `persist.key` is required and can be a string or props-based resolver.
- `persist.version` is required and controls migration boundaries.
- `persist.serialize` and `persist.deserialize` are required.
- Key changes recreate runtime so each key gets isolated persisted state.
- Storage reference changes alone do not recreate runtime.
- Keep adapter instances stable (module scope or `useMemo`) for predictable storage backend usage.
- Keep `persist.serialize`, `persist.deserialize`, and `persist.migrate` references stable (`useCallback` or module scope). Changing codec identities does not recreate runtime.
- React persisted hooks accept sync and async storage adapters.
- Async storage hydration is lazy/non-blocking in hooks (runtime first, persisted state later).
- Server-like environments automatically use in-memory storage fallback.

Returned shape:

- `rendering`
- `state`
- `props`
- `updateProps`
- `snapshot`
- `persistence: { phase, error?, isHydrated, lastRehydratedAt?, lastPersistedAt? }`

## Next.js and SSR hydration

`@workflow-ts/react` works with Next.js SSR, but hydration safety depends on deterministic workflow output.

Rules:

1. Use workflow hooks only in Client Components (`'use client'`).
2. Keep first render output deterministic for the same props (avoid `Date.now()`, `Math.random()`, browser-only branches).
3. Treat hydration warnings as correctness bugs and fix server/client render divergence.

Worker caveat:

- `ctx.runWorker(...)` starts workers from workflow render logic.
- Worker execution is automatic by environment (no hook option needed):
  1. browser-like (`window` + `document`): allowed
  2. React Native (`navigator.product === 'ReactNative'`): allowed
  3. test runtimes (`NODE_ENV === 'test'`, `globalThis.vi`, or `globalThis.jest`): allowed
  4. server-like non-test runtimes (for example Next.js SSR): blocked

For full patterns and troubleshooting, see [Next.js SSR & Hydration](./nextjs-ssr-hydration.md).

## Performance and React Compiler

- Preferred setup: React Compiler enabled in your app build.
- With compiler enabled, manual `React.memo` is usually unnecessary.
- Keep rendering identities stable in workflows to maximize compiler optimizations.
- Keep workflow props small and immutable (prefer flat scalar values like ids/flags/strings).
- Avoid passing large nested object graphs as hook props; derive and pass only the minimal inputs needed.

## Do and do not

- Do: model UI as rendering trees and map those renderings to components.
- Do: compose child workflows with `renderChild(...)` and pass child renderings down.
- Do not: treat workflow-ts like a selector-based global store by default.
- Do not: rely on calling `updateProps` with the same reference to force refreshes.

## Troubleshooting unnecessary re-renders

1. Verify props passed to `useWorkflow` only change when needed.
2. Verify child workflow props preserve identity when values did not change.
3. Verify your app is built with React Compiler if you expect compiler-driven memoization.
