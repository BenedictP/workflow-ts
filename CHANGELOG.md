# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Refined Dependabot policy with deterministic Monday schedules, explicit `main` targeting, tighter PR limits, and grouped npm/GitHub Actions updates (including major-version updates) to reduce noise while keeping dependencies current.
- Updated Dependabot reviewers to replace the legacy `openclaw` account with `AICodeHelper`.
- Updated Dependabot reviewers and `CODEOWNERS` to `BenedictP` as the canonical reviewer/owner.
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

[Unreleased]: https://github.com/BenedictP/workflow-ts/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/BenedictP/workflow-ts/compare/v0.1.1...v0.1.2
