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
import {
  composeInterceptors,
  createInterceptor,
  debugInterceptor,
  loggingInterceptor,
} from '../src/interceptor';

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

interface ChildOutput {
  readonly type: 'childDone';
  readonly value: number;
}

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
    expect(() => {
      runtime.updateProps(undefined);
    }).toThrow('Cannot use disposed workflow runtime');
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

    // Update with same value - should not notify (Object.is comparison)
    runtime.updateProps('initial');

    expect(notifications).toEqual([]);

    unsubscribe();
    runtime.dispose();
  });

  it('should not notify subscribers when props are the same object reference', () => {
    interface ObjectProps {
      readonly value: string;
    }

    const objectPropsWorkflow: Workflow<
      ObjectProps,
      { readonly initialized: boolean },
      never,
      { readonly propsRef: ObjectProps }
    > = {
      initialState: () => ({ initialized: true }),
      render: (props) => ({ propsRef: props }),
    };

    const initialProps: ObjectProps = { value: 'same' };
    const runtime = createRuntime(objectPropsWorkflow, initialProps);
    const notifications: string[] = [];

    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.propsRef.value);
    });

    runtime.updateProps(initialProps);

    expect(notifications).toEqual([]);

    unsubscribe();
    runtime.dispose();
  });

  it('should notify subscribers when props have same value but different reference', () => {
    interface ObjectProps {
      readonly value: string;
    }

    const objectPropsWorkflow: Workflow<
      ObjectProps,
      { readonly initialized: boolean },
      never,
      { readonly propsRef: ObjectProps }
    > = {
      initialState: () => ({ initialized: true }),
      render: (props) => ({ propsRef: props }),
    };

    const runtime = createRuntime(objectPropsWorkflow, { value: 'same' });
    const notifications: string[] = [];

    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.propsRef.value);
    });

    runtime.updateProps({ value: 'same' });

    expect(notifications).toEqual(['same']);

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

  it('should preserve cached rendering reference when props update is a no-op', () => {
    const renderCount = { value: 0 };

    const countingWorkflow: Workflow<string, { value: number }, never, { value: number }> = {
      initialState: () => ({ value: 0 }),
      render: () => {
        renderCount.value++;
        return { value: renderCount.value };
      },
    };

    const runtime = createRuntime(countingWorkflow, 'initial');
    const notifications: number[] = [];
    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.value);
    });

    const firstRendering = runtime.getRendering();
    runtime.updateProps('initial');
    const secondRendering = runtime.getRendering();

    expect(firstRendering).toBe(secondRendering);
    expect(renderCount.value).toBe(1);
    expect(notifications).toEqual([]);

    unsubscribe();
    runtime.dispose();
  });

  it('should call onPropsChanged before render when props change', () => {
    interface Rendering {
      readonly propsValue: string;
      readonly stateValue: string;
    }

    const observedPropsChanges: {
      readonly oldProps: string;
      readonly newProps: string;
      readonly stateValue: string;
    }[] = [];

    const workflow: Workflow<string, PropsWorkflowState, never, Rendering> = {
      initialState: (props) => ({ lastPropsValue: `initial:${props}` }),
      onPropsChanged: (oldProps, newProps, state) => {
        observedPropsChanges.push({
          oldProps,
          newProps,
          stateValue: state.lastPropsValue,
        });
        return {
          lastPropsValue: `changed:${oldProps}->${newProps}`,
        };
      },
      render: (props, state) => ({
        propsValue: props,
        stateValue: state.lastPropsValue,
      }),
    };

    const runtime = createRuntime(workflow, 'first');

    expect(runtime.getRendering()).toEqual({
      propsValue: 'first',
      stateValue: 'initial:first',
    });
    expect(observedPropsChanges).toEqual([]);

    runtime.updateProps('second');

    expect(runtime.getRendering()).toEqual({
      propsValue: 'second',
      stateValue: 'changed:first->second',
    });
    expect(observedPropsChanges).toEqual([
      {
        oldProps: 'first',
        newProps: 'second',
        stateValue: 'initial:first',
      },
    ]);

    runtime.dispose();
  });

  it('should pass sequential old/new props to onPropsChanged across updates', () => {
    const observedPropsChanges: { readonly oldProps: string; readonly newProps: string }[] = [];

    const workflow: Workflow<string, { readonly value: string }, never, { readonly value: string }> = {
      initialState: (props) => ({ value: props }),
      onPropsChanged: (oldProps, newProps) => {
        observedPropsChanges.push({ oldProps, newProps });
        return { value: newProps };
      },
      render: (_props, state) => ({ value: state.value }),
    };

    const runtime = createRuntime(workflow, 'start');
    runtime.getRendering();

    runtime.updateProps('middle');
    runtime.updateProps('end');

    expect(runtime.getRendering()).toEqual({ value: 'end' });
    expect(observedPropsChanges).toEqual([
      { oldProps: 'start', newProps: 'middle' },
      { oldProps: 'middle', newProps: 'end' },
    ]);

    runtime.dispose();
  });

  it('should use custom propsEqual to suppress props updates and onPropsChanged', () => {
    const initialProps = { value: 'same' };
    const equivalentProps = { value: 'same' };
    let onPropsChangedCalls = 0;

    const workflow: Workflow<
      { readonly value: string },
      { readonly marker: number },
      never,
      { readonly marker: number }
    > = {
      initialState: () => ({ marker: 0 }),
      onPropsChanged: () => {
        onPropsChangedCalls += 1;
        return { marker: onPropsChangedCalls };
      },
      render: (_props, state) => ({ marker: state.marker }),
    };

    const runtime = createRuntime(workflow, initialProps, {
      propsEqual: (prev, next) => prev.value === next.value,
    });

    const notifications: number[] = [];
    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.marker);
    });

    runtime.getRendering();
    runtime.updateProps(equivalentProps);

    expect(runtime.getProps()).toBe(initialProps);
    expect(runtime.getRendering()).toEqual({ marker: 0 });
    expect(onPropsChangedCalls).toBe(0);
    expect(notifications).toEqual([]);

    unsubscribe();
    runtime.dispose();
  });

  it('should use custom propsEqual to force props updates and onPropsChanged', () => {
    const observedPropsChanges: { readonly oldProps: string; readonly newProps: string }[] = [];

    const workflow: Workflow<string, { readonly value: number }, never, { readonly value: number }> = {
      initialState: () => ({ value: 0 }),
      onPropsChanged: (oldProps, newProps, state) => {
        observedPropsChanges.push({ oldProps, newProps });
        return { value: state.value + 1 };
      },
      render: (_props, state) => ({ value: state.value }),
    };

    const runtime = createRuntime(workflow, 'same', {
      propsEqual: () => false,
    });

    const notifications: number[] = [];
    const unsubscribe = runtime.subscribe((rendering) => {
      notifications.push(rendering.value);
    });

    runtime.getRendering();
    runtime.updateProps('same');

    expect(observedPropsChanges).toEqual([{ oldProps: 'same', newProps: 'same' }]);
    expect(runtime.getRendering()).toEqual({ value: 1 });
    expect(notifications).toEqual([1]);

    unsubscribe();
    runtime.dispose();
  });

  it('should support value-based props equality for Kotlin-like behavior', () => {
    interface UserProps {
      readonly id: string;
      readonly step: number;
    }

    const observedPropsChanges: { readonly oldStep: number; readonly newStep: number }[] = [];

    const workflow: Workflow<UserProps, { readonly step: number }, never, { readonly step: number }> = {
      initialState: (props) => ({ step: props.step }),
      onPropsChanged: (oldProps, newProps) => {
        observedPropsChanges.push({ oldStep: oldProps.step, newStep: newProps.step });
        return { step: newProps.step };
      },
      render: (_props, state) => ({ step: state.step }),
    };

    const runtime = createRuntime(
      workflow,
      { id: 'u1', step: 1 },
      {
        propsEqual: (prev, next) => prev.id === next.id && prev.step === next.step,
      },
    );

    runtime.getRendering();
    runtime.updateProps({ id: 'u1', step: 1 });
    expect(observedPropsChanges).toEqual([]);

    runtime.updateProps({ id: 'u1', step: 2 });
    expect(runtime.getRendering()).toEqual({ step: 2 });
    expect(observedPropsChanges).toEqual([{ oldStep: 1, newStep: 2 }]);

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
      render: (props, state, ctx) => ({
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

  it('should update child output handler when it changes', () => {
    const parentOutputs: number[] = [];
    let multiplier = 1;

    const handlerChildWorkflow: Workflow<number, ChildState, ChildOutput, ChildRendering> = {
      initialState: (props) => ({ value: props }),
      render: (_props, state, ctx) => ({
        value: state.value,
        onIncrement: () => {
          ctx.actionSink.send((s) => ({
            state: { value: s.value + 1 },
            output: { value: s.value + 1 },
          }));
        },
      }),
    };

    const parentWorkflow: Workflow<number, ParentState, ChildOutput, ParentRenderingWithChild> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const childRendering = ctx.renderChild(
          handlerChildWorkflow,
          props,
          'handler-key',
          (output) => (s) => ({
            state: { childOutputs: [...s.childOutputs, output.value * multiplier] },
          }),
        );
        return {
          childValue: childRendering.value,
          childOutputs: state.childOutputs,
          onIncrement: childRendering.onIncrement,
        };
      },
    };

    const runtime = createRuntime(parentWorkflow, 0, (output) => {
      parentOutputs.push(output.childOutputs[0] ?? 0);
    });

    runtime.getRendering().onIncrement();
    expect(runtime.getState().childOutputs[0]).toBe(1);

    multiplier = 2;
    runtime.updateProps(1);
    runtime.getRendering().onIncrement();

    expect(runtime.getState().childOutputs[1]).toBe(4);
    runtime.dispose();
  });

  it('should apply custom propsEqual to child runtimes', () => {
    interface ParentProps {
      readonly page: number;
      readonly child: {
        readonly value: number;
      };
    }

    interface ParentRenderingWithChildState {
      readonly childValue: number;
    }

    const childPropsChanges: { readonly oldValue: number; readonly newValue: number }[] = [];

    const childWithPropsHook: Workflow<
      { readonly value: number },
      { readonly value: number },
      never,
      { readonly value: number }
    > = {
      initialState: (props) => ({ value: props.value }),
      onPropsChanged: (oldProps, newProps) => {
        childPropsChanges.push({ oldValue: oldProps.value, newValue: newProps.value });
        return { value: newProps.value };
      },
      render: (_props, state) => ({ value: state.value }),
    };

    const parentWorkflow: Workflow<ParentProps, ParentState, never, ParentRenderingWithChildState> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, _state, ctx) => {
        const child = ctx.renderChild(childWithPropsHook, props.child, 'stable-child');
        return { childValue: child.value };
      },
    };

    const runtime = createRuntime(parentWorkflow, { page: 1, child: { value: 10 } }, {
      propsEqual: (prev, next) => JSON.stringify(prev) === JSON.stringify(next),
    });

    expect(runtime.getRendering().childValue).toBe(10);
    runtime.updateProps({ page: 2, child: { value: 10 } });
    expect(runtime.getRendering().childValue).toBe(10);
    expect(childPropsChanges).toEqual([]);

    runtime.dispose();
  });

  it('should clear child output handler when handler becomes undefined', () => {
    interface ParentProps {
      readonly childValue: number;
      readonly attachHandler: boolean;
    }

    interface ParentRenderingWithChild {
      readonly childOutputs: readonly number[];
      readonly onIncrement: () => void;
    }

    const handlerChildWorkflow: Workflow<number, ChildState, ChildOutput, ChildRendering> = {
      initialState: (props) => ({ value: props }),
      render: (_props, state, ctx) => ({
        value: state.value,
        onIncrement: () => {
          ctx.actionSink.send((s) => ({
            state: { value: s.value + 1 },
            output: { type: 'childDone', value: s.value + 1 },
          }));
        },
      }),
    };

    const parentWorkflow: Workflow<ParentProps, ParentState, never, ParentRenderingWithChild> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const handler = props.attachHandler
          ? (output: ChildOutput) =>
              (s: ParentState) => ({
                state: { childOutputs: [...s.childOutputs, output.value] },
              })
          : undefined;
        const childRendering = ctx.renderChild(handlerChildWorkflow, props.childValue, 'handler-key', handler);
        return {
          childOutputs: state.childOutputs,
          onIncrement: childRendering.onIncrement,
        };
      },
    };

    const runtime = createRuntime(parentWorkflow, { childValue: 0, attachHandler: true });

    runtime.getRendering().onIncrement();
    expect(runtime.getState().childOutputs).toEqual([1]);

    runtime.updateProps({ childValue: 0, attachHandler: false });
    runtime.getRendering().onIncrement();
    expect(runtime.getState().childOutputs).toEqual([1]);

    runtime.dispose();
  });

  it('should dispose all untouched children in a single render pass', () => {
    interface ParentProps {
      readonly showSecond: boolean;
      readonly showThird: boolean;
    }

    interface ParentRenderingWithMultipleChildren {
      readonly incrementSecond?: () => void;
      readonly incrementThird?: () => void;
    }

    const outputtingChildWorkflow: Workflow<number, ChildState, ChildOutput, ChildRendering> = {
      initialState: (props) => ({ value: props }),
      render: (_props, state, ctx) => ({
        value: state.value,
        onIncrement: () => {
          ctx.actionSink.send((s) => ({
            state: { value: s.value + 1 },
            output: { type: 'childDone', value: s.value + 1 },
          }));
        },
      }),
    };

    const parentWorkflow: Workflow<
      ParentProps,
      ParentState,
      never,
      ParentRenderingWithMultipleChildren
    > = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, _state, ctx) => {
        ctx.renderChild(childWorkflow, 0, 'first');
        const second = props.showSecond
          ? ctx.renderChild(outputtingChildWorkflow, 0, 'second', (output) => (s) => ({
              state: { childOutputs: [...s.childOutputs, output.value] },
            }))
          : undefined;
        const third = props.showThird
          ? ctx.renderChild(outputtingChildWorkflow, 0, 'third', (output) => (s) => ({
              state: { childOutputs: [...s.childOutputs, 100 + output.value] },
            }))
          : undefined;

        return {
          incrementSecond: second?.onIncrement,
          incrementThird: third?.onIncrement,
        };
      },
    };

    const runtime = createRuntime(parentWorkflow, { showSecond: true, showThird: true });

    const initialRendering = runtime.getRendering();
    initialRendering.incrementSecond?.();
    initialRendering.incrementThird?.();
    expect(runtime.getState().childOutputs).toEqual([1, 101]);

    runtime.updateProps({ showSecond: false, showThird: false });
    runtime.getRendering();

    runtime.updateProps({ showSecond: true, showThird: true });
    const restoredRendering = runtime.getRendering();
    restoredRendering.incrementSecond?.();
    restoredRendering.incrementThird?.();
    expect(runtime.getState().childOutputs).toEqual([1, 101, 1, 101]);

    runtime.dispose();
  });

  it('should use fallback workflow key when workflow is circular', () => {
    const workflow: Workflow<number, { value: number }, never, { value: number }> = {
      initialState: (props) => ({ value: props }),
      render: (_props, state) => ({ value: state.value }),
    };

    const circular = workflow as Workflow<number, { value: number }, never, { value: number }> & {
      self?: unknown;
    };
    circular.self = circular;

    const parentWorkflow: Workflow<number, ParentState, never, ParentRendering> = {
      initialState: () => ({ childOutputs: [] }),
      render: (props, state, ctx) => {
        const childRendering = ctx.renderChild(circular, props);
        return {
          childValue: childRendering.value,
          childOutputs: state.childOutputs,
        };
      },
    };

    const runtime = createRuntime(parentWorkflow, 1);
    expect(runtime.getRendering().childValue).toBe(1);
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
    expect(() => {
      runtime.getRendering().onIncrement();
    }).not.toThrow();
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
    expect(() => {
      runtime.getRendering().onIncrement();
    }).toThrow();
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
    const mutableWorkflow: Workflow<
      void,
      { value: number },
      never,
      { value: number; increment: () => void }
    > = {
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

    expect(() => {
      runtime.updateProps(undefined);
    }).toThrow('Cannot use disposed workflow runtime');
  });

  it('should throw on send after dispose', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    runtime.dispose();

    expect(() => {
      runtime.send((s) => ({ count: s.count + 1 }));
    }).toThrow('Cannot use disposed workflow runtime');
  });

  it('should stop draining queued actions after a queued action disposes runtime', () => {
    const runtime = createRuntime(counterWorkflow, undefined);
    const processed: string[] = [];
    let queued = false;

    runtime.subscribe(() => {
      if (queued) return;
      queued = true;

      // Sends from within a listener are queued because handleAction is mid-drain.
      runtime.send((state) => {
        processed.push('dispose');
        runtime.dispose();
        return { state: { count: state.count + 1 } };
      });
      runtime.send((state) => {
        processed.push('after-dispose');
        return { state: { count: state.count + 100 } };
      });
    });

    runtime.send((state) => ({ state: { count: state.count + 1 } }));

    expect(runtime.isDisposed()).toBe(true);
    expect(processed).toEqual(['dispose']);
  });
});

