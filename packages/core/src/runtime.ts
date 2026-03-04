import type { DevTools, RuntimeDevTools } from './devtools';
import type { Interceptor } from './interceptor';
import type { Action, RenderContext, Worker, Workflow } from './types';
import { WorkerManager } from './worker';

// ============================================================
// Types
// ============================================================

/**
 * Debug log level
 */
export type LogLevel = 'log' | 'warn' | 'error';

/**
 * Debug logger function
 */
export type DebugLogger = (level: LogLevel, message: string, data?: unknown) => void;

/**
 * Default debug logger that uses console
 */
const defaultLogger: DebugLogger = (level, message, data) => {
  const prefix = '[workflow-ts]';
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${message}`, data);
  } else {
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${message}`);
  }
};

// ============================================================
// Workflow Runtime - The engine that drives workflows
// ============================================================

/**
 * Configuration for creating a workflow runtime.
 */
export interface RuntimeConfig<P, S, O, R> {
  /** The workflow to run */
  readonly workflow: Workflow<P, S, O, R>;
  /** Initial props for the workflow */
  readonly props: P;
  /** Optional callback for workflow outputs */
  readonly onOutput?: ((output: O) => void) | undefined;
  /** Optional initial state (for testing) */
  readonly initialState?: S | undefined;
  /** Optional snapshot to restore state from */
  readonly snapshot?: string | undefined;
  /** Enable debug logging */
  readonly debug?: boolean | DebugLogger | undefined;
  /** Optional interceptors for cross-cutting concerns */
  readonly interceptors?: readonly Interceptor<S, O>[] | undefined;
  /** Optional devtools for debugging/monitoring */
  readonly devTools?: DevTools<S, O, R> | undefined;
}

/**
 * Runtime for a single workflow.
 * Manages state, actions, children, and workers.
 *
 * @template P - Props type
 * @template S - State type
 * @template O - Output type
 * @template R - Rendering type
 */
export class WorkflowRuntime<P, S, O, R> {
  private state: S;
  private cachedRendering: R | null = null;
  private currentProps: P;
  private readonly listeners = new Set<(rendering: R) => void>();
  private readonly workerManager = new WorkerManager();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly childRuntimes = new Map<string, WorkflowRuntime<any, any, any, any>>();
  /** Keys of children that were used in the current render cycle */
  private readonly touchedChildren = new Set<string>();
  private disposed = false;
  private isRendering = false;
  private isProcessingActions = false;
  private readonly actionQueue: Action<S, O>[] = [];

  private outputHandlers = new Map<string, ((output: unknown) => void) | undefined>();
  /** Type-safe output handlers for specific output types */
  private readonly typedOutputHandlers = new Map<string, Set<(output: unknown) => void>>();
  private readonly workflowKeyMap = new WeakMap<object, string>();
  private workflowKeyCounter = 0;

  private readonly debug: DebugLogger | null;
  private readonly devTools: RuntimeDevTools<S, O, R> | null;

  constructor(private readonly config: RuntimeConfig<P, S, O, R>) {
    // Initialize debug logger
    if (config.debug === true) {
      this.debug = defaultLogger;
    } else if (typeof config.debug === 'function') {
      this.debug = config.debug;
    } else {
      this.debug = null;
    }

    const restoredState =
      config.snapshot !== undefined
        ? (config.workflow.restore?.(config.snapshot) ??
          config.workflow.initialState(config.props, config.snapshot))
        : undefined;

    this.state = config.initialState ?? restoredState ?? config.workflow.initialState(config.props);
    this.currentProps = config.props;

    this.debug?.('log', 'Runtime initialized', { initialState: this.state });

    // Initialize devtools
    if (config.devTools !== undefined) {
      this.devTools = config.devTools as RuntimeDevTools<S, O, R>;
      this.devTools._setCurrentState(this.state);
      this.devTools._log({ type: 'init', state: this.state });
    } else {
      this.devTools = null;
    }
  }

  /**
   * Get the current rendering. Cached between state changes.
   */
  public getRendering(): R {
    this.assertNotDisposed();

    this.cachedRendering ??= this.performRender();
    return this.cachedRendering;
  }

  /**
   * Get the current state (for testing/debugging).
   */
  public getState(): S {
    return this.state;
  }

  /**
   * Get the current props.
   */
  public getProps(): P {
    return this.currentProps;
  }

