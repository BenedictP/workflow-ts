import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { action, createRuntime, type Workflow } from '../src';
import {
  createPersistedRuntime,
  createPersistedRuntimeAsync,
  type PersistConfig,
  type PersistErrorContext,
} from '../src/persistRuntime';
import { memoryStorage, type PersistStorage, type SyncStorage } from '../src/persistStorage';

interface CounterState {
  readonly count: number;
}

interface CounterRendering {
  readonly count: number;
  readonly increment: () => void;
}

const PERSIST_VERSION = 1;

const envelope = (data: string, version = PERSIST_VERSION): string => {
  return JSON.stringify({ v: version, data });
};

const counterWorkflow: Workflow<void, CounterState, never, CounterRendering> = {
  initialState: (_props, snapshot) =>
    snapshot === undefined ? { count: 0 } : (JSON.parse(snapshot) as CounterState),
  snapshot: (state) => JSON.stringify(state),
  render: (_props, state, ctx) => ({
    count: state.count,
    increment: () => ctx.actionSink.send(action((s: CounterState) => ({ count: s.count + 1 }))),
  }),
};

const counterSerialize = (state: CounterState): string => JSON.stringify(state);
const counterDeserialize = (raw: string): CounterState => JSON.parse(raw) as CounterState;

const waitForMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const createStorageSpy = (
  seed?: string,
): {
  storage: SyncStorage;
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
} => {
  let value = seed ?? null;

  const getItem = vi.fn((_key: string) => value);
  const setItem = vi.fn((_key: string, nextValue: string) => {
    value = nextValue;
  });
  const removeItem = vi.fn((_key: string) => {
    value = null;
  });

  return {
    storage: { getItem, setItem, removeItem },
    getItem,
    setItem,
    removeItem,
  };
};