// ============================================================
// Worker Integration Tests
// ============================================================
// Output Type Subscription Tests
// ============================================================

type TestOutput =
  | { type: 'loaded'; data: string }
  | { type: 'error'; error: string }
  | { type: 'progress'; percent: number };

interface OutputTestState {
  readonly outputEmitted: TestOutput | null;
}

interface OutputTestRendering {
  readonly outputEmitted: TestOutput | null;
  readonly emitLoaded: () => void;
  readonly emitError: () => void;
  readonly emitProgress: () => void;
}

const outputTestWorkflow: Workflow<void, OutputTestState, TestOutput, OutputTestRendering> = {
  initialState: () => ({ outputEmitted: null }),
  render: (_props, state, ctx) => ({
    outputEmitted: state.outputEmitted,
    emitLoaded: () => {
      ctx.actionSink.send(() => ({
        state: { outputEmitted: { type: 'loaded', data: 'test-data' } },
        output: { type: 'loaded', data: 'test-data' } as TestOutput,
      }));
    },
    emitError: () => {
      ctx.actionSink.send(() => ({
        state: { outputEmitted: { type: 'error', error: 'test-error' } },
        output: { type: 'error', error: 'test-error' } as TestOutput,
      }));
    },
    emitProgress: () => {
      ctx.actionSink.send(() => ({
        state: { outputEmitted: { type: 'progress', percent: 50 } },
        output: { type: 'progress', percent: 50 } as TestOutput,
      }));
    },
  }),
};

