# When to Use Workflow-ts

Use this page to decide quickly whether workflow-ts is the right fit for a feature or product area.

## Good fit

workflow-ts is a strong fit when you have:

- complex, explicit state transitions across many UI states
- async stages that need deterministic orchestration (loading, retry, cancel, completion)
- parent-child flow composition with typed outputs
- high confidence requirements via runtime-level unit tests

## Not a good fit

workflow-ts is usually not worth the overhead when you have:

- mostly static pages with minimal interaction logic
- simple local component state where `useState` or `useReducer` is enough
- no need for child-flow composition or long-lived workflow trees
- teams that are not ready to model state transitions explicitly

## Comparison at a glance

| Tool          | Best for                                                              | Tradeoff profile                                              |
| ------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `workflow-ts` | Explicit state-machine UI flows with composition and worker lifecycle | More up-front modeling, strong long-term predictability       |
| `useReducer`  | Local component state with moderate transition complexity             | Minimal tooling, limited built-in async/composition structure |
| Redux Toolkit | Shared app-wide store, normalized state, middleware ecosystem         | Global-store overhead and selector architecture               |
| XState        | Formal statecharts with guards and visual tooling                     | More statechart ceremony and machine vocabulary               |

## Adoption checklist

Use workflow-ts for a feature slice when most answers are "yes":

1. Do we have 3+ meaningful UI states with explicit transitions?
2. Do we need robust async lifecycle handling and cancellation?
3. Do parent and child flows need typed, explicit output routing?
4. Do we want domain logic tested independently from UI framework tests?
5. Would explicit state/action modeling reduce current bugs or ambiguity?

## Migration path

Adopt incrementally:

1. Choose one feature with high transition complexity.
2. Model its domain flow as a workflow in `@workflow-ts/core`.
3. Integrate via `useWorkflow` in one screen/container.
4. Add runtime tests with `createRuntime` for key transitions.
5. Expand composition to adjacent flows only after the first feature stabilizes.

## Related guides

- [Overview](./overview.md)
- [React Integration](./react.md)
- [Composition & Child Workflows](./composition.md)
- [README Profile Example](../../examples/readme-profile/README.md)
