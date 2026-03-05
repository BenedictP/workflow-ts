import type { Worker } from './types';

// ============================================================
// Worker Manager - Handles worker lifecycle
// ============================================================

/**
 * Internal state for tracking a running worker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface WorkerState<T = any> {
  /** AbortController for cancelling the worker */
  readonly controller: AbortController;
  /** Current status of the worker */
  status: 'running' | 'stopped' | 'completed';
  /** Whether this worker was used in the current render cycle */
  touched: boolean;
  /** The worker function */
  worker: Worker<T>;
  /** Output handler */
  onOutput: (output: T) => void;
  /** Completion handler */
  onComplete: () => void;
}

/**
 * Manages worker lifecycle (start/stop based on render calls).
 * Workers are started when called in render() and stopped when
 * they're no longer called in subsequent renders.
 */
export class WorkerManager {
  private readonly activeWorkers = new Map<string, WorkerState>();
  /** Keys of workers that were touched in the current render cycle */
  private touchedKeys = new Set<string>();
  /** Whether we're currently in a render cycle */
  private inRenderCycle = false;

  /** Whether we're currently in a render cycle */
  public get isInRenderCycle(): boolean {
    return this.inRenderCycle;
  }

  /**
   * Begin a new render cycle.
   * This resets the touched set to track which workers are used.
   * Must be paired with endRenderCycle().
   */
  public beginRenderCycle(): void {
    this.inRenderCycle = true;
    this.touchedKeys.clear();
  }

  /**
   * End the current render cycle.
   * Stops any workers that were not touched during the render.
   */
  public endRenderCycle(): void {
    this.inRenderCycle = false;

    // Stop any workers that weren't touched in this render
    for (const key of this.activeWorkers.keys()) {
      if (!this.touchedKeys.has(key)) {
        this.stopWorker(key);
      }
    }

    this.touchedKeys.clear();
  }

  /**
   * Start a worker if not already running.
   * During a render cycle, marks the worker as touched.
   * If worker with same key is already running, keeps it alive (no restart).
   * To restart with new worker, stopWorker must be called first.
   *
   * @param worker - The worker to start
   * @param key - Unique key for this worker
   * @param onOutput - Callback when worker produces output
   * @param onComplete - Callback when worker completes
   */
  public startWorker<T>(
    worker: Worker<T>,
    key: string,
    onOutput: (output: T) => void,
    onComplete: () => void,
  ): void {
    // Mark as touched if in a render cycle
    if (this.inRenderCycle) {
      this.touchedKeys.add(key);
    }

    // Already running - keep it alive, don't restart
    // (handler changes will be picked up on next render after worker completes)
    const existing = this.activeWorkers.get(key);
    if (existing !== undefined) {
      // Update handlers for when worker next produces output
      existing.onOutput = onOutput;
      existing.onComplete = onComplete;
      return;
    }

    const controller = new AbortController();
    const state: WorkerState<T> = {
      controller,
      status: 'running',
      touched: true,
      worker,
      onOutput,
      onComplete,
    };

    this.activeWorkers.set(key, state);

    worker
      .run(controller.signal)
      .then((output: T) => {
        if (state.status === 'running') {
          state.onOutput(output);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          // Expected when aborted
          return;
        }
        console.error(`Worker ${key} error:`, error);
      })
      .finally(() => {
        if (state.status === 'running') {
          state.status = 'completed';
          this.activeWorkers.delete(key);
          try {
            state.onComplete();
          } catch (error) {
            console.error(`Worker ${key} onComplete error:`, error);
          }
        }
      });
  }

  /**
   * Stop a specific worker.
   *
   * @param key - The key of the worker to stop
   */
  public stopWorker(key: string): void {
    const state = this.activeWorkers.get(key);
    if (state !== undefined) {
      state.status = 'stopped';
      state.controller.abort();
      this.activeWorkers.delete(key);
    }
  }

  /**
   * Stop all workers.
   */
  public stopAll(): void {
    this.activeWorkers.forEach((state) => {
      state.status = 'stopped';
      state.controller.abort();
    });
    this.activeWorkers.clear();
    this.touchedKeys.clear();
  }

  /**
   * Dispose of all workers and resources.
   * Alias for stopAll() for API consistency.
   */
  public dispose(): void {
    this.stopAll();
  }

  /**
   * Get keys of all active workers.
   */
  public getActiveWorkerKeys(): readonly string[] {
    return Array.from(this.activeWorkers.keys());
  }

  /**
   * Check if a worker with the given key is running.
   */
  public isRunning(key: string): boolean {
    return this.activeWorkers.has(key);
  }

  /**
   * Get the count of active workers (for testing).
   */
  public get activeWorkerCount(): number {
    return this.activeWorkers.size;
  }
}

// ============================================================
// Worker factories
// ============================================================

/**
 * Create a worker from an async function.
 *
 * @example
 * ```typescript
 * const fetchUser = createWorker('fetch-user', async (signal) => {
 *   const response = await fetch('/api/user', { signal });
 *   return response.json();
 * });
 * ```
 */
export function createWorker<T>(
  key: string,
  run: (signal: AbortSignal) => Promise<T>,
): Worker<T> {
  return {
    key,
    run,
  };
}

/**
 * Create a worker from a promise factory.
 *
 * @example
 * ```typescript
 * const loadData = fromPromise('load-data', () => api.getData());
 * ```
 */
export function fromPromise<T>(key: string, factory: (signal?: AbortSignal) => Promise<T>): Worker<T> {
  return createWorker(key, async (signal: AbortSignal): Promise<T> => {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return factory(signal);
  });
}

/**
 * Create a worker that fetches JSON data.
 *
 * @example
 * ```typescript
 * const fetchTodos = fetchWorker<Todo[]>('fetch-todos', '/api/todos');
 * ```
 */
export function fetchWorker<T>(key: string, url: string, options?: RequestInit): Worker<T> {
  return createWorker(key, async (signal: AbortSignal): Promise<T> => {
    const response = await fetch(url, { ...options, signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  });
}

/**
 * Create a debounced worker.
 * Waits for the specified delay before running the inner worker.
 *
 * @example
 * ```typescript
 * const debouncedSearch = debounceWorker(
 *   'search',
 *   createWorker('search-inner', async (s) => search(query)),
 *   300
 * );
 * ```
 */
export function debounceWorker<T>(key: string, worker: Worker<T>, delayMs: number): Worker<T> {
  return createWorker(key, async (signal: AbortSignal): Promise<T> => {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, delayMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    return worker.run(signal);
  });
}
