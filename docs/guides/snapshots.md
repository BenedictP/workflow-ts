# Snapshots

Snapshots serialize workflow state so it can be persisted and restored.

## Define snapshot/restore

```ts
const workflow: Workflow<Props, State, Output, Rendering> = {
  initialState: (props, snapshot) => snapshot ? JSON.parse(snapshot) : { count: 0 },
  restore: (snapshot) => JSON.parse(snapshot),
  snapshot: (state) => JSON.stringify(state),
  render: (props, state, ctx) => ({ count: state.count }),
};
```

## Restore a runtime

```ts
const runtime = createRuntime(workflow, props, { snapshot: snapshotString });
```

`restore` takes precedence when provided; otherwise `initialState(props, snapshot)` is used.
