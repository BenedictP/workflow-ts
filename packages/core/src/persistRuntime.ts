import { named } from './action';
import { createInterceptor, type Interceptor } from './interceptor';
import type { AsyncStorage, PersistStorage } from './persistStorage';
import { createRuntime, type RuntimeConfig, type WorkflowRuntime } from './runtime';
import type { Action, Workflow } from './types';

export type PersistRehydrateMode = 'none' | 'lazy' | 'blocking';

type PersistPhase = 'rehydrate' | 'persist';

type PersistOperation =
  | 'getItem'
  | 'setItem'
  | 'removeItem'
  | 'decodeEnvelope'
  | 'serialize'
  | 'onPersist'
  | 'onRehydrate'
  | 'onRehydrateSkipped'
  | 'deserialize'
  | 'migrate';

export interface PersistErrorContext {
  readonly phase: PersistPhase;
  readonly operation: PersistOperation;
  readonly key: string;
}

export interface PersistEnvelope {
  readonly v: number;
  readonly data: string;
}

export type PersistSerializer<S> = (state: S) => string;
export type PersistDeserializer<P, S> = (raw: string, props: P) => S;
export type PersistMigrate = (raw: string, fromVersion: number, toVersion: number) => string;

export interface PersistConfig<P, S, O, R> extends Omit<
  RuntimeConfig<P, S, O, R>,
  'workflow' | 'props' | 'snapshot'
> {
  readonly storage: PersistStorage;
  readonly key: string;
  readonly version: number;
  readonly rehydrate?: PersistRehydrateMode;
  readonly writeDebounceMs?: number;
  readonly serialize: PersistSerializer<S>;
  readonly deserialize: PersistDeserializer<P, S>;
  readonly migrate?: PersistMigrate;
  readonly onPersist?: (snapshot: string) => void;
  readonly onRehydrate?: (snapshot: string) => void;
  readonly onRehydrateSkipped?: (snapshot: string, reason: 'stateChanged') => void;
  readonly onError?: (error: unknown, context: PersistErrorContext) => void;
}

interface PersistRuntimeInternals<P, S, O, R> {
  readonly runtime: WorkflowRuntime<P, S, O, R>;
  readonly applyHydrationValue: (
    storedValue: string,
    expectedStateChangeGeneration?: number,
  ) => void;
  readonly getStateChangeGeneration: () => number;
  readonly isPersistDisposed: () => boolean;
}

interface RehydratedState<S> {
  readonly state: S;
  readonly data: string;
}

interface EnqueuePersistOptions {
  readonly force?: boolean;
}

const PERSIST_LOG_PREFIX = '[workflow-ts/persist]';
const HYDRATE_ACTION_NAME = '@workflow-ts/persist/hydrate';

const toAsyncStorage = (storage: PersistStorage): AsyncStorage => {
  return {
    getItem: (key: string): Promise<string | null> => {
      return Promise.resolve().then(() => {
        return storage.getItem(key) as string | null;
      });
    },
    setItem: (key: string, value: string): Promise<void> => {
      return Promise.resolve().then(() => {
        return storage.setItem(key, value);
      });
    },
    removeItem: (key: string): Promise<void> => {
      return Promise.resolve().then(() => {
        return storage.removeItem(key);
      });
    },
  };
};

const isPromiseLike = <T>(value: unknown): value is Promise<T> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return typeof (value as { readonly then?: unknown }).then === 'function';
};

const validatePersistKey = (key: string): void => {
  if (key.trim().length === 0) {
    throw new Error('Persist config "key" must be a non-empty string');
  }
};

const validatePersistVersion = (version: number): void => {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Persist config "version" must be an integer >= 1');
  }
};

const validatePersistSerializer = <S>(serializer: PersistSerializer<S>): void => {
  if (typeof serializer !== 'function') {
    throw new Error('Persist config "serialize" must be a function');
  }
};

const validatePersistDeserializer = <P, S>(deserializer: PersistDeserializer<P, S>): void => {
  if (typeof deserializer !== 'function') {
    throw new Error('Persist config "deserialize" must be a function');
  }
};

