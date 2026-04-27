import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRuntime,
  createWorker,
  debounceWorker,
  fromPromise,
  type Workflow,
  type Worker,
} from '../src';
import { WorkerManager } from '../src/worker';

// ============================================================
// Test Utilities
// ============================================================

/**
 * Create a worker that resolves after a delay.
 * Useful for testing async worker lifecycle.
 */
function createDelayedWorker<T>(key: string, delayMs: number, value: T): Worker<T> {
  return createWorker(key, async (signal) => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, delayMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
    return value;
  });
}

/**
 * Create a worker that tracks abort signal calls.
 */
function createAbortTrackingWorker(key: string): {
  worker: Worker<void>;
  wasAborted: () => boolean;
} {
  let aborted = false;
  const worker = createWorker(key, async (signal) => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 10000);
      signal.addEventListener('abort', () => {
        aborted = true;
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  });
  return {
    worker,
    wasAborted: () => aborted,
  };
}

function createInstrumentedAbortController(): {
  signal: AbortSignal;
  abort: () => void;
  getAbortListenerCount: () => number;
  addAbortListenerSpy: ReturnType<typeof vi.fn>;
  removeAbortListenerSpy: ReturnType<typeof vi.fn>;
} {
  let aborted = false;
  const abortListeners = new Set<EventListener>();

  const addAbortListenerSpy = vi.fn((type: string, listener: unknown, _options?: unknown): void => {
    if (type !== 'abort') return;
    if (typeof listener !== 'function') return;
    abortListeners.add(listener);
  });

  const removeAbortListenerSpy = vi.fn(
    (type: string, listener: unknown, _options?: unknown): void => {
      if (type !== 'abort') return;
      if (typeof listener !== 'function') return;
      abortListeners.delete(listener);
    },
  );

  const signal = {
    get aborted(): boolean {
      return aborted;
    },
    addEventListener: addAbortListenerSpy,
    removeEventListener: removeAbortListenerSpy,
  } as unknown as AbortSignal;

  const abort = (): void => {
    if (aborted) return;
    aborted = true;
    const listeners = Array.from(abortListeners);
    abortListeners.clear();
    const event = new Event('abort');
    listeners.forEach((listener) => listener(event));
  };

  return {
    signal,
    abort,
    getAbortListenerCount: () => abortListeners.size,
    addAbortListenerSpy,
    removeAbortListenerSpy,
  };
}

// ============================================================
// WorkerManager Tests
// ============================================================

