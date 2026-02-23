# RFC 0001 — Runtime improvements (workers, snapshots, React hooks)

## Status
Draft

## Motivation
We have four pain points:
1) Worker outputs can race with dispose and surface misleading error logs.
2) Snapshot restore path is unclear (no API to hydrate a runtime).
3) React hook `useWorkflowWithState` diverges from `useSyncExternalStore` semantics.
4) `renderChild` does not update child props unless an output handler is provided.

## Proposal (PR series)

### PR 1 — Worker lifecycle correctness
- Guard the output handler in `WorkflowRuntime.runWorker` to avoid `assertNotDisposed` errors racing with dispose.
- Keep WorkerManager behavior as-is; this is a runtime-level guard.
- Warn (not throw) if `runWorker` is called outside a render cycle to surface the footgun.
- Tests:
  - Ensure no error is logged when a worker resolves after `dispose()`.

### PR 2 — Snapshot restore API
- Extend `createRuntime` to accept an optional `snapshot` param.
- If snapshot provided:
  - prefer `workflow.restore?.(snapshot)`; fallback to `initialState(props, snapshot)`.
- Add docs + example in `packages/core/README.md`.
- Tests:
  - Round-trip snapshot + restore.
  - Versioned snapshot migration example.

### PR 3 — React hook stability
- Align `useWorkflowWithState` with `useSyncExternalStore` for consistent subscriptions.
- If returning `{ rendering, state, props }`, memoize snapshot to avoid churn.
- Make runtime recreation on `workflow` identity change opt-in; document that `key` is the standard reset mechanism.
- Add SSR-safe fallback in hooks.
- Add docs section for hook lifecycle and workflow identity.

### PR 4 — Child props updates
- Always call `child.updateProps(props)` when a child runtime already exists, even without output handler.
- Add test ensuring child props update without handler.

## Compatibility
- Worker/output guards are backwards compatible and reduce footguns.
- Snapshot API is additive (no breaking change).
- React hook behavior change only when workflow identity changes; this is a correctness fix.

## Open Questions
- Should `runWorker` be allowed outside render? (Recommendation: warn, not throw.)

## Rollout Plan
- Ship PRs in order 1 → 2 → 3.
- Each PR keeps main green with targeted tests.
