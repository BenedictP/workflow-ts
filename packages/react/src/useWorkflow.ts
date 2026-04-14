import type { Workflow } from '@workflow-ts/core';
import { createRuntime, type WorkflowRuntime } from '@workflow-ts/core';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import {
  createPropsSnapshot,
  resolveShouldValidateProps,
  useManagedWorkflowRuntime,
  type AllowedProp,
  type AllowedPropPrimitive,
  type AllowedTypedArray,
  type WorkflowRuntimeOptions,
} from './internal/managedRuntime';

export { resolveShouldValidateProps };
export type { AllowedProp, AllowedPropPrimitive, AllowedTypedArray };

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
export type UseWorkflowHookOptions<O> = WorkflowRuntimeOptions<O>;

export function useWorkflow<P extends AllowedProp, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  props: P,
  onOutput?: (output: O) => void,
  options?: UseWorkflowHookOptions<O>,
): R {
  const lastRenderingRef = useRef<R | null>(null);
  const runtimeRef = useRef<WorkflowRuntime<P, S, O, R> | null>(null);
  const storeRuntimeState = useCallback((runtimeToStore: WorkflowRuntime<P, S, O, R>) => {
    lastRenderingRef.current = runtimeToStore.getRendering();
  }, []);
  const { runtime, shouldBeActive } = useManagedWorkflowRuntime({
    workflow,
    props,
    createRuntime: (workflowToRun, runtimeProps, runtimeOnOutput) => {
      return createRuntime(workflowToRun, runtimeProps, {
        onOutput: runtimeOnOutput,
      });
    },
    onOutput,
    outputHandlers: options?.outputHandlers,
    lifecycle: options?.lifecycle,
    isActive: options?.isActive,
    resetOnWorkflowChange: options?.resetOnWorkflowChange,
    hasInactiveSnapshot: lastRenderingRef.current !== null,
    runtimeRef,
    onStoreRuntimeState: storeRuntimeState,
  });

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!shouldBeActive || runtime === null || runtime.isDisposed()) {
        return () => undefined;
      }
      return runtime.subscribe(listener);
    },
    [runtime, shouldBeActive],
  );
  const getRenderingSnapshot = useCallback(() => {
    if (shouldBeActive) {
      if (runtime === null || runtime.isDisposed()) {
        throw new Error('Workflow runtime is not available');
      }
      const rendering = runtime.getRendering();
      lastRenderingRef.current = rendering;
      return rendering;
    }

    if (runtime !== null && !runtime.isDisposed()) {
      const rendering = runtime.getRendering();
      lastRenderingRef.current = rendering;
      return rendering;
    }

    if (lastRenderingRef.current !== null) {
      return lastRenderingRef.current;
    }

    throw new Error('Workflow rendering is not available while inactive');
  }, [runtime, shouldBeActive]);

  // Subscribe to rendering changes
  return useSyncExternalStore(subscribe, getRenderingSnapshot, getRenderingSnapshot);
}

/**
 * Hook options for useWorkflowWithState
 */
export interface UseWorkflowOptions<P extends AllowedProp, O> extends WorkflowRuntimeOptions<O> {
  /** Initial props for the workflow */
  props: P;
  /** Callback for workflow outputs */
  onOutput?: (output: O) => void;
}

/**
 * Hook result that includes both rendering and runtime controls
 */
