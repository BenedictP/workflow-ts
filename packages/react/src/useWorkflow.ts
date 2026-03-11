import type { Workflow } from '@workflow-ts/core';
import { createRuntime, WorkflowRuntime } from '@workflow-ts/core';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

type RuntimeLifecycleMode = 'always-on' | 'pause-when-backgrounded';

export type AllowedPropPrimitive = string | number | boolean | bigint | symbol | null | undefined;
export type AllowedTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;
export type AllowedProp =
  | AllowedPropPrimitive
  | ((...args: readonly unknown[]) => unknown)
  | Date
  | Map<AllowedProp, AllowedProp>
  | Set<AllowedProp>
  | ArrayBuffer
  | DataView
  | AllowedTypedArray
  | readonly AllowedProp[]
  | {
      readonly [key: string]: AllowedProp;
      readonly [key: symbol]: AllowedProp;
    };

const isObjectLike = (value: unknown): value is Record<string | symbol, unknown> => {
  return typeof value === 'object' && value !== null;
};

interface PropsSnapshot {
  readonly comparable: unknown;
  readonly runtimeValue: unknown;
}

interface PropsValidationEnvironment {
  readonly reactNativeDev: unknown;
  readonly nodeEnv: unknown;
  readonly viteDev: unknown;
  readonly viteProd: unknown;
  readonly viteMode: unknown;
}

type OutputHandlers<O> = {
  [K in O extends { type: string } ? O['type'] : never]?: (output: Extract<O, { type: K }>) => void;
};

const comparableAccessorTag = Symbol('workflowComparableAccessor');
const allowedPropsDescription =
  'primitives, functions, Array, plain object, Date, Map, Set, ArrayBuffer, DataView, TypedArray';

/**
 * Internal helper: resolve whether runtime props validation should run from env signals.
 */
export const resolveShouldValidateProps = (env: PropsValidationEnvironment): boolean => {
  if (typeof env.reactNativeDev === 'boolean') return env.reactNativeDev;

  if (typeof env.nodeEnv === 'string') return env.nodeEnv !== 'production';

  if (typeof env.viteDev === 'boolean') return env.viteDev;
  if (typeof env.viteProd === 'boolean') return !env.viteProd;
  if (typeof env.viteMode === 'string') return env.viteMode !== 'production';

  return false;
};

const shouldValidateProps = (): boolean => {
  const importMeta = import.meta as ImportMeta & {
    readonly env?: {
      readonly DEV?: unknown;
      readonly PROD?: unknown;
      readonly MODE?: unknown;
    };
  };
  // Prefer explicit runtime signals and default to false when environment is unknown.
  return resolveShouldValidateProps({
    reactNativeDev: (globalThis as { readonly __DEV__?: unknown }).__DEV__,
    nodeEnv: typeof process === 'undefined' ? undefined : process.env['NODE_ENV'],
    viteDev: importMeta.env?.DEV,
    viteProd: importMeta.env?.PROD,
    viteMode: importMeta.env?.MODE,
  });
};

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

const getTypeName = (value: object): string => {
  const constructor = (value as { readonly constructor?: { readonly name?: unknown } }).constructor;
  const name = constructor?.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }
  return Object.prototype.toString.call(value);
};

const formatPropPath = (base: string, key: PropertyKey): string => {
  if (typeof key === 'string') {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
      return `${base}.${key}`;
    }
    return `${base}[${JSON.stringify(key)}]`;
  }
  return `${base}[${String(key)}]`;
};

const throwUnsupportedPropsError = (path: string, value: unknown): never => {
  const typeLabel = isObjectLike(value) ? getTypeName(value) : typeof value;
  throw new TypeError(
    `Unsupported workflow props at "${path}": ${typeLabel}. Allowed: ${allowedPropsDescription}.`,
  );
};

