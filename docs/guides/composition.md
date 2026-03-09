# Composition & child workflows

Workflows compose as a tree. A parent renders children and combines their renderings into its own.

## Rendering a child

```ts
const childRendering = ctx.renderChild(
  childWorkflow,
  childProps,
  'child-key',
  (childOutput) => (state) => ({
    state: handleChildOutput(state, childOutput),
  }),
);
```

### Keys

- **Stable keys** preserve child state across parent renders.
- Changing a key creates a new child instance.

### Props updates

Children receive updated props every render. If your child derives state from props, use the `onPropsChanged` lifecycle hook to update state before the next render:

```ts
const childWorkflow = {
  initialState: (props) => ({ value: props.initialValue }),
  onPropsChanged: (oldProps, newProps, state) => {
    if (oldProps.initialValue !== newProps.initialValue) {
      return { ...state, value: newProps.initialValue };
    }
    return state;
  },
  render: (props, state, ctx) => ({ value: state.value }),
};
```

## Output handling

The optional `handler` argument on `renderChild(...)` is how a parent workflow receives child outputs and maps them to parent actions. If you don't need child outputs, omit the handler.

```ts
type ChildOutput = { type: 'success'; data: string } | { type: 'cancel' };

const childRendering = ctx.renderChild(childWorkflow, childProps, 'child-key', (childOutput) => {
  return (state) => ({
    state:
      childOutput.type === 'success'
        ? { ...state, step: 'done', data: childOutput.data }
        : { ...state, step: 'editing' },
  });
});
```

### Runtime-level output subscriptions

`runtime.on(...)` in `@workflow-ts/core` and `outputHandlers` in `@workflow-ts/react` are conveniences for listening to a workflow runtime's own outputs. They are separate from parent-child output routing and only apply when the output type is a discriminated union shaped like `{ type: string }`.

```ts
type WorkflowOutput = { type: 'success'; data: string } | { type: 'error'; error: string };

// Runtime API - subscribe to specific output types
runtime.on('success', (output) => {
  console.log('Loaded:', output.data);
});

runtime.on('error', (output) => {
  console.log('Error:', output.error);
});

// Unsubscribe
const unsubscribe = runtime.on('success', handler);
unsubscribe();

// Or remove all handlers for a type
runtime.off('error');
```

### React hooks

```ts
const rendering = useWorkflow(childWorkflow, props, undefined, {
  outputHandlers: {
    success: (output) => navigate(`/data/${output.data}`),
    error: (output) => showToast(output.error),
  },
});
```

## Best practices

- Keep child renderings small and composable.
- Use stable keys for long‑lived children.
- Avoid mutating props/state; always return new state.