describe('Output type subscription', () => {
  it('should subscribe to specific output type', () => {
    const runtime = createRuntime(outputTestWorkflow, undefined);
    const loadedOutputs: { type: 'loaded'; data: string }[] = [];

    const unsubscribe = runtime.on('loaded', (output) => {
      loadedOutputs.push(output);
    });

    // Trigger output
    runtime.getRendering().emitLoaded();

    expect(loadedOutputs).toHaveLength(1);
    expect(loadedOutputs[0]).toEqual({ type: 'loaded', data: 'test-data' });

    unsubscribe();
    runtime.dispose();
  });

  it('should subscribe to multiple output types', () => {
    const runtime = createRuntime(outputTestWorkflow, undefined);
    const loadedOutputs: { type: 'loaded'; data: string }[] = [];
    const errorOutputs: { type: 'error'; error: string }[] = [];

    runtime.on('loaded', (output) => {
      loadedOutputs.push(output);
    });
    runtime.on('error', (output) => {
      errorOutputs.push(output);
    });

    runtime.getRendering().emitLoaded();
    runtime.getRendering().emitError();
    runtime.getRendering().emitProgress();

    expect(loadedOutputs).toHaveLength(1);
    expect(errorOutputs).toHaveLength(1);
    // Progress should not trigger loaded or error handlers
    expect(loadedOutputs[0].data).toBe('test-data');
    expect(errorOutputs[0].error).toBe('test-error');

    runtime.dispose();
  });

  it('should unsubscribe from specific output type', () => {
    const runtime = createRuntime(outputTestWorkflow, undefined);
    const loadedOutputs: { type: 'loaded'; data: string }[] = [];

    const handler = (output: { type: 'loaded'; data: string }) => {
      loadedOutputs.push(output);
    };
    const unsubscribe = runtime.on('loaded', handler);

    runtime.getRendering().emitLoaded();
    expect(loadedOutputs).toHaveLength(1);

    unsubscribe();

    runtime.getRendering().emitLoaded();
    expect(loadedOutputs).toHaveLength(1); // Should still be 1, not 2

    runtime.dispose();
  });

  it('should remove all handlers for a type with off()', () => {
    const runtime = createRuntime(outputTestWorkflow, undefined);
    const loadedOutputs: { type: 'loaded'; data: string }[] = [];

    runtime.on('loaded', (output) => {
      loadedOutputs.push(output);
    });
    runtime.on('loaded', (output) => {
      loadedOutputs.push({ ...output, data: `${output.data}-2` });
    });

    runtime.getRendering().emitLoaded();
    expect(loadedOutputs).toHaveLength(2);

    // Remove all handlers for 'loaded' type
    runtime.off('loaded');

    runtime.getRendering().emitLoaded();
    expect(loadedOutputs).toHaveLength(2); // No new handlers called

    runtime.dispose();
  });

  it('should call both onOutput and typed handlers', () => {
    const allOutputs: TestOutput[] = [];
    const loadedOutputs: { type: 'loaded'; data: string }[] = [];

    const runtime = createRuntime(outputTestWorkflow, undefined, {
      onOutput: (output) => {
        allOutputs.push(output);
      },
    });

    runtime.on('loaded', (output) => {
      loadedOutputs.push(output);
    });

    runtime.getRendering().emitLoaded();

    expect(allOutputs).toHaveLength(1);
    expect(loadedOutputs).toHaveLength(1);
    expect(allOutputs[0]).toEqual({ type: 'loaded', data: 'test-data' });
    expect(loadedOutputs[0]).toEqual({ type: 'loaded', data: 'test-data' });

    runtime.dispose();
  });

  it('should handle outputs without type property', () => {
    // Workflow with non-discriminated output
    type NoTypeOutput = string;
    interface NoTypeState {
      readonly value: string;
    }
    interface NoTypeRendering {
      readonly emit: (value: string) => void;
    }
    const noTypeWorkflow: Workflow<void, NoTypeState, NoTypeOutput, NoTypeRendering> = {
      initialState: () => ({ value: '' }),
      render: (_props, state, ctx) => ({
        emit: (value: string) => {
          ctx.actionSink.send(() => ({
            state: { value },
            output: value,
          }));
        },
      }),
    };

    const runtime = createRuntime(noTypeWorkflow, undefined);
    const outputs: string[] = [];

    // Should not throw, just not call handlers
    runtime.on('someType' as any, () => {});
    runtime.getRendering().emit('test');

    // No error should occur
    runtime.dispose();
  });

  it('should clear typed handlers on dispose', () => {
    const runtime = createRuntime(outputTestWorkflow, undefined);
    const loadedOutputs: { type: 'loaded'; data: string }[] = [];

    runtime.on('loaded', (output) => {
      loadedOutputs.push(output);
    });

    runtime.dispose();

    // After dispose, handlers should be cleared
    // Creating new runtime to verify old one is disposed
    const runtime2 = createRuntime(outputTestWorkflow, undefined);
    runtime2.getRendering().emitLoaded();
    expect(loadedOutputs).toHaveLength(0); // No outputs from new runtime
    runtime2.dispose();
  });
});

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

    const workerWorkflow: Workflow<
      void,
      { result: number | null },
      never,
      { result: number | null }
    > = {
      initialState: () => ({ result: null }),
      render: (_props, state, ctx) => {
        ctx.runWorker(worker, 'test-worker', (output) => (s) => ({ result: output + s.result! }));
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
    const emitWithValue = action<{ count: number }, string>((s) => s, 'done');
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
    const increment = named(
      'increment',
      action((s: { count: number }) => ({ count: s.count + 1 })),
    );
    expect(increment.name).toBe('increment');

    const result = increment({ count: 0 });
    expect(result.state).toEqual({ count: 1 });
  });
});

