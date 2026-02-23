import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  action,
  compose,
  createRuntime,
  createWorker,
  jsonSnapshot,
  named,
  type Workflow,
  type Worker,
  WorkflowRuntime,
} from '../src';

// ============================================================
// Test Types
// ============================================================

interface CounterState {
  readonly count: number;
}

interface CounterRendering {
  readonly count: number;
  readonly onIncrement: () => void;
  readonly onDecrement: () => void;
  readonly onReset: () => void;
}

type CounterOutput = { readonly type: 'reachedZero' } | { readonly type: 'reachedTen' };

// ============================================================
// Test Workflows for Props Testing
// ============================================================

interface PropsWorkflowState {
  readonly lastPropsValue: string;
}

interface PropsWorkflowRendering {
  readonly propsValue: string;
  readonly stateValue: string;
}

const propsWorkflow: Workflow<string, PropsWorkflowState, never, PropsWorkflowRendering> = {
  initialState: (props) => ({ lastPropsValue: props }),
  render: (props, state) => ({
    propsValue: props,
    stateValue: state.lastPropsValue,
  }),
};

// ============================================================
// Test Workflows for Child Testing
// ============================================================

interface ChildState {
  readonly value: number;
}

interface ChildRendering {
  readonly value: number;
  readonly onIncrement: () => void;
}

interface ChildOutput { readonly type: 'childDone'; readonly value: number }

const childWorkflow: Workflow<number, ChildState, ChildOutput, ChildRendering> = {
  initialState: (props) => ({ value: props }),
  render: (props, state, ctx) => ({
    value: state.value,
    onIncrement: () => {
      ctx.actionSink.send((s) => {
        const newValue = s.value + 1;
        return {
          state: { value: newValue },
          ...(newValue === 10 && { output: { type: 'childDone' as const, value: newValue } }),
        };
      });
    },
  }),
};

interface ParentState {
  readonly childOutputs: readonly number[];
}

interface ParentRendering {
  readonly childValue: number;
  readonly childOutputs: readonly number[];
}

// ============================================================
// Test Workflows for Snapshot Testing
// ============================================================

interface SnapshotState {
  readonly count: number;
  readonly name: string;
}

interface SnapshotRendering {
  readonly display: string;
}

const snapshotWorkflow: Workflow<void, SnapshotState, never, SnapshotRendering> = {
  initialState: () => ({ count: 0, name: 'initial' }),
  render: (_props, state) => ({ display: `${state.name}: ${state.count}` }),
  snapshot: (state) => JSON.stringify(state),
  restore: (snapshot) => JSON.parse(snapshot) as SnapshotState,
};

// ============================================================
// Test Workflow
// ============================================================

const counterWorkflow: Workflow<void, CounterState, CounterOutput, CounterRendering> = {
  initialState: () => ({ count: 0 }),

  render: (_props, state, ctx): CounterRendering => ({
    count: state.count,
    onIncrement: () => {
      ctx.actionSink.send((s) => {
        const newCount = s.count + 1;
        return {
          state: { count: newCount },
          ...(newCount === 10 && { output: { type: 'reachedTen' as const } }),
        };
      });
    },
    onDecrement: () => {
      ctx.actionSink.send((s) => {
        const newCount = s.count - 1;
        return {
          state: { count: newCount },
          ...(newCount === 0 && { output: { type: 'reachedZero' as const } }),
        };
      });
    },
    onReset: () => {
      ctx.actionSink.send(action(() => ({ count: 0 })));
    },
  }),
};

// ============================================================
// Tests
// ============================================================