const assertSupportedProps = (value: unknown, path = 'props', seen = new WeakSet()): void => {
  if (value === null || value === undefined) return;
  if (typeof value === 'function') return;
  if (!isObjectLike(value)) return;
  if (seen.has(value)) return;
  seen.add(value);

  if (value instanceof Promise || value instanceof WeakMap || value instanceof WeakSet) {
    throwUnsupportedPropsError(path, value);
  }

  if (value instanceof Date) return;

  if (value instanceof Map) {
    let index = 0;
    for (const [mapKey, mapValue] of value.entries()) {
      assertSupportedProps(mapKey, `${path}.<mapKey:${index}>`, seen);
      assertSupportedProps(mapValue, `${path}.<mapValue:${index}>`, seen);
      index += 1;
    }
    return;
  }

  if (value instanceof Set) {
    let index = 0;
    for (const setValue of value.values()) {
      assertSupportedProps(setValue, `${path}.<setValue:${index}>`, seen);
      index += 1;
    }
    return;
  }

  if (ArrayBuffer.isView(value)) return;
  if (value instanceof ArrayBuffer) return;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertSupportedProps(value[index], `${path}[${index}]`, seen);
    }
    return;
  }

  if (!isPlainObject(value)) {
    throwUnsupportedPropsError(path, value);
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) continue;
    assertSupportedProps(descriptor.value, formatPropPath(path, key), seen);
  }
};

type CloneMode = 'runtime' | 'comparable';

const cloneValue = (value: unknown, mode: CloneMode, seen = new WeakMap<object, unknown>()): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'function') return value;
  if (!isObjectLike(value)) return value;
  if (seen.has(value)) return seen.get(value);

  if (value instanceof Date) return new Date(value.getTime());

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value) {
      clone.push(cloneValue(item, mode, seen));
    }
    return clone;
  }

  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(value, clone);
    for (const [key, mapValue] of value.entries()) {
      clone.set(cloneValue(key, mode, seen), cloneValue(mapValue, mode, seen));
    }
    return clone;
  }

  if (value instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(value, clone);
    for (const setValue of value.values()) {
      clone.add(cloneValue(setValue, mode, seen));
    }
    return clone;
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      const cloneBuffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return new DataView(cloneBuffer);
    }
    return new (value.constructor as new (input: ArrayBufferView) => unknown)(value);
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (!isPlainObject(value)) {
    seen.set(value, value);
    return value;
  }

  if (mode === 'runtime') {
    const prototype = Object.getPrototypeOf(value) as object | null;
    const clone = Object.create(prototype) as Record<string | symbol, unknown>;
    seen.set(value, clone);

    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if ('value' in descriptor) {
        descriptor.value = cloneValue(descriptor.value, mode, seen);
      }
      Object.defineProperty(clone, key, descriptor);
    }

    return clone;
  }

  const clone = Object.create(null) as Record<PropertyKey, unknown>;
  seen.set(value, clone);

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;

    if ('value' in descriptor) {
      clone[key] = cloneValue(descriptor.value, mode, seen);
      continue;
    }

    clone[key] = {
      [comparableAccessorTag]: true,
      hasGetter: descriptor.get !== undefined,
      hasSetter: descriptor.set !== undefined,
    };
  }

  return clone;
};

const cloneRuntimeValue = (value: unknown): unknown => cloneValue(value, 'runtime');

const cloneComparableValue = (value: unknown): unknown => cloneValue(value, 'comparable');

interface DeepEqualContext {
  readonly seen: WeakMap<object, object>;
  readonly seenPairs: (readonly [object, object])[];
}

const createDeepEqualContext = (): DeepEqualContext => ({
  seen: new WeakMap<object, object>(),
  seenPairs: [],
});

const createDeepEqualCheckpoint = (context: DeepEqualContext): number => context.seenPairs.length;

const rollbackDeepEqualContext = (context: DeepEqualContext, checkpoint: number): void => {
  while (context.seenPairs.length > checkpoint) {
    const pair = context.seenPairs.pop();
    if (!pair) continue;
    const [source] = pair;
    context.seen.delete(source);
  }
};

const isDirectlyComparableSetValue = (value: unknown): boolean => {
  return value === null || value === undefined || typeof value === 'function' || !isObjectLike(value);
};

