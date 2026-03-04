import { type Workflow, action } from '@workflow-ts/core';

// Define state
export interface State {
  count: number;
}

// Define rendering (what the UI sees)
export type Rendering =
  | { type: 'atZero'; count: 0; increment: () => void }
  | { type: 'counting'; count: number; increment: () => void; decrement: () => void; reset: () => void }
  | { type: 'atMax'; count: number; decrement: () => void; reset: () => void };

// Define outputs (events to parent)
export type Output = 
  | { type: 'reachedZero' }
  | { type: 'reachedMax'; value: number };

const MAX_COUNT = 10;

export const counterWorkflow: Workflow<void, State, Output, Rendering> = {
  initialState: () => ({ count: 0 }),
  
  render: (_props, state, ctx) => {
    const increment = (): void => {
      ctx.actionSink.send((s) => {
        const newCount = Math.min(s.count + 1, MAX_COUNT);
        return {
          state: { count: newCount },
          ...(newCount === MAX_COUNT ? { output: { type: 'reachedMax', value: newCount } as Output } : {}),
        };
      });
    };

    const decrement = (): void => {
      ctx.actionSink.send((s) => {
        const newCount = Math.max(s.count - 1, 0);
        return {
          state: { count: newCount },
          ...(newCount === 0 ? { output: { type: 'reachedZero' } as Output } : {}),
        };
      });
    };

    const reset = (): void => {
      ctx.actionSink.send(action(() => ({ count: 0 })));
    };

    if (state.count === 0) {
      return { type: 'atZero', count: 0, increment };
    } else if (state.count === MAX_COUNT) {
      return { type: 'atMax', count: state.count, decrement, reset };
    } else {
      return { type: 'counting', count: state.count, increment, decrement, reset };
    }
  },
};
