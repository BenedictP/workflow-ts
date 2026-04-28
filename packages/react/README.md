# @workflow-ts/react

React hooks for workflow-ts.

## Installation

```bash
pnpm add @workflow-ts/react @workflow-ts/core
```

## Recommended Architecture

Use workflow-ts as a rendering subscription + mapping system:

1. Subscribe to workflow rendering with `useWorkflow`.
2. Map that rendering tree to React components.

```tsx
import { useWorkflow } from '@workflow-ts/react';

function AppScreen({ userId }: { userId: string }) {
  const rendering = useWorkflow(appWorkflow, { userId });
  return <AppRenderer rendering={rendering} />;
}
```

This keeps workflow logic inside workflows and keeps React focused on rendering.

## Performance

- Preferred setup: React Compiler enabled in the consuming app.
- With React Compiler, manual `React.memo` is usually unnecessary.
- Keep props/rendering references stable to minimize work.
- Keep workflow props small and immutable (prefer flat scalar values like ids/flags/strings).
- Avoid passing large nested object graphs as hook props; pass only minimal derived inputs.

## Props Contract

`useWorkflow` and `useWorkflowWithState` expose a TypeScript `AllowedProp` contract for hook props.
At runtime, unsupported values are validated and rejected only in development environments (React Native `__DEV__` or `NODE_ENV !== 'production'`).

Allowed values:

- primitives (`string`, `number`, `boolean`, `bigint`, `symbol`, `null`, `undefined`)
- functions
- arrays
- plain objects (`Object.prototype` or `null` prototype)
- `Date`, `Map`, `Set`
- `ArrayBuffer`, `DataView`, typed arrays

Rejected values:

- class instances
- branded built-ins outside the allowlist (`URL`, `Error`, `RegExp`, etc.)
- `Promise`, `WeakMap`, `WeakSet`

## Hooks

### `useWorkflow(workflow, props, onOutput?, options?)`

Subscribe to a workflow's rendering. Re-renders component when workflow state changes.

```tsx
import { useWorkflow } from '@workflow-ts/react';
import { type Workflow } from '@workflow-ts/core';

const counterWorkflow: Workflow<void, State, never, Rendering> = {
  // ... workflow definition
};

function Counter() {
  const { count, onIncrement, onDecrement } = useWorkflow(
    counterWorkflow,
    undefined, // props
  );

  return (
    <div>
      <span>{count}</span>
      <button onClick={onIncrement}>+</button>
      <button onClick={onDecrement}>-</button>
    </div>
  );
}
```

**Parameters:**

- `workflow` - The workflow definition
- `props` - Props to pass to the workflow (must satisfy the plain-only contract above)
- `onOutput?` - Optional callback for workflow outputs
- `options?` - Optional hook options

**Options:**

- `resetOnWorkflowChange?: boolean` - Recreate runtime when workflow identity changes (opt-in). Defaults to `false`. To hard-reset in React, consider using a component `key`.
- `outputHandlers?: { [K in O extends { type: string } ? O['type'] : never]?: (output: Extract<O, { type: K }>) => void }` - Typed per-output handlers for discriminated union outputs.
- Hooks are compatible with React StrictMode development replays.
- Disposed runtimes in `@workflow-ts/core` still throw when used (strict disposal contract).
- `lifecycle?: 'always-on' | 'pause-when-backgrounded'` - Runtime lifecycle mode. Defaults to `'always-on'`.
- `isActive?: boolean` - Active state used with `'pause-when-backgrounded'`. Defaults to `true`.
- In pause mode, explicit `isActive: true -> false` transitions dispose runtime immediately.

**Returns:** The current rendering (type `R` from workflow)

### `useWorkflowWithState(workflow, options)`

Like `useWorkflow`, but also exposes runtime controls.

