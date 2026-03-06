# workflow-ts doc map

Use this map for progressive disclosure. Read only the section needed for the current task.

## Entry points

- `README.md`: canonical quick-start example with workflow, React integration, and runtime test pattern.
- `docs/index.md`: index of company-authored guides.

## Guide routing

- `docs/guides/overview.md`: architecture model (props, state, rendering, actions, workers, composition).
- `docs/guides/react.md`: `useWorkflow` and `useWorkflowWithState`, prop constraints, performance guidance.
- `docs/guides/workers.md`: worker key semantics, lifecycle, cancellation/restart behavior, async best practices.
- `docs/guides/composition.md`: `renderChild`, child keys, and output routing.
- `docs/guides/testing.md`: runtime-level test strategy, worker testing patterns, test hygiene.
- `docs/guides/snapshots.md`: persistence and restore flow.
- `docs/guides/interceptors.md`: analytics/logging hooks around action lifecycle.
- `docs/guides/devtools.md`: runtime event inspection and history APIs.
- `docs/guides/when-to-use.md`: fit check for choosing workflow-ts vs alternatives.

## API surface

- `packages/core/README.md`: `Workflow`, `createRuntime`, `RenderContext`, action helpers, runtime APIs.
- `packages/react/README.md`: React hook APIs and options.

## Runnable examples

- `examples/readme-profile/`: source of truth for README snippets.
- `examples/counter/`: minimal workflow example.

## Fast lookup patterns

- `rg -n "runWorker|Keyed Side-Effect|cancel|restart" docs/guides/workers.md`
- `rg -n "useWorkflow|useWorkflowWithState|Do and do not|props" docs/guides/react.md`
- `rg -n "renderChild|stable keys|output" docs/guides/composition.md`
- `rg -n "What to test|Testing workers|Test hygiene" docs/guides/testing.md`
