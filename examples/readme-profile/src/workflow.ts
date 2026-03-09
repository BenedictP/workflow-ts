// README_SNIPPET_START: workflow
import { createWorker, type Worker, type Workflow } from '@workflow-ts/core';

// Props enter the workflow from the hosting screen.
export interface Props {
  userId: string;
}

// State is the internal state machine.
export type State =
  | { type: 'loading' }
  | { type: 'loaded'; name: string }
  | { type: 'error'; message: string };

// Output is emitted upward when the flow is done.
export interface Output {
  type: 'closed';
}

// Rendering is the UI contract returned from render().
export type Rendering =
  | { type: 'loading'; close: () => void }
  | { type: 'loaded'; name: string; reload: () => void; close: () => void }
  | { type: 'error'; message: string; retry: () => void; close: () => void };

// Worker results feed back into state transitions.
type LoadProfileResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

// Tests can inject custom workers through this provider.
export interface WorkersProvider {
  loadProfileWorker: Worker<LoadProfileResult>;
}

// Simulate an async profile fetch that also honors cancellation.
const createLoadProfileWorker = (): Worker<LoadProfileResult> => {
  return createWorker<LoadProfileResult>('load-profile', async (signal) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 5);
      signal.addEventListener(
        'abort',
        () => {
          // Abort clears the timer so the worker can finish immediately.
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });

    if (signal.aborted) {
      return { ok: false, message: 'Cancelled' };
    }

    return { ok: true as const, name: 'Ada' };
  });
};

const defaultWorkersProvider: WorkersProvider = {
  loadProfileWorker: createLoadProfileWorker(),
};

// Allow worker injection so tests can control success and failure paths.
export const createProfileWorkflow = (
  workersProvider: WorkersProvider = defaultWorkersProvider,
): Workflow<Props, State, Output, Rendering> => ({
  initialState: () => ({ type: 'loading' }),

  render: (_props, state, ctx) => {
    switch (state.type) {
      case 'loading':
        // Start the load worker while this rendering is active.
        ctx.runWorker(workersProvider.loadProfileWorker, 'profile-load', (result) => () => ({
          state: result.ok
            ? { type: 'loaded', name: result.name }
            : { type: 'error', message: result.message },
        }));

        return {
          type: 'loading',
          close: () => {
            // Emit an output without changing the current state.
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
      case 'loaded':
        return {
          type: 'loaded',
          name: state.name,
          reload: () => {
            // UI events send actions back into the workflow.
            ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
          },
          close: () => {
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
      case 'error':
        return {
          type: 'error',
          message: state.message,
          retry: () => {
            // Retry by sending the state machine back to loading.
            ctx.actionSink.send(() => ({ state: { type: 'loading' } }));
          },
          close: () => {
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
    }
  },
});

export const profileWorkflow = createProfileWorkflow();
// README_SNIPPET_END: workflow