const deepEqual = (a: unknown, b: unknown, context = createDeepEqualContext()): boolean => {
  if (Object.is(a, b)) return true;
  if (!isObjectLike(a) || !isObjectLike(b)) return false;
  if (a instanceof WeakMap || b instanceof WeakMap || a instanceof WeakSet || b instanceof WeakSet) {
    return false;
  }

  const seenTarget = context.seen.get(a);
  if (seenTarget !== undefined) {
    return seenTarget === b;
  }
  context.seen.set(a, b);
  context.seenPairs.push([a, b]);

  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp || b instanceof RegExp) {
    if (!(a instanceof RegExp) || !(b instanceof RegExp)) return false;
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map)) return false;
    if (a.size !== b.size) return false;

    const bEntries = [...b.entries()];
    let index = 0;
    for (const [aKey, aValue] of a.entries()) {
      const [bKey, bValue] = bEntries[index] ?? [];
      if (!deepEqual(aKey, bKey, context)) return false;
      if (!deepEqual(aValue, bValue, context)) return false;
      index += 1;
    }
    return true;
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;

    const aStructuralValues: unknown[] = [];
    const bStructuralValues: unknown[] = [];

    for (const bValue of b.values()) {
      if (isDirectlyComparableSetValue(bValue)) continue;
      bStructuralValues.push(bValue);
    }

    for (const aValue of a.values()) {
      if (isDirectlyComparableSetValue(aValue)) {
        if (!b.has(aValue)) return false;
        continue;
      }

      aStructuralValues.push(aValue);
    }

    if (aStructuralValues.length !== bStructuralValues.length) return false;
    if (aStructuralValues.length === 0) return true;

    const matchedStructuralValues = new Array<boolean>(bStructuralValues.length).fill(false);
    for (const aValue of aStructuralValues) {
      let matchedIndex = -1;
      for (let i = 0; i < bStructuralValues.length; i += 1) {
        if (matchedStructuralValues[i] === true) continue;
        const checkpoint = createDeepEqualCheckpoint(context);
        const matches = deepEqual(aValue, bStructuralValues[i], context);
        rollbackDeepEqualContext(context, checkpoint);
        if (!matches) continue;
        matchedIndex = i;
        break;
      }
      if (matchedIndex === -1) return false;
      matchedStructuralValues[matchedIndex] = true;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i], context)) return false;
    }
    return true;
  }

  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return false;
    if (a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    const aBytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const bBytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < aBytes.length; i += 1) {
      if (aBytes[i] !== bBytes[i]) return false;
    }
    return true;
  }

  if (a instanceof ArrayBuffer || b instanceof ArrayBuffer) {
    if (!(a instanceof ArrayBuffer) || !(b instanceof ArrayBuffer)) return false;
    if (a.byteLength !== b.byteLength) return false;
    const aBytes = new Uint8Array(a);
    const bBytes = new Uint8Array(b);
    for (let i = 0; i < aBytes.length; i += 1) {
      if (aBytes[i] !== bBytes[i]) return false;
    }
    return true;
  }

  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  const aKeys = Reflect.ownKeys(a);
  const bKeys = Reflect.ownKeys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], context)) return false;
  }

  return true;
};

const createPropsSnapshot = (props: unknown): PropsSnapshot => {
  // Validate first so unsupported non-plain/branded values fail fast with
  // a deterministic error instead of passing unpredictable runtime objects.
  if (shouldValidateProps()) {
    assertSupportedProps(props);
  }
  return {
    comparable: cloneComparableValue(props),
    // Comparison uses a structural snapshot that avoids invoking getters.
    // Runtime values are cloned for supported prop shapes only.
    runtimeValue: cloneRuntimeValue(props),
  };
};

const getUpdatedPropsSnapshot = (snapshot: PropsSnapshot, nextProps: unknown): PropsSnapshot | null => {
  if (shouldValidateProps()) {
    assertSupportedProps(nextProps);
  }
  const nextComparable = cloneComparableValue(nextProps);
  if (deepEqual(snapshot.comparable, nextComparable)) return null;
  return {
    comparable: nextComparable,
    runtimeValue: cloneRuntimeValue(nextProps),
  };
};

interface ManagedRuntimeOptions<P extends AllowedProp, S, O, R> {
  readonly workflow: Workflow<P, S, O, R>;
  readonly props: P;
  readonly onOutput?: (output: O) => void;
  readonly outputHandlers?: OutputHandlers<O>;
  readonly lifecycle?: RuntimeLifecycleMode;
  readonly isActive?: boolean;
  readonly resetOnWorkflowChange?: boolean;
  readonly hasInactiveSnapshot: boolean;
  readonly runtimeRef: {
    current: WorkflowRuntime<P, S, O, R> | null;
  };
  readonly onStoreRuntimeState?: (runtime: WorkflowRuntime<P, S, O, R>) => void;
}