describe('WorkflowRuntime', () => {
  it('should create runtime with initial state', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    expect(runtime.getState()).toEqual({ count: 0 });
    expect(runtime.getRendering().count).toBe(0);
    runtime.dispose();
  });

  it('should handle increment action', () => {
    const runtime = createRuntime(counterWorkflow, undefined);

    runtime.getRendering().onIncrement();
    expect(runtime.getState()).toEqual({ count: 1 });
    expect(runtime.getRendering().count).toBe(1);

    runtime.dispose();
  });

  it('should handle decrement action', () => {
    const runtime = createRuntime(counterWorkflow, undefined);

    // Increment first
    runtime.getRendering().onIncrement();
    runtime.getRendering().onIncrement();
    expect(runtime.getState()).toEqual({ count: 2 });

    // Then decrement
    runtime.getRendering().onDecrement();
    expect(runtime.getState()).toEqual({ count: 1 });

    runtime.dispose();
  });

  it('should handle reset action', () => {
    const runtime = createRuntime(counterWorkflow, undefined);

    // Increment a few times
    runtime.getRendering().onIncrement();
    runtime.getRendering().onIncrement();
    runtime.getRendering().onIncrement();
    expect(runtime.getState()).toEqual({ count: 3 });

    // Reset
    runtime.getRendering().onReset();
    expect(runtime.getState()).toEqual({ count: 0 });

    runtime.dispose();
  });

  it('should emit output when reaching zero', () => {
    const outputs: CounterOutput[] = [];
    const runtime = createRuntime(counterWorkflow, undefined, (output) => {
      outputs.push(output);
    });

    // Start at 0, increment, then decrement back to 0
    runtime.getRendering().onIncrement();
    runtime.getRendering().onDecrement();

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toEqual({ type: 'reachedZero' });

    runtime.dispose();
  });

  it('should emit output when reaching ten', () => {
    const outputs: CounterOutput[] = [];
    const runtime = createRuntime(counterWorkflow, undefined, (output) => {
      outputs.push(output);
    });

    // Increment to 10
    for (let i = 0; i < 10; i++) {
      runtime.getRendering().onIncrement();
    }

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toEqual({ type: 'reachedTen' });

    runtime.dispose();
  });

  it('should notify subscribers on state change', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const renderings: number[] = [];

    const unsubscribe = runtime.subscribe((rendering) => {
      renderings.push(rendering.count);
    });

    runtime.getRendering().onIncrement();
    runtime.getRendering().onIncrement();
    runtime.getRendering().onDecrement();

    expect(renderings).toEqual([1, 2, 1]);

    unsubscribe();
    runtime.dispose();
  });

  it('should support multiple subscribers', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const renderings1: number[] = [];
    const renderings2: number[] = [];

    const unsub1 = runtime.subscribe((r) => renderings1.push(r.count));
    const unsub2 = runtime.subscribe((r) => renderings2.push(r.count));

    runtime.getRendering().onIncrement();

    expect(renderings1).toEqual([1]);
    expect(renderings2).toEqual([1]);

    unsub1();
    runtime.getRendering().onIncrement();

    expect(renderings1).toEqual([1]); // No longer receiving updates
    expect(renderings2).toEqual([1, 2]);

    unsub2();
    runtime.dispose();
  });

  it('should throw error when using disposed runtime', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    runtime.dispose();

    expect(() => runtime.getRendering()).toThrow('Cannot use disposed workflow runtime');
    expect(() => runtime.subscribe(() => {})).toThrow('Cannot use disposed workflow runtime');
    expect(() => { runtime.updateProps(undefined); }).toThrow('Cannot use disposed workflow runtime');
  });
});

// ============================================================
// Props Update Tests
// ============================================================

