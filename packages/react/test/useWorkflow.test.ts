import { renderHook, act } from '@testing-library/react';
import type { Workflow } from '@workflow-ts/core';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkflow, useWorkflowWithState } from '../src/useWorkflow';

const flushTimers = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};


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
}

type CounterOutput = { readonly type: 'reachedZero' } | { readonly type: 'reachedTen' };

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
  }),
};

// Props-based workflow for testing updates
interface PropsWorkflowState {
  readonly value: number;
}

interface PropsWorkflowRendering {
  readonly value: number;
  readonly doubled: number;
}

const propsWorkflow: Workflow<{ initial: number }, PropsWorkflowState, never, PropsWorkflowRendering> = {
  initialState: (props) => ({ value: props.initial }),

  render: (props, state): PropsWorkflowRendering => ({
    value: state.value,
    doubled: state.value * 2,
  }),
};

// ============================================================
// Tests
// ============================================================

describe('useWorkflow', () => {
  it('should return initial rendering', () => {
    const { result, unmount } = renderHook(() => useWorkflow(counterWorkflow, undefined));

    expect(result.current.count).toBe(0);
    expect(typeof result.current.onIncrement).toBe('function');
    expect(typeof result.current.onDecrement).toBe('function');
    
    unmount();
  });

  it('should update rendering on action', () => {
    const { result, unmount } = renderHook(() => useWorkflow(counterWorkflow, undefined));

    act(() => {
      result.current.onIncrement();
    });

    expect(result.current.count).toBe(1);

    act(() => {
      result.current.onIncrement();
      result.current.onIncrement();
    });

    expect(result.current.count).toBe(3);
    
    unmount();
  });

  it('should call onOutput callback', () => {
    const onOutput = vi.fn();
    const { result, unmount } = renderHook(() =>
      useWorkflow(counterWorkflow, undefined, onOutput),
    );

    act(() => {
      result.current.onIncrement();
      result.current.onDecrement(); // Back to 0, should emit
    });

    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenCalledWith({ type: 'reachedZero' });
    
    unmount();
  });

  it('should update rendering when props change', () => {
    const { result, rerender, unmount } = renderHook(
      ({ initial }) => useWorkflow(propsWorkflow, { initial }),
      { initialProps: { initial: 5 } },
    );

    expect(result.current.value).toBe(5);
    expect(result.current.doubled).toBe(10);

    rerender({ initial: 10 });

    expect(result.current.value).toBe(10);
    expect(result.current.doubled).toBe(20);
    
    unmount();
  });

  it('should dispose runtime on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useWorkflow(counterWorkflow, undefined),
    );

    // Runtime should be working
    act(() => {
      result.current.onIncrement();
    });
    expect(result.current.count).toBe(1);

    // Unmount should not throw
    expect(() => { unmount(); }).not.toThrow();
  });

  it('should unsubscribe old outputHandler and not double-call after rerender with new handler', () => {
    const oldHandler = vi.fn();
    const newHandler = vi.fn();

    const { result, rerender, unmount } = renderHook(
      ({ handler }: { handler: typeof oldHandler }) =>
        useWorkflow(counterWorkflow, undefined, undefined, {
          outputHandlers: { reachedZero: handler },
        }),
      { initialProps: { handler: oldHandler } },
    );

    // Trigger reachedZero (increment then decrement back to 0)
    act(() => {
      result.current.onIncrement();
      result.current.onDecrement();
    });

    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).toHaveBeenCalledTimes(0);

    // Swap handler
    rerender({ handler: newHandler });

    // Trigger reachedZero again
    act(() => {
      result.current.onIncrement();
      result.current.onDecrement();
    });

    // Old handler must not be called again — cleanup must have run
    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('should work in React StrictMode', () => {
    const { result, unmount } = renderHook(() => useWorkflow(counterWorkflow, undefined), {
      wrapper: StrictMode,
    });

    expect(result.current.count).toBe(0);

    act(() => {
      result.current.onIncrement();
    });

    expect(result.current.count).toBe(1);
    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it('should recreate runtime when workflow identity changes and resetOnWorkflowChange is true', () => {
    interface ResetState {
      readonly count: number;
    }
    interface ResetRendering {
      readonly workflowId: string;
      readonly count: number;
      readonly increment: () => void;
    }
    const createResetWorkflow = (workflowId: string): Workflow<void, ResetState, never, ResetRendering> => ({
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => ({
        workflowId,
        count: state.count,
        increment: () => {
          ctx.actionSink.send((s) => ({ state: { count: s.count + 1 } }));
        },
      }),
    });

    const workflowA = createResetWorkflow('A');
    const workflowB = createResetWorkflow('B');

    const { result, rerender, unmount } = renderHook(
      ({ workflow }) =>
        useWorkflow(workflow, undefined, undefined, { resetOnWorkflowChange: true }),
      { initialProps: { workflow: workflowA } },
    );

    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(1);
    expect(result.current.workflowId).toBe('A');

    const incrementFromOldRuntime = result.current.increment;

    rerender({ workflow: workflowB });
    expect(result.current.count).toBe(0);
    expect(result.current.workflowId).toBe('B');

    act(() => {
      incrementFromOldRuntime();
    });
    expect(result.current.count).toBe(0);
    expect(result.current.workflowId).toBe('B');

    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(1);
    expect(result.current.workflowId).toBe('B');

    unmount();
  });

  it('should keep runtime when workflow identity changes and resetOnWorkflowChange is false', () => {
    interface StableState {
      readonly count: number;
    }
    interface StableRendering {
      readonly workflowId: string;
      readonly count: number;
      readonly increment: () => void;
    }
    const createStableWorkflow = (workflowId: string): Workflow<void, StableState, never, StableRendering> => ({
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => ({
        workflowId,
        count: state.count,
        increment: () => {
          ctx.actionSink.send((s) => ({ state: { count: s.count + 1 } }));
        },
      }),
    });

    const workflowA = createStableWorkflow('A');
    const workflowB = createStableWorkflow('B');

    const { result, rerender, unmount } = renderHook(
      ({ workflow }) =>
        useWorkflow(workflow, undefined, undefined, { resetOnWorkflowChange: false }),
      { initialProps: { workflow: workflowA } },
    );

    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(1);
    expect(result.current.workflowId).toBe('A');

    rerender({ workflow: workflowB });
    expect(result.current.count).toBe(1);
    expect(result.current.workflowId).toBe('A');

    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(2);
    expect(result.current.workflowId).toBe('A');

    unmount();
  });

  it('should dispose runtime while inactive and recreate when active again', () => {
    const { result, rerender, unmount } = renderHook(
      ({ isActive }) =>
        useWorkflow(counterWorkflow, undefined, undefined, {
          lifecycle: 'pause-when-backgrounded',
          isActive,
        }),
      { initialProps: { isActive: true } },
    );

    act(() => {
      result.current.onIncrement();
    });
    expect(result.current.count).toBe(1);
    const oldIncrement = result.current.onIncrement;

    rerender({ isActive: false });

    act(() => {
      oldIncrement();
    });
    expect(result.current.count).toBe(1);

    rerender({ isActive: true });

    expect(result.current.count).toBe(0);
    act(() => {
      oldIncrement();
    });
    expect(result.current.count).toBe(0);

    act(() => {
      result.current.onIncrement();
    });
    expect(result.current.count).toBe(1);

    unmount();
  });

  it('should cancel pending dispose when reactivated quickly', () => {
    const { result, rerender, unmount } = renderHook(
      ({ isActive }) =>
        useWorkflow(counterWorkflow, undefined, undefined, {
          lifecycle: 'pause-when-backgrounded',
          isActive,
        }),
      { initialProps: { isActive: true } },
    );

    act(() => {
      result.current.onIncrement();
    });
    expect(result.current.count).toBe(1);

    rerender({ isActive: false });
    rerender({ isActive: true });

    expect(result.current.count).toBe(1);

    act(() => {
      result.current.onIncrement();
    });
    expect(result.current.count).toBe(2);

    unmount();
  });
});

describe('useWorkflowWithState', () => {
  it('should return rendering and controls', () => {
    const { result, unmount } = renderHook(() =>
      useWorkflowWithState(counterWorkflow, { props: undefined }),
    );

    expect(result.current.rendering.count).toBe(0);
    expect(result.current.state).toEqual({ count: 0 });
    expect(result.current.props).toBeUndefined();
    expect(typeof result.current.updateProps).toBe('function');
    expect(typeof result.current.snapshot).toBe('function');
    
    unmount();
  });

  it('should update state on action', () => {
    const { result, unmount } = renderHook(() =>
      useWorkflowWithState(counterWorkflow, { props: undefined }),
    );

    act(() => {
      result.current.rendering.onIncrement();
    });

    expect(result.current.state.count).toBe(1);
    expect(result.current.rendering.count).toBe(1);
    
    unmount();
  });

  it('should support updateProps', () => {
    const { result, unmount } = renderHook(() =>
      useWorkflowWithState(propsWorkflow, { props: { initial: 5 } }),
    );

    expect(result.current.rendering.value).toBe(5);

    act(() => {
      result.current.updateProps({ initial: 20 });
    });

    expect(result.current.rendering.value).toBe(20);
    expect(result.current.props.initial).toBe(20);
    
    unmount();
  });

  it('should call onOutput callback', () => {
    const onOutput = vi.fn();
    const { result, unmount } = renderHook(() =>
      useWorkflowWithState(counterWorkflow, {
        props: undefined,
        onOutput,
      }),
    );

    act(() => {
      result.current.rendering.onIncrement();
      result.current.rendering.onDecrement(); // Back to 0
    });

    expect(onOutput).toHaveBeenCalledWith({ type: 'reachedZero' });

    unmount();
  });

  it('should unsubscribe old outputHandler and not double-call after rerender with new handler', () => {
    const oldHandler = vi.fn();
    const newHandler = vi.fn();

    const { result, rerender, unmount } = renderHook(
      ({ handler }: { handler: typeof oldHandler }) =>
        useWorkflowWithState(counterWorkflow, {
          props: undefined,
          outputHandlers: { reachedZero: handler },
        }),
      { initialProps: { handler: oldHandler } },
    );

    // Trigger reachedZero (increment then decrement back to 0)
    act(() => {
      result.current.rendering.onIncrement();
      result.current.rendering.onDecrement();
    });

    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).toHaveBeenCalledTimes(0);

    // Swap handler
    rerender({ handler: newHandler });

    // Trigger reachedZero again
    act(() => {
      result.current.rendering.onIncrement();
      result.current.rendering.onDecrement();
    });

    // Old handler must not be called again — cleanup must have run
    expect(oldHandler).toHaveBeenCalledTimes(1);
    expect(newHandler).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('should work in React StrictMode', () => {
    const { result, unmount } = renderHook(
      () => useWorkflowWithState(counterWorkflow, { props: undefined }),
      { wrapper: StrictMode },
    );

    expect(result.current.rendering.count).toBe(0);

    act(() => {
      result.current.rendering.onIncrement();
    });

    expect(result.current.rendering.count).toBe(1);
    expect(result.current.state.count).toBe(1);
    expect(() => {
      unmount();
    }).not.toThrow();
  });

  it('should dispose runtime while inactive and recreate when active again', () => {
    const { result, rerender, unmount } = renderHook(
      ({ isActive }) =>
        useWorkflowWithState(counterWorkflow, {
          props: undefined,
          lifecycle: 'pause-when-backgrounded',
          isActive,
        }),
      { initialProps: { isActive: true } },
    );

    act(() => {
      result.current.rendering.onIncrement();
    });
    expect(result.current.state.count).toBe(1);
    const oldIncrement = result.current.rendering.onIncrement;
    const staleUpdateProps = result.current.updateProps;
    const staleSnapshot = result.current.snapshot;

    rerender({ isActive: false });

    act(() => {
      oldIncrement();
    });
    expect(result.current.state.count).toBe(1);
    expect(() => {
      staleUpdateProps(undefined);
    }).not.toThrow();
    expect(() => {
      staleSnapshot();
    }).not.toThrow();

    rerender({ isActive: true });

    expect(result.current.state.count).toBe(0);
    act(() => {
      oldIncrement();
    });
    expect(result.current.state.count).toBe(0);

    act(() => {
      result.current.rendering.onIncrement();
    });
    expect(result.current.state.count).toBe(1);

    unmount();
  });

  it('should keep stale controls safe after runtime is disposed while inactive', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ isActive }) =>
        useWorkflowWithState(counterWorkflow, {
          props: undefined,
          lifecycle: 'pause-when-backgrounded',
          isActive,
        }),
      { initialProps: { isActive: true } },
    );

    act(() => {
      result.current.rendering.onIncrement();
    });

    const staleUpdateProps = result.current.updateProps;
    const staleSnapshot = result.current.snapshot;

    rerender({ isActive: false });
    await flushTimers();

    expect(() => {
      staleUpdateProps(undefined);
    }).not.toThrow();
    expect(() => {
      staleSnapshot();
    }).not.toThrow();
    expect(staleSnapshot()).toBeUndefined();

    unmount();
  });
});
