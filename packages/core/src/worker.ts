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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface WorkerDeclaration<T = any> {
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
  private readonly declaredWorkers = new Map<string, WorkerDeclaration>();
  private renderDeclaredWorkers: Map<string, WorkerDeclaration> | undefined;
  private pendingDeclaredWorkers: Map<string, WorkerDeclaration> | undefined;
  /** Keys of workers that were touched in the current render cycle */
  private touchedKeys = new Set<string>();
  /** Whether we're currently in a render cycle */
  private inRenderCycle = false;
  /** Whether declared workers should actively run. */
  private effectsStarted: boolean;
  /** Whether worker starts declared during render should wait for an explicit effects flush. */
  private readonly deferRenderStarts: boolean;

  public constructor(effectsStarted = true, deferRenderStarts = false) {
    this.effectsStarted = effectsStarted;
    this.deferRenderStarts = deferRenderStarts;
  }

  /** Whether we're currently in a render cycle */
  public get isInRenderCycle(): boolean {
    return this.inRenderCycle;
  }

  public hasPendingEffects(): boolean {
    return !this.effectsStarted || this.pendingDeclaredWorkers !== undefined;
  }

  /**
   * Begin a new render cycle.
   * This resets the touched set to track which workers are used.
   * Must be paired with endRenderCycle().
   */
  public beginRenderCycle(): void {
    this.inRenderCycle = true;
    this.touchedKeys.clear();
    if (this.deferRenderStarts) {
      this.renderDeclaredWorkers = new Map();
    }
  }

  /**
   * End the current render cycle.
   * Stops any workers that were not touched during the render.
   */
  public endRenderCycle(): void {
    this.inRenderCycle = false;

    if (this.deferRenderStarts) {
      this.pendingDeclaredWorkers = this.renderDeclaredWorkers ?? new Map();
      this.renderDeclaredWorkers = undefined;
      this.touchedKeys.clear();
      return;
    }

    // Stop any workers that weren't touched in this render.
    for (const key of this.declaredWorkers.keys()) {
      if (!this.touchedKeys.has(key)) {
        this.declaredWorkers.delete(key);
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

    const declaration = { worker, onOutput, onComplete };

    if (this.deferRenderStarts && this.inRenderCycle) {
      this.renderDeclaredWorkers?.set(key, declaration);
      return;
    }

    this.declaredWorkers.set(key, declaration);

    if (!this.effectsStarted) {
      return;
    }

    this.startDeclaredWorker(worker, key, onOutput, onComplete);
  }

  /**
   * Start all currently declared workers.
   */
  public startEffects(): void {
    if (!this.hasPendingEffects()) {
      return;
    }

    this.effectsStarted = true;
    this.reconcilePendingDeclarations();
    this.declaredWorkers.forEach((declaration, key) => {
      this.startDeclaredWorker(
        declaration.worker,
        key,
        declaration.onOutput,
        declaration.onComplete,
      );
    });
  }

  /**
   * Stop active workers while preserving the latest render declarations.
   */
  public stopEffects(): void {
    if (!this.effectsStarted) return;
    this.effectsStarted = false;
    this.stopActiveWorkers();
  }

  private startDeclaredWorker<T>(
    worker: Worker<T>,
    key: string,
    onOutput: (output: T) => void,
    onComplete: () => void,
  ): void {
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

    let result: Promise<T>;
    try {
      result = worker.run(controller.signal);
    } catch (error) {
      this.activeWorkers.delete(key);
      state.status = 'completed';
      console.error(`Worker ${key} error:`, error);
      try {
        state.onComplete();
      } catch (completeError) {
        console.error(`Worker ${key} onComplete error:`, completeError);
      }
      return;
    }

    result
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
    this.declaredWorkers.clear();
    this.renderDeclaredWorkers = undefined;
    this.pendingDeclaredWorkers = undefined;
    this.stopActiveWorkers();
  }

  private reconcilePendingDeclarations(): void {
    const pending = this.pendingDeclaredWorkers;
    if (pending === undefined) {
      return;
    }

    this.pendingDeclaredWorkers = undefined;

    for (const key of this.declaredWorkers.keys()) {
      if (!pending.has(key)) {
        this.declaredWorkers.delete(key);
        this.stopWorker(key);
      }
    }

    pending.forEach((declaration, key) => {
      this.declaredWorkers.set(key, declaration);
    });
  }

  private stopActiveWorkers(): void {
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
export function createWorker<T>(key: string, run: (signal: AbortSignal) => Promise<T>): Worker<T> {
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
export function fromPromise<T>(
  key: string,
  factory: (signal?: AbortSignal) => Promise<T>,
): Worker<T> {
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
      let settled = false;
      let onAbort: (() => void) | null = null;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (onAbort !== null) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      };
      const timeout = setTimeout(finish, delayMs);
      onAbort = (): void => {
        clearTimeout(timeout);
        finish();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    return worker.run(signal);
  });
}