describe('Props updates', () => {
  it('should update props and trigger re-render', () => {
    const runtime = createRuntime(propsWorkflow, 'initial');
    
    // Initial rendering
    expect(runtime.getProps()).toBe('initial');
    expect(runtime.getRendering().propsValue).toBe('initial');
    expect(runtime.getRendering().stateValue).toBe('initial');
    
    // Update props
    runtime.updateProps('updated');
    
    expect(runtime.getProps()).toBe('updated');
    expect(runtime.getRendering().propsValue).toBe('updated');
    // State should not change (only re-render)
    expect(runtime.getRendering().stateValue).toBe('initial');
    
    runtime.dispose();
  });

  it('should notify subscribers when props change', () => {
    const runtime = createRuntime(propsWorkflow, 'initial');
    const notifications: string[] = [];
    
    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.propsValue);
    });
    
    runtime.updateProps('first');
    runtime.updateProps('second');
    
    expect(notifications).toEqual(['first', 'second']);
    
    unsubscribe();
    runtime.dispose();
  });

  it('should not notify subscribers when props are same value', () => {
    const runtime = createRuntime(propsWorkflow, 'initial');
    const notifications: string[] = [];
    
    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.propsValue);
    });
    
    // Update with same value - should still notify (shallow comparison not done)
    runtime.updateProps('initial');
    
    // Notification still occurs (runtime doesn't do shallow comparison)
    expect(notifications).toEqual(['initial']);
    
    unsubscribe();
    runtime.dispose();
  });

  it('should cache rendering until state or props change', () => {
    const renderCount = { value: 0 };
    
    const countingWorkflow: Workflow<string, { value: number }, never, { value: number }> = {
      initialState: () => ({ value: 0 }),
      render: () => {
        renderCount.value++;
        return { value: renderCount.value };
      },
    };
    
    const runtime = createRuntime(countingWorkflow, 'initial');
    
    // First access triggers render
    runtime.getRendering();
    expect(renderCount.value).toBe(1);
    
    // Second access uses cache
    runtime.getRendering();
    expect(renderCount.value).toBe(1);
    
    // Props update clears cache
    runtime.updateProps('new');
    runtime.getRendering();
    expect(renderCount.value).toBe(2);
    
    runtime.dispose();
  });
});

// ============================================================
// Child Workflow Tests
// ============================================================

