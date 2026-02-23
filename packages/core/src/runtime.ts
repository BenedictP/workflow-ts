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
   * Get a snapshot of the current state.
   */
  public snapshot(): string | undefined {
    if (this.config.workflow.snapshot !== undefined) {
      return this.config.workflow.snapshot(this.state);
    }
    return undefined;
  }

  /**
   * Dispose of this runtime and all children.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.workerManager.stopAll();
    this.childRuntimes.forEach((child) => { child.dispose(); });
    this.childRuntimes.clear();
    this.listeners.clear();
  }

  /**
   * Check if the runtime has been disposed.
   */
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

    try {
      const context = this.createRenderContext();
      return this.config.workflow.render(this.currentProps, this.state, context);
    } finally {
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
    return {
      actionSink: {
        send: (action: Action<S, O>): void => {
          this.handleAction(action);
        },
      },
      renderChild: <CP, CS, CO, CR>(
        workflow: Workflow<CP, CS, CO, CR>,
        props: CP,
        key?: string,
        handler?: (output: CO) => Action<S, O>,
      ): CR => {
        return this.renderChild(workflow, props, key, handler);
      },
      runWorker: <W>(worker: Worker<W>, key: string, handler: (output: W) => Action<S, O>): void => {
        this.runWorker(worker, key, handler);
      },
    };
  }

  private handleAction(action: Action<S, O>): void {
    this.assertNotDisposed();

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
      child = new WorkflowRuntime<CP, CS, CO, CR>({
        workflow,
        props,
        onOutput:
          handler !== undefined
            ? (output: CO) => {
                this.handleAction(handler(output));
              }
            : undefined,
      });
      this.childRuntimes.set(childKey, child);
    } else if (handler !== undefined) {
      // Update props if child already exists - this allows child to react to prop changes
      child.updateProps(props);
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
    const constructor = (workflow as object).constructor as { name?: string } | undefined;
    const name = constructor?.name ?? '';
    if (name.length > 0) {
      return name;
    }

    if (typeof workflow === 'object') {
      return JSON.stringify(workflow);
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
  onOutput?: (output: O) => void,
  snapshot?: string,
): WorkflowRuntime<P, S, O, R> {
  return new WorkflowRuntime({ workflow, props, onOutput, snapshot });
}
