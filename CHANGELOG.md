# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Added short inline comments to the README quick-start snippets while keeping them synced with the runnable `examples/readme-profile` sources.
- Added README badges for CI status, per-package bundle size (`@workflow-ts/core`, `@workflow-ts/react`), and per-package npm versions.
- Switched bundle-size badges to Shields-hosted images after BundleJS badge images failed to render reliably in GitHub README views.
- Updated npm version badge labels to display the package names (`@workflow-ts/core` and `@workflow-ts/react`) directly on the badges.



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

[Unreleased]: https://github.com/BenedictP/workflow-ts/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/BenedictP/workflow-ts/compare/v0.1.1...v0.1.2
