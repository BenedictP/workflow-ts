# workflow-ts Roadmap: From v0.1 → v1.0+

## Philosophy
workflow-ts sits between Zustand (too free — no guardrails) and XState (too config-heavy — JSON graphs). The killer positioning: **"Stop writing state machine config, start writing functions."** Lean into that. Keep the code-first, type-safe, composable architecture. Make it the obvious choice when you want explicit state transitions without YAML/JSON ceremonies.

---

## Phase 1: Foundation & Polish (v0.2.x)

### 1.1 Test Coverage
- **Target: 90%+ coverage** on `@workflow-ts/core`. Currently gaps in interceptors, edge cases in runtime disposal, and child workflow error boundaries.
- Add property-based tests for action composition (`fast-check` or similar).
- Add stress tests: 10k rapid actions, deep child nesting (10 levels), memory leak detection via `weak-napi`.

### 1.2 TypeScript DX
- **Stricter inference**: `createStatefulWorkflow` should infer `Output` from `render` return type when actions emit output, without explicit generic params.
- **Discriminated union helpers**: `matchState(state, { loading: ..., loaded: ..., error: ... })` — exhaustiveness-checked, returns value.
- **Action builder DSL**: Instead of `ctx.actionSink.send(() => ({ state: ... }))`, allow:
  ```ts
  ctx.send(setState({ type: 'loaded', data }))
  ctx.send(emit({ type: 'closed' }))
  ctx.send(batch(action1, action2))
  ```

### 1.3 Error Boundaries & Resilience
- **Unhandled worker errors**: Currently `console.error` — add `onWorkerError` interceptor hook.
- **Action error recovery**: `safeAction` is good, but add `tryAction` wrapper that catches and routes to an error state.
- **Child workflow crash isolation**: One child throwing shouldn't tear down the parent.

### 1.4 Bundle Size Audit
- **Target: core <3kB gzipped** (currently ~4.7kB). Tree-shake `devtools`, `interceptors`, `persist` into separate entry points so you only pay for what you use.
- Audit `WorkerManager` — `Map` + `AbortController` polyfills may be bloating.

---

## Phase 2: Performance (v0.3.x)

> **Note on memoization:** With React Compiler now handling automatic memoization, we no longer need manual selectors or `useWorkflow` memoization. The compiler will optimize re-renders automatically.

### 2.1 Concurrent React Safety
- Verify `useSyncExternalStore` usage handles React 18+ concurrent features correctly.
- Add `useTransition` support: `startTransition(() => runtime.send(action))` should work without tearing.
- **Zombie child safety**: Already handled? Audit and document.

### 2.2 Worker Batching
- Batch worker outputs that arrive in the same microtask into a single state transition + re-render.
- Add `requestAnimationFrame`-based render throttling option for high-frequency workers (e.g., animation, WebSocket).

---

## Phase 3: Ecosystem & Middleware (v0.4.x)

### 3.1 Middleware System (like Zustand)
Standardize interceptor patterns into a middleware API:

```ts
const workflow = createStatefulWorkflow({
  middleware: [
    loggerMiddleware(),
    persistMiddleware({ storage: localStorage }),
    immerMiddleware(), // allow mutable updates in actions
  ],
})
```

### 3.2 Immer Integration
- Optional `produce`-based actions: `ctx.actionSink.send(draft => { draft.count++ })` instead of immutable spreads.
- This is the #1 complaint from developers switching from Zustand — they miss mutability.

### 3.3 DevTools Ecosystem
- **Redux DevTools Extension**: Wire `createDevTools` to the Redux DevTools browser extension. This gives time-travel, action logging, and state inspection for free.
- **Stately Inspector**: XState's visual editor is a massive moat. Build a simple web-based inspector that reads DevTools events and draws state transition graphs.
- **VS Code Extension**: Syntax highlighting for workflow files, jump-to-state definition, inline rendering preview.

### 3.4 CLI Tooling
- `npx workflow-ts inspect <file>` — runs a workflow in a terminal UI, lets you send actions and see state/rendering.
- `npx workflow-ts generate <name>` — scaffolding for new workflows with full type boilerplate.

---

## Phase 4: Visualization & Tooling (v0.5.x)