export interface UseWorkflowResult<P extends AllowedProp, S, R> {
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
export function useWorkflowWithState<P extends AllowedProp, S, O, R>(
  workflow: Workflow<P, S, O, R>,
  options: UseWorkflowOptions<P, O>,
): UseWorkflowResult<P, S, R> {
  const runtimeRef = useRef<WorkflowRuntime<P, S, O, R> | null>(null);
  const lastSnapshotRef = useRef<UseWorkflowResult<P, S, R> | null>(null);
  const lastSnapshotStringRef = useRef<string | undefined>(undefined);
  const shouldBeActiveRef = useRef(true);
  const safeUpdateProps = useCallback((nextProps: P): void => {
    if (!shouldBeActiveRef.current) return;
    const currentRuntime = runtimeRef.current;
    if (currentRuntime === null || currentRuntime.isDisposed()) return;
    const propsSnapshot = createPropsSnapshot(nextProps);
    currentRuntime.updateProps(propsSnapshot.runtimeValue as P);
  }, []);
  const safeSnapshot = useCallback((): string | undefined => {
    const currentRuntime = runtimeRef.current;
    if (currentRuntime !== null && !currentRuntime.isDisposed()) {
      const snapshotValue = currentRuntime.snapshot();
      lastSnapshotStringRef.current = snapshotValue;
      return snapshotValue;
    }
    return lastSnapshotStringRef.current;
  }, []);
  const createResultSnapshot = useCallback(
    (rendering: R, state: S, props: P): UseWorkflowResult<P, S, R> => ({
      rendering,
      state,
      props,
      updateProps: safeUpdateProps,
      snapshot: safeSnapshot,
    }),
    [safeUpdateProps, safeSnapshot],
  );
  const storeRuntimeState = useCallback(
    (runtimeToStore: WorkflowRuntime<P, S, O, R>): void => {
      const rendering = runtimeToStore.getRendering();
      const state = runtimeToStore.getState();
      const props = runtimeToStore.getProps();
      lastSnapshotRef.current = createResultSnapshot(rendering, state, props);
      lastSnapshotStringRef.current = runtimeToStore.snapshot();
    },
    [createResultSnapshot],
  );
  const { runtime, shouldBeActive } = useManagedWorkflowRuntime({
    workflow,
    props: options.props,
    createRuntime: (workflowToRun, runtimeProps, runtimeOnOutput) => {
      return createRuntime(workflowToRun, runtimeProps, {
        onOutput: runtimeOnOutput,
      });
    },
    onOutput: options.onOutput,
    outputHandlers: options.outputHandlers,
    lifecycle: options.lifecycle,
    isActive: options.isActive,
    resetOnWorkflowChange: options.resetOnWorkflowChange,
    hasInactiveSnapshot: lastSnapshotRef.current !== null,
    runtimeRef,
    onStoreRuntimeState: storeRuntimeState,
  });
  shouldBeActiveRef.current = shouldBeActive;

  useEffect(() => {
    if (runtime !== null && !runtime.isDisposed()) {
      lastSnapshotRef.current = null;
    }
  }, [runtime]);

  const getSnapshot = useCallback(() => {
    if (!shouldBeActive) {
      if (runtime !== null && !runtime.isDisposed()) {
        const rendering = runtime.getRendering();
        const state = runtime.getState();
        const props = runtime.getProps();
        if (lastSnapshotRef.current !== null) {
          if (
            lastSnapshotRef.current.rendering === rendering &&
            lastSnapshotRef.current.state === state &&
            lastSnapshotRef.current.props === props
          ) {
            return lastSnapshotRef.current;
          }
        }
        const inactiveSnapshot = createResultSnapshot(rendering, state, props);
        lastSnapshotRef.current = inactiveSnapshot;
        lastSnapshotStringRef.current = runtime.snapshot();
        return inactiveSnapshot;
      }

      if (lastSnapshotRef.current !== null) {
        return lastSnapshotRef.current;
      }

      throw new Error('Workflow snapshot is not available while inactive');
    }

    if (runtime === null || runtime.isDisposed()) {
      throw new Error('Workflow runtime is not available');
    }

    const rendering = runtime.getRendering();
    const state = runtime.getState();
    const props = runtime.getProps();

    if (lastSnapshotRef.current !== null) {
      if (
        lastSnapshotRef.current.rendering === rendering &&
        lastSnapshotRef.current.state === state &&
        lastSnapshotRef.current.props === props
      ) {
        return lastSnapshotRef.current;
      }
    }

    lastSnapshotRef.current = createResultSnapshot(rendering, state, props);

    return lastSnapshotRef.current;
  }, [runtime, shouldBeActive, createResultSnapshot]);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!shouldBeActive || runtime === null || runtime.isDisposed()) {
        return () => undefined;
      }
      return runtime.subscribe(listener);
    },
    [runtime, shouldBeActive],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return snapshot;
}
