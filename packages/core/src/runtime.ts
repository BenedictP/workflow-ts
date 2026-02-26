import type { Action, RenderContext, Worker, Workflow } from './types';
import { WorkerManager } from './worker';

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

  private outputHandlers = new Map<
    string,
    ((output: unknown) => void) | undefined
  >();
  private readonly workflowKeyMap = new WeakMap<object, string>();
  private workflowKeyCounter = 0;

  constructor(private readonly config: RuntimeConfig<P, S, O, R>) {
    const restoredState =
      config.snapshot !== undefined
        ? (config.workflow.restore?.(config.snapshot) ??
            config.workflow.initialState(config.props, config.snapshot))
        : undefined;

    this.state = config.initialState ?? restoredState ?? config.workflow.initialState(config.props);
    this.currentProps = config.props;
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
    this.currentProps = props;
    this.cachedRendering = null;
    this.notifyListeners();
  }

  /**
   * Send an action directly to the runtime.
   *
   * @param action - The action to process
   */
  public send(action: Action<S, O>): void {
    this.handleAction(action);
  }

  /**
   * Dispose the runtime and stop all workers.
   */
  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    this.workerManager.dispose();
    this.listeners.clear();
    this.childRuntimes.forEach((child) => { child.dispose(); });
    this.childRuntimes.clear();
    this.touchedChildren.clear();
    this.cachedRendering = null;
    this.actionQueue.length = 0;
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

  // ============================================================
  // Private implementation
  // ============================================================

  private performRender(): R {
    // Begin worker render cycle - track which workers are used
    this.workerManager.beginRenderCycle();
    // Reset touched children tracking
    this.touchedChildren.clear();
    this.isRendering = true;

    try {
      const context = this.createRenderContext();
      return this.config.workflow.render(this.currentProps, this.state, context);
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
    this.assertNotDisposed();

    if (this.isRendering || this.isProcessingActions) {
      this.actionQueue.push(action);
      return;
    }

    this.isProcessingActions = true;

    try {
      this.processAction(action);
      while (this.actionQueue.length > 0) {
        const next = this.actionQueue.shift();
        if (next) this.processAction(next);
      }
    } finally {
      this.isProcessingActions = false;
    }
  }

  private processAction(action: Action<S, O>): void {
    const result = action(this.state);
    this.state = result.state;

    // Clear cached rendering
    this.cachedRendering = null;

    // Emit output if any
    if (result.output !== undefined && this.config.onOutput !== undefined) {
      this.config.onOutput(result.output);
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
    let child = this.childRuntimes.get(childKey) as
      | WorkflowRuntime<CP, CS, CO, CR>
      | undefined;

    if (child === undefined) {
      if (handler !== undefined) {
        this.updateOutputHandler(childKey, (output) => {
          this.handleAction(handler(output as CO));
        });
      }
      child = new WorkflowRuntime<CP, CS, CO, CR>({
        workflow,
        props,
        onOutput: (output: CO) => {
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

  private runWorker<W>(
    worker: Worker<W>,
    key: string,
    handler: (output: W) => Action<S, O>,
  ): void {
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
        this.handleAction(handler(output));
      },
      (): void => {
        // Worker completed
      },
    );
  }

  private notifyListeners(): void {
    const rendering = this.getRendering();
    this.listeners.forEach((listener) => {
      try {
        listener(rendering);
      } catch (error) {
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