describe('WorkerManager', () => {
  let manager: WorkerManager;

  beforeEach(() => {
    manager = new WorkerManager();
  });

  afterEach(() => {
    manager.stopAll();
  });

  describe('basic lifecycle', () => {
    it('should start a worker', () => {
      const onOutput = vi.fn();
      const onComplete = vi.fn();
      const worker = createDelayedWorker('test', 100, 'result');

      manager.startWorker(worker, 'test', onOutput, onComplete);

      expect(manager.isRunning('test')).toBe(true);
      expect(manager.getActiveWorkerKeys()).toContain('test');
    });

    it('should not restart an already running worker', () => {
      const onOutput = vi.fn();
      const onComplete = vi.fn();
      const worker = createDelayedWorker('test', 100, 'result');

      manager.startWorker(worker, 'test', onOutput, onComplete);
      manager.startWorker(worker, 'test', onOutput, onComplete);

      expect(manager.activeWorkerCount).toBe(1);
    });

    it('should stop a worker', () => {
      const { worker, wasAborted } = createAbortTrackingWorker('test');
      manager.startWorker(worker, 'test', vi.fn(), vi.fn());

      manager.stopWorker('test');

      expect(manager.isRunning('test')).toBe(false);
      expect(wasAborted()).toBe(true);
    });

    it('should not call onComplete when worker is stopped', async () => {
      const { worker } = createAbortTrackingWorker('test');
      const onComplete = vi.fn();
      manager.startWorker(worker, 'test', vi.fn(), onComplete);

      manager.stopWorker('test');
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onComplete).not.toHaveBeenCalled();
      expect(manager.isRunning('test')).toBe(false);
    });

    it('should stop all workers', () => {
      const { worker: w1, wasAborted: w1Aborted } = createAbortTrackingWorker('w1');
      const { worker: w2, wasAborted: w2Aborted } = createAbortTrackingWorker('w2');

      manager.startWorker(w1, 'w1', vi.fn(), vi.fn());
      manager.startWorker(w2, 'w2', vi.fn(), vi.fn());

      manager.stopAll();

      expect(manager.activeWorkerCount).toBe(0);
      expect(w1Aborted()).toBe(true);
      expect(w2Aborted()).toBe(true);
    });

    it('should catch and log onComplete errors without leaving worker active', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const onCompleteError = new Error('onComplete failed');
      const worker = createWorker('test', async () => 'done');

      try {
        manager.startWorker(worker, 'test', vi.fn(), () => {
          throw onCompleteError;
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(manager.isRunning('test')).toBe(false);
        expect(manager.activeWorkerCount).toBe(0);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Worker test onComplete error:',
          onCompleteError,
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('should call onComplete when worker throws synchronously', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const workerError = new Error('worker failed');
      const onCompleteError = new Error('onComplete failed');
      const worker = createWorker('test', () => {
        throw workerError;
      });
      const onComplete = vi.fn(() => {
        throw onCompleteError;
      });

      try {
        manager.startWorker(worker, 'test', vi.fn(), onComplete);

        expect(manager.isRunning('test')).toBe(false);
        expect(manager.activeWorkerCount).toBe(0);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith('Worker test error:', workerError);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Worker test onComplete error:',
          onCompleteError,
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe('render cycle lifecycle', () => {
    it('should track touched workers during render cycle', () => {
      const worker = createDelayedWorker('test', 100, 'result');

      manager.beginRenderCycle();
      manager.startWorker(worker, 'test', vi.fn(), vi.fn());
      expect(manager.isRunning('test')).toBe(true);
      manager.endRenderCycle();

      // Worker should still be running since it was touched
      expect(manager.isRunning('test')).toBe(true);
    });

    it('should stop untouched workers at end of render cycle', async () => {
      const { worker, wasAborted } = createAbortTrackingWorker('test');

      // First render - start the worker
      manager.beginRenderCycle();
      manager.startWorker(worker, 'test', vi.fn(), vi.fn());
      manager.endRenderCycle();

      expect(manager.isRunning('test')).toBe(true);
      expect(wasAborted()).toBe(false);

      // Second render - don't touch the worker
      manager.beginRenderCycle();
      // Not calling startWorker for 'test'
      manager.endRenderCycle();

      // Worker should be stopped now
      expect(manager.isRunning('test')).toBe(false);
      expect(wasAborted()).toBe(true);
    });

    it('should keep running workers that are touched in new render', () => {
      const { worker, wasAborted } = createAbortTrackingWorker('test');

      // First render - start the worker
      manager.beginRenderCycle();
      manager.startWorker(worker, 'test', vi.fn(), vi.fn());
      manager.endRenderCycle();

      // Second render - touch the worker again
      manager.beginRenderCycle();
      manager.startWorker(worker, 'test', vi.fn(), vi.fn());
      manager.endRenderCycle();

      // Worker should still be running
      expect(manager.isRunning('test')).toBe(true);
      expect(wasAborted()).toBe(false);
    });

    it('should handle multiple workers with different touch patterns', () => {
      const { worker: w1, wasAborted: w1Aborted } = createAbortTrackingWorker('w1');
      const { worker: w2, wasAborted: w2Aborted } = createAbortTrackingWorker('w2');

      // First render - start both
      manager.beginRenderCycle();
      manager.startWorker(w1, 'w1', vi.fn(), vi.fn());
      manager.startWorker(w2, 'w2', vi.fn(), vi.fn());
      manager.endRenderCycle();

      // Second render - only touch w1
      manager.beginRenderCycle();
      manager.startWorker(w1, 'w1', vi.fn(), vi.fn());
      // Not touching w2
      manager.endRenderCycle();

      // w1 should be running, w2 should be stopped
      expect(manager.isRunning('w1')).toBe(true);
      expect(manager.isRunning('w2')).toBe(false);
      expect(w1Aborted()).toBe(false);
      expect(w2Aborted()).toBe(true);
    });
  });
});

// ============================================================
// Workflow Worker Integration Tests
// ============================================================

describe('Workflow with workers', () => {
  interface TestState {
    readonly value: string;
    readonly workerRunning: boolean;
  }

  interface TestRendering {
    readonly value: string;
    readonly toggleWorker: () => void;
  }

  it('should start worker when called in render', async () => {
    let started = false;
    const testWorker = createWorker('test', async () => {
      started = true;
      return 'done';
    });

    const workflow: Workflow<boolean, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'initial', workerRunning: false }),
      render: (props, state, ctx) => {
        if (props) {
          ctx.runWorker(testWorker, 'test', (output) => (s) => ({
            state: { ...s, value: output },
          }));
        }
        return {
          value: state.value,
          toggleWorker: () => {},
        };
      },
    };

    const runtime = createRuntime(workflow, true);
    runtime.getRendering();

    // Wait for worker to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(started).toBe(true);
    runtime.dispose();
  });

  it('should defer workers in manual effect mode until effects are started', async () => {
    let starts = 0;
    const testWorker = createWorker('test', async () => {
      starts += 1;
      return 'done';
    });

    const workflow: Workflow<boolean, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'initial', workerRunning: false }),
      render: (props, state, ctx) => {
        if (props) {
          ctx.runWorker(testWorker, 'test', (output) => (s) => ({
            state: { ...s, value: output },
          }));
        }
        return {
          value: state.value,
          toggleWorker: () => {},
        };
      },
    };

    const runtime = createRuntime(workflow, true, { effectMode: 'manual' });
    runtime.getRendering();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(starts).toBe(0);

    runtime.startEffects();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(starts).toBe(1);

    runtime.dispose();
  });

  it('should defer newly declared manual workers until the next effects start', () => {
    let starts = 0;
    const testWorker = createWorker('test', async () => {
      starts += 1;
      return 'done';
    });

    const workflow: Workflow<void, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'initial', workerRunning: false }),
      render: (_props, state, ctx) => {
        if (state.workerRunning) {
          ctx.runWorker(testWorker, 'test', (output) => (s) => ({
            state: { ...s, value: output },
          }));
        }
        return {
          value: state.value,
          toggleWorker: () => {
            ctx.actionSink.send((s) => ({
              state: { ...s, workerRunning: true },
            }));
          },
        };
      },
    };

    const runtime = createRuntime(workflow, undefined, { effectMode: 'manual' });
    const rendering = runtime.getRendering();
    runtime.startEffects();
    expect(starts).toBe(0);

    rendering.toggleWorker();
    runtime.getRendering();
    expect(starts).toBe(0);

    runtime.startEffects();
    expect(starts).toBe(1);

    runtime.dispose();
  });

  it('should defer stopping omitted manual workers until the next effects start', () => {
    let starts = 0;
    let signal: AbortSignal | undefined;
    const testWorker = createWorker('test', async (receivedSignal) => {
      starts += 1;
      signal = receivedSignal;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 10000);
        receivedSignal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const workflow: Workflow<boolean, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'initial', workerRunning: false }),
      render: (props, state, ctx) => {
        if (props) {
          ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        }
        return {
          value: state.value,
          toggleWorker: () => {},
        };
      },
    };

    const runtime = createRuntime(workflow, true, { effectMode: 'manual' });
    runtime.getRendering();
    runtime.startEffects();
    expect(starts).toBe(1);
    expect(signal?.aborted).toBe(false);

    runtime.updateProps(false);
    runtime.getRendering();
    expect(signal?.aborted).toBe(false);

    runtime.updateProps(true);
    runtime.getRendering();
    runtime.startEffects();
    expect(starts).toBe(1);
    expect(signal?.aborted).toBe(false);

    runtime.updateProps(false);
    runtime.getRendering();
    expect(signal?.aborted).toBe(false);

    runtime.startEffects();
    expect(signal?.aborted).toBe(true);

    runtime.dispose();
  });

  it('should defer child workflow manual workers until the parent effects start', () => {
    let starts = 0;
    const childWorker = createWorker('child', async () => {
      starts += 1;
      return 'done';
    });

    const childWorkflow: Workflow<void, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'child', workerRunning: true }),
      render: (_props, state, ctx) => {
        ctx.runWorker(childWorker, 'child', (output) => (s) => ({
          state: { ...s, value: output },
        }));
        return {
          value: state.value,
          toggleWorker: () => {},
        };
      },
    };

    const parentWorkflow: Workflow<void, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'parent', workerRunning: false }),
      render: (_props, state, ctx) => {
        if (state.workerRunning) {
          ctx.renderChild(childWorkflow, undefined, 'child');
        }
        return {
          value: state.value,
          toggleWorker: () => {
            ctx.actionSink.send((s) => ({
              state: { ...s, workerRunning: true },
            }));
          },
        };
      },
    };

    const runtime = createRuntime(parentWorkflow, undefined, { effectMode: 'manual' });
    const rendering = runtime.getRendering();
    runtime.startEffects();
    expect(starts).toBe(0);

    rendering.toggleWorker();
    runtime.getRendering();
    expect(starts).toBe(0);

    runtime.startEffects();
    expect(starts).toBe(1);

    runtime.dispose();
  });

  it('should stop and restart declared workers when manual effects are toggled', async () => {
    let starts = 0;
    let signal: AbortSignal | undefined;
    const testWorker = createWorker('test', async (receivedSignal) => {
      starts += 1;
      signal = receivedSignal;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 10000);
        receivedSignal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const workflow: Workflow<void, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'initial', workerRunning: false }),
      render: (_props, state, ctx) => {
        ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        return {
          value: state.value,
          toggleWorker: () => {},
        };
      },
    };

    const runtime = createRuntime(workflow, undefined, { effectMode: 'manual' });
    runtime.getRendering();
    runtime.startEffects();
    expect(starts).toBe(1);
    expect(signal?.aborted).toBe(false);

    runtime.stopEffects();
    expect(signal?.aborted).toBe(true);

    runtime.startEffects();
    expect(starts).toBe(2);

    runtime.dispose();
  });

  it('should stop worker when no longer called in render', async () => {
    const { worker, wasAborted } = createAbortTrackingWorker('test');

    const workflow: Workflow<boolean, TestState, never, TestRendering> = {
      initialState: () => ({ value: 'initial', workerRunning: false }),
      render: (props, state, ctx) => {
        if (props) {
          ctx.runWorker(worker, 'test', () => (s) => ({ state: s }));
        }
        return {
          value: state.value,
          toggleWorker: () => {},
        };
      },
    };

    const runtime = createRuntime(workflow, true);
    runtime.getRendering();

    // Worker should be started
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wasAborted()).toBe(false);

    // Update props to false - worker should stop
    runtime.updateProps(false);
    runtime.getRendering();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wasAborted()).toBe(true);

    runtime.dispose();
  });

  it('should handle worker output and update state', async () => {
    const testWorker = createWorker('test', async () => {
      return 'worker-result';
    });

    interface State {
      readonly results: string[];
    }

    const workflow: Workflow<void, State, never, { results: string[] }> = {
      initialState: () => ({ results: [] }),
      render: (_props, state, ctx) => {
        ctx.runWorker(testWorker, 'test', (output) => (s) => ({
          state: { results: [...s.results, output] },
        }));
        return { results: state.results };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();

    // Wait for worker to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(runtime.getState().results).toContain('worker-result');
    runtime.dispose();
  });

  it('should not restart worker if called multiple times in same render', () => {
    let startCount = 0;
    const testWorker = createWorker('test', async () => {
      startCount++;
      return 'done';
    });

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        // Call runWorker multiple times - should only start once
        ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        return { count: state.count };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();

    expect(startCount).toBe(1);
    runtime.dispose();
  });

  it('should stop workers when runtime is disposed', async () => {
    const { worker, wasAborted } = createAbortTrackingWorker('test');

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        ctx.runWorker(worker, 'test', () => (s) => ({ state: s }));
        return { count: state.count };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(wasAborted()).toBe(false);

    runtime.dispose();

    expect(wasAborted()).toBe(true);
  });

  it('should ignore worker output after runtime is disposed', async () => {
    const testWorker = createWorker('test', async () => {
      return 'done';
    });

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        ctx.runWorker(testWorker, 'test', () => (s) => ({ state: { count: s.count + 1 } }));
        return { count: state.count };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();
    runtime.dispose();

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(runtime.getState().count).toBe(0);
  });
});