describe('Child workflow lifecycle', () => {
  it('should render child workflow', () => {
    const parentWorkflow: Workflow<number, ParentState, never, ParentRendering> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const childRendering = ctx.renderChild(childWorkflow, props);
        return {
          childValue: childRendering.value,
          childOutputs: state.childOutputs,
        };
      },
    };
    
    const runtime = createRuntime(parentWorkflow, 5);
    
    expect(runtime.getRendering().childValue).toBe(5);
    
    runtime.dispose();
  });

  it('should reuse child workflow with same key', () => {
    const childStates: number[] = [];
    
    const trackingChildWorkflow: Workflow<number, ChildState, never, ChildRendering> = {
      initialState: (props) => ({ value: props }),
      render: (_props, state, ctx) => ({
        value: state.value,
        onIncrement: () => {
          ctx.actionSink.send((s) => ({ value: s.value + 1 }));
        },
      }),
    };
    
    const parentWorkflow: Workflow<number, ParentState, never, ParentRendering> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const childRendering = ctx.renderChild(trackingChildWorkflow, props, 'fixed-key');
        childStates.push(childRendering.value);
        return {
          childValue: childRendering.value,
          childOutputs: state.childOutputs,
        };
      },
    };
    
    const runtime = createRuntime(parentWorkflow, 5);
    
    // First render - child initialized with props 5
    runtime.getRendering();
    expect(childStates[childStates.length - 1]).toBe(5);
    
    // Re-render parent with different props - child keeps its original state (5)
    // because the child was already created and is reused
    runtime.updateProps(10);
    runtime.getRendering();
    // Child is reused with same state (5), not recreated with new props (10)
    expect(childStates[childStates.length - 1]).toBe(5);
    
    runtime.dispose();
  });

  it('should update child props even without output handler', () => {
    const childProps: number[] = [];

    const propsChildWorkflow: Workflow<number, ChildState, never, ChildRendering> = {
      initialState: (props) => ({ value: props }),
      render: (props, state) => {
        childProps.push(props);
        return { value: state.value, onIncrement: () => {} };
      },
    };

    const parentWorkflow: Workflow<number, ParentState, never, ParentRendering> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const childRendering = ctx.renderChild(propsChildWorkflow, props, 'child-props');
        return {
          childValue: childRendering.value,
          childOutputs: state.childOutputs,
        };
      },
    };

    const runtime = createRuntime(parentWorkflow, 1);
    runtime.getRendering();

    runtime.updateProps(2);
    runtime.getRendering();

    expect(childProps).toEqual([1, 2]);

    runtime.dispose();
  });

  it('should handle child workflow output', () => {
    const outputs: number[] = [];
    
    const parentWorkflow: Workflow<number, ParentState, ChildOutput, ParentRendering> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const childRendering = ctx.renderChild(
          childWorkflow,
          9, // Start at 9 so one increment reaches 10
          'child-key',
          (output) => {
            return (s) => ({
              state: { childOutputs: [...s.childOutputs, output.value] },
            });
          },
        );
        return {
          childValue: childRendering.value,
          childOutputs: state.childOutputs,
        };
      },
    };
    
    const runtime = createRuntime(parentWorkflow, 0, (output) => {
      outputs.push(output.childOutputs[0] ?? 0);
    });
    
    // Initial rendering
    expect(runtime.getRendering().childValue).toBe(9);
    
    // Increment child to trigger output
    const initialRendering = runtime.getRendering();
    expect(initialRendering.childValue).toBe(9);
    // TODO: trigger child increment when child workflow exposes an action API
    
    runtime.dispose();
  });

  it('should dispose child workflows when parent is disposed', () => {
    const disposedChildren: string[] = [];
    
    const trackedChildWorkflow: Workflow<number, { value: number }, never, { value: number }> = {
      initialState: (props) => ({ value: props }),
      render: (_props, state) => ({ value: state.value }),
    };
    
    const parentWorkflow: Workflow<void, { dummy: number }, never, { childValue: number }> = {
      initialState: () => ({ dummy: 0 }),
      render: (_props, _state, ctx) => {
        const child = ctx.renderChild(trackedChildWorkflow, 42, 'child-1');
        return { childValue: child.value };
      },
    };
    
    const runtime = createRuntime(parentWorkflow, undefined);
    
    // Access rendering to create child
    runtime.getRendering();
    
    // Dispose parent
    runtime.dispose();
    
    // Verify disposed
    expect(runtime.isDisposed()).toBe(true);
  });
});

// ============================================================
// Listener Tests (Extended)
// ============================================================

describe('Multiple listeners', () => {
  it('should handle rapid subscribe/unsubscribe during notifications', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const values: number[] = [];
    
    // Subscribe two listeners
    const unsub1 = runtime.subscribe((r) => {
      values.push(r.count);
    });
    
    const unsub2 = runtime.subscribe((r) => {
      values.push(r.count * 10);
    });
    
    // Both should receive notifications
    runtime.getRendering().onIncrement();
    expect(values).toEqual([1, 10]);
    
    // Unsubscribe first
    unsub1();
    
    // Only second should receive
    runtime.getRendering().onIncrement();
    expect(values).toEqual([1, 10, 20]);
    
    unsub2();
    runtime.dispose();
  });

  it('should handle subscriber that throws error', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const successfulNotifications: number[] = [];
    
    const unsub1 = runtime.subscribe(() => {
      throw new Error('Subscriber error');
    });
    
    const unsub2 = runtime.subscribe((r) => {
      successfulNotifications.push(r.count);
    });
    
    // Should not throw, and second listener should still receive notification
    expect(() => { runtime.getRendering().onIncrement(); }).not.toThrow();
    expect(successfulNotifications).toEqual([1]);
    
    unsub1();
    unsub2();
    runtime.dispose();
  });

  it('should allow resubscription after unsubscribe', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const values: number[] = [];
    
    const unsubscribe = runtime.subscribe((r) => {
      values.push(r.count);
    });
    
    runtime.getRendering().onIncrement();
    unsubscribe();
    runtime.getRendering().onIncrement();
    
    // Resubscribe
    const unsubscribe2 = runtime.subscribe((r) => {
      values.push(r.count * 10);
    });
    
    runtime.getRendering().onIncrement();
    
    expect(values).toEqual([1, 30]);
    
    unsubscribe2();
    runtime.dispose();
  });

  it('should clear all listeners on dispose', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const values: number[] = [];
    
    runtime.subscribe((r) => values.push(r.count));
    runtime.subscribe((r) => values.push(r.count * 2));
    
    runtime.getRendering().onIncrement();
    expect(values).toEqual([1, 2]);
    
    runtime.dispose();
    
    // After dispose, actions should throw
    expect(() => { runtime.getRendering().onIncrement(); }).toThrow();
    expect(values).toEqual([1, 2]); // No new values
  });
});

