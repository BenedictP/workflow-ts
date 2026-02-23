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
function createDelayedWorker<T>(
  key: string,
  delayMs: number,
  value: T,
): Worker<T> {
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
    const inner = createWorker('inner', async () => 'done');
    const debounced = debounceWorker('debounced', inner, 50);

    const controller = new AbortController();
    const promise = debounced.run(controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
  });
});
