import type { Workflow, WorkflowRuntime as WorkflowRuntimeType } from '@workflow-ts/core';
import { createRuntime } from '@workflow-ts/core';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Hook to use a workflow in a React component.
 *
 * @param workflow - The workflow definition
 * @param props - Props to pass to the workflow
 * @param onOutput - Optional callback for workflow outputs
 * @returns The current rendering
 *
 * @example
 * ```tsx
 * const counter = useWorkflow(counterWorkflow, undefined);
 * return (
 *   <div>
 *     <span>{counter.count}</span>
 *     <button onClick={counter.onIncrement}>+</button>
 *     <button onClick={counter.onDecrement}>-</button>
 *   </div>
 * );
 * ```
 */
export function useWorkflow<P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  onOutput?: (output: O) => void,
): R {
  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;

  // Create runtime once per workflow
  const [runtime] = useState<WorkflowRuntimeType<P, S, O, R>>(() => {
    return createRuntime(workflow, props, (output: O) => {
      onOutputRef.current?.(output);
    });
  });

  // Dispose on unmount
  useEffect(() => {
    return () => { runtime.dispose(); };
  }, [runtime]);

  // Update props when they change
  useEffect(() => {
    runtime.updateProps(props);
  }, [runtime, props]);

  // Subscribe to rendering changes
  return useSyncExternalStore(
    useMemo(() => (listener: () => void) => runtime.subscribe(listener), [runtime]),
    useMemo(() => () => runtime.getRendering(), [runtime]),
    useMemo(() => () => runtime.getRendering(), [runtime]),
  );
}

/**
 * Hook options for useWorkflowWithState
 */
export interface UseWorkflowOptions<P, O> {
  /** Initial props for the workflow */
  props: P;
  /** Callback for workflow outputs */
  onOutput?: (output: O) => void;
}

/**
 * Hook result that includes both rendering and runtime controls
 */
export interface UseWorkflowResult<P, S, R> {
  /** Current rendering */
  rendering: R;
  /** Current state (for debugging) */
  state: S;
  /** Current props */
  props: P;
  /** Update props */
  updateProps: (props: P) => void;
  /** Snapshot current state */
  snapshot: () => string | undefined;
}

/**
 * Hook that returns both rendering and runtime controls.
 *
 * @param workflow - The workflow definition
 * @param options - Hook options
 * @returns Rendering and runtime controls
 *
 * @example
 * ```tsx
 * const { rendering, state, updateProps } = useWorkflowWithState(
 *   searchWorkflow,
 *   { props: { query: '' } }
 * );
 *
 * return (
 *   <div>
 *     <input onChange={(e) => updateProps({ query: e.target.value })} />
 *     <ul>{rendering.results.map(r => <li key={r.id}>{r.name}</li>)}</ul>
 *   </div>
 * );
 * ```
 */
export function useWorkflowWithState<P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  options: UseWorkflowOptions<P, O>,
): UseWorkflowResult<P, S, R> {
  const onOutputRef = useRef(options.onOutput);
  onOutputRef.current = options.onOutput;

  // Create runtime once per workflow
  const [runtime] = useState<WorkflowRuntimeType<P, S, O, R>>(() => {
    return createRuntime(workflow, options.props, (output: O) => {
      onOutputRef.current?.(output);
    });
  });

  // Track version to force re-renders
  const [, setVersion] = useState(0);

  // Dispose on unmount
  useEffect(() => {
    return () => { runtime.dispose(); };
  }, [runtime]);

  // Subscribe to changes
  useEffect(() => {
    return runtime.subscribe(() => {
      setVersion((v) => v + 1);
    });
  }, [runtime]);

  return {
    rendering: runtime.getRendering(),
    state: runtime.getState(),
    props: runtime.getProps(),
    updateProps: (props: P) => { runtime.updateProps(props); },
    snapshot: () => runtime.snapshot(),
  };
}