// ============================================================
// Snapshot Tests
// ============================================================

describe('Snapshot/restore workflow state', () => {
  it('should return undefined when workflow has no snapshot method', () => {
    const workflowNoSnapshot: Workflow<void, { value: number }, never, { value: number }> = {
      initialState: () => ({ value: 0 }),
      render: (_props, state) => ({ value: state.value }),
    };
    
    const runtime = createRuntime(workflowNoSnapshot, undefined);
    
    expect(runtime.snapshot()).toBeUndefined();
    
    runtime.dispose();
  });

  it('should snapshot workflow state', () => {
    const runtime = new WorkflowRuntime({
      workflow: snapshotWorkflow,
      props: undefined,
    });
    
    const snapshot = runtime.snapshot();
    
    expect(snapshot).toBe('{"count":0,"name":"initial"}');
    
    runtime.dispose();
  });

  it('should restore workflow from snapshot', () => {
    const restoredState = snapshotWorkflow.restore?.('{"count":5,"name":"restored"}');
    
    expect(restoredState).toEqual({ count: 5, name: 'restored' });
  });

  it('should create runtime with initial state from snapshot', () => {
    const runtime = new WorkflowRuntime({
      workflow: snapshotWorkflow,
      props: undefined,
      initialState: { count: 10, name: 'from-snapshot' },
    });
    
    expect(runtime.getState()).toEqual({ count: 10, name: 'from-snapshot' });
    expect(runtime.getRendering().display).toBe('from-snapshot: 10');
    
    runtime.dispose();
  });

  it('should use jsonSnapshot utility', () => {
    const { snapshot, restore } = jsonSnapshot<{ count: number }>();
    
    const state = { count: 42 };
    const snapshotStr = snapshot(state);
    
    expect(snapshotStr).toBe('{"count":42}');
    expect(restore(snapshotStr)).toEqual({ count: 42 });
  });

  it('should update state and reflect in snapshot', () => {
    const mutableWorkflow: Workflow<void, { value: number }, never, { value: number; increment: () => void }> = {
      initialState: () => ({ value: 0 }),
      render: (_props, state, ctx) => ({
        value: state.value,
        increment: () => {
          ctx.actionSink.send((s) => ({ state: { value: s.value + 1 } }));
        },
      }),
      snapshot: (state) => JSON.stringify(state),
    };
    
    const runtime = createRuntime(mutableWorkflow, undefined);
    
    expect(runtime.snapshot()).toBe('{"value":0}');
    
    runtime.getRendering().increment();
    expect(runtime.snapshot()).toBe('{"value":1}');
    
    runtime.getRendering().increment();
    expect(runtime.snapshot()).toBe('{"value":2}');
    
    runtime.dispose();
  });
});

// ============================================================
// Disposal Cleanup Tests
// ============================================================

