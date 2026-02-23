# React integration

`@workflow-ts/react` provides hooks to bind renderings to React.

## useWorkflow

```tsx
const rendering = useWorkflow(workflow, props);
```

- Rerenders on workflow state changes.
- Optional `options.resetOnWorkflowChange` recreates the runtime when workflow identity changes.

## useWorkflowWithState

```tsx
const { rendering, state, props, updateProps, snapshot } = useWorkflowWithState(workflow, {
  props,
  onOutput,
  resetOnWorkflowChange: false,
});
```

This hook uses `useSyncExternalStore` internally for consistent snapshots.
