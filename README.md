# workflow-ts

[![Build Status](https://img.shields.io/github/actions/workflow/status/BenedictP/workflow-ts/ci.yml?branch=main&style=flat&colorA=000000&colorB=000000)](https://github.com/BenedictP/workflow-ts/actions?query=workflow%3ACI)
[![Core Bundle Size](https://img.shields.io/badge/core%20bundle%20size-4.68%20kB%20gzip-000000?style=flat&labelColor=000000)](https://bundlejs.com/?q=%40workflow-ts%2Fcore)
[![React Bundle Size](https://img.shields.io/badge/react%20bundle%20size-9%20kB%20gzip-000000?style=flat&labelColor=000000)](https://bundlejs.com/?q=%40workflow-ts%2Freact)
[![Core Version](https://img.shields.io/npm/v/%40workflow-ts%2Fcore?style=flat&label=%40workflow-ts%2Fcore&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@workflow-ts/core)
[![React Version](https://img.shields.io/npm/v/%40workflow-ts%2Freact?style=flat&label=%40workflow-ts%2Freact&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@workflow-ts/react)

TypeScript implementation of Square's [Workflow architecture](https://developer.squareup.com/blog/workflow-compose/) for explicit, testable, state-machine-driven application logic.

## Why workflow-ts

- Explicit state machines instead of scattered UI flags
- Unidirectional action flow for predictable transitions
- Composable parent-child workflows
- Async work with render-scoped lifecycle via workers
- UI-agnostic core runtime with React hooks in a separate package

### Further reading

- [Your UI Has States — Start Treating Them That Way](https://medium.com/@benedict.pregler/your-ui-has-states-start-treating-them-that-way-ade30be1e72e)
- [Zustand Gives You Freedom, workflow-ts Gives You Guardrails](https://medium.com/@benedict.pregler/zustand-gives-you-freedom-workflow-ts-gives-you-guardrails-6d4634b724aa)
- [Stop Writing State Machine Config, Start Writing Functions](https://medium.com/@benedict.pregler/stop-writing-state-machine-config-start-writing-functions-50254e3daa39)

## When to use it

Use workflow-ts when you want explicit, deterministic state transitions and a clear separation between business logic orchestration and UI rendering.

## Install

```bash
pnpm add @workflow-ts/core
# React bindings:
pnpm add @workflow-ts/react
```

## Quick Start: One Cohesive Example

This example models a small "load profile" flow and is reused in the concept snippets below.
Canonical runnable source: [`examples/readme-profile`](./examples/readme-profile).

### 0. High-Level Architecture

![workflow-ts architecture overview](./docs/WorkflowArchitecture-dark.png)

At a high level, `Props` enter a workflow runtime, and the runtime stores explicit `State`. Every state transition triggers a `render` call, and `render` must return a framework-agnostic `Rendering` (data + callbacks) for the current state. UI callbacks send `Actions` back into the runtime to transition state, `Workers` feed async results into the same action loop, and optional `Output` values bubble events to the parent workflow or hosting screen.

### 1. Define the workflow (`@workflow-ts/core`)

<!-- README_SNIPPET:workflow:start -->

```typescript
import { createWorker, type Worker, type Workflow } from '@workflow-ts/core';

// Props enter the workflow from the hosting screen.
export interface Props {
  userId: string;
}

// State is the internal state machine.
export type State =
  | { type: 'loading' }
  | { type: 'loaded'; name: string }
  | { type: 'error'; message: string };

// Output is emitted upward when the flow is done.
export interface Output {
  type: 'closed';
}

// Rendering is the UI contract returned from render().
export type Rendering =
  | { type: 'loading'; close: () => void }
  | { type: 'loaded'; name: string; reload: () => void; close: () => void }
  | { type: 'error'; message: string; retry: () => void; close: () => void };

// Worker results feed back into state transitions.
type LoadProfileResult = { ok: true; name: string } | { ok: false; message: string };

// Tests can inject custom workers through this provider.
export interface WorkersProvider {
  loadProfileWorker: Worker<LoadProfileResult>;
}

// Simulate an async profile fetch that also honors cancellation.
const createLoadProfileWorker = (): Worker<LoadProfileResult> => {
  return createWorker<LoadProfileResult>('load-profile', async (signal) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 5);
      signal.addEventListener(
        'abort',
        () => {
          // Abort clears the timer so the worker can finish immediately.
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

    if (signal.aborted) {
      return { ok: false, message: 'Cancelled' };
    }

    return { ok: true as const, name: 'Ada' };
  });
};

const defaultWorkersProvider: WorkersProvider = {
  loadProfileWorker: createLoadProfileWorker(),
};

// Allow worker injection so tests can control success and failure paths.
export const createProfileWorkflow = (
  workersProvider: WorkersProvider = defaultWorkersProvider,
): Workflow<Props, State, Output, Rendering> => ({
  initialState: () => ({ type: 'loading' }),

  render: (_props, state, ctx) => {
    switch (state.type) {
      case 'loading':
        // Start the load worker while this rendering is active.
        ctx.runWorker(workersProvider.loadProfileWorker, 'profile-load', (result) => () => ({
          state: result.ok
            ? { type: 'loaded', name: result.name }
            : { type: 'error', message: result.message },
        }));

        return {
          type: 'loading',
          close: () => {
            // Emit an output without changing the current state.
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
      case 'loaded':
        return {
          type: 'loaded',
          name: state.name,
          reload: () => {
            // UI events send actions back into the workflow.
            ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
          },
          close: () => {
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
      case 'error':
        return {
          type: 'error',
          message: state.message,
          retry: () => {
            // Retry by sending the state machine back to loading.
            ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
          },
          close: () => {
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
    }
  },
});

export const profileWorkflow = createProfileWorkflow();
```

<!-- README_SNIPPET:workflow:end -->

Deep dive: [Overview](./docs/guides/overview.md), [Workers](./docs/guides/workers.md)
Worker lifecycle notes include keyed side-effect semantics and one-shot analytics/idempotency patterns.
Render convention: keep `render` primarily as `switch (state.type)`. Use pre-switch code only for worker startup that must run in every state.

### 2. Subscribe in React (`@workflow-ts/react`)

<!-- README_SNIPPET:react:start -->

```tsx
import { useWorkflow } from '@workflow-ts/react';
import type { JSX } from 'react';

import { profileWorkflow } from './workflow';

export function ProfileScreen({ userId }: { userId: string }): JSX.Element {
  // Subscribe to the workflow and get the latest rendering for these props.
  const rendering = useWorkflow(profileWorkflow, { userId });

  // Each rendering case maps directly to the UI for that state.
  switch (rendering.type) {
    case 'loading':
      // The worker is still running, so only Close is available.
      return (
        <section>
          <h1>Profile</h1>
          <p>Loading...</p>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'loaded':
      // Loaded renderings expose both data and follow-up actions.
      return (
        <section>
          <h1>Welcome {rendering.name}</h1>
          <button onClick={rendering.reload}>Reload</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'error':
      // Error renderings carry a message plus a recovery action.
      return (
        <section>
          <h1>Profile</h1>
          <p>{rendering.message}</p>
          <button onClick={rendering.retry}>Retry</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    default:
      // Exhaustiveness check - this should never happen
      throw new Error(`Unknown rendering type: ${(rendering as { type: string }).type}`);
  }
}
```

<!-- README_SNIPPET:react:end -->

Deep dive: [React Integration](./docs/guides/react.md), [Next.js SSR & Hydration](./docs/guides/nextjs-ssr-hydration.md)

### 3. Test without UI

<!-- README_SNIPPET:test:start -->

```typescript
import { createRuntime } from '@workflow-ts/core';
import { expect, it } from 'vitest';

import { profileWorkflow } from '../src/workflow';

it('transitions loading -> loaded', () => {
  // Create a runtime so the workflow can be tested without mounting UI.
  const runtime = createRuntime(profileWorkflow, { userId: 'u1' });

  // The workflow should start in the loading state and rendering.
  expect(runtime.getRendering().type).toBe('loading');
  expect(runtime.getState().type).toBe('loading');

  // Drive the next transition the same way a UI callback would.
  runtime.send(() => ({ state: { type: 'loaded', name: 'Ada' } }));
  const loaded = runtime.getRendering();
  expect(loaded.type).toBe('loaded');
  expect((loaded as Extract<typeof loaded, { type: 'loaded' }>).name).toBe('Ada');

  // Dispose the runtime to clean up workers and subscriptions.
  runtime.dispose();
});
```

<!-- README_SNIPPET:test:end -->

Deep dive: [Testing](./docs/guides/testing.md)

## Core Concepts

These are concise mechanics. For complete walkthroughs, start at [Documentation Index](./docs/index.md).

### State

State is internal and immutable. Model each meaningful step explicitly:

```typescript
type State =
  | { type: 'loading' }
  | { type: 'loaded'; name: string }
  | { type: 'error'; message: string };
```

More: [Overview](./docs/guides/overview.md)

### Actions

Actions are pure reducers that return next state and optional output:

```typescript
ctx.actionSink.send((state) =>
  state.type === 'error' ? { state: { type: 'loading' } } : { state },
);
```

More: [Overview](./docs/guides/overview.md), [Composition](./docs/guides/composition.md)

### Rendering

Rendering is the framework-agnostic view model (data + callbacks):

```typescript
render: (_props, state, ctx) => {
  switch (state.type) {
    case 'loading':
      return { type: 'loading' };
    case 'loaded':
      return { type: 'loaded', name: state.name };
    case 'error':
      return { type: 'error', message: state.message };
  }
},
```

More: [Overview](./docs/guides/overview.md), [React Integration](./docs/guides/react.md)

### Workers

Workers run async tasks and are started/stopped by render calls:

```typescript
switch (state.type) {
  case 'loading':
    ctx.runWorker(loadProfileWorker, 'profile-load', (result) => () => ({
      state: result.ok
        ? { type: 'loaded', name: result.name }
        : { type: 'error', message: result.message },
    }));
    return { type: 'loading' };
  case 'loaded':
    return { type: 'loaded', name: state.name };
  case 'error':
    return { type: 'error', message: state.message };
}
```

In full workflows, keep rendering/state handling in a `switch (state.type)` and reserve pre-switch logic for unconditional worker startup only.

More: [Workers](./docs/guides/workers.md)

### Composition

Parents render children and map child outputs back into parent actions:

```typescript
const child = ctx.renderChild(childWorkflow, childProps, 'child-key', (output) => (state) => ({
  state,
  output,
}));
```

More: [Composition & Child Workflows](./docs/guides/composition.md)

### Snapshots

To persist state, call `snapshot(state)` and store the returned string.  
To restore state, pass that string back through `initialState(props, snapshot)` when creating the runtime:

```typescript
initialState: (_props, snapshot) => (snapshot ? JSON.parse(snapshot) : { count: 0 }),
snapshot: (state) => JSON.stringify(state),
```

More: [Snapshots](./docs/guides/snapshots.md)

### Persistence

You can also wire automatic persistence on every state transition:

```typescript
import { createPersistedRuntime, localStorageStorage } from '@workflow-ts/core';

const runtime = createPersistedRuntime(workflow, props, {
  storage: localStorageStorage(),
  key: 'profile:v1:u1',
  version: 2,
  rehydrate: 'lazy',
  serialize: (state) => JSON.stringify(state),
  deserialize: (raw, _props) => JSON.parse(raw),
});
```

More: [Persistence](./docs/guides/persistence.md)

## Documentation Map

Start here: [Documentation Index](./docs/index.md)

### Getting Started

- [Overview](./docs/guides/overview.md)
- [React Integration](./docs/guides/react.md)
- [Next.js SSR & Hydration](./docs/guides/nextjs-ssr-hydration.md)

### Workflow Mechanics

- [Composition & Child Workflows](./docs/guides/composition.md)
- [Workers](./docs/guides/workers.md)

### Reliability

- [Testing](./docs/guides/testing.md)
- [Snapshots](./docs/guides/snapshots.md)
- [Persistence](./docs/guides/persistence.md)

## Examples

See [examples/](./examples):

- [README Profile](./examples/readme-profile/README.md) - runnable source-of-truth for the Quick Start snippets
- [Counter](./examples/counter/README.md) - minimal state/action workflow

## Package References

- [@workflow-ts/core API](./packages/core/README.md)
- [@workflow-ts/react API](./packages/react/README.md)

## AI agent Skill

Install the workflow-ts skill with the `skills` CLI:

```bash
npx skills add BenedictP/workflow-ts
```

Then use the skill in prompts as `$workflow-ts-architecture`.

Docs: [Skills CLI](https://skills.sh/docs/cli), [FAQ](https://skills.sh/docs/faq), [Overview](https://skills.sh/docs)

## Development

```bash
pnpm install
pnpm test
pnpm build
pnpm typecheck
pnpm ci
```

## Acknowledgments

Inspired by Square's [Workflow library](https://github.com/square/workflow-kotlin) and Point-Free's [TCA](https://github.com/pointfreeco/swift-composable-architecture).

## License

MIT
