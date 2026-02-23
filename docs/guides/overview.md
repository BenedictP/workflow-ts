# Overview

Workflow-ts is a TypeScript implementation of Square’s Workflow architecture: explicit state machines, unidirectional data flow, and composable renderings.

## Core ideas

- **Props** are inputs from parents.
- **State** is private, immutable workflow state.
- **Rendering** is the external “view model”: data + event callbacks.
- **Actions** are pure functions that produce new state (and optionally output).
- **Workers** run async work with lifecycle tied to render calls.
- **Composition** builds trees of workflows via `renderChild`.

## Runtime vs UI bindings

- `@workflow-ts/core` is UI‑agnostic (runtime, types, workers, actions).
- `@workflow-ts/react` binds renderings to React via hooks.

## When to use

Use workflow-ts when you need explicit, testable state transitions and clear separation between business logic and UI rendering.
