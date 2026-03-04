# Testing workflows

Workflows are a good fit for unit tests because runtime behavior is deterministic and independent from UI frameworks.

## What to test

For a typical workflow, these tests give good coverage:

1. Initial state and initial rendering.
2. Rendering callbacks (user events) and state transitions.
3. Outputs emitted to parents.
4. Props updates via `runtime.updateProps(...)`.
5. Worker behavior (async success/cancel/failure paths).

## Basic runtime test

```ts
import { createRuntime } from '@workflow-ts/core';
import { expect, it } from 'vitest';

it('increments counter', () => {
  const runtime = createRuntime(counterWorkflow, undefined);

  expect(runtime.getRendering().count).toBe(0);

  runtime.getRendering().onIncrement();

  expect(runtime.getState().count).toBe(1);
  expect(runtime.getRendering().count).toBe(1);

  runtime.dispose();
});
```

## Testing outputs

You can capture all outputs with `onOutput`:

```ts
const outputs: Output[] = [];
const runtime = createRuntime(workflow, props, {
  onOutput: (output) => outputs.push(output),
});

// trigger actions...
expect(outputs).toEqual([{ type: 'done' }]);

runtime.dispose();
```

If your output type uses a `type` discriminator, `runtime.on(...)` gives typed handlers:

```ts
const runtime = createRuntime(workflow, props);
const completed: Array<{ type: 'done'; id: string }> = [];

const unsubscribe = runtime.on('done', (output) => {
  completed.push(output);
});

// trigger actions...
expect(completed).toEqual([{ type: 'done', id: '42' }]);

unsubscribe();
runtime.dispose();
```

## Testing prop-driven behavior

```ts
const runtime = createRuntime(workflow, { userId: 'u1' });

expect(runtime.getRendering().title).toBe('u1');

runtime.updateProps({ userId: 'u2' });

expect(runtime.getProps()).toEqual({ userId: 'u2' });
expect(runtime.getRendering().title).toBe('u2');

runtime.dispose();
```

## Testing workers

### Approach 1: run real async workers

This is best when you want to verify real worker wiring and lifecycle.

```ts
it('loads data through worker', async () => {
  const runtime = createRuntime(workflowWithWorker, undefined);
  runtime.getRendering().start();

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(runtime.getRendering().status).toBe('loaded');
  runtime.dispose();
});
```

### Approach 2: simulate completion with `runtime.send(...)`

This is best for pure workflow transition tests where async timing is not important.

```ts
const runtime = createRuntime(workflowWithWorker, undefined);

runtime.getRendering().start();
runtime.send((state) => ({
  state: { ...state, status: 'loaded' },
}));

expect(runtime.getRendering().status).toBe('loaded');
runtime.dispose();
```

## Testing composed workflows

For parent-child workflows, test through the parent rendering and assert parent state/output:

```ts
const runtime = createRuntime(parentWorkflow, { id: 'a1' });

runtime.getRendering().child.onSave();

expect(runtime.getState().savedIds).toEqual(['a1']);
runtime.dispose();
```

This verifies child output handling without needing to test runtime internals.

## React tests vs workflow tests

- Prefer testing domain logic at the `@workflow-ts/core` level with `createRuntime`.
- Use `@workflow-ts/react` tests (`renderHook`) for integration concerns like subscription updates, StrictMode behavior, and cleanup.

## Test hygiene

- Create a new runtime per test.
- Always call `runtime.dispose()` (or use test hooks like `afterEach`).
- Assert behavior through public APIs (`getRendering`, `getState`, `onOutput`, `updateProps`, `send`).
