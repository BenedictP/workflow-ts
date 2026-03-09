// README_SNIPPET_START: test
import { createRuntime } from '@workflow-ts/core';
import { expect, it } from 'vitest';

import { profileWorkflow } from '../src/workflow';

it('transitions loading -> loaded', () => {
  // Create a runtime so the workflow can be tested without mounting UI.
  const runtime = createRuntime(profileWorkflow, { userId: 'u1' });

  // The workflow should start in the loading state and rendering.
  expect(runtime.getRendering().type).toBe('loading');
  expect(runtime.getState().type).toBe('loading');

  // Drive the next transition the same way a UI callback would.
  runtime.send(() => ({ state: { type: 'loaded', name: 'Ada' } }));
  const loaded = runtime.getRendering();
  expect(loaded.type).toBe('loaded');
  expect((loaded as Extract<typeof loaded, { type: 'loaded' }>).name).toBe('Ada');

  // Dispose the runtime to clean up workers and subscriptions.
  runtime.dispose();
});
// README_SNIPPET_END: test