const createErrorReporter = (
  onError: ((error: unknown, context: PersistErrorContext) => void) | undefined,
): ((error: unknown, context: PersistErrorContext) => void) => {
  const warnedKeys = new Set<string>();

  return (error: unknown, context: PersistErrorContext): void => {
    const warnKey = `${context.phase}:${context.operation}:${context.key}`;

    if (!warnedKeys.has(warnKey)) {
      warnedKeys.add(warnKey);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `${PERSIST_LOG_PREFIX} ${context.phase} ${context.operation} failed for key "${context.key}"`,
        errorMessage,
      );
    }

    try {
      onError?.(error, context);
    } catch (callbackError) {
      const callbackErrorMessage =
        callbackError instanceof Error ? callbackError.message : String(callbackError);
      console.error(
        `${PERSIST_LOG_PREFIX} onError callback threw for key "${context.key}"`,
        callbackErrorMessage,
      );
    }
  };
};

const createHydrateAction = <S, O>(state: S): Action<S, O> => {
  return named(HYDRATE_ACTION_NAME, () => ({ state }));
};

const createPersistInterceptor = <S, O>(
  writeSnapshot: (snapshot: string) => void,
  getSnapshotForState: (state: S) => string | undefined,
): Interceptor<S, O> => {
  return createInterceptor<S, O>('persist', {
    onStateChange: (change) => {
      if (change.reason === 'action' && change.actionName === HYDRATE_ACTION_NAME) {
        return;
      }

      const snapshot = getSnapshotForState(change.nextState);
      if (snapshot === undefined) {
        return;
      }
      writeSnapshot(snapshot);
    },
  });
};

const pickRuntimeConfig = <P, S, O, R>(
  config: PersistConfig<P, S, O, R>,
  interceptors: readonly Interceptor<S, O>[],
  initialState?: S,
): Partial<RuntimeConfig<P, S, O, R>> => {
  return {
    onOutput: config.onOutput,
    initialState: initialState ?? config.initialState,
    debug: config.debug,
    interceptors,
    devTools: config.devTools,
    propsEqual: config.propsEqual,
    effectMode: config.effectMode,
  };
};

const encodePersistEnvelope = (version: number, data: string): string => {
  return JSON.stringify({ v: version, data } satisfies PersistEnvelope);
};

const decodePersistEnvelope = (raw: string): PersistEnvelope => {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Persisted payload must be a JSON object envelope');
  }

  const candidate = parsed as { readonly v?: unknown; readonly data?: unknown };
  const version = candidate.v;
  if (!Number.isInteger(version) || (version as number) < 1) {
    throw new Error('Persisted payload envelope field "v" must be an integer >= 1');
  }

  if (typeof candidate.data !== 'string') {
    throw new Error('Persisted payload envelope field "data" must be a string');
  }

  return {
    v: version as number,
    data: candidate.data,
  };
};

const decodePersistedState = <P, S, O, R>(
  storedValue: string,
  props: P,
  config: PersistConfig<P, S, O, R>,
  deserializeState: PersistDeserializer<P, S>,
  reportError: (error: unknown, context: PersistErrorContext) => void,
  removePersistedValue: () => void,
): RehydratedState<S> | null => {
  let envelope: PersistEnvelope;
  try {
    envelope = decodePersistEnvelope(storedValue);
  } catch (error) {
    reportError(error, {
      phase: 'rehydrate',
      operation: 'decodeEnvelope',
      key: config.key,
    });
    removePersistedValue();
    return null;
  }

  let data = envelope.data;
  if (envelope.v !== config.version) {
    const migrate = config.migrate;
    if (migrate === undefined) {
      reportError(
        new Error(
          `Persisted payload version ${envelope.v} does not match configured version ${config.version}`,
        ),
        {
          phase: 'rehydrate',
          operation: 'migrate',
          key: config.key,
        },
      );
      removePersistedValue();
      return null;
    }

    try {
      data = migrate(envelope.data, envelope.v, config.version);
    } catch (error) {
      reportError(error, {
        phase: 'rehydrate',
        operation: 'migrate',
        key: config.key,
      });
      removePersistedValue();
      return null;
    }
  }

  try {
    return {
      state: deserializeState(data, props),
      data,
    };
  } catch (error) {
    reportError(error, {
      phase: 'rehydrate',
      operation: 'deserialize',
      key: config.key,
    });
    removePersistedValue();
    return null;
  }
};