interface ManagedRuntimeResult<P extends AllowedProp, S, O, R> {
  readonly runtime: WorkflowRuntime<P, S, O, R> | null;
  readonly shouldBeActive: boolean;
}

const useManagedWorkflowRuntime = <P extends AllowedProp, S, O, R>(
  options: ManagedRuntimeOptions<P, S, O, R>,
): ManagedRuntimeResult<P, S, O, R> => {
  const onOutputRef = useRef(options.onOutput);
  onOutputRef.current = options.onOutput;

  const outputHandlersRef = useRef(options.outputHandlers);
  outputHandlersRef.current = options.outputHandlers;
  const outputHandlerSubscriptionsRef = useRef(new Map<string, () => void>());

  const onStoreRuntimeStateRef = useRef(options.onStoreRuntimeState);
  onStoreRuntimeStateRef.current = options.onStoreRuntimeState;

  const lastSyncedPropsRef = useRef<PropsSnapshot>(createPropsSnapshot(options.props));
  const pendingDisposalsRef = useRef(new Map<WorkflowRuntime<P, S, O, R>, ReturnType<typeof setTimeout>>());
  const workflowRef = useRef(options.workflow);

  const lifecycle = options.lifecycle ?? 'always-on';
  const shouldBeActive = lifecycle === 'pause-when-backgrounded' ? options.isActive ?? true : true;
  const previousActiveRef = useRef(shouldBeActive);
  const workflowChanged = workflowRef.current !== options.workflow;
  const shouldCreateRuntime =
    shouldBeActive || (options.runtimeRef.current === null && !options.hasInactiveSnapshot);

  // Create a new runtime when needed:
  // 1. First render
  // 2. Previous runtime was disposed (e.g. StrictMode effect replay)
  // 3. Workflow identity changed and resetOnWorkflowChange is enabled
  const needsNewRuntime =
    shouldCreateRuntime &&
    (
      options.runtimeRef.current === null ||
      options.runtimeRef.current.isDisposed() ||
      (options.resetOnWorkflowChange === true && workflowChanged)
    );

  if (needsNewRuntime) {
    const propsSnapshot = createPropsSnapshot(options.props);
    options.runtimeRef.current = createRuntime(
      options.workflow,
      propsSnapshot.runtimeValue as P,
      {
        onOutput: (output: O) => {
          onOutputRef.current?.(output);
        },
      },
    );
    lastSyncedPropsRef.current = propsSnapshot;
  }
  workflowRef.current = options.workflow;

  const runtime = options.runtimeRef.current;
  const scheduleDispose = useCallback((runtimeToDispose: WorkflowRuntime<P, S, O, R>) => {
    if (runtimeToDispose.isDisposed()) return;
    if (pendingDisposalsRef.current.has(runtimeToDispose)) return;

    const timerId = setTimeout(() => {
      pendingDisposalsRef.current.delete(runtimeToDispose);
      if (!runtimeToDispose.isDisposed()) {
        runtimeToDispose.dispose();
      }
      if (options.runtimeRef.current === runtimeToDispose) {
        options.runtimeRef.current = null;
      }
    }, 0);

    pendingDisposalsRef.current.set(runtimeToDispose, timerId);
  }, [options.runtimeRef]);
  const cancelPendingDispose = useCallback((runtimeToKeep: WorkflowRuntime<P, S, O, R>) => {
    const timerId = pendingDisposalsRef.current.get(runtimeToKeep);
    if (timerId === undefined) return;
    clearTimeout(timerId);
    pendingDisposalsRef.current.delete(runtimeToKeep);
  }, []);
  const clearOutputHandlerSubscriptions = useCallback(() => {
    outputHandlerSubscriptionsRef.current.forEach((unsubscribe) => {
      unsubscribe();
    });
    outputHandlerSubscriptionsRef.current.clear();
  }, []);

  // Keep output subscriptions scoped to the active runtime lifecycle.
  useEffect(() => {
    if (runtime === null || runtime.isDisposed() || !shouldBeActive) {
      clearOutputHandlerSubscriptions();
      return;
    }

    return () => {
      clearOutputHandlerSubscriptions();
    };
  }, [runtime, shouldBeActive, clearOutputHandlerSubscriptions]);

  // Register typed output handlers without resubscribing on every object identity change.
  useEffect(() => {
    if (runtime === null || runtime.isDisposed() || !shouldBeActive) {
      clearOutputHandlerSubscriptions();
      return;
    }

    const handlers = options.outputHandlers;
    const subscriptions = outputHandlerSubscriptionsRef.current;
    const nextSubscribedTypes = new Set<string>();

    // Object.entries loses type correlation between key and handler, so we cast.
    // When K is inferred as the full OutputType union, Extract<O, { type: OutputType }>
    // resolves to all of O — every handler appears to accept all variants. This is
    // unavoidable with Object.entries but safe: outputHandlers is typed to only allow
    // valid pairs, and runtime.on only calls each handler with its matching output type.
    type OutputType = O extends { type: string } ? O['type'] : never;
    for (const [type, handler] of Object.entries(handlers ?? {})) {
      if (handler === undefined) continue;
      nextSubscribedTypes.add(type);

      if (subscriptions.has(type)) continue;

      const unsubscribe = runtime.on(
        type as OutputType,
        ((output: Extract<O, { type: OutputType }>) => {
          const latestHandler = outputHandlersRef.current?.[type as OutputType];
          if (latestHandler === undefined) return;
          (
            latestHandler as (output: Extract<O, { type: OutputType }>) => void
          )(output);
        }) as (output: Extract<O, { type: OutputType }>) => void,
      );
      subscriptions.set(type, unsubscribe);
    }

    subscriptions.forEach((unsubscribe, type) => {
      if (nextSubscribedTypes.has(type)) return;
      unsubscribe();
      subscriptions.delete(type);
    });
  }, [runtime, options.outputHandlers, shouldBeActive, clearOutputHandlerSubscriptions]);

  // Dispose this runtime when it is replaced or the component unmounts.
  useEffect(() => {
    if (runtime === null) {
      previousActiveRef.current = shouldBeActive;
      return;
    }

    const wasActive = previousActiveRef.current;
    previousActiveRef.current = shouldBeActive;
    const transitionedToInactive = wasActive && !shouldBeActive;

    if (transitionedToInactive) {
      cancelPendingDispose(runtime);
      if (!runtime.isDisposed()) {
        onStoreRuntimeStateRef.current?.(runtime);
        runtime.dispose();
      }
      if (options.runtimeRef.current === runtime) {
        options.runtimeRef.current = null;
      }
      return;
    }

    if (shouldBeActive) {
      // StrictMode effect replay cleanup schedules disposal. Setup for the same runtime
      // immediately cancels that pending disposal.
      cancelPendingDispose(runtime);
    } else {
      if (!runtime.isDisposed()) {
        onStoreRuntimeStateRef.current?.(runtime);
      }
      scheduleDispose(runtime);
    }

    return () => {
      // If this effect is cleaning up a runtime that has already been replaced,
      // dispose immediately to avoid one-tick stale runtime activity.
      if (options.runtimeRef.current !== runtime) {
        cancelPendingDispose(runtime);
        if (!runtime.isDisposed()) {
          runtime.dispose();
        }
        return;
      }
      scheduleDispose(runtime);
    };
  }, [runtime, shouldBeActive, scheduleDispose, cancelPendingDispose, options.runtimeRef]);

  // Intentionally run after every render so deep mutations in supported prop
  // shapes are detected even when React reference equality is unchanged.
  useEffect(() => {
    if (runtime === null || runtime.isDisposed() || !shouldBeActive) return;
    const propsSnapshot = getUpdatedPropsSnapshot(lastSyncedPropsRef.current, options.props);
    if (propsSnapshot === null) return;
    lastSyncedPropsRef.current = propsSnapshot;
    runtime.updateProps(propsSnapshot.runtimeValue as P);
  });

  return {
    runtime,
    shouldBeActive,
  };
};

