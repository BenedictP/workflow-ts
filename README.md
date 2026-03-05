# workflow-ts

A TypeScript implementation of Square's [Workflow architecture](https://developer.squareup.com/blog/workflow-compose/) for building state-machine-driven applications.

> **Why Workflow?** Complex UIs have complex state. Workflow makes that state explicit, testable, and composable. Instead of scattered `useState` calls and imperative logic, you define clear state machines with declarative rendering.

## Packages

| Package                                  | Description                          |
| ---------------------------------------- | ------------------------------------ |
| [`@workflow-ts/core`](./packages/core)   | Core workflow runtime and types      |
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
type Rendering =
  | { type: 'idle'; load: () => void }
  | { type: 'loading' }
  | { type: 'loaded'; data: string }
  | { type: 'error'; message: string; retry: () => void };

// 3. Define events to parent (optional)
type Output = never; // no parent outputs in this example

// 4. Implement the workflow
const dataWorkflow: Workflow<void, State, Output, Rendering> = {
  initialState: () => ({ type: 'idle' }),

  render: (_props, state, ctx) => {
    switch (state.type) {
      case 'idle':
        return {
          type: 'idle',
          load: () => {
            ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
            // Worker handles async (see Workers section)
          },
        };
      case 'loading':
        return { type: 'loading' };
      case 'loaded':
        return { type: 'loaded', data: state.data };
      case 'error':
        return {
          type: 'error',
          message: state.message,
          retry: () => {
            ctx.actionSink.send(() => ({ state: { type: 'idle' } }));
          },
        };
    }
  },
};
```

### Use with React

```tsx
import { useWorkflow } from '@workflow-ts/react';

function DataScreen() {
  const rendering = useWorkflow(dataWorkflow, undefined);
  return <DataRenderer rendering={rendering} />;
}

function DataRenderer({ rendering }: { rendering: Rendering }) {
  switch (rendering.type) {
    case 'idle':
      return <button onClick={rendering.load}>Load Data</button>;
    case 'loading':
      return <Spinner />;
    case 'error':
      return <Error message={rendering.message} onRetry={rendering.retry} />;
    case 'loaded':
      return <DataDisplay data={rendering.data} />;
  }
}
```

Preferred architecture is subscribe to a workflow rendering, then map rendering data to React components.
With React Compiler enabled, manual `React.memo` is usually unnecessary.
React hooks expose a TypeScript plain-only props contract and validate unsupported values only in development environments (for example React Native `__DEV__`, `NODE_ENV !== 'production'`, or bundler dev flags).

### Test Without UI

```typescript
import { createRuntime } from '@workflow-ts/core';

test('loads data successfully', () => {
  const runtime = createRuntime(dataWorkflow, undefined);

  const initial = runtime.getRendering();
  expect(initial.type).toBe('idle');

  // Simulate user action
  if (initial.type === 'idle') {
    initial.load();
  }
  expect(runtime.getRendering().type).toBe('loading');

  // Simulate async completion (or use real workers in tests)
  runtime.send(() => ({ state: { type: 'loaded', data: 'test' } }));
  expect(runtime.getRendering().type).toBe('loaded');

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

## Documentation

- [Core API Reference](./packages/core/README.md)
- [React Integration](./packages/react/README.md)
- [Large Root Workflow Pattern](./docs/guides/large-root-workflow.md)

## Comparison

| Feature                 | workflow-ts | Redux           | XState        | Zustand     |
| ----------------------- | ----------- | --------------- | ------------- | ----------- |
| State machine explicit  | ✅          | ❌              | ✅            | ❌          |
| Zero boilerplate        | ⚠️          | ⚠️              | ⚠️            | ✅          |
| Async built-in          | ✅          | ⚠️              | ✅            | ⚠️          |
| Framework agnostic      | ✅          | ✅              | ✅            | ✅          |
| First-class composition | ✅          | ⚠️              | ✅            | ⚠️          |
| TypeScript native       | ✅          | ⚠️              | ✅            | ✅          |

Legend: ✅ first-class, ⚠️ supported with patterns/add-ons, ❌ not a core model.

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