const invokeOnRehydrate = <P, S, O, R>(
  data: string,
  config: PersistConfig<P, S, O, R>,
  reportError: (error: unknown, context: PersistErrorContext) => void,
): void => {
  try {
    config.onRehydrate?.(data);
  } catch (error) {
    reportError(error, {
      phase: 'rehydrate',
      operation: 'onRehydrate',
      key: config.key,
    });
  }
};

const createPersistRuntimeInternals = <P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  config: PersistConfig<P, S, O, R>,
  reportError: (error: unknown, context: PersistErrorContext) => void,
  initialRuntimeState?: S,
): PersistRuntimeInternals<P, S, O, R> => {
  const asyncStorage = toAsyncStorage(config.storage);
  const debounceMs = Math.max(0, config.writeDebounceMs ?? 0);
  const serializeState = config.serialize;
  const deserializeState = config.deserialize;

  let stateChangeGeneration = 0;
  let pendingSnapshot: string | undefined;
  let latestSnapshot: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  // A single in-flight write promise + a FIFO of queued writes. We intentionally
  // avoid `writeChain = writeChain.then(...)` style chaining, which retains every
  // historical .then in the promise graph for the life of the runtime.
  const writeQueue: { readonly snapshot: string; readonly force: boolean }[] = [];
  let writeInFlight: Promise<void> | undefined;
  let persistDisposed = false;

  const removePersistedValue = (): void => {
    void asyncStorage.removeItem(config.key).catch((removeError) => {
      reportError(removeError, {
        phase: 'rehydrate',
        operation: 'removeItem',
        key: config.key,
      });
    });
  };

  const performWrite = async (snapshot: string, force: boolean): Promise<void> => {
    if (persistDisposed && !force) {
      return;
    }

    try {
      const envelope = encodePersistEnvelope(config.version, snapshot);
      await asyncStorage.setItem(config.key, envelope);
    } catch (error) {
      reportError(error, {
        phase: 'persist',
        operation: 'setItem',
        key: config.key,
      });
      return;
    }

    try {
      config.onPersist?.(snapshot);
    } catch (error) {
      reportError(error, {
        phase: 'persist',
        operation: 'onPersist',
        key: config.key,
      });
    }
  };

  const drainWriteQueue = (): void => {
    if (writeInFlight !== undefined) {
      return;
    }
    const next = writeQueue.shift();
    if (next === undefined) {
      return;
    }
    writeInFlight = performWrite(next.snapshot, next.force).finally(() => {
      writeInFlight = undefined;
      drainWriteQueue();
    });
  };

  const enqueuePersist = (snapshot: string, options?: EnqueuePersistOptions): void => {
    writeQueue.push({ snapshot, force: options?.force ?? false });
    drainWriteQueue();
  };

  const schedulePersist = (snapshot: string): void => {
    if (persistDisposed) {
      return;
    }

    latestSnapshot = snapshot;
    pendingSnapshot = snapshot;

    if (debounceMs === 0) {
      pendingSnapshot = undefined;
      enqueuePersist(snapshot);
      return;
    }

    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      const nextSnapshot = pendingSnapshot;
      pendingSnapshot = undefined;
      if (nextSnapshot !== undefined) {
        enqueuePersist(nextSnapshot);
      }
    }, debounceMs);
  };

  const getSnapshotForState = (state: S): string | undefined => {
    try {
      return serializeState(state);
    } catch (error) {
      reportError(error, {
        phase: 'persist',
        operation: 'serialize',
        key: config.key,
      });
      return undefined;
    }
  };

  const stateChangeTrackingInterceptor = createInterceptor<S, O>('persist-state-change-tracking', {
    onStateChange: (change) => {
      if (change.reason === 'action' && change.actionName === HYDRATE_ACTION_NAME) {
        return;
      }
      stateChangeGeneration += 1;
    },
  });
  const persistInterceptor = createPersistInterceptor(schedulePersist, getSnapshotForState);
  const interceptors = [
    ...(config.interceptors ?? []),
    stateChangeTrackingInterceptor,
    persistInterceptor,
  ];

  const runtime = createRuntime(
    workflow,
    props,
    pickRuntimeConfig(config, interceptors, initialRuntimeState),
  );

  const originalDispose = runtime.dispose.bind(runtime);
  runtime.dispose = (): void => {
    if (persistDisposed) {
      return;
    }

    const snapshotToFlush = pendingSnapshot ?? latestSnapshot;
    pendingSnapshot = undefined;
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    persistDisposed = true;

    if (snapshotToFlush !== undefined) {
      enqueuePersist(snapshotToFlush, { force: true });
    }

    originalDispose();
  };

  const applyHydrationValue = (
    storedValue: string,
    expectedStateChangeGeneration?: number,
  ): void => {
    // Lazy hydration may resolve after runtime disposal (e.g. async storage read).
    // In that case, skip hydration silently instead of reporting a misleading
    // storage-read error from disposed runtime access.
    if (persistDisposed || runtime.isDisposed()) {
      return;
    }

    const result = decodePersistedState(
      storedValue,
      runtime.getProps(),
      config,
      deserializeState,
      reportError,
      removePersistedValue,
    );
    if (result === null) {
      return;
    }

    if (
      expectedStateChangeGeneration !== undefined &&
      stateChangeGeneration !== expectedStateChangeGeneration
    ) {
      try {
        config.onRehydrateSkipped?.(result.data, 'stateChanged');
      } catch (error) {
        reportError(error, {
          phase: 'rehydrate',
          operation: 'onRehydrateSkipped',
          key: config.key,
        });
      }
      return;
    }

    runtime.send(createHydrateAction<S, O>(result.state));
    invokeOnRehydrate(result.data, config, reportError);
  };

  return {
    runtime,
    applyHydrationValue,
    getStateChangeGeneration: (): number => stateChangeGeneration,
    isPersistDisposed: (): boolean => persistDisposed,
  };
};

