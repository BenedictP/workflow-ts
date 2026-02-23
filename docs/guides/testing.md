# Testing workflows

Workflows are easy to test because the runtime is deterministic and UI‑agnostic.

## Basic runtime test

```ts
import { createRuntime } from '@workflow-ts/core';

test('increments counter', () => {
  const runtime = createRuntime(counterWorkflow, undefined);
  expect(runtime.getRendering().count).toBe(0);

  runtime.getRendering().onIncrement();
  expect(runtime.getRendering().count).toBe(1);

  runtime.dispose();
});
```

## Testing outputs

```ts
const outputs: Output[] = [];
const runtime = createRuntime(workflow, props, (output) => outputs.push(output));
// trigger actions...
expect(outputs).toEqual([{ type: 'done' }]);
```

## Workers

Workers run async work. In tests, you can:

- Use real async workers and await completion.
- Or simulate worker completion by dispatching actions directly.

```ts
runtime.send((state) => ({ state: { ...state, status: 'done' } }));
```
