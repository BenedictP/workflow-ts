# workflow-ts

A TypeScript implementation of Square's [Workflow architecture](https://developer.squareup.com/blog/workflow-compose/) for building state-machine-driven applications.

> **Why Workflow?** Complex UIs have complex state. Workflow makes that state explicit, testable, and composable. Instead of scattered `useState` calls and imperative logic, you define clear state machines with declarative rendering.

## Packages

| Package | Description |
|---------|-------------|
| [`@workflow-ts/core`](./packages/core) | Core workflow runtime and types |
| [`@workflow-ts/react`](./packages/react) | React hooks for workflow integration |

## Features

- 🎯 **State Machine First** - Model your domain as explicit states, not scattered booleans
- 🔄 **Unidirectional Data Flow** - State changes through actions only, making debugging trivial
- 🧩 **Composable** - Nested workflows compose naturally as parent-child trees
- 🧪 **Testable** - Test complex flows without UI, mock time, simulate user actions
- ⚛️ **Framework Agnostic** - Core works anywhere; React bindings included
- 📦 **Zero Dependencies** - Core has no runtime dependencies

## Quick Start

### Install

```bash
pnpm add @workflow-ts/core
# For React:
pnpm add @workflow-ts/react
```

### Define a Workflow

```typescript
import { type Workflow } from '@workflow-ts/core';

// 1. Define your state (explicit state machine)
type State =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'loaded'; data: string }
  | { type: 'error'; message: string };

// 2. Define what users see (rendering is just data + callbacks)
interface Rendering {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  data?: string;
  error?: string;
  load: () => void;
  retry: () => void;
}

// 3. Define events to parent (optional)
type Output = { type: 'loaded'; data: string };

// 4. Implement the workflow
const dataWorkflow: Workflow<void, State, Output, Rendering> = {
  initialState: () => ({ type: 'idle' }),
  
  render: (_props, state, ctx) => ({
    status: state.type,
    data: state.type === 'loaded' ? state.data : undefined,
    error: state.type === 'error' ? state.message : undefined,
    
    load: () => {
      ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
      // Worker handles async (see Workers section)
    },
    
    retry: () => {
      ctx.actionSink.send(() => ({ state: { type: 'idle' } }));
    },
  }),
};
```

### Use with React

```tsx
import { useWorkflow } from '@workflow-ts/react';

function DataComponent() {
  const { status, data, error, load, retry } = useWorkflow(dataWorkflow, undefined);
  
  if (status === 'loading') return <Spinner />;
  if (status === 'error') return <Error message={error} onRetry={retry} />;
  if (status === 'loaded') return <DataDisplay data={data} />;
  
  return <button onClick={load}>Load Data</button>;
}
```

### Test Without UI

```typescript
import { createRuntime } from '@workflow-ts/core';

test('loads data successfully', async () => {
  const runtime = createRuntime(dataWorkflow, undefined);
  
  expect(runtime.getRendering().status).toBe('idle');
  
  // Simulate user action
  runtime.getRendering().load();
  expect(runtime.getRendering().status).toBe('loading');
  
  // Simulate async completion (or use real workers in tests)
  runtime.send(() => ({ state: { type: 'loaded', data: 'test' } }));
  expect(runtime.getRendering().status).toBe('loaded');
  
  runtime.dispose();
});
```

## Core Concepts

### State

State is internal and immutable. Each state is a distinct node in your state machine:

```typescript
type State =
  | { type: 'editing'; draft: string }
  | { type: 'saving'; draft: string }
  | { type: 'saved'; publishedAt: Date };
```

### Actions

Actions are pure functions that transform state:

```typescript
ctx.actionSink.send((state) => ({
  state: { type: 'saving', draft: state.draft },
  output: { type: 'saveStarted' }, // optional event to parent
}));
```

### Rendering

Rendering is the external view - data + callbacks. No UI framework specifics:

```typescript
render: (props, state, ctx) => ({
  title: state.draft,
  isSaving: state.type === 'saving',
  onSave: () => ctx.actionSink.send(/* ... */),
}),
```

### Workers

Workers handle async operations with automatic lifecycle management:

```typescript
import { createWorker } from '@workflow-ts/core';

const saveWorker = createWorker('save', async (signal) => {
  const response = await fetch('/api/save', { signal });
  return response.json();
});

// In render:
ctx.runWorker(saveWorker, 'save-key', (result) => (state) => ({
  state: { type: 'saved', publishedAt: result.timestamp },
}));
```

Workers start when called in render, stop when not called. This makes cleanup automatic.

### Composition

Workflows compose as trees. Parent workflows render children:

```typescript
render: (props, state, ctx) => ({
  // Render child workflow
  child: ctx.renderChild(childWorkflow, childProps, 'child-key', (childOutput) => (state) => ({
    state: handleChildOutput(state, childOutput),
  })),
}),
```

## Examples

See the [`examples/`](./examples) directory:

- **Counter** - Basic state and actions
- **Todo List** - List management with workers
- **Login Flow** - Multi-step state machine with validation
- **Nested Workflows** - Parent-child composition

## Documentation

- Docs site: https://aicodehelper.github.io/workflow-ts/
- [Core API Reference](./packages/core/README.md)
- [React Integration](./packages/react/README.md)
- [Guides](./docs/index.md)

## Comparison

| Feature | workflow-ts | Redux | XState | TCA (Swift) |
|---------|-------------|-------|--------|-------------|
| State machine explicit | ✅ | ❌ | ✅ | ✅ |
| Zero boilerplate | ✅ | ❌ | ⚠️ | ✅ |
| Async built-in | ✅ | ❌ (middleware) | ⚠️ (services) | ✅ |
| Framework agnostic | ✅ | ✅ | ✅ | ❌ |
| First-class composition | ✅ | ⚠️ | ⚠️ | ✅ |
| TypeScript native | ✅ | ⚠️ | ✅ | ❌ |

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages
pnpm build

# Type check
pnpm typecheck

# Run all checks
pnpm ci
```

## Acknowledgments

Inspired by Square's [Workflow library](https://github.com/square/workflow-kotlin) and [Point-Free's TCA](https://github.com/pointfreeco/swift-composable-architecture).

## License

MIT
