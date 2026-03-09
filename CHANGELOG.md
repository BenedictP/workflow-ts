# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Prevented React output handler subscription churn when `outputHandlers` is passed as an inline object by keeping per-output subscriptions stable and dispatching to the latest handler via refs.
- Made core runtime listener and typed output handler dispatch deterministic by snapshotting callbacks per cycle, so mid-dispatch subscribe/unsubscribe applies on the next cycle and dispatch stops immediately if runtime is disposed.
- Fixed `composeInterceptors()` so interceptor `filter(action)` is applied to action-driven `onStateChange` callbacks while keeping props-driven `onStateChange` delivery unchanged.

[Unreleased]: https://github.com/BenedictP/workflow-ts/compare/v0.0.1...HEAD
