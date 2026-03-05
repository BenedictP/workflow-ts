import { renderHook, act } from '@testing-library/react';
import type { Workflow } from '@workflow-ts/core';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AllowedProp } from '../src/useWorkflow';
import { resolveShouldValidateProps, useWorkflow, useWorkflowWithState } from '../src/useWorkflow';

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

  render: (props): PropsWorkflowRendering => ({
    value: props.initial,
    doubled: props.initial * 2,
  }),
};

interface ComplexProps {
  readonly profile: {
    count: number;
  };
  readonly timestamp: Date;
  readonly tags: Set<string>;
  readonly scores: Map<string, number>;
}

interface ComplexRendering {
  readonly count: number;
  readonly timestampMs: number;
  readonly tagCount: number;
  readonly alphaScore: number | undefined;
}

const complexPropsWorkflow: Workflow<ComplexProps, null, never, ComplexRendering> = {
  initialState: () => null,
  render: (props): ComplexRendering => ({
    count: props.profile.count,
    timestampMs: props.timestamp.getTime(),
    tagCount: props.tags.size,
    alphaScore: props.scores.get('alpha'),
  }),
};

interface ArrayProps {
  readonly items: number[];
}

interface ArrayRendering {
  readonly itemCount: number;
  readonly lastItem: number | undefined;
}

const arrayPropsWorkflow: Workflow<ArrayProps, null, never, ArrayRendering> = {
  initialState: () => null,
  render: (props): ArrayRendering => ({
    itemCount: props.items.length,
    lastItem: props.items.at(-1),
  }),
};

interface CyclicProps {
  value: number;
  self?: CyclicProps;
}

interface CyclicRendering {
  readonly value: number;
  readonly selfValue: number | undefined;
}

const cyclicPropsWorkflow: Workflow<CyclicProps, null, never, CyclicRendering> = {
  initialState: () => null,
  render: (props): CyclicRendering => ({
    value: props.value,
    selfValue: props.self?.value,
  }),
};

class SearchQueryProps {
  public query: string;

  public constructor(query: string) {
    this.query = query;
  }
}

interface ClassRendering {
  readonly query: string;
}

const classPropsWorkflow: Workflow<SearchQueryProps, null, never, ClassRendering> = {
  initialState: () => null,
  render: (props): ClassRendering => ({
    query: props.query,
  }),
};

const anyPropsWorkflow: Workflow<{ value: AllowedProp }, null, never, { value: AllowedProp }> = {
  initialState: () => null,
  render: (props) => ({
    value: props.value,
  }),
};

// ============================================================
// Tests
// ============================================================