```tsx
import { useWorkflowWithState } from '@workflow-ts/react';

function SearchComponent() {
  const { rendering, state, updateProps, snapshot } = useWorkflowWithState(searchWorkflow, {
    props: { query: '' },
    onOutput: (output) => console.log('Output:', output),
  });

  return (
    <div>
      <input value={state.query} onChange={(e) => updateProps({ query: e.target.value })} />
      <ul>
        {rendering.results.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

**Options:**

- `props: P` - Initial props (must satisfy the plain-only contract above)
- `onOutput?: (output: O) => void` - Output callback
- `outputHandlers?: { [K in O extends { type: string } ? O['type'] : never]?: (output: Extract<O, { type: K }>) => void }` - Typed per-output handlers for discriminated union outputs.
- `resetOnWorkflowChange?: boolean` - Recreate runtime when workflow identity changes (opt-in). Defaults to `false`.
- StrictMode development replay is supported without changing core runtime disposal semantics.
- `lifecycle?: 'always-on' | 'pause-when-backgrounded'` - Runtime lifecycle mode. Defaults to `'always-on'`.
- `isActive?: boolean` - Active state used with `'pause-when-backgrounded'`. Defaults to `true`.
- Inactive controls are safe: `updateProps` no-ops and `snapshot` returns last-known value (or `undefined`).

**Returns:**

- `rendering: R` - Current rendering
- `state: S` - Current state (for debugging)
- `props: P` - Current props
- `updateProps: (props: P) => void` - Update props
- `snapshot: () => string | undefined` - Get state snapshot

### `usePersistedWorkflow(workflow, options)`

Unified persisted hook that combines runtime controls and persistence phase state.

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
    writeDebounceMs: 250,
    serialize: (state) => JSON.stringify(state),
    deserialize: (raw, _props) => JSON.parse(raw),
  },
});
```

**Returns:**

- `rendering: R`
- `state: S`
- `props: P`
- `updateProps: (props: P) => void`
- `snapshot: () => string | undefined`
- `persistence: { phase: 'idle' | 'rehydrating' | 'ready' | 'error'; error?: unknown; isHydrated: boolean; lastRehydratedAt?: number; lastPersistedAt?: number }`

**Options:**

- `props: P` - Required workflow props
- `persist.storage: PersistStorage` - Sync or async storage adapter
- `persist.key: string | ((props: P) => string)` - Required deterministic key resolver
- `persist.version: number` - Required envelope/schema version
- `persist.serialize: (state: S) => string` - Required state serializer
- `persist.deserialize: (raw: string, props: P) => S` - Required state deserializer
- `persist.rehydrate?: 'none' | 'lazy'` - Defaults to `'lazy'`
- `persist.writeDebounceMs?: number` - Debounce writes in milliseconds
- `persist.migrate?: (raw, fromVersion, toVersion) => string` - Optional version migration
- `persist.onPersist?`, `persist.onRehydrate?`, `persist.onError?` - Optional persistence callbacks
- Standard runtime options are also supported: `lifecycle`, `isActive`, `outputHandlers`, `resetOnWorkflowChange`, `onOutput`

Behavior notes:

- Changing the resolved persist key recreates the runtime and isolates state per key.
- Storage reference changes alone do not recreate the runtime.
- Keep adapter instances stable (module scope or `useMemo`) for predictable storage backend usage.
- Keep `persist.serialize`, `persist.deserialize`, and `persist.migrate` function references stable (for example via `useCallback` or module scope). Changing codec identities does not recreate the runtime.
- In server-like environments, hooks use in-memory storage fallback automatically.
- Async storage in React hooks is lazy/non-blocking: runtime is created immediately, then persisted state is applied when storage resolves.

## Next.js and SSR hydration

`@workflow-ts/react` is compatible with Next.js SSR/hydration when the initial render is deterministic.

Rules:

1. Call `useWorkflow` and `useWorkflowWithState` only in Client Components (`'use client'`).
2. Ensure first render output is identical for server and client with the same props.
3. Avoid time/random/browser-only branches in initial workflow render paths.

Worker caveat:

- `ctx.runWorker(...)` starts workers from render logic.
- Worker execution is automatic by environment:
  - browser-like (`window` + `document`): allowed
  - React Native (`navigator.product === 'ReactNative'`): allowed
  - test runtimes (`NODE_ENV === 'test'`, `globalThis.vi`, or `globalThis.jest`): allowed
  - server-like non-test runtimes (for example Next.js SSR): blocked

Recommended App Router usage:

```tsx
// app/page.tsx (Server Component)
import { ScreenClient } from './ScreenClient';

export default async function Page() {
  const initial = await fetchInitialData();
  return <ScreenClient initial={initial} />;
}
```

