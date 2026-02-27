# @workflow-ts/core

Core runtime for workflow-ts - a TypeScript state machine architecture.

## Installation

```bash
pnpm add @workflow-ts/core
```

## API Reference

### `Workflow<P, S, O, R>`

The main interface for defining a workflow.

```typescript
interface Workflow<P, S, O, R> {
  // Create initial state from props
  initialState: (props: P, snapshot?: string) => S;
  
  // Render current state into a rendering
  render: (props: P, state: S, context: RenderContext<S, O>) => R;
  
  // Optional: serialize state for persistence
  snapshot?: (state: S) => string;
  
  // Optional: restore state from snapshot
  restore?: (snapshot: string) => S;
}
```

**Type Parameters:**
- `P` - Props (input from parent)
- `S` - State (internal state machine)
- `O` - Output (events to parent, or `never` if none)
- `R` - Rendering (external representation)

### `createRuntime(workflow, props, config?)`

Create a runtime to execute a workflow.

```typescript
import { createRuntime } from '@workflow-ts/core';

// Simple usage
const runtime = createRuntime(workflow, props);

// With output handler
const runtime = createRuntime(workflow, props, {
  onOutput: (output) => console.log('Output:', output)
});

// With full config (snapshot restoration)
const runtime = createRuntime(workflow, props, {
  onOutput: (output) => console.log('Output:', output),
  initialState: { count: 5 },
  snapshot: savedSnapshot,  // previously saved via runtime.snapshot()
});

// Enable debug logging
const runtime = createRuntime(workflow, props, {
  debug: true  // logs to console with [workflow-ts] prefix
});

// Or use custom logger
const runtime = createRuntime(workflow, props, {
  debug: (level, message, data) => {
    console.log(`[${level}]`, message, data);
  }
});

// Legacy: still supports callback as third argument (backwards compatible)
const runtime = createRuntime(workflow, props, (output) => {
  console.log('Output:', output);
});
```

**Parameters:**
- `workflow` - Workflow definition
- `props` - Initial props
- `config?` - Optional configuration object or output callback:
  - `onOutput?: (output: O) => void` - Callback for workflow outputs
  - `initialState?: S` - Initial state (for testing)
  - `snapshot?: string` - Restore state from serialized snapshot
  - `debug?: boolean | DebugLogger` - Enable debug logging
```

```typescript
// Get current rendering
const rendering = runtime.getRendering();

// Subscribe to changes
const unsubscribe = runtime.subscribe((rendering) => {
  console.log('New rendering:', rendering);
});

// Clean up
runtime.dispose();
```

### `WorkflowRuntime<P, S, O, R>`

The runtime class returned by `createRuntime`.

**Methods:**

| Method | Description |
|--------|-------------|
| `getRendering()` | Get current rendering |
| `getState()` | Get current state (for debugging) |
| `getProps()` | Get current props |
| `subscribe(listener)` | Subscribe to rendering changes. Returns unsubscribe function. |
| `updateProps(props)` | Update props (triggers re-render) |
| `send(action)` | Send an action directly |
| `snapshot()` | Get serialized state string |
| `dispose()` | Clean up runtime and all children |
| `isDisposed()` | Check if disposed |

### `RenderContext<S, O>`

Passed to `render()` for side effects.

```typescript
interface RenderContext<S, O> {
  // Send an action to the runtime
  actionSink: Sink<Action<S, O>>;
  
  // Render a child workflow
  renderChild: <CP, CS, CO, CR>(
    workflow: Workflow<CP, CS, CO, CR>,
    props: CP,
    key?: string,
    handler?: (output: CO) => Action<S, O>
  ) => CR;
  
  // Run a worker (async operation)
  runWorker: <W>(
    worker: Worker<W>,
    key: string,
    handler: (output: W) => Action<S, O>
  ) => void;
}
```

### Action Types

**`Action<S, O>`**

A pure function that transforms state:

```typescript
type Action<S, O = never> = (state: S) => ActionResult<S, O>;

interface ActionResult<S, O> {
  state: S;           // New state (required)
  output?: O;         // Event to parent (optional)
}
```

**Action Helpers:**

```typescript
import { action, emit, noChange, compose, named } from '@workflow-ts/core';

// Simple state update
const increment = action<{ count: number }>((s) => ({ count: s.count + 1 }));

// State update with output
const save = action<State, Output>((s) => s, { type: 'saved' });

// Only emit output (no state change)
const notify = emit({ type: 'done' });

// No-op action
const noop = noChange<State>();

// Compose actions
const resetAndNotify = compose(
  (s) => ({ ...s, count: 0 }),
  emit({ type: 'reset' })
);

// Named action (for debugging)
const namedIncrement = named('increment', increment);
```

### Worker Types

**`Worker<T>`**

An async operation that produces output.

```typescript
interface Worker<T> {
  key: string;
  run: (signal: AbortSignal) => Promise<T>;
}
```

**Worker Factories:**

```typescript
import { createWorker, fromPromise, fetchWorker, debounceWorker } from '@workflow-ts/core';

// From async function
const loadUser = createWorker('load-user', async (signal) => {
  const res = await fetch('/api/user', { signal });
  return res.json();
});

// From promise factory
const loadData = fromPromise('load-data', () => api.fetchData());

// Fetch JSON
const fetchTodos = fetchWorker<Todo[]>('fetch-todos', '/api/todos');

// Debounced worker
const debouncedSearch = debounceWorker('search', searchWorker, 300);
```

### Snapshot Utilities

```typescript
import { jsonSnapshot, versionedSnapshot } from '@workflow-ts/core';

// JSON serialization
const { snapshot, restore } = jsonSnapshot<{ count: number }>();

// Versioned snapshot (for migrations)
const { snapshot, restore } = versionedSnapshot<State>(
  1,  // version
  (state) => JSON.stringify(state),
  (json, version) => {
    if (version === 0) {
      // migrate from v0
    }
    return JSON.parse(json);
  }
);
```

## Example: HTTP Request Workflow

```typescript
import { 
  type Workflow, 
  createRuntime, 
  createWorker,
  action 
} from '@workflow-ts/core';

// State machine for HTTP request
type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; data: unknown }
  | { type: 'error'; error: string };

interface Rendering {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: unknown | null;
  error: string | null;
  fetch: () => void;
  reset: () => void;
}

// Worker for HTTP request
const fetchWorker = createWorker('fetch', async (signal) => {
  const res = await fetch('/api/data', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

const httpWorkflow: Workflow<string, State, never, Rendering> = {
  initialState: () => ({ type: 'idle' }),
  
  render: (url, state, ctx) => {
    // Run worker when loading
    if (state.type === 'loading') {
      ctx.runWorker(fetchWorker, 'fetch', (result) => () => ({
        state: { type: 'success', data: result },
      }));
    }
    
    return {
      status: state.type,
      data: state.type === 'success' ? state.data : null,
      error: state.type === 'error' ? state.error : null,
      
      fetch: () => {
        ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
      },
      
      reset: () => {
        ctx.actionSink.send(() => ({ state: { type: 'idle' } }));
      },
    };
  },
};
```

## License

MIT