/**
 * Hook to use a workflow in a React component.
 *
 * @param workflow - The workflow definition
 * @param props - Props to pass to the workflow
 * @param onOutput - Optional callback for workflow outputs
 * @returns The current rendering
 *
 * @example
 * ```tsx
 * const counter = useWorkflow(counterWorkflow, undefined);
 * return (
 *   <div>
 *     <span>{counter.count}</span>
 *     <button onClick={counter.onIncrement}>+</button>
 *     <button onClick={counter.onDecrement}>-</button>
 *   </div>
 * );
 * ```
 */
interface WorkflowRuntimeOptions<O> {
  /** Runtime lifecycle mode */
  lifecycle?: RuntimeLifecycleMode;
  /** Whether runtime should be active (used with pause-when-backgrounded lifecycle) */
  isActive?: boolean;
  /** Optional handlers for specific output types */
  outputHandlers?: OutputHandlers<O>;
  /** Reset runtime when workflow identity changes (opt-in) */
  resetOnWorkflowChange?: boolean;
}

export type UseWorkflowHookOptions<O> = WorkflowRuntimeOptions<O>;

export function useWorkflow<P extends AllowedProp, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  onOutput?: (output: O) => void,
  options?: UseWorkflowHookOptions<O>,
): R {
  const lastRenderingRef = useRef<R | null>(null);
  const runtimeRef = useRef<WorkflowRuntime<P, S, O, R> | null>(null);
  const storeRuntimeState = useCallback((runtimeToStore: WorkflowRuntime<P, S, O, R>) => {
    lastRenderingRef.current = runtimeToStore.getRendering();
  }, []);
  const { runtime, shouldBeActive } = useManagedWorkflowRuntime({
    workflow,
    props,
    onOutput,
    outputHandlers: options?.outputHandlers,
    lifecycle: options?.lifecycle,
    isActive: options?.isActive,
    resetOnWorkflowChange: options?.resetOnWorkflowChange,
    hasInactiveSnapshot: lastRenderingRef.current !== null,
    runtimeRef,
    onStoreRuntimeState: storeRuntimeState,
  });

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!shouldBeActive || runtime === null || runtime.isDisposed()) {
        return () => undefined;
      }
      return runtime.subscribe(listener);
    },
    [runtime, shouldBeActive]
  );
  const getRenderingSnapshot = useCallback(() => {
    if (shouldBeActive) {
      if (runtime === null || runtime.isDisposed()) {
        throw new Error('Workflow runtime is not available');
      }
      const rendering = runtime.getRendering();
      lastRenderingRef.current = rendering;
      return rendering;
    }

    if (runtime !== null && !runtime.isDisposed()) {
      const rendering = runtime.getRendering();
      lastRenderingRef.current = rendering;
      return rendering;
    }

    if (lastRenderingRef.current !== null) {
      return lastRenderingRef.current;
    }

    throw new Error('Workflow rendering is not available while inactive');
  }, [runtime, shouldBeActive]);

  // Subscribe to rendering changes
  return useSyncExternalStore(subscribe, getRenderingSnapshot, getRenderingSnapshot);
}

