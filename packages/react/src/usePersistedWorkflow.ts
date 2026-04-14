import type { PersistErrorContext, SyncStorage, Workflow } from '@workflow-ts/core';
import { createPersistedRuntime, memoryStorage, WorkflowRuntime } from '@workflow-ts/core';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  createPropsSnapshot,
  useManagedWorkflowRuntime,
  type AllowedProp,
  type WorkflowRuntimeOptions,
} from './internal/managedRuntime';
import type { UseWorkflowResult } from './useWorkflow';

export type PersistKeyResolver<P> = string | ((props: P) => string);

export type PersistHydrationStatus = 'idle' | 'rehydrating' | 'hydrated' | 'error';

export interface PersistHydrationState {
  readonly status: PersistHydrationStatus;
  readonly error?: unknown;
  readonly rehydratedAt?: number;
}

interface HydrationStore {
  readonly getSnapshot: () => PersistHydrationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setSnapshot: (next: PersistHydrationState) => void;
  readonly replaceSnapshot: (next: PersistHydrationState) => void;
}

const createHydrationStore = (): HydrationStore => {
  let snapshot: PersistHydrationState = { status: 'idle' };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: (): PersistHydrationState => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSnapshot: (next: PersistHydrationState): void => {
      snapshot = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
    replaceSnapshot: (next: PersistHydrationState): void => {
      snapshot = next;
    },
  };
};

export interface ReactPersistConfig<P, S, O, R> {
  readonly storage: SyncStorage;
  readonly key: PersistKeyResolver<P>;
  readonly version: number;
  readonly rehydrate?: 'none' | 'lazy';
  readonly writeDebounceMs?: number;
  readonly serialize: (state: S) => string;
  readonly deserialize: (raw: string, props: P) => S;
  readonly migrate?: (raw: string, fromVersion: number, toVersion: number) => string;
  readonly onPersist?: (snapshot: string) => void;
  readonly onRehydrate?: (snapshot: string) => void;
  readonly onError?: (error: unknown, context: PersistErrorContext) => void;
}

export interface UsePersistedWorkflowOptions<
  P extends AllowedProp,
  S,
  O,
  R,
> extends WorkflowRuntimeOptions<O> {
  readonly props: P;
  readonly onOutput?: (output: O) => void;
  readonly persist: ReactPersistConfig<P, S, O, R>;
}

export interface UsePersistedWorkflowResult<P extends AllowedProp, S, R> extends UseWorkflowResult<
  P,
  S,
  R
> {
  readonly hydration: PersistHydrationState;
}

const resolvePersistKey = <P>(resolver: PersistKeyResolver<P>, props: P): string => {
  return typeof resolver === 'function' ? resolver(props) : resolver;
};

const isServerLikeEnvironment = (): boolean => {
  return typeof window === 'undefined';
};

const getSafeStorage = (
  storage: SyncStorage,
  serverFallbackRef: { current: SyncStorage | null },
): SyncStorage => {
  if (!isServerLikeEnvironment()) {
    return storage;
  }

  serverFallbackRef.current ??= memoryStorage();
  return serverFallbackRef.current;
};

