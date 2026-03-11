# Overview

Workflow-ts is a TypeScript implementation of Square’s Workflow architecture: explicit state machines, unidirectional data flow, and composable renderings.

## Core ideas

- **Props** are inputs from parents.
- **State** is private, immutable workflow state.
- **Rendering** is the external “view model”: data + event callbacks.
- **Actions** are pure functions that produce new state (and optionally output).
- **Workers** run async work with lifecycle tied to render calls.
- **Composition** builds trees of workflows via `renderChild`.
- **`onPropsChanged`** is an optional lifecycle hook that lets a workflow derive state from new props before render.

## Runtime vs UI bindings

- `@workflow-ts/core` is UI‑agnostic (runtime, types, workers, actions).
- `@workflow-ts/react` binds renderings to React via hooks.

## When to use

Use workflow-ts when you need explicit, testable state transitions and clear separation between business logic and UI rendering.

Good fit:

- explicit multi-state flows with non-trivial transitions
- async lifecycle handling (load/retry/cancel)
- parent-child orchestration with typed outputs
- workflows that need strong runtime-level tests

Not a good fit:

- mostly static screens or simple local UI state
- features with little/no flow composition
- teams that want minimal upfront state modeling

## Runtime API

The `createRuntime(workflow, props, config?)` call returns a runtime instance. For backward compatibility, the third argument can also be a plain output callback.
Worker execution is automatic by environment: browser-like, React Native, and test runtimes run workers; server-like non-test runtimes block workers.

| Method                      | Description                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `getRendering()`            | Returns the current rendering                                                                                               |
| `getState()`                | Returns the current workflow state                                                                                          |
| `getProps()`                | Returns the current props                                                                                                   |
| `updateProps(props)`        | Updates props and re-renders if changed                                                                                     |
| `send(action)`              | Sends an action to the runtime                                                                                              |
| `dispose()`                 | Disposes the runtime and cancels all workers                                                                                |
| `snapshot()`                | Returns a serializable snapshot of the current state                                                                        |
| `subscribe(listener)`       | Subscribes to rendering changes; returns an unsubscribe function                                                            |
| `isDisposed()`              | Returns `true` if the runtime has been disposed                                                                             |
| `on(type, handler)`         | Subscribes to typed outputs for discriminated union outputs shaped like `{ type: string }`; returns an unsubscribe function |
| `off(type, handler?)`       | Removes a specific typed-output handler when `handler` is provided, or all handlers for `type` when omitted                |

`on(...)` and `off(...)` are only useful when the workflow output is a discriminated union with a string `type` field.

## Next steps

- Start with [When to Use](./when-to-use.md) to decide where workflow-ts fits.
- Read [React Integration](./react.md) to see how renderings map into UI.
- Read [Composition & Child Workflows](./composition.md) for parent-child orchestration.
- Run the [README Profile Example](../../examples/readme-profile/README.md) to trace the end-to-end library shape.
