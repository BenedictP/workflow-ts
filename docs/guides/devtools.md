# DevTools

`@workflow-ts/core` includes runtime DevTools for event inspection and state-history tracking.

## Quick start

```ts
import { createDevTools, createRuntime, named, type DevToolsEvent } from '@workflow-ts/core';

const devTools = createDevTools<State, Output, Rendering>();
const runtime = createRuntime(workflow, props, { devTools });

const unsubscribe = devTools.subscribe((event: DevToolsEvent<State, Output, Rendering>) => {
  console.log(`[devtools] ${event.type}`, {
    at: new Date(event.timestamp).toISOString(),
    actionName: event.actionName,
    durationMs: event.durationMs,
    state: event.state,
    output: event.output,
    error: event.error?.message,
  });
});

// Later, stop listening.
unsubscribe();
runtime.dispose();
```

## Runtime events

Current runtime integration emits these events:

- `init`: logged once when a runtime is created.
- `props:update`: logged by `updateProps(...)` when props are considered changed.
- `render`: logged before `workflow.render(...)`.
- `render:complete`: logged after render with `rendering` and `durationMs`.
- `action:send`: logged before action execution.
- `action:complete`: logged after action execution with `durationMs`.
- `action:error`: logged when an action throws.
- `stateChange`: logged when state changes (from action result or `onPropsChanged`).
- `output`: logged when an action emits output.
- `worker:start`, `worker:complete`, `worker:abort`: defined in `DevToolsEventType` but **not yet emitted** by the runtime integration.

Event details:

- `timestamp` is auto-populated for every logged event.
- `actionName` is included for actions wrapped with `named(...)`.
- `state` is included on most runtime-emitted events.

## DevTools API

- Enable/disable: `isEnabled()` and `setEnabled(enabled)`.
- Event stream: `subscribe(handler)` and `getEvents()`.
- Current snapshot: `getState()` returns `{ currentState, events }`.
- Time-travel history: `getHistory()`, `jumpTo(index)`, `undo()`, `redo()`, `canUndo()`, `canRedo()`. Note: `jumpTo`, `undo`, and `redo` return `DevToolsSnapshot` values only — they do not mutate runtime state or rewind/cancel workers.
- Persistence: `serialize()` and `deserialize(data)`.
- Maintenance: `clear()` (events only) and `reset()` (events, history, index, current state).

Options note: `enableTiming`, `autoPause`, and `latencyThreshold` exist in `DevToolsOptions` but are **not yet enforced** by runtime/devtools logic.

Behavior notes:

- `maxEvents` defaults to `1000`; oldest events are dropped when the buffer limit is reached.
- `setEnabled(false)` stops logging and subscriber notifications until re-enabled.