// ============================================================
// Worker execution environment tests
// ============================================================

const setGlobalForWorkerTest = (key: string, value: unknown): (() => void) => {
  const runtimeGlobals = globalThis as Record<string, unknown>;
  const hadOwnKey = Object.prototype.hasOwnProperty.call(runtimeGlobals, key);
  const previousDescriptor = hadOwnKey
    ? Object.getOwnPropertyDescriptor(runtimeGlobals, key)
    : undefined;

  if (previousDescriptor?.configurable === false) {
    const previousValue = runtimeGlobals[key];
    runtimeGlobals[key] = value;
    return () => {
      runtimeGlobals[key] = previousValue;
    };
  }

  Object.defineProperty(runtimeGlobals, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: previousDescriptor?.enumerable ?? true,
  });

  return () => {
    if (hadOwnKey && previousDescriptor !== undefined) {
      Object.defineProperty(runtimeGlobals, key, previousDescriptor);
      return;
    }
    Reflect.deleteProperty(runtimeGlobals, key);
  };
};

describe('Worker execution environment guard', () => {
  it('blocks workers in server-like non-test environments and warns once per key', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const previousNodeEnv = process.env.NODE_ENV;
    const restoreGlobals = [
      setGlobalForWorkerTest('window', undefined),
      setGlobalForWorkerTest('document', undefined),
      setGlobalForWorkerTest('navigator', undefined),
      setGlobalForWorkerTest('vi', undefined),
      setGlobalForWorkerTest('jest', undefined),
      setGlobalForWorkerTest('__DEV__', true),
    ];
    process.env.NODE_ENV = 'production';

    let workerRuns = 0;
    const testWorker = createWorker('blocked-worker', async () => {
      workerRuns += 1;
      return 'done';
    });

    interface State {
      readonly count: number;
    }
    interface Rendering {
      readonly count: number;
      readonly bump: () => void;
    }

    const workflow: Workflow<void, State, never, Rendering> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        ctx.runWorker(testWorker, 'blocked-key', () => (s) => ({ state: s }));
        return {
          count: state.count,
          bump: () => {
            ctx.actionSink.send((s) => ({ state: { count: s.count + 1 } }));
          },
        };
      },
    };

    try {
      const runtime = createRuntime(workflow, undefined);
      runtime.getRendering().bump();
      runtime.getRendering().bump();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(workerRuns).toBe(0);
      expect(warningSpy).toHaveBeenCalledTimes(1);
      expect(warningSpy).toHaveBeenCalledWith(
        expect.stringContaining('blocked in this environment'),
      );

      runtime.dispose();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      while (restoreGlobals.length > 0) {
        restoreGlobals.pop()?.();
      }
      warningSpy.mockRestore();
    }
  });

  it('allows workers in browser-like environments', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const restoreGlobals = [
      setGlobalForWorkerTest('window', {}),
      setGlobalForWorkerTest('document', {}),
      setGlobalForWorkerTest('navigator', undefined),
      setGlobalForWorkerTest('vi', undefined),
      setGlobalForWorkerTest('jest', undefined),
    ];
    process.env.NODE_ENV = 'production';

    let workerRuns = 0;
    const testWorker = createWorker('browser-worker', async () => {
      workerRuns += 1;
      return 1;
    });

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        if (state.count === 0) {
          ctx.runWorker(testWorker, 'browser-key', (value) => () => ({ state: { count: value } }));
        }
        return { count: state.count };
      },
    };

    try {
      const runtime = createRuntime(workflow, undefined);
      runtime.getRendering();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(workerRuns).toBe(1);
      expect(runtime.getState().count).toBe(1);
      runtime.dispose();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      while (restoreGlobals.length > 0) {
        restoreGlobals.pop()?.();
      }
    }
  });

  it('allows workers in React Native-like environments without document', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const restoreGlobals = [
      setGlobalForWorkerTest('window', undefined),
      setGlobalForWorkerTest('document', undefined),
      setGlobalForWorkerTest('navigator', { product: 'ReactNative' }),
      setGlobalForWorkerTest('vi', undefined),
      setGlobalForWorkerTest('jest', undefined),
    ];
    process.env.NODE_ENV = 'production';

    let workerRuns = 0;
    const testWorker = createWorker('react-native-worker', async () => {
      workerRuns += 1;
      return 1;
    });

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        if (state.count === 0) {
          ctx.runWorker(testWorker, 'react-native-key', (value) => () => ({
            state: { count: value },
          }));
        }
        return { count: state.count };
      },
    };

    try {
      const runtime = createRuntime(workflow, undefined);
      runtime.getRendering();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(workerRuns).toBe(1);
      expect(runtime.getState().count).toBe(1);
      runtime.dispose();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      while (restoreGlobals.length > 0) {
        restoreGlobals.pop()?.();
      }
    }
  });

  it('allows workers in test environments', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const restoreGlobals = [
      setGlobalForWorkerTest('window', undefined),
      setGlobalForWorkerTest('document', undefined),
      setGlobalForWorkerTest('navigator', undefined),
      setGlobalForWorkerTest('vi', undefined),
      setGlobalForWorkerTest('jest', undefined),
    ];
    process.env.NODE_ENV = 'test';

    let workerRuns = 0;
    const testWorker = createWorker('test-env-worker', async () => {
      workerRuns += 1;
      return 1;
    });

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        if (state.count === 0) {
          ctx.runWorker(testWorker, 'test-env-key', (value) => () => ({ state: { count: value } }));
        }
        return { count: state.count };
      },
    };

    try {
      const runtime = createRuntime(workflow, undefined);
      runtime.getRendering();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(workerRuns).toBe(1);
      expect(runtime.getState().count).toBe(1);
      runtime.dispose();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      while (restoreGlobals.length > 0) {
        restoreGlobals.pop()?.();
      }
    }
  });

  it('allows workers when a known test global is present', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const restoreGlobals = [
      setGlobalForWorkerTest('window', undefined),
      setGlobalForWorkerTest('document', undefined),
      setGlobalForWorkerTest('navigator', undefined),
      setGlobalForWorkerTest('vi', {}),
      setGlobalForWorkerTest('jest', undefined),
    ];
    process.env.NODE_ENV = 'production';

    let workerRuns = 0;
    const testWorker = createWorker('test-global-worker', async () => {
      workerRuns += 1;
      return 1;
    });

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        if (state.count === 0) {
          ctx.runWorker(testWorker, 'test-global-key', (value) => () => ({
            state: { count: value },
          }));
        }
        return { count: state.count };
      },
    };

    try {
      const runtime = createRuntime(workflow, undefined);
      runtime.getRendering();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(workerRuns).toBe(1);
      expect(runtime.getState().count).toBe(1);
      runtime.dispose();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      while (restoreGlobals.length > 0) {
        restoreGlobals.pop()?.();
      }
    }
  });

  it('applies the same environment guard for child runtimes', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const previousNodeEnv = process.env.NODE_ENV;
    let childRuns = 0;

    const childWorker = createWorker('child-worker', async () => {
      childRuns += 1;
      return 1;
    });

    const childWorkflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        if (state.count === 0) {
          ctx.runWorker(childWorker, 'child-worker-key', (value) => () => ({
            state: { count: value },
          }));
        }
        return { count: state.count };
      },
    };

    const parentWorkflow: Workflow<void, { done: boolean }, never, { childCount: number }> = {
      initialState: () => ({ done: false }),
      render: (_props, state, ctx) => {
        const child = ctx.renderChild(childWorkflow, undefined, 'child');
        return { childCount: child.count + (state.done ? 1 : 0) };
      },
    };

    const blockedRestores = [
      setGlobalForWorkerTest('window', undefined),
      setGlobalForWorkerTest('document', undefined),
      setGlobalForWorkerTest('navigator', undefined),
      setGlobalForWorkerTest('vi', undefined),
      setGlobalForWorkerTest('jest', undefined),
    ];
    process.env.NODE_ENV = 'production';

    try {
      const blockedRuntime = createRuntime(parentWorkflow, undefined);
      blockedRuntime.getRendering();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(childRuns).toBe(0);
      blockedRuntime.dispose();

      while (blockedRestores.length > 0) {
        blockedRestores.pop()?.();
      }

      const allowedRestores = [
        setGlobalForWorkerTest('window', {}),
        setGlobalForWorkerTest('document', {}),
        setGlobalForWorkerTest('navigator', undefined),
        setGlobalForWorkerTest('vi', undefined),
        setGlobalForWorkerTest('jest', undefined),
      ];

      childRuns = 0;
      const allowedRuntime = createRuntime(parentWorkflow, undefined);
      allowedRuntime.getRendering();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(childRuns).toBe(1);
      allowedRuntime.dispose();

      while (allowedRestores.length > 0) {
        allowedRestores.pop()?.();
      }
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      while (blockedRestores.length > 0) {
        blockedRestores.pop()?.();
      }
      warningSpy.mockRestore();
    }
  });
});

