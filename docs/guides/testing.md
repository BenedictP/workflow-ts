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

### Approach 1: run real async workers with controlled completion

This verifies real worker wiring and lifecycle without flaky `setTimeout(...)` waits.

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

it('loads data through worker', async () => {
  const pending = deferred<{ id: string }>();
  const loadWorker = createWorker('load', async () => pending.promise);
  const runtime = createRuntime(workflowWithWorker(loadWorker), undefined);

  runtime.getRendering().start();
  expect(runtime.getRendering().status).toBe('loading');

  pending.resolve({ id: '42' });
  await Promise.resolve(); // flush worker completion microtask

  expect(runtime.getRendering().status).toBe('loaded');
  runtime.dispose();
});
```

### Test cancellation explicitly

If a key is not called in the next render, the runtime aborts that worker.

```ts
it('aborts worker when no longer rendered', async () => {
  let aborted = false;

  const worker = createWorker('load', async (signal) => {
    signal.addEventListener('abort', () => {
      aborted = true;
    });
    await new Promise(() => {}); // keep worker pending
    return 'done';
  });

  const runtime = createRuntime(workflowWithConditionalWorker(worker), { enabled: true });
  runtime.getRendering();

  runtime.updateProps({ enabled: false });
  runtime.getRendering();

  expect(aborted).toBe(true);
  runtime.dispose();
});
```

### Test failure paths as data, not thrown worker errors

`runWorker` handles worker output only. Thrown errors are logged and do not dispatch an action.
For testable failure state transitions, return a result union from the worker and branch in the handler.

```ts
type LoadResult =
  | { type: 'ok'; data: string }
  | { type: 'error'; message: string };

const loadWorker = createWorker<LoadResult>('load', async () => {
  return { type: 'error', message: 'Network failed' };
});

// in render:
ctx.runWorker(loadWorker, 'load', (result) => () => ({
  state:
    result.type === 'ok'
      ? { type: 'loaded', data: result.data }
      : { type: 'error', message: result.message },
}));
```

This is the same pattern used in Kotlin Workflow tests with `Worker.from { Result.Success(...) }` / `Result.Error(...)`: model failures as worker outputs, then assert state/render transitions.

```ts
import { createWorker, createRuntime, type Worker } from '@workflow-ts/core';
import { expect, it, vi } from 'vitest';

type Result<T> = { type: 'success'; data: T } | { type: 'error'; message: string };
type Card = { id: string };

interface WorkerProvider {
  loadCardsWorker: (sandbox: boolean) => Worker<Result<Card[]>>;
}

it('shows error, then loads cards after retry', async () => {
  const provider: WorkerProvider = {
    loadCardsWorker: vi
      .fn()
      .mockReturnValueOnce(
        createWorker('load-cards-fail', async () => ({ type: 'error', message: 'TEST' })),
      )
      .mockReturnValueOnce(
        createWorker('load-cards-ok', async () => ({ type: 'success', data: [{ id: '1' }] })),
      ),
  };

  const runtime = createRuntime(createManageStoredPaymentWorkflow(provider), false);

  await Promise.resolve();
  expect(runtime.getRendering().type).toBe('error');

  runtime.getRendering().retry();
  await Promise.resolve();
  expect(runtime.getRendering().type).toBe('cards');

  runtime.dispose();
});
```

### Approach 2: simulate transitions with `runtime.send(...)`

This is useful for pure transition testing, but it does not verify worker start/abort behavior.

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
