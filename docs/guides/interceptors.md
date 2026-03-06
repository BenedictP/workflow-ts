# Interceptors

Interceptors let you observe runtime processing in the workflow runtime.
They are useful for cross-cutting concerns like analytics, logging, and diagnostics.

## Where interceptors run

Interceptors are configured on `createRuntime(...)` in `@workflow-ts/core`.

```ts
import { createRuntime } from '@workflow-ts/core';

const runtime = createRuntime(workflow, props, {
  interceptors: [],
});
```

`@workflow-ts/react` hooks (`useWorkflow`, `useWorkflowWithState`) do not currently expose an
`interceptors` option directly.

## Lifecycle hooks

Each interceptor can hook into:

1. `onSend(action, context)` before the action executes.
2. `onResult(action, result, context)` after execution.
3. `onError(action, error, context)` when the action throws.
4. `onStateChange(change, context)` when state transitions.
5. `filter(action)` to opt in/out per action.

Use this to keep action functions pure while handling side effects externally.

Interceptor `context` includes `workflowKey`, a stable identifier for the runtime instance that
processed the event.

`onStateChange` includes a `reason`:

- `'action'`: state changed from action processing. Includes `action` and optional `actionName`.
- `'propsChanged'`: state changed from `onPropsChanged`.

## 1. Custom interceptor with `createInterceptor`

```ts
import { createInterceptor, createRuntime, named } from '@workflow-ts/core';

type State = { count: number };
type Output = { type: 'reachedMax'; value: number };

const analytics = {
  track: (event: string, payload: Record<string, unknown>) => {
    console.log(event, payload);
  },
};

const analyticsInterceptor = createInterceptor<State, Output>('analytics', {
  onSend: (action, ctx) => {
    const actionName = (action as { name?: string }).name ?? 'anonymous_action';
    analytics.track('workflow.action.send', {
      action: actionName,
      stateBefore: ctx.state,
    });
  },
  onResult: (action, result, ctx) => {
    const actionName = (action as { name?: string }).name ?? 'anonymous_action';
    analytics.track('workflow.action.result', {
      action: actionName,
      stateBefore: ctx.state,
      stateAfter: result.state,
      hasOutput: result.output !== undefined,
    });
  },
  onError: (action, error) => {
    const actionName = (action as { name?: string }).name ?? 'anonymous_action';
    analytics.track('workflow.action.error', {
      action: actionName,
      message: error.message,
    });
  },
  onStateChange: (change) => {
    analytics.track('workflow.state.change', {
      reason: change.reason,
      previous: change.prevState,
      next: change.nextState,
      actionName: change.reason === 'action' ? change.actionName : undefined,
    });
  },
});

const runtime = createRuntime(workflow, props, {
  interceptors: [analyticsInterceptor],
});

// Naming actions helps produce stable names in logs/analytics.
const increment = named('increment', (state: State) => ({
  state: { count: state.count + 1 },
}));
runtime.send(increment);
```

## 2. Built-in `loggingInterceptor`

Use this for quick runtime visibility.

```ts
import { createRuntime, loggingInterceptor } from '@workflow-ts/core';

const runtime = createRuntime(workflow, props, {
  interceptors: [
    loggingInterceptor({
      prefix: '[counter]',
      logResults: true,
      logState: true,
    }),
  ],
});
```

## 3. Built-in `debugInterceptor`

Use this when you want logging that can be toggled on/off.

```ts
import { createRuntime, debugInterceptor } from '@workflow-ts/core';

const runtime = createRuntime(workflow, props, {
  interceptors: [
    debugInterceptor({
      enabled: process.env.NODE_ENV !== 'production',
      logSend: true,
      logResults: true,
    }),
  ],
});
```

## 4. Chain behavior with `composeInterceptors`

Compose multiple interceptors into a single ordered chain.

```ts
import {
  composeInterceptors,
  createInterceptor,
  createRuntime,
  loggingInterceptor,
} from '@workflow-ts/core';

const metrics = createInterceptor<State, Output>('metrics', {
  onSend: () => {
    /* increment metric */
  },
});

const chain = composeInterceptors(loggingInterceptor({ prefix: '[workflow]' }), metrics);

const runtime = createRuntime(workflow, props, {
  interceptors: [chain],
});
```

You can also pass multiple interceptors directly as an array:

```ts
const runtime = createRuntime(workflow, props, {
  interceptors: [firstInterceptor, secondInterceptor],
});
```

## 5. Filter specific actions

Filters let an interceptor apply only to some actions.

```ts
import { createInterceptor } from '@workflow-ts/core';

const incrementOnly = createInterceptor<State, Output>('increment-only', {
  filter: (action) => (action as { name?: string }).name === 'increment',
  onSend: () => {
    // runs only for named('increment', ...)
  },
});
```

`filter(action)` is evaluated for action hooks (`onSend`, `onResult`, `onError`, and action-driven
`onStateChange`). Props-driven `onStateChange` events do not have an action and are delivered
whenever `onStateChange` is defined.

## Guidelines

- Keep actions pure and deterministic.
- Use interceptors for side effects (analytics, logs, metrics), not action bodies.
- Use `onStateChange` for transition-level analytics or diagnostics.
- Prefer action naming (`named(...)`) if you need stable action-level reporting.