  /**
   * Subscribe to rendering changes.
   *
   * @param listener - Callback when rendering changes
   * @returns Unsubscribe function
   */
  public subscribe(listener: (rendering: R) => void): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update props (triggers re-render).
   *
   * @param props - New props
   */
  public updateProps(props: P): void {
    this.assertNotDisposed();
    if (Object.is(this.currentProps, props)) {
      return;
    }
    this.currentProps = props;
    this.cachedRendering = null;
    // DevTools: log props update
    this.devTools?._log({
      type: 'props:update',
      props,
      state: this.state,
    });
    this.notifyListeners();
  }

  /**
   * Send an action directly to the runtime.
   *
   * @param action - The action to process
   */
  public send(action: Action<S, O>): void {
    this.assertNotDisposed();
    this.handleAction(action);
  }

  /**
   * Dispose the runtime and stop all workers.
   */
  public dispose(): void {
    if (this.disposed) return;

    this.debug?.('log', 'Runtime disposed');
    this.disposed = true;
    this.workerManager.dispose();
    this.listeners.clear();
    this.childRuntimes.forEach((child) => {
      child.dispose();
    });
    this.childRuntimes.clear();
    this.touchedChildren.clear();
    this.cachedRendering = null;
    this.actionQueue.length = 0;
    this.typedOutputHandlers.clear();
  }

  /**
   * Snapshot the current state, if supported.
   */
  public snapshot(): string | undefined {
    if (this.config.workflow.snapshot !== undefined) {
      return this.config.workflow.snapshot(this.state);
    }
    return undefined;
  }

