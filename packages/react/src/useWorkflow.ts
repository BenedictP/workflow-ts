import type { Workflow } from '@workflow-ts/core';
import { createRuntime } from '@workflow-ts/core';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

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
export interface UseWorkflowHookOptions {
  /** Reset runtime when workflow identity changes (opt-in) */
  resetOnWorkflowChange?: boolean;
  /** Optional handlers for specific output types */
  outputHandlers?: Partial<{
    [K in keyof O]: O[K] extends { type: string } ? (output: O[K]) => void : never;
  }>;
}

export function useWorkflow<P, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  onOutput?: (output: O) => void,
  options?: UseWorkflowHookOptions,
): R {
  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;
  const outputHandlersRef = useRef(options?.outputHandlers);
  outputHandlersRef.current = options?.outputHandlers;

  const runtimeKey = options?.resetOnWorkflowChange === true ? workflow : 'static-runtime';
  const runtime = useMemo(() => {
    const rt = createRuntime(workflow, props, { onOutput: (output: O) => {
      onOutputRef.current?.(output);
    }});

    // Register typed output handlers
    const handlers = outputHandlersRef.current;
    if (handlers) {
      Object.entries(handlers).forEach(([type, handler]) => {
        if (handler) {
          rt.on(type as any, handler as any);
        }
      });
    }

    return rt;
  }, [runtimeKey]);

  // Dispose on unmount
  useEffect(() => {
    return () => { runtime.dispose(); };
  }, [runtime]);

  // Update props when they change
  useEffect(() => {
    runtime.updateProps(props);
  }, [runtime, props]);

  const subscribe = useMemo(() => (listener: () => void) => runtime.subscribe(listener), [runtime]);
  const getRenderingSnapshot = useMemo(() => () => runtime.getRendering(), [runtime]);

  // Subscribe to rendering changes
  return useSyncExternalStore(subscribe, getRenderingSnapshot, getRenderingSnapshot);
}

/**
 * Hook options for useWorkflowWithState
 */
export interface UseWorkflowOptions<P, O> {
  /** Initial props for the workflow */
  props: P;
  /** Callback for workflow outputs */
  onOutput?: (output: O) => void;
  /** Optional handlers for specific output types */
  outputHandlers?: Partial<{
    [K in keyof O]: O[K] extends { type: string } ? (output: O[K]) => void : never;
  }>;
  /** Reset runtime when workflow identity changes (opt-in) */
  resetOnWorkflowChange?: boolean;
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
  const outputHandlersRef = useRef(options.outputHandlers);
  outputHandlersRef.current = options.outputHandlers;

  const runtimeKey = options.resetOnWorkflowChange === true ? workflow : 'static-runtime';
  const runtime = useMemo(() => {
    const rt = createRuntime(workflow, options.props, { onOutput: (output: O) => {
      onOutputRef.current?.(output);
    }});

    // Register typed output handlers
    const handlers = outputHandlersRef.current;
    if (handlers) {
      Object.entries(handlers).forEach(([type, handler]) => {
        if (handler) {
          rt.on(type as any, handler as any);
        }
      });
    }

    return rt;
  }, [runtimeKey]);

  // Dispose on unmount
  useEffect(() => {
    return () => { runtime.dispose(); };
  }, [runtime]);

  // Update props when they change
  useEffect(() => {
    runtime.updateProps(options.props);
  }, [runtime, options.props]);

  const getSnapshot = useMemo(() => {
    let lastSnapshot: UseWorkflowResult<P, S, R> | null = null;
    return () => {
      const rendering = runtime.getRendering();
      const state = runtime.getState();
      const props = runtime.getProps();

      if (lastSnapshot !== null) {
        if (
          lastSnapshot.rendering === rendering &&
          lastSnapshot.state === state &&
          lastSnapshot.props === props
        ) {
          return lastSnapshot;
        }
      }

      lastSnapshot = {
        rendering,
        state,
        props,
        updateProps: (nextProps: P) => { runtime.updateProps(nextProps); },
        snapshot: () => runtime.snapshot(),
      };

      return lastSnapshot;
    };
  }, [runtime]);

  const subscribe = useMemo(() => (listener: () => void) => runtime.subscribe(listener), [runtime]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return snapshot;
}
