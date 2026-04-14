import { act, renderHook } from '@testing-library/react';
import { memoryStorage, type PersistStorage, type SyncStorage, type Workflow } from '@workflow-ts/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePersistedWorkflow, type PersistKeyResolver } from '../src/usePersistedWorkflow';

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
    increment: () => {
      ctx.actionSink.send((s) => ({
        state: { count: s.count + 1 },
      }));
    },
  }),
};

const counterSerialize = (state: CounterState): string => JSON.stringify(state);
const counterDeserialize = (raw: string): CounterState => JSON.parse(raw) as CounterState;

interface PropsState {
  readonly value: number;
}

interface PropsRendering {
  readonly value: number;
  readonly increment: () => void;
}

interface PropsInput {
  readonly userId: string;
  readonly initial: number;
}

const propsWorkflow: Workflow<PropsInput, PropsState, never, PropsRendering> = {
  initialState: (props, snapshot) =>
    snapshot === undefined ? { value: props.initial } : (JSON.parse(snapshot) as PropsState),
  snapshot: (state) => JSON.stringify(state),
  render: (_props, state, ctx) => ({
    value: state.value,
    increment: () => {
      ctx.actionSink.send((s) => ({
        state: { value: s.value + 1 },
      }));
    },
  }),
};

const propsSerialize = (state: PropsState): string => JSON.stringify(state);
const propsDeserialize = (raw: string): PropsState => JSON.parse(raw) as PropsState;

interface OutputEvent {
  readonly type: 'saved';
  readonly value: number;
}

interface OutputRendering {
  readonly save: () => void;
}

const outputWorkflow: Workflow<void, CounterState, OutputEvent, OutputRendering> = {
  initialState: () => ({ count: 0 }),
  snapshot: (state) => JSON.stringify(state),
  render: (_props, _state, ctx) => ({
    save: () => {
      ctx.actionSink.send((s) => ({
        state: { count: s.count + 1 },
        output: { type: 'saved', value: s.count + 1 },
      }));
    },
  }),
};

const waitForMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

const createMapStorage = (
  initialEntries?: Record<string, string>,
): {
  storage: SyncStorage;
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
} => {
  const map = new Map<string, string>(Object.entries(initialEntries ?? {}));

  const getItem = vi.fn((key: string): string | null => {
    return map.get(key) ?? null;
  });
  const setItem = vi.fn((key: string, value: string): void => {
    map.set(key, value);
  });
  const removeItem = vi.fn((key: string): void => {
    map.delete(key);
  });

  return {
    storage: { getItem, setItem, removeItem },
    getItem,
    setItem,
    removeItem,
  };
};