describe('persistRuntime v3', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sync API defaults to lazy and rehydrates from versioned envelope', () => {
    const { storage } = createStorageSpy(envelope('{"count":5}'));

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    expect(runtime.getState()).toEqual({ count: 5 });
  });

  it('sync API supports rehydrate:none and does not read storage', () => {
    const { storage, getItem } = createStorageSpy(envelope('{"count":5}'));

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      rehydrate: 'none',
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    expect(getItem).not.toHaveBeenCalled();
    expect(runtime.getState()).toEqual({ count: 0 });
  });

  it('sync API lazy mode supports async storage and hydrates later', async () => {
    let resolveGet: ((value: string | null) => void) | undefined;

    const storage: PersistStorage = {
      getItem: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveGet = resolve;
          }),
      ),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      rehydrate: 'lazy',
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    expect(runtime.getState()).toEqual({ count: 0 });

    resolveGet?.(envelope('{"count":11}'));
    await waitForMicrotasks();

    expect(runtime.getState()).toEqual({ count: 11 });
  });

  it('async API defaults to blocking and returns hydrated state', async () => {
    const storage: PersistStorage = {
      getItem: vi.fn(async () => envelope('{"count":7}')),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    expect(runtime.getState()).toEqual({ count: 7 });
  });

  it('async API lazy mode returns before hydration and applies envelope later', async () => {
    let resolveGet: ((value: string | null) => void) | undefined;

    const storage: PersistStorage = {
      getItem: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveGet = resolve;
          }),
      ),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      rehydrate: 'lazy',
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    expect(runtime.getState()).toEqual({ count: 0 });

    resolveGet?.(envelope('{"count":9}'));
    await waitForMicrotasks();

    expect(runtime.getState()).toEqual({ count: 9 });
  });

  it('async API lazy mode continues when storage getItem throws synchronously', async () => {
    const onError = vi.fn();
    const storage: PersistStorage = {
      getItem: () => {
        throw new Error('read failed sync');
      },
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      rehydrate: 'lazy',
      serialize: counterSerialize,
      deserialize: counterDeserialize,
      onError,
    });

    expect(runtime.getState()).toEqual({ count: 0 });
    await waitForMicrotasks();

    expect(
      onError.mock.calls.some(
        ([error, context]: [unknown, PersistErrorContext]) =>
          error instanceof Error &&
          error.message === 'read failed sync' &&
          context.phase === 'rehydrate' &&
          context.operation === 'getItem' &&
          context.key === 'counter',
      ),
    ).toBe(true);
  });

  it('async API lazy mode ignores late hydration after runtime is disposed', async () => {
    let resolveGet: ((value: string | null) => void) | undefined;
    const onError = vi.fn();
    const onRehydrate = vi.fn();

    const storage: PersistStorage = {
      getItem: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveGet = resolve;
          }),
      ),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      rehydrate: 'lazy',
      serialize: counterSerialize,
      deserialize: counterDeserialize,
      onError,
      onRehydrate,
    });

    runtime.dispose();
    resolveGet?.(envelope('{"count":10}'));
    await waitForMicrotasks();

    expect(runtime.isDisposed()).toBe(true);
    expect(onRehydrate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('sync API lazy mode ignores late async hydration after runtime is disposed', async () => {
    let resolveGet: ((value: string | null) => void) | undefined;
    const onError = vi.fn();
    const onRehydrate = vi.fn();

    const storage: PersistStorage = {
      getItem: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveGet = resolve;
          }),
      ),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      rehydrate: 'lazy',
      serialize: counterSerialize,
      deserialize: counterDeserialize,
      onError,
      onRehydrate,
    });

    runtime.dispose();
    resolveGet?.(envelope('{"count":12}'));
    await waitForMicrotasks();

    expect(runtime.isDisposed()).toBe(true);
    expect(onRehydrate).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('throws for invalid key/version config', async () => {
    const storage = memoryStorage();

    expect(() =>
      createPersistedRuntime(counterWorkflow, undefined, {
        storage,
        key: 'counter',
        version: 0,
        serialize: counterSerialize,
        deserialize: counterDeserialize,
      }),
    ).toThrow('Persist config "version" must be an integer >= 1');

    await expect(
      createPersistedRuntimeAsync(counterWorkflow, undefined, {
        storage,
        key: '   ',
        version: 1,
        serialize: counterSerialize,
        deserialize: counterDeserialize,
      }),
    ).rejects.toThrow('Persist config "key" must be a non-empty string');
  });

  it('throws when serializer or deserializer is missing', async () => {
    const missingSerializeConfig = {
      storage: memoryStorage(),
      key: 'counter',
      version: 1,
    } as unknown as PersistConfig<void, CounterState, never, CounterRendering>;

    expect(() =>
      createPersistedRuntime(counterWorkflow, undefined, missingSerializeConfig),
    ).toThrow('Persist config "serialize" must be a function');

    await expect(
      createPersistedRuntimeAsync(counterWorkflow, undefined, missingSerializeConfig),
    ).rejects.toThrow('Persist config "serialize" must be a function');

    const missingDeserializeConfig = {
      storage: memoryStorage(),
      key: 'counter',
      version: 1,
      serialize: counterSerialize,
    } as unknown as PersistConfig<void, CounterState, never, CounterRendering>;

    expect(() =>
      createPersistedRuntime(counterWorkflow, undefined, missingDeserializeConfig),
    ).toThrow('Persist config "deserialize" must be a function');
  });

  it('supports custom serialize/deserialize without workflow.snapshot', async () => {
    interface CustomState {
      readonly count: number;
    }

    const customWorkflow: Workflow<void, CustomState, never, { readonly increment: () => void }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, _state, ctx) => ({
        increment: () => {
          ctx.actionSink.send((state) => ({
            state: { count: state.count + 1 },
          }));
        },
      }),
    };

    const { storage, setItem } = createStorageSpy();

    const runtime = createPersistedRuntime(customWorkflow, undefined, {
      storage,
      key: 'custom',
      version: 1,
      serialize: (state) => `count:${state.count}`,
      deserialize: (raw) => ({ count: Number(raw.split(':')[1]) }),
    });

    runtime.getRendering().increment();
    await waitForMicrotasks();

    expect(runtime.getState()).toEqual({ count: 1 });
    expect(setItem).toHaveBeenCalledWith('custom', envelope('count:1'));
  });

  it('migrates older payload versions before deserialize', async () => {
    const onRehydrate = vi.fn();

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage: {
        getItem: vi.fn(async () => envelope('{"count":2}', 1)),
        setItem: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
      },
      key: 'counter',
      version: 2,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
      migrate: (raw) => {
        const parsed = JSON.parse(raw) as CounterState;
        return JSON.stringify({ count: parsed.count + 10 });
      },
      onRehydrate,
    });

    expect(runtime.getState()).toEqual({ count: 12 });
    expect(onRehydrate).toHaveBeenCalledWith('{"count":12}');
  });

  it('drops payload and continues when migrate fails', async () => {
    const removeItem = vi.fn(async () => undefined);
    const onError = vi.fn();

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage: {
        getItem: vi.fn(async () => envelope('{"count":2}', 1)),
        setItem: vi.fn(async () => undefined),
        removeItem,
      },
      key: 'counter',
      version: 2,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
      migrate: () => {
        throw new Error('migrate failed');
      },
      onError,
    });

    expect(runtime.getState()).toEqual({ count: 0 });
    expect(removeItem).toHaveBeenCalledWith('counter');
    expect(
      onError.mock.calls.some(
        ([error, context]: [unknown, PersistErrorContext]) =>
          error instanceof Error &&
          error.message === 'migrate failed' &&
          context.phase === 'rehydrate' &&
          context.operation === 'migrate' &&
          context.key === 'counter',
      ),
    ).toBe(true);
  });

  it('persists on every state change without debounce using versioned envelope', async () => {
    const { storage, setItem } = createStorageSpy();

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    runtime.getRendering().increment();
    runtime.getRendering().increment();

    await waitForMicrotasks();

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(setItem).toHaveBeenNthCalledWith(1, 'counter', envelope('{"count":1}'));
    expect(setItem).toHaveBeenNthCalledWith(2, 'counter', envelope('{"count":2}'));
  });

  it('coalesces writes with debounce and persists latest envelope', async () => {
    vi.useFakeTimers();
    const { storage, setItem } = createStorageSpy();

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      writeDebounceMs: 100,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    runtime.getRendering().increment();
    runtime.getRendering().increment();

    vi.advanceTimersByTime(99);
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('counter', envelope('{"count":2}'));
  });

  it('does not immediately persist internal hydration action', async () => {
    const { storage, setItem } = createStorageSpy(envelope('{"count":3}'));

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    await waitForMicrotasks();

    expect(runtime.getState()).toEqual({ count: 3 });
    expect(setItem).not.toHaveBeenCalled();

    runtime.getRendering().increment();
    await waitForMicrotasks();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenLastCalledWith('counter', envelope('{"count":4}'));
  });

  it('calls onPersist, onRehydrate and onError callbacks', async () => {
    const onPersist = vi.fn();
    const onRehydrate = vi.fn();
    const onError = vi.fn();

    const storage: PersistStorage = {
      getItem: vi.fn(async () => envelope('{"count":2}')),
      setItem: vi.fn(async () => {
        throw new Error('write failed');
      }),
      removeItem: vi.fn(async () => undefined),
    };

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage,
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
      onPersist,
      onRehydrate,
      onError,
    });

    expect(runtime.getState()).toEqual({ count: 2 });
    expect(onRehydrate).toHaveBeenCalledWith('{"count":2}');

    runtime.getRendering().increment();
    await waitForMicrotasks();

    expect(onPersist).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    expect(
      onError.mock.calls.some(
        ([error, context]: [unknown, PersistErrorContext]) =>
          error instanceof Error &&
          error.message === 'write failed' &&
          context.phase === 'persist' &&
          context.operation === 'setItem' &&
          context.key === 'counter',
      ),
    ).toBe(true);
  });

  it('drops invalid envelope and continues with fresh state', async () => {
    const removeItem = vi.fn(async () => undefined);

    const runtime = await createPersistedRuntimeAsync(counterWorkflow, undefined, {
      storage: {
        getItem: vi.fn(async () => '{bad-json'),
        setItem: vi.fn(async () => undefined),
        removeItem,
      },
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: counterSerialize,
      deserialize: counterDeserialize,
    });

    expect(runtime.getState()).toEqual({ count: 0 });
    expect(removeItem).toHaveBeenCalledWith('counter');
  });

  it('continues runtime when serialize throws', async () => {
    const onError = vi.fn();

    const runtime = createPersistedRuntime(counterWorkflow, undefined, {
      storage: memoryStorage(),
      key: 'counter',
      version: PERSIST_VERSION,
      serialize: (state) => {
        if (state.count >= 1) {
          throw new Error('serialize failed');
        }
        return JSON.stringify(state);
      },
      deserialize: counterDeserialize,
      onError,
    });

    expect(() => runtime.getRendering().increment()).not.toThrow();
    expect(runtime.getState()).toEqual({ count: 1 });
    await waitForMicrotasks();

    expect(
      onError.mock.calls.some(
        ([error, context]: [unknown, PersistErrorContext]) =>
          error instanceof Error &&
          error.message === 'serialize failed' &&
          context.phase === 'persist' &&
          context.operation === 'serialize' &&
          context.key === 'counter',
      ),
    ).toBe(true);
  });

  it('preserves existing createRuntime behavior with snapshot payloads', () => {
    const runtime = createRuntime(counterWorkflow, undefined, {
      snapshot: '{"count":4}',
    });

    expect(runtime.getState()).toEqual({ count: 4 });

    runtime.send((state) => ({
      state: { count: state.count + 1 },
    }));

    expect(runtime.getState()).toEqual({ count: 5 });
  });
});
