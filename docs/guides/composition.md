# Composition & child workflows

Workflows compose as a tree. A parent renders children and combines their renderings into its own.

## Rendering a child

```ts
const childRendering = ctx.renderChild(childWorkflow, childProps, 'child-key', (childOutput) => (state) => ({
  state: handleChildOutput(state, childOutput),
}));
```

### Keys

- **Stable keys** preserve child state across parent renders.
- Changing a key creates a new child instance.

### Props updates

Children receive updated props every render. If your child derives state from props, do so explicitly (e.g., compare props in render and dispatch an action).

## Output handling

The optional output handler maps child outputs to parent actions. If you don’t need outputs, omit the handler.

## Best practices

- Keep child renderings small and composable.
- Use stable keys for long‑lived children.
- Avoid mutating props/state; always return new state.
