// README_SNIPPET_START: test
import { createRuntime } from '@workflow-ts/core';
import { expect, it } from 'vitest';

import { profileWorkflow } from '../src/workflow';

it('transitions loading -> loaded', () => {
  const runtime = createRuntime(profileWorkflow, { userId: 'u1' });

  expect(runtime.getRendering().type).toBe('loading');
  expect(runtime.getState().type).toBe('loading');

  runtime.send(() => ({ state: { type: 'loaded', name: 'Ada' } }));
  const loaded = runtime.getRendering();
  expect(loaded.type).toBe('loaded');
  expect((loaded as Extract<typeof loaded, { type: 'loaded' }>).name).toBe('Ada');

  runtime.dispose();
});
// README_SNIPPET_END: test
