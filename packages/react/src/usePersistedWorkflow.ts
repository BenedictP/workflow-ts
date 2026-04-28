import type {
  PersistErrorContext,
  PersistStorage,
  Workflow,
  WorkflowRuntime,
} from '@workflow-ts/core';
import { createPersistedRuntime, memoryStorage } from '@workflow-ts/core';
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

export interface ReactPersistConfig<P, S, _O = unknown, _R = unknown> {
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
  readonly onRehydrateSkipped?: (snapshot: string, reason: 'stateChanged') => void;
  readonly onError?: (error: unknown, context: PersistErrorContext) => void;
}

export interface UsePersistedWorkflowOptions<
  P extends AllowedProp,
  S,
  O,
> extends WorkflowRuntimeOptions<O> {
  readonly props: P;
  readonly onOutput?: (output: O) => void;
  readonly persist: ReactPersistConfig<P, S>;
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

const isBrowserLikeEnvironment = (): boolean => {
  const runtimeGlobals = globalThis as {
    readonly window?: unknown;
    readonly document?: unknown;
  };
  return runtimeGlobals.window !== undefined && runtimeGlobals.document !== undefined;
};

const isReactNativeEnvironment = (): boolean => {
  const runtimeGlobals = globalThis as {
    readonly navigator?: {
      readonly product?: unknown;
    };
  };
  return runtimeGlobals.navigator?.product === 'ReactNative';
};

const isTestEnvironment = (): boolean => {
  const runtimeGlobals = globalThis as {
    readonly vi?: unknown;
    readonly jest?: unknown;
  };

  if (runtimeGlobals.vi !== undefined || runtimeGlobals.jest !== undefined) {
    return true;
  }

  const nodeEnv = typeof process === 'undefined' ? undefined : process.env['NODE_ENV'];
  return nodeEnv === 'test';
};

const isServerLikeEnvironment = (): boolean => {
  return !isBrowserLikeEnvironment() && !isReactNativeEnvironment() && !isTestEnvironment();
};

// Internal test seam for environment classification.
export const __testing = {
  isServerLikeEnvironment,
};

const isDevelopmentEnvironment = (): boolean => {
  const runtimeGlobals = globalThis as { readonly __DEV__?: unknown };
  if (typeof runtimeGlobals.__DEV__ === 'boolean') {
    return runtimeGlobals.__DEV__;
  }

  const nodeEnv = typeof process === 'undefined' ? undefined : process.env['NODE_ENV'];
  if (typeof nodeEnv === 'string') {
    return nodeEnv !== 'production';
  }

  const importMeta = import.meta as ImportMeta & {
    readonly env?: {
      readonly DEV?: unknown;
      readonly PROD?: unknown;
      readonly MODE?: unknown;
    };
  };
  if (typeof importMeta.env?.DEV === 'boolean') {
    return importMeta.env.DEV;
  }
  if (typeof importMeta.env?.PROD === 'boolean') {
    return !importMeta.env.PROD;
  }
  if (typeof importMeta.env?.MODE === 'string') {
    return importMeta.env.MODE !== 'production';
  }

  return false;
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
  options: UsePersistedWorkflowOptions<P, S, O>,
): UsePersistedWorkflowResult<P, S, R> {
  const runtimeRef = useRef<WorkflowRuntime<P, S, O, R> | null>(null);
  const lastSnapshotRef = useRef<UseWorkflowResult<P, S, R> | null>(null);
  const lastSnapshotStringRef = useRef<string | undefined>(undefined);
  const shouldBeActiveRef = useRef(true);

  const persistenceStoreRef = useRef<PersistenceStore | null>(null);
  persistenceStoreRef.current ??= createPersistenceStore();
  const persistenceStore = persistenceStoreRef.current;
  const runtimeTokenRef = useRef(0);
  const isCreatingRuntimeRef = useRef(false);
  const warnedCodecIdentityChangeRef = useRef(false);
  const previousCodecRef = useRef<{
    readonly serialize: ReactPersistConfig<P, S>['serialize'];
    readonly deserialize: ReactPersistConfig<P, S>['deserialize'];
    readonly migrate: ReactPersistConfig<P, S>['migrate'];
  } | null>(null);

  const persist = options.persist;

  const onPersistRef = useRef(persist.onPersist);
  onPersistRef.current = persist.onPersist;

  const onRehydrateRef = useRef(persist.onRehydrate);
  onRehydrateRef.current = persist.onRehydrate;

  const onRehydrateSkippedRef = useRef(persist.onRehydrateSkipped);
  onRehydrateSkippedRef.current = persist.onRehydrateSkipped;

  const onErrorRef = useRef(persist.onError);
  onErrorRef.current = persist.onError;

  const serverFallbackStorageRef = useRef<PersistStorage | null>(null);
  const effectiveStorage = getSafeStorage(persist.storage, serverFallbackStorageRef);

  const resolvedKey = resolvePersistKey(persist.key, options.props);
  if (typeof resolvedKey !== 'string') {
    throw new Error('Persist config "key" must resolve to a string');
  }
  if (resolvedKey.trim().length === 0) {
    throw new Error('Persist config "key" must be a non-empty string');
  }
  const resolvedRehydrateMode = persist.rehydrate ?? 'lazy';

  const runtimeIdentity = useMemo(
    () => ({
      key: resolvedKey,
      version: persist.version,
      rehydrate: resolvedRehydrateMode,
      writeDebounceMs: persist.writeDebounceMs,
    }),
    [resolvedKey, persist.version, resolvedRehydrateMode, persist.writeDebounceMs],
  );

  useEffect(() => {
    const previousCodec = previousCodecRef.current;
    previousCodecRef.current = {
      serialize: persist.serialize,
      deserialize: persist.deserialize,
      migrate: persist.migrate,
    };

    if (previousCodec === null || warnedCodecIdentityChangeRef.current) {
      return;
    }

    if (!isDevelopmentEnvironment()) {
      return;
    }

    const codecChanged =
      previousCodec.serialize !== persist.serialize ||
      previousCodec.deserialize !== persist.deserialize ||
      previousCodec.migrate !== persist.migrate;

    if (!codecChanged) {
      return;
    }

    warnedCodecIdentityChangeRef.current = true;
    console.warn(
      '[workflow-ts/react] usePersistedWorkflow detected changed persist codec function identities (serialize/deserialize/migrate). Runtime is not recreated for these changes; keep codec functions stable with useCallback or module scope.',
    );
  }, [persist.deserialize, persist.migrate, persist.serialize]);

  const createRuntimeWithPersistence = useCallback(
    (
      workflowToRun: Workflow<P, S, O, R>,
      runtimeProps: P,
      runtimeOnOutput: (output: O) => void,
    ): WorkflowRuntime<P, S, O, R> => {
      const runtimeToken = runtimeTokenRef.current + 1;
      runtimeTokenRef.current = runtimeToken;
      const isCurrentRuntimeToken = (): boolean => runtimeTokenRef.current === runtimeToken;

      if (resolvedRehydrateMode === 'none') {
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
        if (!isCurrentRuntimeToken()) {
          return;
        }

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

          if (resolvedRehydrateMode === 'lazy') {
            if (isPromiseLike<string | null>(value)) {
              void value
                .then((resolvedValue) => {
                  if (!isCurrentRuntimeToken()) {
                    return;
                  }
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
          rehydrate: resolvedRehydrateMode,
          writeDebounceMs: persist.writeDebounceMs,
          effectMode: 'manual',
          serialize: persist.serialize,
          deserialize: persist.deserialize,
          migrate: persist.migrate,
          onOutput: runtimeOnOutput,
          onPersist: (snapshot: string) => {
            if (!isCurrentRuntimeToken()) {
              return;
            }
            const current = persistenceStore.getSnapshot();
            publishPersistenceState({
              ...current,
              lastPersistedAt: Date.now(),
            });
            onPersistRef.current?.(snapshot);
          },
          onRehydrate: (snapshot: string) => {
            if (!isCurrentRuntimeToken()) {
              return;
            }
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
          onRehydrateSkipped: (snapshot: string, reason: 'stateChanged') => {
            if (!isCurrentRuntimeToken()) {
              return;
            }
            const current = persistenceStore.getSnapshot();
            publishPersistenceState({
              ...current,
              phase: 'ready',
              error: undefined,
              isHydrated: false,
              lastRehydratedAt: Date.now(),
            });
            onRehydrateSkippedRef.current?.(snapshot, reason);
          },
          onError: (error: unknown, context: PersistErrorContext) => {
            if (!isCurrentRuntimeToken()) {
              return;
            }
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
      persist.serialize,
      persist.version,
      persist.writeDebounceMs,
      resolvedRehydrateMode,
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
