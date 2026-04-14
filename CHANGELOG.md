# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** Reworked persistence in `@workflow-ts/core` to a strict codec model with versioned envelopes (`{ v, data }`): persisted runtimes now require explicit `serialize(state)` and `deserialize(raw, props)` in config, with optional `migrate(raw, fromVersion, toVersion)`.
- **Breaking:** Redesigned `@workflow-ts/react` persisted hook output to expose `persistence` phase state (`idle`/`rehydrating`/`ready`/`error`) with metadata (`isHydrated`, `lastRehydratedAt`, `lastPersistedAt`) instead of the previous `hydration` shape.
- React persisted hooks now accept `PersistStorage` (sync or async) with lazy non-blocking rehydrate semantics.
- `createPersistedRuntime()` now accepts `PersistStorage` directly and supports lazy rehydrate from async `getItem` without requiring async runtime creation.

### Fixed

- Persistence error context now reports invalid envelope payloads as `operation: 'decodeEnvelope'` (instead of `deserialize`) so consumers can distinguish envelope corruption from user codec failures.
- `createPersistedRuntimeAsync(..., { rehydrate: 'lazy' })` now reports synchronous storage read errors via `onError` instead of rejecting runtime creation.
- Persisted runtimes now flush the latest pending snapshot on `dispose()` (including debounced writes) to avoid dropping the final transition state.
- `usePersistedWorkflow` now warns once in development when `persist.serialize`/`persist.deserialize`/`persist.migrate` function identities change after mount.
- `usePersistedWorkflow` now throws a clear configuration error when `persist.key` resolves to a non-string value at runtime.
- React persisted runtime identity no longer resets state when storage adapter references churn (for example inline `memoryStorage()` usage).
- React persisted-hook server fallback detection now aligns with core environment rules so React Native/test-like environments are not misclassified as server-only.
- Persist error reporting now classifies thrown `onPersist` callback failures as `operation: 'onPersist'` instead of misreporting them as storage `setItem` failures.
- Persist error reporting now classifies thrown `onRehydrate` callback failures as `operation: 'onRehydrate'` and keeps runtime hydration/state transitions running.
- Persist error handling now guards user `onError` callbacks so thrown callback exceptions cannot break the internal persistence write chain.

## [0.1.3] - 2026-04-13

### Changed

- Refined Dependabot policy with deterministic Monday schedules, explicit `main` targeting, tighter PR limits, and grouped npm/GitHub Actions updates (including major-version updates) to reduce noise while keeping dependencies current.
- Updated Dependabot reviewers to replace the legacy `openclaw` account with `AICodeHelper`.
- Updated Dependabot reviewers and `CODEOWNERS` to `BenedictP` as the canonical reviewer/owner.
- Added a CI `Release Readiness` job that validates release-version alignment and dry-run publishes for both packages, so dependency/action update PRs catch release-path breakage before merge.
- Added a dedicated Next.js SSR/hydration guide and linked it from the docs index, React docs, package README, and root README to document deterministic first-render and worker caveats.
- Added short inline comments to the README quick-start snippets while keeping them synced with the runnable `examples/readme-profile` sources.
- Added README badges for CI status, per-package bundle size (`@workflow-ts/core`, `@workflow-ts/react`), and per-package npm versions.
- Switched bundle-size badges to Shields-hosted images after BundleJS badge images failed to render reliably in GitHub README views.
- Updated npm version badge labels to display the package names (`@workflow-ts/core` and `@workflow-ts/react`) directly on the badges.
- Added a Quick Start high-level architecture section in the README with the new `docs/WorkflowArchitecture-dark.png` diagram and an overview paragraph of props/state/rendering/actions/workers/output flow.
- Clarified in the README architecture overview that every state transition triggers `render`, and that `render` must return a `Rendering` for the current state.

## [0.1.2] - 2026-03-09

### Changed

- Clarified the docs onboarding path, child output routing, and typed output subscription requirements.

### Fixed

- Prevented React output handler subscription churn when `outputHandlers` is passed as an inline object by keeping per-output subscriptions stable and dispatching to the latest handler via refs.
- Made core runtime listener and typed output handler dispatch deterministic by snapshotting callbacks per cycle, so mid-dispatch subscribe/unsubscribe applies on the next cycle and dispatch stops immediately if runtime is disposed.
- Fixed `composeInterceptors()` so interceptor `filter(action)` is applied to action-driven `onStateChange` callbacks while keeping props-driven `onStateChange` delivery unchanged.
- Optimized React prop `Set` comparison so reordered primitive-heavy sets avoid quadratic matching work during `useWorkflow` prop sync.
- Reduced React structural `Set` comparison allocations by using deep-equality context checkpoints instead of cloning context per structural candidate.
- Fixed `debounceWorker()` abort listener cleanup so listeners are removed after both abort and normal debounce completion.

[Unreleased]: https://github.com/BenedictP/workflow-ts/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/BenedictP/workflow-ts/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/BenedictP/workflow-ts/compare/v0.1.1...v0.1.2