### 4.1 State Machine Visualization
- Export a JSON format compatible with [Stately Editor](https://stately.ai/editor) or build a custom lightweight visualizer.
- Generate Mermaid diagrams from workflow definitions:
  ```ts
  generateMermaid(workflow) // → string for README embedding
  ```

---

## Phase 5: Framework Bindings (v0.6.x)

### 5.1 Vue Integration (`@workflow-ts/vue`)
- `useWorkflow()` composable mirroring the React API.
- Vue's reactivity system actually maps well to workflow-ts — `watch(workflow.rendering, ...)`.

### 5.2 Svelte Integration (`@workflow-ts/svelte`)
- Svelte store-compatible wrapper: `$rendering` auto-subscribes.

### 5.3 Solid Integration (`@workflow-ts/solid`)
- Solid's fine-grained reactivity + selectors = extremely performant.

### 5.4 Vanilla / Node.js
- Better standalone runtime API for backend use cases (state machine APIs, job orchestration).
- WebSocket worker helpers.

---

## Phase 6: Testing & Quality (v0.7.x)

### 6.1 Test Utilities Package (`@workflow-ts/testing`)
- `createTestRuntime(workflow, { initialState, clock: fakeTimers })`
- `expect(runtime).toTransitionTo('loaded')` — custom jest/vitest matchers.
- `workerMock` — control worker resolution order in tests.
- Snapshot testing for renderings.

### 6.2 Model-Based Testing (vs. XState)
- Given a workflow definition, generate all valid state paths and verify no crashes.
- Property: "From any state, any action either transitions validly or is a no-op."

---

## Phase 7: Documentation & Adoption (v0.8.x → v1.0)

### 7.1 Example Gallery
Build 10+ real-world examples:
- **E-commerce cart** (persistence, optimistic updates)
- **Multi-step form wizard** (validation, back/forward, draft saving)
- **Real-time chat** (WebSocket workers, presence, typing indicators)
- **Infinite scroll** (pagination workers, error retry)
- **Authentication flow** (OAuth, token refresh, session expiry)
- **Kanban board** (drag-and-drop, optimistic updates)
- **Search with debounce** (already have counter/profile)

### 7.2 Benchmarks
- Publish performance benchmarks vs. Zustand, XState, Redux, Jotai:
  - Render throughput (actions/sec)
  - Memory usage (10k workflows)
  - Bundle size comparison
  - Type-checking speed

### 7.3 Migration Guides
- "Migrating from Zustand" — show how `create()` maps to `createStatefulWorkflow()`
- "Migrating from XState" — show how `createMachine()` maps to functions
- "Migrating from Redux" — show how reducers map to actions

### 7.4 Marketing Site
- `workflow-ts.dev` with interactive examples (StackBlitz/CodeSandbox embeds)
- Comparison page: workflow-ts vs. Zustand vs. XState (honest — don't trash competitors, show tradeoffs)

---

## Phase 8: Post-v1.0 (Future)

- **Server Components**: `useWorkflow` that works in React Server Components (serialization boundary).
- **Edge runtime**: Cloudflare Workers / Deno support (audit `AbortController`, `fetch`, etc.).
- **Collaborative state**: CRDT-based state merging for multi-user workflows (Yjs integration).
- **AI code generation**: Fine-tuned model that generates workflow-ts code from natural language descriptions.

---

## Priority Order (What to Build First)

| Priority | Feature | Why |
|----------|---------|-----|
| **P0** | Redux DevTools integration | Free debugging UX, ecosystem compatibility |
| **P0** | Test utilities package | Makes adoption easier, catches regressions |
| **P1** | Immer middleware | #1 developer friction point vs. Zustand |
| **P1** | Vue/Svelte bindings | Expand addressable market |
| **P2** | Visual inspector / Mermaid gen | XState's moat — need a lightweight answer |
| **P2** | CLI tooling | Developer ergonomics, scaffolding |
| **P3** | Model-based testing | Quality/reliability differentiator |
| **P3** | Benchmarks + marketing site | Adoption velocity |

---

## Competitive Positioning

| | Zustand | XState | **workflow-ts** |
|---|---|---|---|
| **Boilerplate** | Minimal | High (config) | **Medium (functions)** |
| **Type safety** | Good | Excellent | **Excellent** |
| **Visual editor** | ❌ | ✅ Stately | **❌ (Phase 2)** |
| **Async handling** | Manual | Services | **Workers (built-in)** |
| **Bundle size** | ~1kB | ~15kB | **~4.7kB (target: 3kB)** |
| **Learning curve** | Low | High | **Medium** |
| **Composability** | Hooks | Actors | **Child workflows** |
| **DevTools** | Basic | Excellent | **Good + time travel** |

**The pitch**: *"Zustand gives you freedom. XState gives you visual tools. workflow-ts gives you guardrails without the config tax."*