// README_SNIPPET_START: workflow
import { createWorker, type Worker, type Workflow } from '@workflow-ts/core';

export interface Props {
  userId: string;
}

export type State =
  | { type: 'loading' }
  | { type: 'loaded'; name: string }
  | { type: 'error'; message: string };

export interface Output {
  type: 'closed';
}

export type Rendering =
  | { type: 'loading'; close: () => void }
  | { type: 'loaded'; name: string; reload: () => void; close: () => void }
  | { type: 'error'; message: string; retry: () => void; close: () => void };

type LoadProfileResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

export interface WorkersProvider {
  loadProfileWorker: Worker<LoadProfileResult>;
}

const createLoadProfileWorker = (): Worker<LoadProfileResult> => {
  return createWorker<LoadProfileResult>('load-profile', async (signal) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 5);
      signal.addEventListener(
        'abort',
        () => {
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

export const createProfileWorkflow = (
  workersProvider: WorkersProvider = defaultWorkersProvider,
): Workflow<Props, State, Output, Rendering> => ({
  initialState: () => ({ type: 'loading' }),

  render: (_props, state, ctx) => {
    if (state.type === 'loading') {
      ctx.runWorker(workersProvider.loadProfileWorker, 'profile-load', (result) => () => ({
        state: result.ok
          ? { type: 'loaded', name: result.name }
          : { type: 'error', message: result.message },
      }));
    }

    switch (state.type) {
      case 'loading':
        return {
          type: 'loading',
          close: () => {
            ctx.actionSink.send((s) => ({ state: s, output: { type: 'closed' } }));
          },
        };
      case 'loaded':
        return {
          type: 'loaded',
          name: state.name,
          reload: () => {
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
