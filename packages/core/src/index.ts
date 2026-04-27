// ============================================================
// @workflow-ts/core
// A TypeScript implementation of Square's Workflow architecture
// ============================================================

// Types
export type {
  Action,
  ActionResult,
  NoOutput,
  NoProps,
  Observable,
  Output,
  Props,
  RenderContext,
  Rendering,
  Sink,
  State,
  Subscription,
  Worker,
  Workflow,
} from './types';

// Runtime
export {
  WorkflowRuntime,
  createRuntime,
  type RuntimeConfig,
  type RuntimeEffectMode,
  type PropsComparator,
  type DebugLogger,
  type LogLevel,
} from './runtime';

// Actions
export { action, compose, emit, named, noChange, safeAction } from './action';

// Workflow builder
export { createStatefulWorkflow, type StatefulWorkflowConfig } from './workflowBuilder';

// Child output helpers
export { routeChildOutput, type ChildOutputHandlers } from './child';

// Result helpers
export { matchResult, type Result, type ResultHandlers } from './result';

// Workers
export { createWorker, debounceWorker, fetchWorker, fromPromise, WorkerManager } from './worker';

// Snapshot utilities
export { jsonSnapshot, SnapshotParseError, type Snapshotable, versionedSnapshot } from './snapshot';

// Persistence
export {
  createPersistedRuntime,
  createPersistedRuntimeAsync,
  type PersistConfig,
  type PersistDeserializer,
  type PersistEnvelope,
  type PersistErrorContext,
  type PersistMigrate,
  type PersistRehydrateMode,
  type PersistSerializer,
} from './persistRuntime';
export {
  localStorageStorage,
  memoryStorage,
  sessionStorageStorage,
  type PersistStorage,
  type SyncStorage,
  type AsyncStorage,
} from './persistStorage';

// Interceptors
export {
  createInterceptor,
  loggingInterceptor,
  debugInterceptor,
  composeInterceptors,
  type ActionStateChange,
  type PropsChangedStateChange,
  type Interceptor,
  type InterceptorConfig,
  type InterceptorContext,
  type InterceptorStateChange,
  type InterceptorStateChangeReason,
  type InterceptorLogger,
  type LoggingInterceptorOptions,
  type DebugInterceptorOptions,
} from './interceptor';

// DevTools
export {
  createDevTools,
  type DevTools,
  type DevToolsEvent,
  type DevToolsEventType,
  type DevToolsOptions,
  type DevToolsSnapshot,
} from './devtools';