  public isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Subscribe to a specific output type.
   * Only called when the output's type matches the given type.
   *
   * @param type - The output type to listen for
   * @param handler - Callback when this output type is emitted
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // For output type: { type: 'loaded'; data: string } | { type: 'error'; error: string }
   * runtime.on('loaded', (output) => {
   *   console.log('Loaded:', output.data);
   * });
   * runtime.on('error', (output) => {
   *   console.log('Error:', output.error);
   * });
   * ```
   */
  public on<K extends string>(
    type: K,
    handler: (output: O extends { type: K } ? O : never) => void,
  ): () => void {
    this.assertNotDisposed();

    const key = `typed:${type}`;
    let handlers = this.typedOutputHandlers.get(key);
    if (handlers === undefined) {
      handlers = new Set();
      this.typedOutputHandlers.set(key, handlers);
    }

    const wrappedHandler = handler as (output: unknown) => void;
    handlers.add(wrappedHandler);

    return () => {
      handlers.delete(wrappedHandler);
    };
  }

  /**
   * Unsubscribe from a specific output type.
   *
   * @param type - The output type to stop listening for
   * @param handler - Optional specific handler to remove
   */
  public off<K extends string>(
    type: K,
    handler?: (output: O extends { type: K } ? O : never) => void,
  ): void {
    const key = `typed:${type}`;
    const handlers = this.typedOutputHandlers.get(key);

    if (handlers === undefined) return;

    if (handler === undefined) {
      // Remove all handlers for this type
      handlers.clear();
    } else {
      handlers.delete(handler as (output: unknown) => void);
    }
  }

  // ============================================================
  // Private implementation
  // ============================================================

  private performRender(): R {
    // Begin worker render cycle - track which workers are used
    this.workerManager.beginRenderCycle();
    // Reset touched children tracking
    this.touchedChildren.clear();
    this.isRendering = true;

    // DevTools: log render start
    const renderStartTime = this.devTools ? performance.now() : 0;
    this.devTools?._log({ type: 'render', state: this.state });

    let rendering: R;
    try {
      const context = this.createRenderContext();
      rendering = this.config.workflow.render(this.currentProps, this.state, context);
    } finally {
      this.isRendering = false;
      // End render cycle - stop any workers that weren't used
      this.workerManager.endRenderCycle();

      // Dispose any children that weren't rendered in this cycle
      for (const [key, child] of this.childRuntimes) {
        if (!this.touchedChildren.has(key)) {
          child.dispose();
          this.childRuntimes.delete(key);
        }
      }
      this.touchedChildren.clear();
    }

    // DevTools: log render complete
    const durationMs = this.devTools ? performance.now() - renderStartTime : 0;
    this.devTools?._log({
      type: 'render:complete',
      rendering,
      state: this.state,
      durationMs,
    });

    return rendering;
  }

  private createRenderContext(): RenderContext<S, O> {
    // Capture reference to actual methods to avoid infinite recursion
    const renderChildFn = this.renderChild.bind(this);
    const runWorkerFn = this.runWorker.bind(this);

    return {
      actionSink: {
        send: (action: Action<S, O>): void => {
          this.handleAction(action);
        },
      },
      renderChild: renderChildFn,
      runWorker: runWorkerFn,
    };
  }

  private handleAction(action: Action<S, O>): void {
    if (this.disposed) return;  // Silently ignore actions after disposal

    if (this.isRendering || this.isProcessingActions) {
      this.actionQueue.push(action);
      return;
    }

    this.isProcessingActions = true;

    try {
      this.processAction(action);
      while (!this.disposed && this.actionQueue.length > 0) {
        const next = this.actionQueue.shift();
        if (next) this.processAction(next);
      }
    } catch (error) {
      this.debug?.('error', 'Error processing action', error);
      throw error;
    } finally {
      this.isProcessingActions = false;
    }
  }

  private processAction(action: Action<S, O>): void {
    const interceptors = this.config.interceptors ?? [];

    // Build context for interceptors
    const context = {
      state: this.state,
      props: this.currentProps,
      workflowKey: '',
    };

    // DevTools: log action send
    const startTime = this.devTools ? performance.now() : 0;
    this.devTools?._log({ type: 'action:send', action, state: this.state });

    // Call onSend interceptors
    for (const interceptor of interceptors) {
      if (interceptor.config.filter?.(action) === false) continue;
      interceptor.config.onSend?.(action, context);
    }

    let result: import('./types').ActionResult<S, O>;

    try {
      // Execute action
      result = action(this.state);

      // Call onResult interceptors (can modify result)
      for (const interceptor of interceptors) {
        if (interceptor.config.filter?.(action) === false) continue;
        const override = interceptor.config.onResult?.(action, result, context);
        if (override !== undefined) {
          result = override;
        }
      }
    } catch (error) {
      // Call onError interceptors
      for (const interceptor of interceptors) {
        if (interceptor.config.filter?.(action) === false) continue;
        interceptor.config.onError?.(action, error as Error, context);
      }

      // DevTools: log action error
      this.devTools?._log({
        type: 'action:error',
        action,
        state: this.state,
        error: error as Error,
      });

      throw error;
    }

    // DevTools: log action complete + state change
    const durationMs = this.devTools ? performance.now() - startTime : 0;
    this.devTools?._log({
      type: 'action:complete',
      action,
      state: this.state,
      durationMs,
    });

    if (result.state !== this.state) {
      this.devTools?._log({
        type: 'stateChange',
        prevState: this.state,
        newState: result.state,
      });
    }

    // Update state
    this.state = result.state;

    // DevTools: update current state
    this.devTools?._setCurrentState(this.state);

    // Debug log state change
    this.debug?.('log', 'State updated', { newState: this.state });

    // Clear cached rendering
    this.cachedRendering = null;

    // Emit output if any
    if (result.output !== undefined) {
      this.debug?.('log', 'Output emitted', { output: result.output });
      // DevTools: log output
      this.devTools?._log({ type: 'output', output: result.output, state: this.state });
      if (this.config.onOutput !== undefined) {
        this.config.onOutput(result.output);
      }
      // Call typed output handlers
      this.emitTypedOutput(result.output);
    }

    // Notify listeners
    this.notifyListeners();
  }

  private updateOutputHandler(key: string, handler?: (output: unknown) => void): void {
    if (handler === undefined) {
      this.outputHandlers.delete(key);
      return;
    }
    this.outputHandlers.set(key, handler);
  }

  private getOutputHandler(key: string): ((output: unknown) => void) | undefined {
    return this.outputHandlers.get(key);
  }

  private emitTypedOutput(output: O): void {
    // Get the type from the output if it has a type property
    const outputType = (output as { type?: string }).type;
    if (outputType === undefined) return;

    const key = `typed:${outputType}`;
    const handlers = this.typedOutputHandlers.get(key);
    if (handlers === undefined || handlers.size === 0) return;

    handlers.forEach((handler) => {
      try {
        handler(output);
      } catch (error) {
        this.debug?.('error', 'Error in output handler', error);
        console.error('Error in output handler:', error);
      }
    });
  }

  private renderChild<CP, CS, CO, CR>(
    workflow: Workflow<CP, CS, CO, CR>,
    props: CP,
    key: string | undefined,
    handler: ((output: CO) => Action<S, O>) | undefined,
  ): CR {
    const childKey = key ?? this.getWorkflowKey(workflow);

    // Mark this child as touched in the current render cycle
    this.touchedChildren.add(childKey);

    // Get or create child runtime
    let child = this.childRuntimes.get(childKey) as WorkflowRuntime<CP, CS, CO, CR> | undefined;

    if (child === undefined) {
      if (handler !== undefined) {
        this.updateOutputHandler(childKey, (output) => {
          this.debug?.('log', 'Child output received', { childKey, output });
          this.handleAction(handler(output as CO));
        });
      }
      child = new WorkflowRuntime<CP, CS, CO, CR>({
        workflow,
        props,
        onOutput: (output: CO) => {
          this.debug?.('log', 'Child output', { childKey, output });
          this.getOutputHandler(childKey)?.(output);
        },
      });
      this.childRuntimes.set(childKey, child);
    } else {
      // Update props if child already exists - this allows child to react to prop changes
      child.updateProps(props);
      if (handler !== undefined) {
        this.updateOutputHandler(childKey, (output) => {
          this.handleAction(handler(output as CO));
        });
      }
    }

    return child.getRendering();
  }

  private runWorker<W>(worker: Worker<W>, key: string, handler: (output: W) => Action<S, O>): void {
    if (!this.workerManager.isInRenderCycle) {
      console.warn(
        'runWorker was called outside of render; workers started here may be stopped unexpectedly.',
      );
    }

    this.workerManager.startWorker<W>(
      worker,
      key,
      (output: W): void => {
        if (this.disposed) return;
        this.debug?.('log', 'Worker completed', { worker: key, output });
        this.handleAction(handler(output));
      },
      (): void => {
        if (this.disposed) return;
        this.debug?.('log', 'Worker finished', { worker: key });
      },
    );
  }

  private notifyListeners(): void {
    if (this.disposed) return;
    const rendering = this.getRendering();
    this.listeners.forEach((listener) => {
      try {
        listener(rendering);
      } catch (error) {
        this.debug?.('error', 'Error in workflow listener', error);
        console.error('Error in workflow listener:', error);
      }
    });
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Cannot use disposed workflow runtime');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getWorkflowKey(workflow: Workflow<any, any, any, any>): string {
    // Only use constructor name for named functions/classes, not "Object" (default for object literals)
    const constructor = (workflow as object).constructor as { name?: string } | undefined;
    const name = constructor?.name ?? '';
    if (name.length > 0 && name !== 'Object') {
      return name;
    }

    // Use WeakMap for object identity (works for both object literals and class instances)
    if (typeof workflow === 'object') {
      const existing = this.workflowKeyMap.get(workflow as object);
      if (existing !== undefined) return existing;
      const next = `workflow-${this.workflowKeyCounter++}`;
      this.workflowKeyMap.set(workflow as object, next);
      return next;
    }

    return String(workflow);
  }
}

// ============================================================
// Factory function
// ============================================================

/**
 * Create a workflow runtime.
 *
 * @param workflow - Workflow definition
 * @param props - Initial props
 * @param onOutput - Optional output handler
 * @returns New workflow runtime
 *
 * @example
 * ```typescript
 * const runtime = createRuntime(myWorkflow, { initialValue: 0 });
 * const rendering = runtime.getRendering();
 *
 * runtime.subscribe((rendering) => {
 *   console.log('New rendering:', rendering);
 * });
 * ```
 */
export function createRuntime<P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  configOrOnOutput?: Partial<RuntimeConfig<P, S, O, R>> | ((output: O) => void),
): WorkflowRuntime<P, S, O, R> {
  // Handle backwards compatibility: if configOrOnOutput is a function, treat it as onOutput
  const config: Partial<RuntimeConfig<P, S, O, R>> =
    typeof configOrOnOutput === 'function'
      ? { onOutput: configOrOnOutput }
      : (configOrOnOutput ?? {});
  return new WorkflowRuntime({ ...config, workflow, props });
}
