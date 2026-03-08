# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace with two publishable packages and runnable examples:
- `packages/core`: framework-agnostic runtime (`src/`) and unit tests (`test/`).
- `packages/react`: React bindings (`src/`) and tests (`test/`).
- `examples/*`: Vite-based demo apps that consume workspace packages.
- `docs/`: Markdown guides and index used as the canonical contributor-facing docs.
- `scripts/`: repository utilities (for example README snippet verification).

Keep source in `src/` and place tests in `test/` using `*.test.ts` naming.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies (Node 18+; CI uses Node 20).
- `pnpm build`: build all workspace packages recursively.
- `pnpm test`: run all package/example test suites.
- `pnpm typecheck`: run strict TypeScript checks across the workspace.
- `pnpm lint` / `pnpm lint:fix`: run ESLint checks or auto-fix issues.
- `pnpm format` / `pnpm format:check`: apply or verify Prettier formatting.
- `pnpm ci`: local equivalent of CI gates (`typecheck`, `lint`, `test`, `build`).
- After every code change, run `pnpm ci` before creating or updating a PR to ensure CI checks pass.
- After every code change, add a short summary of the change under `Unreleased` in `CHANGELOG.md` (Keep a Changelog format).

Example: run only React package tests with `pnpm --filter @workflow-ts/react test`.

## Coding Style & Naming Conventions
TypeScript is strict (`tsconfig.base.json`) and ESM-first. Prettier defaults: 2-space indent, semicolons, single quotes, trailing commas, `printWidth` 100. ESLint enforces explicit boundary types, `eqeqeq`, import ordering, and discourages `any`.

Naming:
- Files: `camelCase.ts` (for example `workflowBuilder.ts`, `useWorkflow.ts`).
- Tests: `featureName.test.ts`.
- Keep workflow-related types explicit (`Props`, `State`, `Output`, `Rendering`).

## Testing Guidelines
Framework: Vitest (`vitest run` in packages; `happy-dom` for React tests). Add or update tests for every behavioral change, especially state transitions, worker lifecycle, and output mapping. Prefer runtime-level tests in `packages/core` for domain logic and integration tests in `packages/react` for hook behavior.

## Commit & Pull Request Guidelines
Use concise, imperative commit subjects. Current history favors Conventional Commit prefixes where useful (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`), optionally with issue/PR references like `(#76)`.

PRs should follow `.github/PULL_REQUEST_TEMPLATE.md`: include a clear description, change type, linked issues (`Fixes #123`), test evidence, and screenshots for UI/example changes.