/**
 * Hook options for useWorkflowWithState
 */
export interface UseWorkflowOptions<P extends AllowedProp, O> extends WorkflowRuntimeOptions<O> {
  /** Initial props for the workflow */
  props: P;
  /** Callback for workflow outputs */
  onOutput?: (output: O) => void;
}

/**
 * Hook result that includes both rendering and runtime controls
 */
export interface UseWorkflowResult<P extends AllowedProp, S, R> {
  /** Current rendering */
  rendering: R;
  /** Current state (for debugging) */
  state: S;
  /** Current props */
  props: P;
  /** Update props */
  updateProps: (props: P) => void;
  /** Snapshot current state */
  snapshot: () => string | undefined;
}

/**
 * Hook that returns both rendering and runtime controls.
 *
 * @param workflow - The workflow definition
 * @param options - Hook options
 * @returns Rendering and runtime controls
 *
 * @example
 * ```tsx
 * const { rendering, state, updateProps } = useWorkflowWithState(
 *   searchWorkflow,
 *   { props: { query: '' } }
 * );
 *
 * return (
 *   <div>
 *     <input onChange={(e) => updateProps({ query: e.target.value })} />
 *     <ul>{rendering.results.map(r => <li key={r.id}>{r.name}</li>)}</ul>
 *   </div>
 * );
 * ```
 */
