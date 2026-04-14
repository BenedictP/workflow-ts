import type { PersistErrorContext, PersistStorage, Workflow } from '@workflow-ts/core';
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

export type PersistPhase = 'idle' | 'rehydrating' | 'ready' | 'error';

export interface PersistState {
  readonly phase: PersistPhase;
  readonly error?: unknown;
  readonly lastRehydratedAt?: number;
  readonly lastPersistedAt?: number;
  readonly isHydrated: boolean;
}

interface PersistenceStore {
  readonly getSnapshot: () => PersistState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setSnapshot: (next: PersistState) => void;
  readonly replaceSnapshot: (next: PersistState) => void;
}

const createPersistenceStore = (): PersistenceStore => {
  let snapshot: PersistState = { phase: 'idle', isHydrated: false };
  const listeners = new Set<() => void>();

  return {
    getSnapshot: (): PersistState => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSnapshot: (next: PersistState): void => {
      snapshot = next;
      listeners.forEach((listener) => {
        listener();
      });
    },
    replaceSnapshot: (next: PersistState): void => {
      snapshot = next;
    },
  };
};

export interface ReactPersistConfig<P, S, O, R> {
  readonly storage: PersistStorage;
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
  readonly persistence: PersistState;
}

const resolvePersistKey = <P>(resolver: PersistKeyResolver<P>, props: P): string => {
  return typeof resolver === 'function' ? resolver(props) : resolver;
};

const isServerLikeEnvironment = (): boolean => {
  return typeof window === 'undefined';
};

const isPromiseLike = <T>(value: unknown): value is Promise<T> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as { readonly then?: unknown }).then === 'function';
};

const getSafeStorage = (
  storage: PersistStorage,
  serverFallbackRef: { current: PersistStorage | null },
): PersistStorage => {
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

  const persistenceStoreRef = useRef<PersistenceStore | null>(null);
  if (persistenceStoreRef.current === null) {
    persistenceStoreRef.current = createPersistenceStore();
  }
  const persistenceStore = persistenceStoreRef.current;
  const isCreatingRuntimeRef = useRef(false);

  const persist = options.persist;

  const onPersistRef = useRef(persist.onPersist);
  onPersistRef.current = persist.onPersist;

  const onRehydrateRef = useRef(persist.onRehydrate);
  onRehydrateRef.current = persist.onRehydrate;

  const onErrorRef = useRef(persist.onError);
  onErrorRef.current = persist.onError;

  const serverFallbackStorageRef = useRef<PersistStorage | null>(null);
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
        persistenceStore.replaceSnapshot({ phase: 'idle', isHydrated: false });
      } else {
        persistenceStore.replaceSnapshot({ phase: 'rehydrating', isHydrated: false });
      }
      const publishPersistenceState = (next: PersistState): void => {
        if (isCreatingRuntimeRef.current) {
          persistenceStore.replaceSnapshot(next);
          return;
        }
        persistenceStore.setSnapshot(next);
      };
      const markRehydratedWithoutSnapshot = (): void => {
        const current = persistenceStore.getSnapshot();
        if (current.phase !== 'rehydrating') {
          return;
        }
        publishPersistenceState({
          ...current,
          phase: 'ready',
          error: undefined,
          isHydrated: true,
          lastRehydratedAt: Date.now(),
        });
      };
      const trackedStorage: PersistStorage = {
        getItem: (key: string): string | null | Promise<string | null> => {
          const value = effectiveStorage.getItem(key);

          if (rehydrateMode === 'lazy') {
            if (isPromiseLike<string | null>(value)) {
              void value
                .then((resolvedValue) => {
                  if (resolvedValue === null) {
                    markRehydratedWithoutSnapshot();
                  }
                })
                .catch(() => undefined);
            } else if (value === null) {
              markRehydratedWithoutSnapshot();
            }
          }

          return value;
        },
        setItem: (key: string, value: string): void | Promise<void> => {
          return effectiveStorage.setItem(key, value);
        },
        removeItem: (key: string): void | Promise<void> => {
          return effectiveStorage.removeItem(key);
        },
      };

      isCreatingRuntimeRef.current = true;
      try {
        const runtime = createPersistedRuntime(workflowToRun, runtimeProps, {
          storage: trackedStorage,
          key: resolvedKey,
          version: persist.version,
          rehydrate: rehydrateMode,
          writeDebounceMs: persist.writeDebounceMs,
          serialize: persist.serialize,
          deserialize: persist.deserialize,
          migrate: persist.migrate,
          onOutput: runtimeOnOutput,
          onPersist: (snapshot: string) => {
            const current = persistenceStore.getSnapshot();
            publishPersistenceState({
              ...current,
              lastPersistedAt: Date.now(),
            });
            onPersistRef.current?.(snapshot);
          },
          onRehydrate: (snapshot: string) => {
            const current = persistenceStore.getSnapshot();
            publishPersistenceState({
              ...current,
              phase: 'ready',
              error: undefined,
              isHydrated: true,
              lastRehydratedAt: Date.now(),
            });
            onRehydrateRef.current?.(snapshot);
          },
          onError: (error: unknown, context: PersistErrorContext) => {
            if (context.phase === 'rehydrate') {
              const current = persistenceStore.getSnapshot();
              publishPersistenceState({
                ...current,
                phase: 'error',
                error,
                isHydrated: false,
              });
            }
            onErrorRef.current?.(error, context);
          },
        });

        return runtime;
      } finally {
        isCreatingRuntimeRef.current = false;
      }
    },
    [
      effectiveStorage,
      persistenceStore,
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

  const persistenceSnapshot = useSyncExternalStore(
    persistenceStore.subscribe,
    persistenceStore.getSnapshot,
    persistenceStore.getSnapshot,
  );

  return {
    ...workflowSnapshot,
    persistence: persistenceSnapshot,
  };
}