export function createPersistedRuntime<P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  config: PersistConfig<P, S, O, R> & {
    readonly storage: PersistStorage;
    readonly rehydrate?: 'none' | 'lazy';
  },
): WorkflowRuntime<P, S, O, R> {
  validatePersistKey(config.key);
  validatePersistVersion(config.version);
  validatePersistSerializer(config.serialize);
  validatePersistDeserializer(config.deserialize);

  const mode = config.rehydrate ?? 'lazy';
  const reportError = createErrorReporter(config.onError);
  const internals = createPersistRuntimeInternals(workflow, props, config, reportError);

  if (mode === 'none') {
    return internals.runtime;
  }

  const applyHydrationValue = (
    storedValue: string | null,
    expectedStateChangeGeneration: number,
  ): void => {
    if (storedValue === null) {
      return;
    }
    internals.applyHydrationValue(storedValue, expectedStateChangeGeneration);
  };

  let lazyReadStarted = false;
  let lazyReadCompletion: Promise<void> | undefined;
  const startLazyRehydrate = (): Promise<void> | undefined => {
    if (lazyReadStarted) {
      return lazyReadCompletion;
    }
    lazyReadStarted = true;
    const expectedStateChangeGeneration = internals.getStateChangeGeneration();

    try {
      const storedValue = config.storage.getItem(config.key);
      if (isPromiseLike<string | null>(storedValue)) {
        lazyReadCompletion = storedValue
          .then((resolvedValue) => {
            applyHydrationValue(resolvedValue, expectedStateChangeGeneration);
          })
          .catch((error) => {
            // Late rejection after dispose: runtime is already gone, so suppress
            // to avoid a misleading "getItem failed" warning for a torn-down runtime.
            if (internals.isPersistDisposed()) {
              return;
            }
            reportError(error, {
              phase: 'rehydrate',
              operation: 'getItem',
              key: config.key,
            });
          })
          .finally(() => {
            lazyEffectsAttached = false;
            lazyReadCompletion = undefined;
          });
        return lazyReadCompletion;
      } else {
        applyHydrationValue(storedValue, expectedStateChangeGeneration);
      }
    } catch (error) {
      reportError(error, {
        phase: 'rehydrate',
        operation: 'getItem',
        key: config.key,
      });
    }
    return undefined;
  };

  let lazyEffectsAttached = false;
  if (config.effectMode === 'manual') {
    const originalStartEffects = internals.runtime.startEffects.bind(internals.runtime);
    const startEffectsAfterLazyRehydrate = (): void => {
      if (internals.isPersistDisposed() || internals.runtime.isDisposed()) {
        return;
      }
      internals.runtime.getRendering();
      originalStartEffects();
    };
    internals.runtime.startEffects = (): void => {
      const readCompletion = startLazyRehydrate();
      if (readCompletion === undefined) {
        startEffectsAfterLazyRehydrate();
        return;
      }
      if (lazyEffectsAttached) {
        return;
      }
      lazyEffectsAttached = true;
      void readCompletion.finally(startEffectsAfterLazyRehydrate);
    };
  } else {
    startLazyRehydrate();
  }

  return internals.runtime;
}