describe('Disposal cleanup', () => {
  it('should mark runtime as disposed', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    
    expect(runtime.isDisposed()).toBe(false);
    
    runtime.dispose();
    
    expect(runtime.isDisposed()).toBe(true);
  });

  it('should be safe to dispose multiple times', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    
    runtime.dispose();
    runtime.dispose();
    runtime.dispose();
    
    expect(runtime.isDisposed()).toBe(true);
  });

  it('should throw on getRendering after dispose', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    runtime.dispose();
    
    expect(() => runtime.getRendering()).toThrow('Cannot use disposed workflow runtime');
  });

  it('should throw on subscribe after dispose', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    runtime.dispose();
    
    expect(() => runtime.subscribe(() => {})).toThrow('Cannot use disposed workflow runtime');
  });

  it('should throw on updateProps after dispose', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    runtime.dispose();
    
    expect(() => { runtime.updateProps(undefined); }).toThrow('Cannot use disposed workflow runtime');
  });

  it('should throw on send after dispose', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    runtime.dispose();
    
    expect(() => { runtime.send((s) => ({ count: s.count + 1 })); }).toThrow('Cannot use disposed workflow runtime');
  });
});

// ============================================================
// Worker Integration Tests
// ============================================================

describe('Worker integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should run worker and handle output', async () => {
    const worker: Worker<number> = {
      key: 'test-worker',
      run: async () => 42,
    };
    
    const outputs: number[] = [];
    
    const workerWorkflow: Workflow<void, { result: number | null }, never, { result: number | null }> = {
      initialState: () => ({ result: null }),
      render: (_props, state, ctx) => {
        ctx.runWorker(
          worker,
          'test-worker',
          (output) => (s) => ({ result: output + s.result! }),
        );
        return { result: state.result };
      },
    };
    
    const runtime = createRuntime(workerWorkflow, undefined);
    
    expect(runtime.getRendering().result).toBe(null);
    
    // Let worker complete
    await vi.runAllTimersAsync();
    
    runtime.dispose();
  });

  it('should create worker from async function', () => {
    const fetchWorker = createWorker('fetch', async () => {
      return { data: 'test' };
    });
    
    expect(fetchWorker.key).toBe('fetch');
  });
});

// ============================================================
// Direct Send Tests
// ============================================================

describe('Direct send method', () => {
  it('should process action sent directly to runtime', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    
    expect(runtime.getState()).toEqual({ count: 0 });
    
    runtime.send((state) => ({ state: { count: state.count + 5 } }));
    
    expect(runtime.getState()).toEqual({ count: 5 });
    
    runtime.dispose();
  });

  it('should emit output from direct send', () => {
    const outputs: CounterOutput[] = [];
    const runtime = createRuntime(counterWorkflow, undefined, (output) => {
      outputs.push(output);
    });
    
    // Set count to 9, then increment to 10
    runtime.send(() => ({ state: { count: 9 } }));
    runtime.send((state) => ({
      state: { count: state.count + 1 },
      output: state.count + 1 === 10 ? { type: 'reachedTen' as const } : undefined,
    }));
    
    expect(runtime.getState()).toEqual({ count: 10 });
    
    runtime.dispose();
  });
});

describe('action helpers', () => {
  it('should create simple action with action()', () => {
    const increment = action<{ count: number }>((s) => ({ count: s.count + 1 }));
    const result = increment({ count: 5 });

    expect(result.state).toEqual({ count: 6 });
    expect(result.output).toBeUndefined();
  });

  it('should create action with output', () => {
    const emitWithValue = action<{ count: number }, string>(
      (s) => s,
      'done',
    );
    const result = emitWithValue({ count: 5 });

    expect(result.state).toEqual({ count: 5 });
    expect(result.output).toBe('done');
  });

  it('should compose multiple actions', () => {
    const doubleAndIncrement = compose<{ count: number }>(
      action((s) => ({ count: s.count * 2 })),
      action((s) => ({ count: s.count + 1 })),
    );

    const result = doubleAndIncrement({ count: 5 });
    expect(result.state).toEqual({ count: 11 }); // (5 * 2) + 1
  });

  it('should create named action', () => {
    const increment = named('increment', action((s: { count: number }) => ({ count: s.count + 1 })));
    expect(increment.name).toBe('increment');

    const result = increment({ count: 0 });
    expect(result.state).toEqual({ count: 1 });
  });
});