```tsx
// app/ScreenClient.tsx (Client Component)
'use client';

import { useWorkflow } from '@workflow-ts/react';

export function ScreenClient({ initial }: { initial: InitialData }) {
  const rendering = useWorkflow(workflow, initial);
  return <Renderer rendering={rendering} />;
}
```

Anti-pattern (hydration mismatch risk):

```tsx
const workflow: Workflow<void, State, never, Rendering> = {
  initialState: () => ({ now: Date.now() }),
  render: (_props, state) => ({ label: String(state.now) }),
};
```

More details: [Next.js SSR & Hydration](../../docs/guides/nextjs-ssr-hydration.md).

## React Native lifecycle example

Use `AppState` to pause runtime activity while the app is backgrounded:

```tsx
import { AppState } from 'react-native';
import { useEffect, useState } from 'react';
import { useWorkflow } from '@workflow-ts/react';

function Screen() {
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const rendering = useWorkflow(workflow, props, undefined, {
    lifecycle: 'pause-when-backgrounded',
    isActive,
  });

  return <Content rendering={rendering} />;
}
```

## Example: Async Data Fetching

```tsx
import { useEffect } from 'react';
import { useWorkflow } from '@workflow-ts/react';
import { type Workflow, createWorker } from '@workflow-ts/core';

type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; users: User[] }
  | { type: 'error'; message: string };

interface Rendering {
  isLoading: boolean;
  users: User[];
  error: string | null;
  load: () => void;
}

const loadUsersWorker = createWorker('load-users', async (signal) => {
  const res = await fetch('/api/users', { signal });
  return res.json();
});

const usersWorkflow: Workflow<void, State, never, Rendering> = {
  initialState: () => ({ type: 'idle' }),

  render: (_props, state, ctx) => {
    if (state.type === 'loading') {
      ctx.runWorker(loadUsersWorker, 'load', (users) => () => ({
        state: { type: 'success', users },
      }));
    }

    return {
      isLoading: state.type === 'loading',
      users: state.type === 'success' ? state.users : [],
      error: state.type === 'error' ? state.message : null,
      load: () => ctx.actionSink.send(() => ({ state: { type: 'loading' } })),
    };
  },
};

function UserList() {
  const { isLoading, users, error, load } = useWorkflow(usersWorkflow, undefined);

  useEffect(() => {
    load();
  }, []);

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error} />;

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

## Example: Props-Driven Workflow

```tsx
import { useState } from 'react';
import { useWorkflow } from '@workflow-ts/react';
import { type Workflow } from '@workflow-ts/core';

// Workflow that derives state from props
const searchWorkflow: Workflow<{ query: string }, State, never, Rendering> = {
  initialState: (props) => ({ query: props.query, results: [] }),

  render: (props, state, ctx) => {
    // Update state when props change
    if (props.query !== state.query) {
      ctx.actionSink.send((s) => ({ state: { ...s, query: props.query } }));
    }

    return {
      query: state.query,
      results: state.results,
    };
  },
};

function Search() {
  const [input, setInput] = useState('');
  const { results } = useWorkflow(searchWorkflow, { query: input });

  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <ul>
        {results.map((r) => (
          <li key={r.id}>{r.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Testing Components

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { useWorkflow } from '@workflow-ts/react';

test('counter increments', () => {
  render(<Counter />);

  expect(screen.getByText('0')).toBeInTheDocument();

  fireEvent.click(screen.getByText('+'));

  expect(screen.getByText('1')).toBeInTheDocument();
});
```

## TypeScript Tips

### Extract Types

```typescript
// Define types separately for reuse
interface CounterState {
  count: number;
}

interface CounterRendering {
  count: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

type CounterOutput = { type: 'reachedZero' } | { type: 'reachedTen' };

const counterWorkflow: Workflow<void, CounterState, CounterOutput, CounterRendering> = {
  // ...
};

// Use in component
function Counter() {
  const rendering: CounterRendering = useWorkflow(counterWorkflow, undefined);
  // ...
}
```

### Generic Components

```tsx
interface WorkflowProps<P, R> {
  workflow: Workflow<P, any, any, R>;
  props: P;
}

function WorkflowComponent<P, R>({ workflow, props }: WorkflowProps<P, R>) {
  const rendering = useWorkflow(workflow, props);
  // ...
}
```

## License

MIT
