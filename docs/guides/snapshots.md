# Snapshots

Snapshots serialize workflow state so it can be persisted and restored.

## Define snapshot handling

```ts
const workflow: Workflow<Props, State, Output, Rendering> = {
  initialState: (props, snapshot) => snapshot ? JSON.parse(snapshot) : { count: 0 },
  snapshot: (state) => JSON.stringify(state),
  render: (props, state, ctx) => ({ count: state.count }),
};
```

## Restore a runtime

```ts
const runtime = createRuntime(workflow, props, { snapshot: snapshotString });
```

When a snapshot is provided to `createRuntime`, hydration happens through
`initialState(props, snapshot)`.

## When snapshots are produced

Snapshots are produced on demand, not automatically on every state change.

Call `runtime.snapshot()` at platform checkpoints (for example app backgrounding, navigation, or before unload), persist the returned string, and pass it back into `createRuntime(..., { snapshot })` on next launch.

```ts
const snapshotString = runtime.snapshot();
if (snapshotString !== undefined) {
  storage.setItem('workflow.snapshot', snapshotString);
}
```

For React hooks, `useWorkflowWithState` exposes a `snapshot()` helper that delegates to the same runtime method.