export function useWorkflowWithState<P extends AllowedProp, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  options: UseWorkflowOptions<P, O>,
): UseWorkflowResult<P, S, R> {
  const runtimeRef = useRef<WorkflowRuntime<P, S, O, R> | null>(null);
  const lastSnapshotRef = useRef<UseWorkflowResult<P, S, R> | null>(null);
  const lastSnapshotStringRef = useRef<string | undefined>(undefined);
  const shouldBeActiveRef = useRef(true);
  const safeUpdateProps = useCallback((nextProps: P): void => {
    if (!shouldBeActiveRef.current) return;
    const currentRuntime = runtimeRef.current;
    if (currentRuntime === null || currentRuntime.isDisposed()) return;
    const propsSnapshot = createPropsSnapshot(nextProps);
    currentRuntime.updateProps(propsSnapshot.runtimeValue as P);
  }, []);
  const safeSnapshot = useCallback((): string | undefined => {
    const currentRuntime = runtimeRef.current;
    if (currentRuntime !== null && !currentRuntime.isDisposed()) {
      const snapshotValue = currentRuntime.snapshot();
      lastSnapshotStringRef.current = snapshotValue;
      return snapshotValue;
    }
    return lastSnapshotStringRef.current;
  }, []);
  const createResultSnapshot = useCallback(
    (rendering: R, state: S, props: P): UseWorkflowResult<P, S, R> => ({
      rendering,
      state,
      props,
      updateProps: safeUpdateProps,
      snapshot: safeSnapshot,
    }),
    [safeUpdateProps, safeSnapshot],
  );
  const storeRuntimeState = useCallback((runtimeToStore: WorkflowRuntime<P, S, O, R>): void => {
    const rendering = runtimeToStore.getRendering();
    const state = runtimeToStore.getState();
    const props = runtimeToStore.getProps();
    lastSnapshotRef.current = createResultSnapshot(rendering, state, props);
    lastSnapshotStringRef.current = runtimeToStore.snapshot();
  }, [createResultSnapshot]);
  const { runtime, shouldBeActive } = useManagedWorkflowRuntime({
    workflow,
    props: options.props,
    onOutput: options.onOutput,
    outputHandlers: options.outputHandlers,
    lifecycle: options.lifecycle,
    isActive: options.isActive,
    resetOnWorkflowChange: options.resetOnWorkflowChange,
    hasInactiveSnapshot: lastSnapshotRef.current !== null,
    runtimeRef,
    onStoreRuntimeState: storeRuntimeState,
  });
  shouldBeActiveRef.current = shouldBeActive;

  useEffect(() => {
    if (runtime !== null && !runtime.isDisposed()) {
      lastSnapshotRef.current = null;
    }
  }, [runtime]);

  const getSnapshot = useCallback(() => {
    if (!shouldBeActive) {
      if (runtime !== null && !runtime.isDisposed()) {
        const rendering = runtime.getRendering();
        const state = runtime.getState();
        const props = runtime.getProps();
        if (lastSnapshotRef.current !== null) {
          if (
            lastSnapshotRef.current.rendering === rendering &&
            lastSnapshotRef.current.state === state &&
            lastSnapshotRef.current.props === props
          ) {
            return lastSnapshotRef.current;
          }
        }
        const inactiveSnapshot = createResultSnapshot(rendering, state, props);
        lastSnapshotRef.current = inactiveSnapshot;
        lastSnapshotStringRef.current = runtime.snapshot();
        return inactiveSnapshot;
      }

      if (lastSnapshotRef.current !== null) {
        return lastSnapshotRef.current;
      }

      throw new Error('Workflow snapshot is not available while inactive');
    }

    if (runtime === null || runtime.isDisposed()) {
      throw new Error('Workflow runtime is not available');
    }

    const rendering = runtime.getRendering();
    const state = runtime.getState();
    const props = runtime.getProps();

    if (lastSnapshotRef.current !== null) {
      if (
        lastSnapshotRef.current.rendering === rendering &&
        lastSnapshotRef.current.state === state &&
        lastSnapshotRef.current.props === props
      ) {
        return lastSnapshotRef.current;
      }
    }

    lastSnapshotRef.current = createResultSnapshot(rendering, state, props);

    return lastSnapshotRef.current;
  }, [runtime, shouldBeActive, createResultSnapshot]);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!shouldBeActive || runtime === null || runtime.isDisposed()) {
        return () => undefined;
      }
      return runtime.subscribe(listener);
    },
    [runtime, shouldBeActive]
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return snapshot;
}