// ============================================================
// Disposal Reentrancy Regression Tests
// ============================================================

describe('Disposal reentrancy (regression: "Cannot use disposed workflow runtime")', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when on() handler disposes runtime during worker output processing', async () => {
    // Regression: worker output fires an action that emits a typed output. The on()
    // handler calls dispose() inside processAction — before emitTypedOutput returns.
    // Before the fix, processAction would then call notifyListeners() on a disposed
    // runtime, hitting assertNotDisposed() and throwing "Cannot use disposed workflow
    // runtime". That error was caught by WorkerManager and logged via console.error.
    const consoleErrors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => consoleErrors.push(args));

    interface Output {
      type: 'done';
    }
    const worker = createWorker('test', async () => 'result');

    const workflow: Workflow<void, { count: number }, Output, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        ctx.runWorker(worker, 'test', () => (_s) => ({
          state: { count: 1 },
          output: { type: 'done' as const },
        }));
        return { count: state.count };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();

    runtime.on('done', () => {
      runtime.dispose();
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(runtime.isDisposed()).toBe(true);
    expect(consoleErrors).toHaveLength(0);
  });

  it('does not throw when subscribe() listener disposes runtime while an action is queued', async () => {
    // Regression: a subscribe listener queues a new action (via send) then disposes
    // the runtime. Before the fix, the while loop in handleAction() had no disposed
    // check and would process the queued action on a disposed runtime, calling
    // notifyListeners() -> getRendering() -> assertNotDisposed() -> throw.
    const consoleErrors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => consoleErrors.push(args));

    const increment = (s: { count: number }) => ({ state: { count: s.count + 1 } });
    const worker = createWorker('test', async () => 'result');

    const workflow: Workflow<void, { count: number }, never, { count: number }> = {
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => {
        ctx.runWorker(worker, 'test', () => increment);
        return { count: state.count };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();

    // Queuing an action while isProcessingActions=true puts it in the action queue.
    // Disposing immediately after means the while loop must check disposed before
    // processing queued actions, or the next processAction call will throw.
    runtime.subscribe(() => {
      runtime.send(increment);
      runtime.dispose();
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(runtime.isDisposed()).toBe(true);
    expect(consoleErrors).toHaveLength(0);
  });
});

// ============================================================
// AbortSignal Integration Tests
// ============================================================

describe('AbortSignal integration', () => {
  it('should pass AbortSignal to worker run function', () => {
    let receivedSignal: AbortSignal | null = null;
    const testWorker = createWorker('test', async (signal) => {
      receivedSignal = signal;
      return 'done';
    });

    const workflow: Workflow<void, { v: number }, never, { v: number }> = {
      initialState: () => ({ v: 0 }),
      render: (_props, state, ctx) => {
        ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        return { v: state.v };
      },
    };

    const runtime = createRuntime(workflow, undefined);
    runtime.getRendering();

    expect(receivedSignal).not.toBeNull();
    expect(receivedSignal?.aborted).toBe(false);

    runtime.dispose();
  });

  it('should abort signal when worker is stopped', async () => {
    let signalAtAbort: AbortSignal | null = null;
    const testWorker = createWorker('test', async (signal) => {
      signalAtAbort = signal;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, 10000);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return 'done';
    });

    const workflow: Workflow<boolean, { v: number }, never, { v: number }> = {
      initialState: () => ({ v: 0 }),
      render: (props, state, ctx) => {
        if (props) {
          ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        }
        return { v: state.v };
      },
    };

    const runtime = createRuntime(workflow, true);
    runtime.getRendering();

    expect(signalAtAbort?.aborted).toBe(false);

    // Stop the worker by changing props
    runtime.updateProps(false);
    runtime.getRendering();

    // Signal should be aborted
    expect(signalAtAbort?.aborted).toBe(true);

    runtime.dispose();
  });

  it('should handle worker that checks signal.aborted', async () => {
    const testWorker = createWorker('test', async (signal) => {
      // Simulate a long-running task that periodically checks aborted
      for (let i = 0; i < 100; i++) {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return 'done';
    });

    const workflow: Workflow<boolean, { v: number }, never, { v: number }> = {
      initialState: () => ({ v: 0 }),
      render: (props, state, ctx) => {
        if (props) {
          ctx.runWorker(testWorker, 'test', () => (s) => ({ state: s }));
        }
        return { v: state.v };
      },
    };

    const runtime = createRuntime(workflow, true);
    runtime.getRendering();

    // Let the worker run for a bit
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Stop the worker
    runtime.updateProps(false);
    runtime.getRendering();

    // Worker should have been stopped without error
    runtime.dispose();
  });

  it('should abort fromPromise before awaiting factory when already aborted', async () => {
    const worker = fromPromise('test', async () => {
      throw new Error('should not run');
    });

    const controller = new AbortController();
    controller.abort();

    await expect(worker.run(controller.signal)).rejects.toThrow('Aborted');
  });

  it('should abort debounced worker before starting inner worker', async () => {
    let innerRuns = 0;
    const inner = createWorker('inner', async () => {
      innerRuns += 1;
      return 'done';
    });
    const debounced = debounceWorker('debounced', inner, 50);

    const controller = createInstrumentedAbortController();
    const promise = debounced.run(controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
    expect(innerRuns).toBe(0);
    expect(controller.addAbortListenerSpy).toHaveBeenCalledTimes(1);
    expect(controller.removeAbortListenerSpy).toHaveBeenCalledTimes(1);
    expect(controller.removeAbortListenerSpy).toHaveBeenCalledWith(
      'abort',
      controller.addAbortListenerSpy.mock.calls[0]?.[1],
    );
    expect(controller.getAbortListenerCount()).toBe(0);
  });

  it('should remove debounce abort listener after delay when worker is not aborted', async () => {
    let innerRuns = 0;
    const inner = createWorker('inner', async () => {
      innerRuns += 1;
      return 'done';
    });
    const debounced = debounceWorker('debounced', inner, 1);
    const controller = createInstrumentedAbortController();

    await expect(debounced.run(controller.signal)).resolves.toBe('done');

    expect(innerRuns).toBe(1);
    expect(controller.addAbortListenerSpy).toHaveBeenCalledTimes(1);
    expect(controller.removeAbortListenerSpy).toHaveBeenCalledTimes(1);
    expect(controller.removeAbortListenerSpy).toHaveBeenCalledWith(
      'abort',
      controller.addAbortListenerSpy.mock.calls[0]?.[1],
    );
    expect(controller.getAbortListenerCount()).toBe(0);
  });
});
