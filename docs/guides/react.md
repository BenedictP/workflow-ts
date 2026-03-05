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
- In development environments (React Native `__DEV__`, `NODE_ENV !== 'production'`, or bundler dev flags), unsupported values (class instances, `URL`, `Error`, `RegExp`, `Promise`, `WeakMap`, `WeakSet`, etc.) throw `TypeError`.
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