describe('resolveShouldValidateProps', () => {
  it('prefers react-native __DEV__ when present', () => {
    expect(
      resolveShouldValidateProps({
        reactNativeDev: true,
        nodeEnv: 'production',
        viteDev: false,
        viteProd: true,
        viteMode: 'production',
      }),
    ).toBe(true);
  });

  it('uses NODE_ENV when __DEV__ is unavailable', () => {
    expect(
      resolveShouldValidateProps({
        reactNativeDev: undefined,
        nodeEnv: 'production',
        viteDev: true,
        viteProd: false,
        viteMode: 'development',
      }),
    ).toBe(false);
  });

  it('falls back to import.meta.env DEV/PROD/MODE signals', () => {
    expect(
      resolveShouldValidateProps({
        reactNativeDev: undefined,
        nodeEnv: undefined,
        viteDev: true,
        viteProd: undefined,
        viteMode: undefined,
      }),
    ).toBe(true);

    expect(
      resolveShouldValidateProps({
        reactNativeDev: undefined,
        nodeEnv: undefined,
        viteDev: undefined,
        viteProd: true,
        viteMode: undefined,
      }),
    ).toBe(false);

    expect(
      resolveShouldValidateProps({
        reactNativeDev: undefined,
        nodeEnv: undefined,
        viteDev: undefined,
        viteProd: undefined,
        viteMode: 'production',
      }),
    ).toBe(false);
  });

  it('defaults to false when no signal is available', () => {
    expect(
      resolveShouldValidateProps({
        reactNativeDev: undefined,
        nodeEnv: undefined,
        viteDev: undefined,
        viteProd: undefined,
        viteMode: undefined,
      }),
    ).toBe(false);
  });
});

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

  it('should not loop when rerendering with structurally equal props', () => {
    const { result, rerender, unmount } = renderHook(
      ({ initial }) => useWorkflow(propsWorkflow, { initial }),
      { initialProps: { initial: 5 } },
    );

    rerender({ initial: 10 });
    expect(result.current.value).toBe(10);
    expect(result.current.doubled).toBe(20);

    rerender({ initial: 10 });
    expect(result.current.value).toBe(10);
    expect(result.current.doubled).toBe(20);

    unmount();
  });

  it('should treat sets with equal primitive members as unchanged regardless of insertion order', () => {
    interface SetProps {
      readonly tags: Set<string>;
    }

    interface SetRendering {
      readonly renderCount: number;
    }

    let renderCount = 0;
    const setWorkflow: Workflow<SetProps, null, never, SetRendering> = {
      initialState: () => null,
      render: () => ({
        renderCount: ++renderCount,
      }),
    };

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflow(setWorkflow, props),
      { initialProps: { props: { tags: new Set(['a', 'b']) } } },
    );

    expect(result.current.renderCount).toBe(1);

    rerender({ props: { tags: new Set(['b', 'a']) } });
    expect(result.current.renderCount).toBe(1);

    unmount();
  });

  it('should update when set membership changes', () => {
    interface SetProps {
      readonly tags: Set<string>;
    }

    interface SetRendering {
      readonly renderCount: number;
      readonly size: number;
    }

    let renderCount = 0;
    const setWorkflow: Workflow<SetProps, null, never, SetRendering> = {
      initialState: () => null,
      render: (props) => ({
        renderCount: ++renderCount,
        size: props.tags.size,
      }),
    };

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflow(setWorkflow, props),
      { initialProps: { props: { tags: new Set(['a', 'b']) } } },
    );

    expect(result.current.renderCount).toBe(1);
    expect(result.current.size).toBe(2);

    rerender({ props: { tags: new Set(['a', 'b', 'c']) } });
    expect(result.current.renderCount).toBe(2);
    expect(result.current.size).toBe(3);

    unmount();
  });

  it('should treat sets of structural objects as unchanged when only insertion order differs', () => {
    interface TagObject {
      readonly id: number;
      readonly meta: {
        readonly enabled: boolean;
      };
    }

    interface SetProps {
      readonly tags: Set<TagObject>;
    }

    interface SetRendering {
      readonly renderCount: number;
    }

    let renderCount = 0;
    const setWorkflow: Workflow<SetProps, null, never, SetRendering> = {
      initialState: () => null,
      render: () => ({
        renderCount: ++renderCount,
      }),
    };

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflow(setWorkflow, props),
      {
        initialProps: {
          props: {
            tags: new Set<TagObject>([
              { id: 1, meta: { enabled: true } },
              { id: 2, meta: { enabled: false } },
            ]),
          },
        },
      },
    );

    expect(result.current.renderCount).toBe(1);

    rerender({
      props: {
        tags: new Set<TagObject>([
          { id: 2, meta: { enabled: false } },
          { id: 1, meta: { enabled: true } },
        ]),
      },
    });
    expect(result.current.renderCount).toBe(1);

    unmount();
  });

  it('should sync non-plain and deep prop mutations on same top-level reference', () => {
    const initialTimestamp = new Date('2026-01-01T00:00:00.000Z');
    const mutableProps: ComplexProps = {
      profile: { count: 1 },
      timestamp: initialTimestamp,
      tags: new Set(['a']),
      scores: new Map([['alpha', 1]]),
    };

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflow(complexPropsWorkflow, props),
      { initialProps: { props: mutableProps } },
    );

    expect(result.current.count).toBe(1);
    expect(result.current.timestampMs).toBe(initialTimestamp.getTime());
    expect(result.current.tagCount).toBe(1);
    expect(result.current.alphaScore).toBe(1);

    mutableProps.profile.count = 2;
    mutableProps.tags.add('b');
    mutableProps.scores.set('alpha', 2);
    mutableProps.timestamp.setUTCDate(mutableProps.timestamp.getUTCDate() + 1);

    rerender({ props: mutableProps });

    expect(result.current.count).toBe(2);
    expect(result.current.timestampMs).toBe(mutableProps.timestamp.getTime());
    expect(result.current.tagCount).toBe(2);
    expect(result.current.alphaScore).toBe(2);

    unmount();
  });

  it('should sync in-place array mutations on same top-level reference', () => {
    const mutableProps: ArrayProps = {
      items: [1, 2],
    };

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflow(arrayPropsWorkflow, props),
      { initialProps: { props: mutableProps } },
    );

    expect(result.current.itemCount).toBe(2);
    expect(result.current.lastItem).toBe(2);

    mutableProps.items.push(3);
    rerender({ props: mutableProps });

    expect(result.current.itemCount).toBe(3);
    expect(result.current.lastItem).toBe(3);

    unmount();
  });

  it('should support cyclic props and reflect updates', () => {
    const cyclicProps: CyclicProps = { value: 1 };
    cyclicProps.self = cyclicProps;

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflow(cyclicPropsWorkflow, props),
      { initialProps: { props: cyclicProps } },
    );

    expect(result.current.value).toBe(1);
    expect(result.current.selfValue).toBe(1);

    cyclicProps.value = 2;
    rerender({ props: cyclicProps });

    expect(result.current.value).toBe(2);
    expect(result.current.selfValue).toBe(2);

    unmount();
  });

  it('should throw for class-instance props', () => {
    const queryProps = new SearchQueryProps('first');

    expect(() => {
      renderHook(() =>
        useWorkflow<any, null, never, ClassRendering>(
          classPropsWorkflow as unknown as Workflow<any, null, never, ClassRendering>,
          queryProps,
        ),
      );
    }).toThrowError(/Unsupported workflow props at "props": SearchQueryProps/);
  });

  it('should throw for nested unsupported branded objects with path details', () => {
    const props = {
      value: {
        payload: {
          resource: new URL('https://example.com'),
        },
      },
    };

    expect(() => {
      renderHook(() => useWorkflow(anyPropsWorkflow, props));
    }).toThrowError(/Unsupported workflow props at "props\.value\.payload\.resource": URL/);
  });

  it('should throw for Promise, WeakMap, and WeakSet props', () => {
    const unsupportedValues = [Promise.resolve(1), new WeakMap(), new WeakSet()];

    for (const unsupportedValue of unsupportedValues) {
      expect(() => {
        renderHook(() =>
          useWorkflow(anyPropsWorkflow, {
            value: unsupportedValue as unknown as AllowedProp,
          }),
        );
      }).toThrowError(/Unsupported workflow props at "props\.value"/);
    }
  });

  it('should validate unsupported props when __DEV__ is true', () => {
    const runtimeGlobals = globalThis as { __DEV__?: unknown };
    const previousDev = runtimeGlobals.__DEV__;
    const previousNodeEnv = process.env.NODE_ENV;
    runtimeGlobals.__DEV__ = true;
    process.env.NODE_ENV = 'production';

    try {
      expect(() => {
        renderHook(() =>
          useWorkflow(anyPropsWorkflow, { value: new URL('https://example.com') as unknown as AllowedProp }),
        );
      }).toThrowError(/Unsupported workflow props at "props\.value": URL/);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousDev === undefined) {
        delete runtimeGlobals.__DEV__;
      } else {
        runtimeGlobals.__DEV__ = previousDev;
      }
    }
  });

  it('should skip unsupported prop validation when __DEV__ is false', () => {
    const runtimeGlobals = globalThis as { __DEV__?: unknown };
    const previousDev = runtimeGlobals.__DEV__;
    const previousNodeEnv = process.env.NODE_ENV;
    runtimeGlobals.__DEV__ = false;
    process.env.NODE_ENV = 'development';

    try {
      const value = new URL('https://example.com');
      const { result, unmount } = renderHook(() =>
        useWorkflow(anyPropsWorkflow, { value: value as unknown as AllowedProp }),
      );
      expect(result.current.value).toBe(value);
      unmount();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousDev === undefined) {
        delete runtimeGlobals.__DEV__;
      } else {
        runtimeGlobals.__DEV__ = previousDev;
      }
    }
  });

  it('should skip unsupported prop validation when NODE_ENV is production', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const url = new URL('https://example.com');
      const { result, unmount } = renderHook(() =>
        useWorkflow(anyPropsWorkflow, { value: url as unknown as AllowedProp }),
      );

      expect(result.current.value).toBe(url);
      unmount();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
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

  it('should dispose replaced runtime synchronously to prevent stale outputs', () => {
    interface OutputState {
      readonly count: number;
    }
    interface WorkflowOutput {
      readonly type: 'tick';
      readonly source: string;
      readonly count: number;
    }
    interface OutputRendering {
      readonly source: string;
      readonly count: number;
      readonly increment: () => void;
    }

    const createOutputWorkflow = (source: string): Workflow<void, OutputState, WorkflowOutput, OutputRendering> => ({
      initialState: () => ({ count: 0 }),
      render: (_props, state, ctx) => ({
        source,
        count: state.count,
        increment: () => {
          ctx.actionSink.send((s) => {
            const nextCount = s.count + 1;
            return {
              state: { count: nextCount },
              output: { type: 'tick', source, count: nextCount } as const,
            };
          });
        },
      }),
    });

    const workflowA = createOutputWorkflow('A');
    const workflowB = createOutputWorkflow('B');
    const onOutput = vi.fn();

    const { result, rerender, unmount } = renderHook(
      ({ workflow }) =>
        useWorkflow(workflow, undefined, onOutput, { resetOnWorkflowChange: true }),
      { initialProps: { workflow: workflowA } },
    );

    const incrementFromOldRuntime = result.current.increment;
    rerender({ workflow: workflowB });

    act(() => {
      incrementFromOldRuntime();
    });
    expect(onOutput).toHaveBeenCalledTimes(0);

    act(() => {
      result.current.increment();
    });
    expect(onOutput).toHaveBeenCalledTimes(1);
    expect(onOutput).toHaveBeenLastCalledWith({ type: 'tick', source: 'B', count: 1 });

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

  it('should recreate runtime when reactivated quickly', () => {
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

    expect(result.current.count).toBe(0);

    act(() => {
      result.current.onIncrement();
    });
    expect(result.current.count).toBe(1);

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

  it('should sync deep prop mutations for useWorkflowWithState on same top-level reference', () => {
    const mutableProps: ComplexProps = {
      profile: { count: 1 },
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      tags: new Set(['a']),
      scores: new Map([['alpha', 1]]),
    };

    const { result, rerender, unmount } = renderHook(
      ({ props }) => useWorkflowWithState(complexPropsWorkflow, { props }),
      { initialProps: { props: mutableProps } },
    );

    expect(result.current.rendering.count).toBe(1);
    expect(result.current.props.profile.count).toBe(1);

    mutableProps.profile.count = 5;
    mutableProps.tags.add('b');
    mutableProps.scores.set('alpha', 5);
    mutableProps.timestamp.setUTCDate(mutableProps.timestamp.getUTCDate() + 1);
    rerender({ props: mutableProps });

    expect(result.current.rendering.count).toBe(5);
    expect(result.current.rendering.tagCount).toBe(2);
    expect(result.current.rendering.alphaScore).toBe(5);
    expect(result.current.rendering.timestampMs).toBe(mutableProps.timestamp.getTime());
    expect(result.current.props.profile.count).toBe(5);

    unmount();
  });

  it('should apply updateProps when reusing the same mutable object reference', () => {
    const mutableProps = { initial: 5 };
    const { result, unmount } = renderHook(() =>
      useWorkflowWithState(propsWorkflow, { props: { initial: 1 } }),
    );

    act(() => {
      result.current.updateProps(mutableProps);
    });
    expect(result.current.rendering.value).toBe(5);
    expect(result.current.props.initial).toBe(5);

    mutableProps.initial = 8;
    act(() => {
      result.current.updateProps(mutableProps);
    });
    expect(result.current.rendering.value).toBe(8);
    expect(result.current.props.initial).toBe(8);

    unmount();
  });

  it('should throw for class-instance initial props', () => {
    const initialProps = new SearchQueryProps('first');

    expect(() => {
      renderHook(() =>
        useWorkflowWithState<any, null, never, ClassRendering>(
          classPropsWorkflow as unknown as Workflow<any, null, never, ClassRendering>,
          { props: initialProps },
        ),
      );
    }).toThrowError(/Unsupported workflow props at "props": SearchQueryProps/);
  });

  it('should throw for unsupported props passed to updateProps', () => {
    const { result, unmount } = renderHook(() =>
      useWorkflowWithState(anyPropsWorkflow, { props: { value: 'ok' } }),
    );

    expect(() => {
      act(() => {
        result.current.updateProps({
          value: new Error('boom') as unknown as AllowedProp,
        } as { value: AllowedProp });
      });
    }).toThrowError(/Unsupported workflow props at "props\.value": Error/);

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