const createBlockingRuntime = <P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  config: PersistConfig<P, S, O, R>,
  reportError: (error: unknown, context: PersistErrorContext) => void,
  storedValue: string,
): WorkflowRuntime<P, S, O, R> => {
  const asyncStorage = toAsyncStorage(config.storage);
  const deserializeState = config.deserialize;

  const removePersistedValue = (): void => {
    void asyncStorage.removeItem(config.key).catch((removeError) => {
      reportError(removeError, {
        phase: 'rehydrate',
        operation: 'removeItem',
        key: config.key,
      });
    });
  };

  const result = decodePersistedState(
    storedValue,
    props,
    config,
    deserializeState,
    reportError,
    removePersistedValue,
  );

  if (result === null) {
    return createPersistRuntimeInternals(workflow, props, config, reportError).runtime;
  }

  const internals = createPersistRuntimeInternals(
    workflow,
    props,
    config,
    reportError,
    result.state,
  );
  invokeOnRehydrate(result.data, config, reportError);
  return internals.runtime;
};

export async function createPersistedRuntimeAsync<P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  config: PersistConfig<P, S, O, R> & {
    readonly rehydrate?: PersistRehydrateMode;
  },
): Promise<WorkflowRuntime<P, S, O, R>> {
  validatePersistKey(config.key);
  validatePersistVersion(config.version);
  validatePersistSerializer(config.serialize);
  validatePersistDeserializer(config.deserialize);

  const mode = config.rehydrate ?? 'blocking';
  const asyncStorage = toAsyncStorage(config.storage);
  const reportError = createErrorReporter(config.onError);

  if (mode === 'blocking') {
    let storedValue: string | null = null;
    try {
      storedValue = await asyncStorage.getItem(config.key);
    } catch (error) {
      reportError(error, {
        phase: 'rehydrate',
        operation: 'getItem',
        key: config.key,
      });
    }

    if (storedValue !== null) {
      return createBlockingRuntime(workflow, props, config, reportError, storedValue);
    }

    return createPersistRuntimeInternals(workflow, props, config, reportError).runtime;
  }

  const internals = createPersistRuntimeInternals(workflow, props, config, reportError);

  if (mode === 'none') {
    return internals.runtime;
  }

  let lazyReadStarted = false;
  let lazyReadCompletion: Promise<void> | undefined;
  const startLazyRehydrate = (): Promise<void> | undefined => {
    if (lazyReadStarted) {
      return lazyReadCompletion;
    }
    lazyReadStarted = true;
    const expectedStateChangeGeneration = internals.getStateChangeGeneration();

    lazyReadCompletion = asyncStorage
      .getItem(config.key)
      .then((storedValue) => {
        if (storedValue === null) {
          return;
        }
        internals.applyHydrationValue(storedValue, expectedStateChangeGeneration);
      })
      .catch((error) => {
        // Late rejection after dispose: runtime is already gone, so suppress
        // to avoid a misleading "getItem failed" warning for a torn-down runtime.
        if (internals.isPersistDisposed()) {
          return;
        }
        reportError(error, {
          phase: 'rehydrate',
          operation: 'getItem',
          key: config.key,
        });
      })
      .finally(() => {
        lazyEffectsAttached = false;
        lazyReadCompletion = undefined;
      });
    return lazyReadCompletion;
  };

  let lazyEffectsAttached = false;
  if (config.effectMode === 'manual') {
    const originalStartEffects = internals.runtime.startEffects.bind(internals.runtime);
    const startEffectsAfterLazyRehydrate = (): void => {
      if (internals.isPersistDisposed() || internals.runtime.isDisposed()) {
        return;
      }
      internals.runtime.getRendering();
      originalStartEffects();
    };
    internals.runtime.startEffects = (): void => {
      const readCompletion = startLazyRehydrate();
      if (readCompletion === undefined) {
        startEffectsAfterLazyRehydrate();
        return;
      }
      if (lazyEffectsAttached) {
        return;
      }
      lazyEffectsAttached = true;
      void readCompletion.finally(startEffectsAfterLazyRehydrate);
    };
  } else {
    startLazyRehydrate();
  }

  return internals.runtime;
}
