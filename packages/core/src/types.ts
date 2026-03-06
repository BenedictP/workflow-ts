// ============================================================
// Core Types - The foundation of the workflow system
// ============================================================

/**
 * Props: Input configuration passed to a workflow from its parent.
 * Must be immutable - changes require a new props object.
 *
 * @template T - The props type
 */
export type Props<T> = T;

/**
 * Convenience alias for workflows with no props.
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type NoProps = void;

/**
 * State: Internal state of a workflow, managed by the runtime.
 * Must be immutable - state transitions return new state objects.
 *
 * @template T - The state type
 */
export type State<T> = T;

/**
 * Rendering: The external representation of a workflow's current state.
 * Includes display data and event callbacks. Must be immutable.
 *
 * @template T - The rendering type
 */
export type Rendering<T> = T;

/**
 * Output: Events that a workflow can emit to its parent.
 *
 * @template T - The output type
 */
export type Output<T> = T;

/**
 * Convenience alias for workflows that never emit outputs.
 */
export type NoOutput = never;

/**
 * Action: A pure function that transforms state and optionally emits output.
 * Actions are the only way to change workflow state.
 *
 * @template S - The state type
 * @template O - The output type (defaults to never if no output)
 */
export type Action<S, O = never> = (state: S) => ActionResult<S, O>;

/**
 * Result of an action: new state plus optional output.
 */
export interface ActionResult<S, O> {
  /** The new state after the action is applied */
  readonly state: S;
  /** Optional output to emit to parent */
  readonly output?: O;
}

/**
 * Sink: Interface for sending actions to the runtime.
 */
export interface Sink<A> {
  /**
   * Send an action to be processed by the runtime.
   *
   * @param action - The action to send
   */
  readonly send: (action: A) => void;
}

/**
 * RenderContext: Provides access to runtime services during render.
 * Used to send actions, render children, and run workers.
 *
 * @template S - State type
 * @template O - Output type
 */
export interface RenderContext<S, O> {
  /**
   * Send an action to the runtime.
   */
  readonly actionSink: Sink<Action<S, O>>;

  /**
   * Render a child workflow and get its rendering.
   *
   * @param workflow - The child workflow to render
   * @param props - Props to pass to the child
   * @param key - Unique key for this child (used for lifecycle)
   * @param handler - Handler for child outputs
   * @returns The child's rendering
   */
  readonly renderChild: <CP, CS, CO, CR>(
    workflow: Workflow<CP, CS, CO, CR>,
    props: CP,
    key?: string,
    handler?: (output: CO) => Action<S, O>
  ) => CR;

  /**
   * Run a worker (side effect) and handle its output.
   * Workers are started when first called with a key, and stopped
   * when render() doesn't call them anymore.
   *
   * @param worker - The worker to run
   * @param key - Unique key for this worker
   * @param handler - Handler for worker outputs
   */
  readonly runWorker: <W>(
    worker: Worker<W>,
    key: string,
    handler: (output: W) => Action<S, O>
  ) => void;
}

/**
 * Workflow: The main interface for defining a workflow.
 *
 * @template P - Props type (input from parent)
 * @template S - State type (internal state)
 * @template O - Output type (events to parent)
 * @template R - Rendering type (external representation)
 */
export interface Workflow<P, S, O, R> {
  /**
   * Create the initial state for this workflow.
   * Called once when the workflow is first started.
   *
   * @param props - The initial props
   * @param snapshot - Optional snapshot to restore from
   * @returns The initial state
   */
  readonly initialState: (props: P, snapshot?: string) => S;

  /**
   * Render the current state into a rendering.
   * Called after every state change or props update.
   *
   * @param props - Current props
   * @param state - Current state
   * @param context - Render context for side effects
   * @returns The rendering
   */
  readonly render: (props: P, state: S, context: RenderContext<S, O>) => R;

  /**
   * Optional: Called immediately before render when props change.
   * Allows state updates derived from new props.
   *
   * @param oldProps - The previously rendered props
   * @param newProps - The next props to render
   * @param state - Current state before rendering with new props
   * @returns The state that should be rendered
   */
  readonly onPropsChanged?: (oldProps: P, newProps: P, state: S) => S;

  /**
   * Optional: Serialize state to a string for persistence.
   *
   * @param state - The state to snapshot
   * @returns Serialized state string
   */
  readonly snapshot?: (state: S) => string;
}

/**
 * Worker: A side effect that produces output but no rendering.
 * Workers are managed by the runtime and have automatic lifecycle.
 *
 * @template T - The output type
 */
export interface Worker<T> {
  /**
   * Unique key for this worker instance.
   * Used to track worker lifecycle.
   */
  readonly key: string;

  /**
   * Run the worker and produce output.
   *
   * @param signal - AbortSignal for cancellation
   * @returns Promise resolving to output
   */
  readonly run: (signal: AbortSignal) => Promise<T>;
}

/**
 * Observable: Minimal observable interface for reactive workers.
 *
 * @template T - The value type
 */
export interface Observable<T> {
  /**
   * Subscribe to the observable.
   *
   * @param observer - The observer object
   * @returns A subscription that can be unsubscribed
   */
  subscribe(observer: {
    next: (value: T) => void;
    error?: (error: unknown) => void;
    complete?: () => void;
  }): Subscription;
}

/**
 * Subscription: Handle for unsubscribing from an observable.
 */
export interface Subscription {
  /**
   * Unsubscribe from the observable.
   */
  unsubscribe(): void;
}
