// README_SNIPPET_START: react
import { useWorkflow } from '@workflow-ts/react';
import type { JSX } from 'react';

import { profileWorkflow } from './workflow';

export function ProfileScreen({ userId }: { userId: string }): JSX.Element {
  // Subscribe to the workflow and get the latest rendering for these props.
  const rendering = useWorkflow(profileWorkflow, { userId });

  // Each rendering case maps directly to the UI for that state.
  switch (rendering.type) {
    case 'loading':
      // The worker is still running, so only Close is available.
      return (
        <section>
          <h1>Profile</h1>
          <p>Loading...</p>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'loaded':
      // Loaded renderings expose both data and follow-up actions.
      return (
        <section>
          <h1>Welcome {rendering.name}</h1>
          <button onClick={rendering.reload}>Reload</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
    case 'error':
      // Error renderings carry a message plus a recovery action.
      return (
        <section>
          <h1>Profile</h1>
          <p>{rendering.message}</p>
          <button onClick={rendering.retry}>Retry</button>
          <button onClick={rendering.close}>Close</button>
        </section>
      );
  }
}
// README_SNIPPET_END: react
