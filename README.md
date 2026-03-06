# workflow-ts

TypeScript implementation of Square's [Workflow architecture](https://developer.squareup.com/blog/workflow-compose/) for explicit, testable, state-machine-driven application logic.

## Why workflow-ts

- Explicit state machines instead of scattered UI flags
- Unidirectional action flow for predictable transitions
- Composable parent-child workflows
- Async work with render-scoped lifecycle via workers
- UI-agnostic core runtime with React hooks in a separate package

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

### 1. Define the workflow (`@workflow-ts/core`)

<!-- README_SNIPPET:workflow:start -->
```typescript
import { createWorker, type Worker, type Workflow } from '@workflow-ts/core';

export interface Props {
  userId: string;
}

export type State =
  | { type: 'loading' }
  | { type: 'loaded'; name: string }
  | { type: 'error'; message: string };

export interface Output {
  type: 'closed';
}

export type Rendering =
  | { type: 'loading'; close: () => void }
  | { type: 'loaded'; name: string; reload: () => void; close: () => void }
  | { type: 'error'; message: string; retry: () => void; close: () => void };

type LoadProfileResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export interface WorkersProvider {
  loadProfileWorker: Worker<LoadProfileResult>;
}

const createLoadProfileWorker = (): Worker<LoadProfileResult> => {
  return createWorker<LoadProfileResult>('load-profile', async (signal) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 5);
      signal.addEventListener(
        'abort',
        () => {
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

export const createProfileWorkflow = (
  workersProvider: WorkersProvider = defaultWorkersProvider,
): Workflow<Props, State, Output, Rendering> => ({
  initialState: () => ({ type: 'loading' }),

  render: (_props, state, ctx) => {
    if (state.type === 'loading') {
      ctx.runWorker(workersProvider.loadProfileWorker, 'profile-load', (result) => () => ({
        state: result.ok
          ? { type: 'loaded', name: result.name }
          : { type: 'error', message: result.message },
      }));
    }

    switch (state.type) {
      case 'loading':
        return {
          type: 'loading',
          close: () => {
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
      case 'loaded':
        return {
          type: 'loaded',
          name: state.name,
          reload: () => {
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

### 2. Subscribe in React (`@workflow-ts/react`)

<!-- README_SNIPPET:react:start -->
```tsx
import { useWorkflow } from '@workflow-ts/react';
import type { JSX } from 'react';

import { profileWorkflow } from './workflow';

export function ProfileScreen({ userId }: { userId: string }): JSX.Element {
  const rendering = useWorkflow(profileWorkflow, { userId });

  switch (rendering.type) {
    case 'loading':
      return (
        <section>
          <h1>Profile</h1>
          <p>Loading...</p>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'loaded':
      return (
        <section>
          <h1>Welcome {rendering.name}</h1>
          <button onClick={rendering.reload}>Reload</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'error':
      return (
        <section>
          <h1>Profile</h1>
          <p>{rendering.message}</p>
          <button onClick={rendering.retry}>Retry</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
  }
}
```
<!-- README_SNIPPET:react:end -->

Deep dive: [React Integration](./docs/guides/react.md)

### 3. Test without UI

<!-- README_SNIPPET:test:start -->
```typescript
import { createRuntime } from '@workflow-ts/core';
import { expect, it } from 'vitest';

import { profileWorkflow } from '../src/workflow';

it('transitions loading -> loaded', () => {
  const runtime = createRuntime(profileWorkflow, { userId: 'u1' });

  expect(runtime.getRendering().type).toBe('loading');
  expect(runtime.getState().type).toBe('loading');

  runtime.send(() => ({ state: { type: 'loaded', name: 'Ada' } }));
  const loaded = runtime.getRendering();
  expect(loaded.type).toBe('loaded');
  expect((loaded as Extract<typeof loaded, { type: 'loaded' }>).name).toBe('Ada');

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
  state.type === 'error'
    ? { state: { type: 'loading' } }
    : { state },
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
if (state.type === 'loading') {
  ctx.runWorker(loadProfileWorker, 'profile-load', (result) => () => ({
    state: result.ok
      ? { type: 'loaded', name: result.name }
      : { type: 'error', message: result.message },
  }));
}
```

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

You can persist and restore workflow state with `snapshot`/`restore`:

```typescript
snapshot: (state) => JSON.stringify(state),
restore: (snapshot) => JSON.parse(snapshot),
```

More: [Snapshots](./docs/guides/snapshots.md)

## Documentation Map

Start here: [Documentation Index](./docs/index.md)

### Getting Started

- [Overview](./docs/guides/overview.md)
- [React Integration](./docs/guides/react.md)

### Workflow Mechanics

- [Composition & Child Workflows](./docs/guides/composition.md)
- [Workers](./docs/guides/workers.md)

### Reliability

- [Testing](./docs/guides/testing.md)
- [Snapshots](./docs/guides/snapshots.md)

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