export function usePersistedWorkflow<P extends AllowedProp, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  options: UsePersistedWorkflowOptions<P, S, O, R>,
): UsePersistedWorkflowResult<P, S, R> {
  const runtimeRef = useRef<WorkflowRuntime<P, S, O, R> | null>(null);
  const lastSnapshotRef = useRef<UseWorkflowResult<P, S, R> | null>(null);
  const lastSnapshotStringRef = useRef<string | undefined>(undefined);
  const shouldBeActiveRef = useRef(true);

  const hydrationStoreRef = useRef<HydrationStore | null>(null);
  if (hydrationStoreRef.current === null) {
    hydrationStoreRef.current = createHydrationStore();
  }
  const hydrationStore = hydrationStoreRef.current;
  const isCreatingRuntimeRef = useRef(false);

  const persist = options.persist;

  const onPersistRef = useRef(persist.onPersist);
  onPersistRef.current = persist.onPersist;

  const onRehydrateRef = useRef(persist.onRehydrate);
  onRehydrateRef.current = persist.onRehydrate;

  const onErrorRef = useRef(persist.onError);
  onErrorRef.current = persist.onError;

  const serverFallbackStorageRef = useRef<SyncStorage | null>(null);
  const effectiveStorage = getSafeStorage(persist.storage, serverFallbackStorageRef);

  const resolvedKey = resolvePersistKey(persist.key, options.props);
  if (resolvedKey.trim().length === 0) {
    throw new Error('Persist config "key" must be a non-empty string');
  }

  const runtimeIdentity = useMemo(
    () => ({
      key: resolvedKey,
      version: persist.version,
      rehydrate: persist.rehydrate ?? 'lazy',
      writeDebounceMs: persist.writeDebounceMs,
    }),
    [resolvedKey, persist.version, persist.rehydrate, persist.writeDebounceMs],
  );

  const createRuntimeWithPersistence = useCallback(
    (
      workflowToRun: Workflow<P, S, O, R>,
      runtimeProps: P,
      runtimeOnOutput: (output: O) => void,
    ): WorkflowRuntime<P, S, O, R> => {
      const rehydrateMode = persist.rehydrate ?? 'lazy';
      if (rehydrateMode === 'none') {
        hydrationStore.replaceSnapshot({ status: 'idle' });
      } else {
        hydrationStore.replaceSnapshot({ status: 'rehydrating' });
      }
      const publishHydrationState = (next: PersistHydrationState): void => {
        if (isCreatingRuntimeRef.current) {
          hydrationStore.replaceSnapshot(next);
          return;
        }
        hydrationStore.setSnapshot(next);
      };

      isCreatingRuntimeRef.current = true;
      try {
        const runtime = createPersistedRuntime(workflowToRun, runtimeProps, {
          storage: effectiveStorage,
          key: resolvedKey,
          version: persist.version,
          rehydrate: rehydrateMode,
          writeDebounceMs: persist.writeDebounceMs,
          serialize: persist.serialize,
          deserialize: persist.deserialize,
          migrate: persist.migrate,
          onOutput: runtimeOnOutput,
          onPersist: (snapshot: string) => {
            onPersistRef.current?.(snapshot);
          },
          onRehydrate: (snapshot: string) => {
            publishHydrationState({
              status: 'hydrated',
              rehydratedAt: Date.now(),
            });
            onRehydrateRef.current?.(snapshot);
          },
          onError: (error: unknown, context: PersistErrorContext) => {
            if (context.phase === 'rehydrate') {
              publishHydrationState({
                status: 'error',
                error,
              });
            }
            onErrorRef.current?.(error, context);
          },
        });

        if (rehydrateMode !== 'none' && hydrationStore.getSnapshot().status === 'rehydrating') {
          hydrationStore.replaceSnapshot({
            status: 'hydrated',
            rehydratedAt: Date.now(),
          });
        }

        return runtime;
      } finally {
        isCreatingRuntimeRef.current = false;
      }
    },
    [
      effectiveStorage,
      hydrationStore,
      persist.deserialize,
      persist.migrate,
      persist.rehydrate,
      persist.serialize,
      persist.version,
      persist.writeDebounceMs,
      resolvedKey,
    ],
  );

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
    [safeSnapshot, safeUpdateProps],
  );

  const storeRuntimeState = useCallback(
    (runtimeToStore: WorkflowRuntime<P, S, O, R>): void => {
      const rendering = runtimeToStore.getRendering();
      const state = runtimeToStore.getState();
      const props = runtimeToStore.getProps();
      lastSnapshotRef.current = createResultSnapshot(rendering, state, props);
      lastSnapshotStringRef.current = runtimeToStore.snapshot();
    },
    [createResultSnapshot],
  );

  const { runtime, shouldBeActive } = useManagedWorkflowRuntime({
    workflow,
    props: options.props,
    runtimeIdentity,
    createRuntime: createRuntimeWithPersistence,
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

  const getWorkflowSnapshot = useCallback(() => {
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

  const subscribeWorkflow = useCallback(
    (listener: () => void) => {
      if (!shouldBeActive || runtime === null || runtime.isDisposed()) {
        return () => undefined;
      }
      return runtime.subscribe(listener);
    },
    [runtime, shouldBeActive],
  );

  const workflowSnapshot = useSyncExternalStore(
    subscribeWorkflow,
    getWorkflowSnapshot,
    getWorkflowSnapshot,
  );

  const hydrationSnapshot = useSyncExternalStore(
    hydrationStore.subscribe,
    hydrationStore.getSnapshot,
    hydrationStore.getSnapshot,
  );

  return {
    ...workflowSnapshot,
    hydration: hydrationSnapshot,
  };
}