// ============================================================
// Interceptor Tests
// ============================================================

describe('Interceptors', () => {
  describe('createInterceptor', () => {
    it('should create interceptor with name and config', () => {
      const interceptor = createInterceptor<{ count: number }, unknown>('test', {
        onSend: () => {},
      });

      expect(interceptor.name).toBe('test');
      expect(interceptor.config.name).toBe('test');
      expect(interceptor.config.onSend).toBeDefined();
    });

    it('should allow filter function', () => {
      const interceptor = createInterceptor<{ count: number }, unknown>('filtered', {
        filter: (act) => act.toString().includes('increment'),
      });

      expect(interceptor.config.filter).toBeDefined();
    });
  });

  describe('loggingInterceptor', () => {
    it('should create logging interceptor', () => {
      const interceptor = loggingInterceptor<{ count: number }, unknown>();

      expect(interceptor.name).toBe('logging');
      expect(interceptor.config.onSend).toBeDefined();
    });

    it('should respect logResults option', () => {
      const interceptor = loggingInterceptor<{ count: number }, unknown>({ logResults: false });

      expect(interceptor.config.onResult).toBeUndefined();
    });

    it('should respect logState option', () => {
      const mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const interceptor = loggingInterceptor<{ count: number }, unknown>({
        logger: mockLogger,
        logState: true,
      });

      interceptor.config.onSend?.(() => ({ state: { count: 1 } }), {
        state: { count: 0 },
        props: {},
        workflowKey: '',
      });

      expect(mockLogger.log).toHaveBeenCalled();
    });

    it('should respect custom prefix', () => {
      const mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const interceptor = loggingInterceptor<{ count: number }, unknown>({
        logger: mockLogger,
        prefix: '[custom]',
      });

      interceptor.config.onSend?.(() => ({ state: { count: 1 } }), {
        state: { count: 0 },
        props: {},
        workflowKey: '',
      });

      expect(mockLogger.log).toHaveBeenCalledWith('[custom] Action:', expect.any(String));
    });
  });

  describe('debugInterceptor', () => {
    it('should create debug interceptor', () => {
      const interceptor = debugInterceptor<{ count: number }, unknown>();

      expect(interceptor.name).toBe('debug');
      expect(interceptor.config.filter).toBeDefined();
    });

    it('should respect enabled option', () => {
      const disabled = debugInterceptor<{ count: number }, unknown>({ enabled: false });
      const enabled = debugInterceptor<{ count: number }, unknown>({ enabled: true });

      expect(disabled.config.filter?.({} as any)).toBe(false);
      expect(enabled.config.filter?.({} as any)).toBe(true);
    });

    it('should respect logSend option', () => {
      const interceptor = debugInterceptor<{ count: number }, unknown>({ logSend: false });

      expect(interceptor.config.onSend).toBeUndefined();
    });

    it('should respect logResults option', () => {
      const interceptor = debugInterceptor<{ count: number }, unknown>({ logResults: false });

      expect(interceptor.config.onResult).toBeUndefined();
    });
  });

  describe('composeInterceptors', () => {
    it('should compose multiple interceptors', () => {
      const calls: string[] = [];
      const int1 = createInterceptor<{ count: number }, unknown>('int1', {
        onSend: () => calls.push('int1-send'),
      });
      const int2 = createInterceptor<{ count: number }, unknown>('int2', {
        onSend: () => calls.push('int2-send'),
      });

      const composed = composeInterceptors(int1, int2);
      composed.config.onSend?.(() => ({ state: { count: 1 } }), {
        state: { count: 0 },
        props: {},
        workflowKey: '',
      });

      expect(calls).toEqual(['int1-send', 'int2-send']);
    });

    it('should call onResult in sequence and allow modification', () => {
      const int1 = createInterceptor<{ count: number }, unknown>('int1', {
        onResult: (_action, result) => {
          result.state = { count: result.state.count + 10 };
          return result;
        },
      });
      const int2 = createInterceptor<{ count: number }, unknown>('int2', {
        onResult: (_action, result) => {
          result.state = { count: result.state.count + 5 };
          return result;
        },
      });

      const composed = composeInterceptors(int1, int2);
      const result = composed.config.onResult?.(
        () => ({ state: { count: 1 } }),
        { state: { count: 1 }, output: undefined },
        { state: { count: 0 }, props: {}, workflowKey: '' },
      );

      expect(result?.state.count).toBe(16); // 1 + 10 + 5
    });

    it('should respect filter in composed interceptors', () => {
      const calls: string[] = [];
      const int1 = createInterceptor<{ count: number }, unknown>('int1', {
        filter: () => false,
        onSend: () => calls.push('int1-send'),
      });
      const int2 = createInterceptor<{ count: number }, unknown>('int2', {
        onSend: () => calls.push('int2-send'),
      });

      const composed = composeInterceptors(int1, int2);
      composed.config.onSend?.(() => ({ state: { count: 1 } }), {
        state: { count: 0 },
        props: {},
        workflowKey: '',
      });

      expect(calls).toEqual(['int2-send']);
    });

    it('should call onError for all interceptors', () => {
      const calls: string[] = [];
      const int1 = createInterceptor<{ count: number }, unknown>('int1', {
        onError: () => calls.push('int1-error'),
      });
      const int2 = createInterceptor<{ count: number }, unknown>('int2', {
        onError: () => calls.push('int2-error'),
      });

      const composed = composeInterceptors(int1, int2);
      composed.config.onError?.(() => ({ state: { count: 1 } }), new Error('test'), {
        state: { count: 0 },
        props: {},
        workflowKey: '',
      });

      expect(calls).toEqual(['int1-error', 'int2-error']);
    });
  });

  describe('Runtime with interceptors', () => {
    it('should call onSend interceptor', () => {
      const calls: string[] = [];
      const interceptor = createInterceptor<{ count: number }, unknown>('test', {
        onSend: () => calls.push('onSend'),
      });

      const runtime = createRuntime(counterWorkflow, undefined, { interceptors: [interceptor] });
      runtime.send((state) => ({ state: { count: state.count + 1 } }));

      expect(calls).toContain('onSend');
      runtime.dispose();
    });

    it('should call onResult interceptor', () => {
      const calls: { count: number }[] = [];
      const interceptor = createInterceptor<{ count: number }, unknown>('test', {
        onResult: (_action, result) => {
          calls.push(result.state);
          return result;
        },
      });

      const runtime = createRuntime(counterWorkflow, undefined, { interceptors: [interceptor] });
      runtime.send((state) => ({ state: { count: state.count + 5 } }));

      expect(calls).toEqual([{ count: 5 }]);
      runtime.dispose();
    });

    it('should allow interceptor to modify result', () => {
      const interceptor = createInterceptor<{ count: number }, unknown>('modifier', {
        onResult: (_action, result) => {
          result.state = { count: result.state.count * 2 };
          return result;
        },
      });

      const runtime = createRuntime(counterWorkflow, undefined, { interceptors: [interceptor] });
      runtime.send((state) => ({ state: { count: state.count + 3 } }));

      // Original action adds 3, but interceptor doubles it
      expect(runtime.getState()).toEqual({ count: 6 });
      runtime.dispose();
    });

    it('should call onError interceptor when action throws', () => {
      const calls: string[] = [];
      const interceptor = createInterceptor<{ count: number }, unknown>('error-test', {
        onError: () => calls.push('onError'),
      });

      const runtime = createRuntime(counterWorkflow, undefined, { interceptors: [interceptor] });

      expect(() => {
        runtime.send(() => {
          throw new Error('test error');
        });
      }).toThrow();

      expect(calls).toContain('onError');
      runtime.dispose();
    });

    it('should call multiple interceptors in order', () => {
      const calls: string[] = [];
      const int1 = createInterceptor<{ count: number }, unknown>('first', {
        onSend: () => calls.push('first'),
        onResult: (_action, result) => {
          calls.push('first-result');
          return result;
        },
      });
      const int2 = createInterceptor<{ count: number }, unknown>('second', {
        onSend: () => calls.push('second'),
        onResult: (_action, result) => {
          calls.push('second-result');
          return result;
        },
      });

      const runtime = createRuntime(counterWorkflow, undefined, { interceptors: [int1, int2] });
      runtime.send((state) => ({ state: { count: state.count + 1 } }));

      expect(calls).toEqual(['first', 'second', 'first-result', 'second-result']);
      runtime.dispose();
    });

    it('should work with loggingInterceptor', () => {
      const mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const interceptor = loggingInterceptor<{ count: number }, unknown>({
        logger: mockLogger,
        logResults: false,
      });

      const runtime = createRuntime(counterWorkflow, undefined, { interceptors: [interceptor] });
      runtime.send((state) => ({ state: { count: state.count + 1 } }));

      expect(mockLogger.log).toHaveBeenCalled();
      runtime.dispose();
    });
  });
});