describe('usePersistedWorkflow', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('hydrates from existing sync storage in lazy mode', () => {
    const { storage } = createMapStorage({ counter: envelope('{"count":5}') });

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          rehydrate: 'lazy',
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    expect(result.current.rendering.count).toBe(5);
    expect(result.current.state.count).toBe(5);
    expect(result.current.persistence.phase).toBe('ready');
    expect(result.current.persistence.isHydrated).toBe(true);
  });

  it('rehydrate:none does not read from storage', () => {
    const { storage, getItem } = createMapStorage({ counter: envelope('{"count":9}') });

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          rehydrate: 'none',
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    expect(result.current.rendering.count).toBe(0);
    expect(result.current.persistence.phase).toBe('idle');
    expect(result.current.persistence.isHydrated).toBe(false);
    expect(getItem).not.toHaveBeenCalled();
  });

  it('hydrates from async storage in lazy mode', async () => {
    const storage: PersistStorage = {
      getItem: vi.fn(async () => envelope('{"count":6}')),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          rehydrate: 'lazy',
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    expect(result.current.rendering.count).toBe(0);
    expect(result.current.persistence.phase).toBe('rehydrating');
    expect(result.current.persistence.isHydrated).toBe(false);

    await waitForMicrotasks();

    expect(result.current.rendering.count).toBe(6);
    expect(result.current.persistence.phase).toBe('ready');
    expect(result.current.persistence.isHydrated).toBe(true);
    expect(result.current.persistence.lastRehydratedAt).toEqual(expect.any(Number));
  });

  it('marks persistence ready when async storage resolves with no value', async () => {
    const storage: PersistStorage = {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    };

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          rehydrate: 'lazy',
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    expect(result.current.persistence.phase).toBe('rehydrating');
    expect(result.current.persistence.isHydrated).toBe(false);

    await waitForMicrotasks();

    expect(result.current.rendering.count).toBe(0);
    expect(result.current.persistence.phase).toBe('ready');
    expect(result.current.persistence.isHydrated).toBe(true);
    expect(result.current.persistence.lastRehydratedAt).toEqual(expect.any(Number));
  });

  it('persists state transitions as versioned envelopes', async () => {
    const { storage, setItem } = createMapStorage();

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    act(() => {
      result.current.rendering.increment();
      result.current.rendering.increment();
    });

    await waitForMicrotasks();

    expect(setItem).toHaveBeenNthCalledWith(1, 'counter', envelope('{"count":1}'));
    expect(setItem).toHaveBeenNthCalledWith(2, 'counter', envelope('{"count":2}'));
    expect(result.current.persistence.lastPersistedAt).toEqual(expect.any(Number));
  });

  it('does not recreate runtime from inline storage adapter identity churn', async () => {
    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage: memoryStorage(),
          key: 'counter',
          version: PERSIST_VERSION,
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    expect(result.current.rendering.count).toBe(0);

    act(() => {
      result.current.rendering.increment();
    });
    await waitForMicrotasks();
    expect(result.current.rendering.count).toBe(1);

    act(() => {
      result.current.rendering.increment();
    });
    await waitForMicrotasks();
    expect(result.current.rendering.count).toBe(2);
  });

  it('coalesces writes with debounce', async () => {
    vi.useFakeTimers();
    const { storage, setItem } = createMapStorage();

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          writeDebounceMs: 100,
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    act(() => {
      result.current.rendering.increment();
      result.current.rendering.increment();
    });

    vi.advanceTimersByTime(99);
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('counter', envelope('{"count":2}'));
  });

  it('fires onPersist, onRehydrate and onError callbacks', async () => {
    const onPersist = vi.fn();
    const onRehydrate = vi.fn();
    const onError = vi.fn();

    const storage: SyncStorage = {
      getItem: () => envelope('{"count":1}'),
      setItem: () => {
        throw new Error('write failed');
      },
      removeItem: () => undefined,
    };

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage,
          key: 'counter',
          version: PERSIST_VERSION,
          serialize: counterSerialize,
          deserialize: counterDeserialize,
          onPersist,
          onRehydrate,
          onError,
        },
      }),
    );

    expect(result.current.rendering.count).toBe(1);
    expect(result.current.persistence.phase).toBe('ready');
    expect(result.current.persistence.isHydrated).toBe(true);
    expect(onRehydrate).toHaveBeenCalledWith('{"count":1}');

    act(() => {
      result.current.rendering.increment();
    });

    await waitForMicrotasks();

    expect(onPersist).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('supports key resolver and recreates runtime when key changes', () => {
    const { storage, getItem } = createMapStorage({
      'counter:u1': envelope('{"value":3}'),
      'counter:u2': envelope('{"value":9}'),
    });

    const keyResolver = vi.fn<PersistKeyResolver<PropsInput>>((props: PropsInput) => {
      return `counter:${props.userId}`;
    });

    const { result, rerender } = renderHook(
      (props: PropsInput) =>
        usePersistedWorkflow(propsWorkflow, {
          props,
          persist: {
            storage,
            key: keyResolver,
            version: PERSIST_VERSION,
            serialize: propsSerialize,
            deserialize: propsDeserialize,
          },
        }),
      {
        initialProps: { userId: 'u1', initial: 0 },
      },
    );

    expect(result.current.rendering.value).toBe(3);

    rerender({ userId: 'u2', initial: 0 });
    expect(result.current.rendering.value).toBe(9);

    expect(getItem).toHaveBeenCalledWith('counter:u1');
    expect(getItem).toHaveBeenCalledWith('counter:u2');
    expect(keyResolver).toHaveBeenCalled();
  });

  it('warns once when persist codec function identities change', async () => {
    const { storage } = createMapStorage();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const createSerialize = (): ((state: CounterState) => string) => {
      return (state: CounterState) => JSON.stringify(state);
    };

    const { rerender } = renderHook(
      (serialize: (state: CounterState) => string) =>
        usePersistedWorkflow(counterWorkflow, {
          props: undefined,
          persist: {
            storage,
            key: 'counter',
            version: PERSIST_VERSION,
            serialize,
            deserialize: counterDeserialize,
          },
        }),
      {
        initialProps: createSerialize(),
      },
    );

    rerender(createSerialize());
    await waitForMicrotasks();
    rerender(createSerialize());
    await waitForMicrotasks();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[workflow-ts/react]');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('codec function identities');
  });

  it('ignores stale async hydration resolution from replaced runtime', async () => {
    let resolveU1: ((value: string | null) => void) | undefined;
    let resolveU2: ((value: string | null) => void) | undefined;

    const storage: PersistStorage = {
      getItem: (key: string) => {
        if (key === 'counter:u1') {
          return new Promise<string | null>((resolve) => {
            resolveU1 = resolve;
          });
        }

        if (key === 'counter:u2') {
          return new Promise<string | null>((resolve) => {
            resolveU2 = resolve;
          });
        }

        return Promise.resolve(null);
      },
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    const { result, rerender } = renderHook(
      (props: PropsInput) =>
        usePersistedWorkflow(propsWorkflow, {
          props,
          persist: {
            storage,
            key: (p) => `counter:${p.userId}`,
            version: PERSIST_VERSION,
            serialize: propsSerialize,
            deserialize: propsDeserialize,
            rehydrate: 'lazy',
          },
        }),
      {
        initialProps: { userId: 'u1', initial: 0 },
      },
    );

    expect(result.current.persistence.phase).toBe('rehydrating');

    rerender({ userId: 'u2', initial: 0 });
    expect(result.current.persistence.phase).toBe('rehydrating');

    resolveU1?.(null);
    await waitForMicrotasks();

    // Stale u1 hydration completion must not affect active u2 runtime state.
    expect(result.current.persistence.phase).toBe('rehydrating');
    expect(result.current.persistence.isHydrated).toBe(false);

    resolveU2?.(envelope('{"value":7}'));
    await waitForMicrotasks();

    expect(result.current.rendering.value).toBe(7);
    expect(result.current.persistence.phase).toBe('ready');
    expect(result.current.persistence.isHydrated).toBe(true);
  });

  it('isolates state by key when switching entities', async () => {
    const { storage } = createMapStorage();

    const { result, rerender } = renderHook(
      (props: PropsInput) =>
        usePersistedWorkflow(propsWorkflow, {
          props,
          persist: {
            storage,
            key: (p) => `counter:${p.userId}`,
            version: PERSIST_VERSION,
            serialize: propsSerialize,
            deserialize: propsDeserialize,
          },
        }),
      {
        initialProps: { userId: 'u1', initial: 0 },
      },
    );

    act(() => {
      result.current.rendering.increment();
    });
    await waitForMicrotasks();
    expect(result.current.rendering.value).toBe(1);

    rerender({ userId: 'u2', initial: 10 });
    expect(result.current.rendering.value).toBe(10);

    act(() => {
      result.current.rendering.increment();
    });
    await waitForMicrotasks();
    expect(result.current.rendering.value).toBe(11);

    rerender({ userId: 'u1', initial: 0 });
    expect(result.current.rendering.value).toBe(1);
  });

  it('supports onOutput and outputHandlers with persistence enabled', () => {
    const onOutput = vi.fn();
    const onSaved = vi.fn();
    const { storage } = createMapStorage();

    const { result } = renderHook(() =>
      usePersistedWorkflow(outputWorkflow, {
        props: undefined,
        onOutput,
        outputHandlers: {
          saved: onSaved,
        },
        persist: {
          storage,
          key: 'output',
          version: PERSIST_VERSION,
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    act(() => {
      result.current.rendering.save();
    });

    expect(onOutput).toHaveBeenCalledWith({ type: 'saved', value: 1 });
    expect(onSaved).toHaveBeenCalledWith({ type: 'saved', value: 1 });
  });

  it('supports pause lifecycle mode', async () => {
    const { storage } = createMapStorage();

    const { result, rerender } = renderHook(
      (isActive: boolean) =>
        usePersistedWorkflow(counterWorkflow, {
          props: undefined,
          lifecycle: 'pause-when-backgrounded',
          isActive,
          persist: {
            storage,
            key: 'counter',
            version: PERSIST_VERSION,
            serialize: counterSerialize,
            deserialize: counterDeserialize,
          },
        }),
      {
        initialProps: true,
      },
    );

    expect(result.current.rendering.count).toBe(0);

    act(() => {
      result.current.rendering.increment();
    });
    expect(result.current.rendering.count).toBe(1);
    await waitForMicrotasks();

    rerender(false);
    expect(result.current.rendering.count).toBe(1);

    rerender(true);
    expect(result.current.rendering.count).toBe(1);
  });

  it('continues rendering when storage throws', async () => {
    const throwingStorage: SyncStorage = {
      getItem: () => {
        throw new Error('read failed');
      },
      setItem: () => {
        throw new Error('write failed');
      },
      removeItem: () => {
        throw new Error('remove failed');
      },
    };

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage: throwingStorage,
          key: 'counter',
          version: PERSIST_VERSION,
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    expect(result.current.rendering.count).toBe(0);

    act(() => {
      result.current.rendering.increment();
    });

    await waitForMicrotasks();
    expect(result.current.rendering.count).toBe(1);
  });

  it('throws when resolved key is empty', () => {
    const { storage } = createMapStorage();

    expect(() => {
      renderHook(() =>
        usePersistedWorkflow(counterWorkflow, {
          props: undefined,
          persist: {
            storage,
            key: '   ',
            version: PERSIST_VERSION,
            serialize: counterSerialize,
            deserialize: counterDeserialize,
          },
        }),
      );
    }).toThrow('Persist config "key" must be a non-empty string');
  });

  it('throws when key resolver returns non-string value', () => {
    const { storage } = createMapStorage();

    expect(() => {
      renderHook(() =>
        usePersistedWorkflow(counterWorkflow, {
          props: undefined,
          persist: {
            storage,
            key: (() => 123) as unknown as PersistKeyResolver<void>,
            version: PERSIST_VERSION,
            serialize: counterSerialize,
            deserialize: counterDeserialize,
          },
        }),
      );
    }).toThrow('Persist config "key" must resolve to a string');
  });

  it('reports hydration error on rehydrate failures', async () => {
    const throwingStorage: SyncStorage = {
      getItem: () => {
        throw new Error('rehydrate read failed');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    const { result } = renderHook(() =>
      usePersistedWorkflow(counterWorkflow, {
        props: undefined,
        persist: {
          storage: throwingStorage,
          key: 'counter',
          version: PERSIST_VERSION,
          rehydrate: 'lazy',
          serialize: counterSerialize,
          deserialize: counterDeserialize,
        },
      }),
    );

    await waitForMicrotasks();

    expect(result.current.persistence.phase).toBe('error');
    expect(result.current.persistence.isHydrated).toBe(false);
    expect(result.current.persistence.error).toBeInstanceOf(Error);
    expect((result.current.persistence.error as Error).message).toBe('rehydrate read failed');
  });

  it('preserves state, updateProps and snapshot behavior', async () => {
    const { storage } = createMapStorage();

    const { result } = renderHook(() =>
      usePersistedWorkflow(propsWorkflow, {
        props: { userId: 'u1', initial: 1 },
        persist: {
          storage,
          key: (props) => `counter:${props.userId}`,
          version: PERSIST_VERSION,
          serialize: propsSerialize,
          deserialize: propsDeserialize,
        },
      }),
    );

    expect(result.current.rendering.value).toBe(1);

    act(() => {
      result.current.rendering.increment();
    });
    await waitForMicrotasks();

    expect(result.current.state).toEqual({ value: 2 });
    expect(result.current.snapshot()).toBe('{"value":2}');

    act(() => {
      result.current.updateProps({ userId: 'u1', initial: 10 });
    });

    expect(result.current.props).toEqual({ userId: 'u1', initial: 10 });
  });
});
