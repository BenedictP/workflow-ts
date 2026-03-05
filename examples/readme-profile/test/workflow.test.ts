import { createRuntime } from '@workflow-ts/core';
import { describe, expect, it } from 'vitest';

import { profileWorkflow, type Output, type State } from '../src/workflow';

describe('profileWorkflow', () => {
  it('emits closed output from loading', () => {
    const outputs: Output[] = [];
    const runtime = createRuntime(profileWorkflow, { userId: 'u1' }, (output) => {
      outputs.push(output);
    });

    const rendering = runtime.getRendering();
    expect(rendering.type).toBe('loading');
    if (rendering.type === 'loading') {
      rendering.close();
    }

    expect(outputs).toEqual([{ type: 'closed' }]);
    runtime.dispose();
  });

  it('retries from error to loading', () => {
    const runtime = createRuntime(profileWorkflow, { userId: 'u1' }, {
      initialState: { type: 'error', message: 'boom' } satisfies State,
    });

    const rendering = runtime.getRendering();
    expect(rendering.type).toBe('error');

    if (rendering.type === 'error') {
      rendering.retry();
    }

    expect(runtime.getState()).toEqual({ type: 'loading' });
    runtime.dispose();
  });
});
